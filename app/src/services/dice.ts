/**
 * Dice Service — The single entry point for all dice rolling in GRO.WTH.
 * SERVER-ONLY — all dice rolling happens on the server. Clients call API routes.
 *
 * Every game system (skills, items, encounters, combat, death saves, terminal)
 * calls DiceService methods via API routes. Never import this from client code.
 *
 * Flow:
 *   1. Client calls API route (e.g. POST /api/dice/check)
 *   2. API route calls DiceService method
 *   3. DiceService generates crypto-random results (lib/dice.ts)
 *   4. Checks injection registry (Godhead overrides)
 *   5. Computes totals, success/failure, margin
 *   6. Returns RollResult to API route → client
 *   7. Client emits to event bus for 3D visualization
 */
import 'server-only';

import type { FateDie } from '@/types/growth';
import type {
  RollRequest, RollResult, RollSource, DieSpec, DieOutcome,
  DieType, DieColor, ContestedRollResult,
} from '@/types/dice';
import { rollDie } from '@/lib/dice';
import { getSkillDieType, parseDie } from '@/lib/dice-utils';
import { injectionRegistry } from './dice-injection';

// ── ID Generation ─────────────────────────────────────────────────────────

let rollCounter = 0;

/** Generate a unique roll ID. Uses timestamp + counter for simplicity (no nanoid dep needed yet). */
function generateRollId(): string {
  rollCounter++;
  const ts = Date.now().toString(36);
  const ct = rollCounter.toString(36);
  const rand = Math.random().toString(36).slice(2, 6);
  return `roll_${ts}_${ct}_${rand}`;
}

// ── Helpers ───────────────────────────────────────────────────────────────

function dieTypeFromSides(sides: number): DieType | 'flat' {
  if (sides === 0) return 'flat';
  const map: Record<number, DieType> = { 4: 'd4', 6: 'd6', 8: 'd8', 12: 'd12', 20: 'd20' };
  return map[sides] || 'd20';
}

// ── Core Roll Execution ───────────────────────────────────────────────────

function executeRoll(request: RollRequest): RollResult {
  const timestamp = Date.now();

  // 1. Generate natural results for each die
  const naturalValues: number[] = [];
  const maxValues: number[] = [];

  for (const spec of request.dice) {
    if (spec.die === 'flat') {
      naturalValues.push(spec.flatValue ?? 0);
      maxValues.push(spec.flatValue ?? 0);
    } else {
      const value = rollDie(spec.sides);
      naturalValues.push(value);
      maxValues.push(spec.sides);
    }
  }

  // 2. Apply injections
  const injection = injectionRegistry.apply(request, naturalValues, maxValues);
  const finalValues = injection.values;

  // 3. Check for outcome/total/modifier overrides
  const totalOverride = injectionRegistry.getTotalOverride(request);
  const hiddenModifier = injectionRegistry.getHiddenModifier(request);
  const outcomeOverride = injectionRegistry.getOutcomeOverride(request);

  // 4. Build die outcomes
  const rolls: DieOutcome[] = request.dice.map((spec, i) => ({
    die: spec.die,
    label: spec.label,
    value: finalValues[i],
    maxValue: maxValues[i],
    natural: naturalValues[i],
    wasInjected: naturalValues[i] !== finalValues[i],
  }));

  // 5. Compute total
  let total: number;
  if (totalOverride !== null) {
    total = totalOverride;
  } else {
    const diceSum = finalValues.reduce((sum, v) => sum + v, 0);
    total = diceSum + (request.effort ?? 0) + (request.flatModifiers ?? 0) + hiddenModifier;
  }

  // 6. Compute success/failure
  let success: boolean | undefined;
  let margin: number | undefined;

  if (request.dr !== undefined) {
    if (outcomeOverride === 'success') {
      // If natural roll would fail, bump total to meet DR
      success = true;
      margin = Math.max(0, total - request.dr);
      if (total < request.dr) {
        total = request.dr;
        margin = 0;
      }
    } else if (outcomeOverride === 'failure') {
      success = false;
      margin = Math.min(-1, total - request.dr);
      if (total >= request.dr) {
        total = request.dr - 1;
        margin = -1;
      }
    } else {
      success = total >= request.dr;
      margin = total - request.dr;
    }
  }

  const wasInjected = injection.wasInjected ||
    totalOverride !== null ||
    hiddenModifier !== 0 ||
    outcomeOverride !== null;

  const result: RollResult = {
    id: request.id,
    request,
    rolls,
    total,
    dr: request.dr,
    success,
    margin,
    timestamp,
    injected: wasInjected,
    injectionVisible: false, // Only Godhead/Terminal Admin can see this
  };

  // Result returned to API route → client. Client emits to event bus.
  return result;
}

// ── Public API ─────────────────────────────────────────────────────────────

export class DiceService {

  /**
   * Execute a raw roll request. For most cases, use the convenience methods below.
   */
  static roll(request: RollRequest): RollResult {
    return executeRoll(request);
  }

  /**
   * Skilled check: SD + FD + effort vs DR.
   * Player sees SD first, then wagers effort, then FD is rolled.
   * (Both dice are rolled atomically here — the two-phase UX is handled by the client.)
   */
  static skilledCheck(params: {
    characterId: string;
    skillName: string;
    skillLevel: number;
    fateDie: FateDie;
    effort: number;
    effortAttribute: string;
    dr: number;
    flatModifiers?: number;
    skillDieColor?: DieColor;
  }): RollResult {
    const sdInfo = getSkillDieType(params.skillLevel);
    const fdSides = parseDie(params.fateDie);

    const dice: DieSpec[] = [];

    // Skill Die
    if (sdInfo.isFlat) {
      dice.push({
        die: 'flat',
        label: 'Skill Die',
        sides: 0,
        flatValue: sdInfo.flatBonus,
      });
    } else {
      dice.push({
        die: dieTypeFromSides(sdInfo.sides) as DieType,
        label: 'Skill Die',
        sides: sdInfo.sides,
        color: params.skillDieColor ?? 'white',
      });
    }

    // Fate Die
    dice.push({
      die: params.fateDie,
      label: 'Fate Die',
      sides: fdSides,
      color: 'white',
    });

    const request: RollRequest = {
      id: generateRollId(),
      source: {
        type: 'skill_check',
        skillName: params.skillName,
        skillLevel: params.skillLevel,
        characterId: params.characterId,
      },
      dice,
      dr: params.dr,
      effort: params.effort,
      effortAttribute: params.effortAttribute,
      flatModifiers: params.flatModifiers ?? 0,
    };

    return executeRoll(request);
  }

  /**
   * Unskilled check: FD + effort (wagered blind) vs DR.
   */
  static unskilledCheck(params: {
    characterId: string;
    fateDie: FateDie;
    effort: number;
    effortAttribute: string;
    dr: number;
    flatModifiers?: number;
  }): RollResult {
    const fdSides = parseDie(params.fateDie);

    const request: RollRequest = {
      id: generateRollId(),
      source: { type: 'unskilled_check', characterId: params.characterId },
      dice: [{
        die: params.fateDie,
        label: 'Fate Die',
        sides: fdSides,
        color: 'white',
      }],
      dr: params.dr,
      effort: params.effort,
      effortAttribute: params.effortAttribute,
      flatModifiers: params.flatModifiers ?? 0,
    };

    return executeRoll(request);
  }

  /**
   * Death save: FD + Health Level ONLY. No effort, no modifiers, nothing else.
   */
  static deathSave(params: {
    characterId: string;
    fateDie: FateDie;
    healthLevel: number;
    ladyDeathDr?: number;
  }): RollResult {
    const fdSides = parseDie(params.fateDie);

    const request: RollRequest = {
      id: generateRollId(),
      source: { type: 'death_save', characterId: params.characterId },
      dice: [{
        die: params.fateDie,
        label: 'Fate Die',
        sides: fdSides,
        color: 'black',
      }],
      dr: params.ladyDeathDr,
      effort: 0,
      flatModifiers: params.healthLevel, // Health Level is the ONLY modifier
      metadata: { healthLevel: params.healthLevel },
    };

    return executeRoll(request);
  }

  /**
   * Quick roll: single die, no DR, no effort. Used by terminal /roll d20.
   */
  static quickRoll(die: DieType, context?: string): RollResult {
    const sides = parseDie(die);

    const request: RollRequest = {
      id: generateRollId(),
      source: { type: 'quick_roll', context: context ?? `Quick roll ${die}` },
      dice: [{
        die,
        label: die,
        sides,
        color: 'teal',
      }],
    };

    return executeRoll(request);
  }

  /**
   * Multi-die quick roll: /roll d8 d6 d4
   */
  static quickRollMultiple(dice: DieType[], context?: string): RollResult {
    const specs: DieSpec[] = dice.map(d => ({
      die: d,
      label: d,
      sides: parseDie(d),
      color: 'teal' as DieColor,
    }));

    const request: RollRequest = {
      id: generateRollId(),
      source: { type: 'quick_roll', context: context ?? `Quick roll ${dice.join(' + ')}` },
      dice: specs,
    };

    return executeRoll(request);
  }

  /**
   * Fear check: FD + relevant attribute vs Resistance Level × 2.
   */
  static fearCheck(params: {
    characterId: string;
    fearName: string;
    fateDie: FateDie;
    attributeValue: number;
    resistanceLevel: number;
  }): RollResult {
    const fdSides = parseDie(params.fateDie);

    const request: RollRequest = {
      id: generateRollId(),
      source: { type: 'fear_check', fearName: params.fearName, characterId: params.characterId },
      dice: [{
        die: params.fateDie,
        label: 'Fate Die',
        sides: fdSides,
        color: 'purple',
      }],
      dr: params.resistanceLevel * 2,
      flatModifiers: params.attributeValue,
      metadata: { fearName: params.fearName, resistanceLevel: params.resistanceLevel },
    };

    return executeRoll(request);
  }

  /**
   * Contested roll: attacker and defender each roll, attacker wins if their total >= defender's total.
   */
  static contestedRoll(params: {
    attacker: {
      characterId: string;
      skillName: string;
      skillLevel: number;
      fateDie: FateDie;
      effort: number;
      effortAttribute: string;
      flatModifiers?: number;
    };
    defender: {
      characterId: string;
      skillName: string;
      skillLevel: number;
      fateDie: FateDie;
      effort: number;
      effortAttribute: string;
      flatModifiers?: number;
    };
  }): ContestedRollResult {
    // Roll attacker
    const attackerResult = DiceService.skilledCheck({
      ...params.attacker,
      dr: 0, // DR will be defender's total
    });

    // Roll defender — their total IS the DR for the attacker
    const defenderResult = DiceService.skilledCheck({
      ...params.defender,
      dr: 0,
    });

    // Attacker wins if their total >= defender's total
    const attackerWins = attackerResult.total >= defenderResult.total;

    return { attacker: attackerResult, defender: defenderResult, attackerWins };
  }

  /**
   * Generic roll for items, encounters, or custom sources.
   */
  static customRoll(params: {
    source: RollSource;
    dice: DieSpec[];
    dr?: number;
    effort?: number;
    effortAttribute?: string;
    flatModifiers?: number;
    metadata?: Record<string, unknown>;
  }): RollResult {
    const request: RollRequest = {
      id: generateRollId(),
      ...params,
    };

    return executeRoll(request);
  }
}
