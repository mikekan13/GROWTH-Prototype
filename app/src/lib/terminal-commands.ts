/**
 * Terminal Command Parser + Executor
 *
 * Parses /commands from the terminal input and executes them using the same
 * character-actions.ts functions that UI buttons use. Plain text (no / prefix)
 * is treated as a chat message.
 *
 * Commands:
 *   /roll <die> [die...]                              — Quick die roll (d4/d6/d8/d12/d20)
 *   /roll <skill> dr:<n> effort:<n> attr:<attribute>  — Skill check (legacy, use /check)
 *   /check <skill> dr:<n> effort:<n> attr:<attribute> — Full skill check via DiceService
 *   /deathsave [dr:<n>]                               — Death save (FD + Health Level vs DR)
 *   /spend <attribute> <amount>                       — Spend from attribute pool
 *   /restore <attribute> <amount>                     — Restore to attribute pool
 *   /session start [name]                             — Start a new game session
 *   /session end                                      — End the current session
 *   /inject list                                      — (Godhead) List active injections
 *   /inject clear                                     — (Godhead) Remove all injections
 *   /inject remove <id>                               — (Godhead) Remove specific injection
 *   /inject ensure-success [next|char:<id>]           — (Godhead) Force next roll to succeed
 *   /inject ensure-failure [next|char:<id>]           — (Godhead) Force next roll to fail
 *   /inject set <value> next                          — (Godhead) Set next roll to value
 */

import type { GrowthCharacter, FateDie } from '@/types/growth';
import type { TerminalPayload, DiceRollPayload, CommandPayload, GameEventPayload } from '@/types/terminal';
import type { DieType } from '@/types/dice';
import { performSkillCheck, spendAttribute, restoreAttribute, type AttributeName, type ActionResult, type SkillCheckActionResult } from './character-actions';
import { parseDie } from './dice';
import { DiceService } from '@/services/dice';

// ── Types ──────────────────────────────────────────────────────────────────

export interface CommandResult {
  /** Updated character data (null if command doesn't modify character) */
  character: GrowthCharacter | null;
  /** Human-readable changes for changelog */
  changes: string[];
  /** Events to send to the terminal */
  events: Array<{ type: string; payload: TerminalPayload }>;
  /** Error message if command failed */
  error?: string;
}

// ── Parser ─────────────────────────────────────────────────────────────────

interface ParsedArgs {
  positional: string[];
  named: Record<string, string>;
}

function parseArgs(parts: string[]): ParsedArgs {
  const positional: string[] = [];
  const named: Record<string, string> = {};

  for (const part of parts) {
    if (part.includes(':')) {
      const idx = part.indexOf(':');
      named[part.slice(0, idx).toLowerCase()] = part.slice(idx + 1);
    } else {
      positional.push(part.toLowerCase());
    }
  }

  return { positional, named };
}

// ── Executor ───────────────────────────────────────────────────────────────

/**
 * Execute a terminal command. Returns the result including any character updates
 * and terminal events to emit.
 */
export function executeCommand(
  input: string,
  character: GrowthCharacter | null,
): CommandResult {
  const trimmed = input.trim();
  if (!trimmed.startsWith('/')) {
    // Not a command — should be handled as chat by the caller
    return { character: null, changes: [], events: [], error: 'Not a command' };
  }

  const parts = trimmed.slice(1).split(/\s+/);
  const command = parts[0]?.toLowerCase();
  const rest = parts.slice(1);
  const args = parseArgs(rest);

  switch (command) {
    case 'roll':
      return executeRoll(args, character);
    case 'check':
      return executeCheck(args, character);
    case 'deathsave':
      return executeDeathSave(args, character);
    case 'spend':
      return executeSpend(args, character);
    case 'restore':
      return executeRestore(args, character);
    case 'session':
      return executeSession(args);
    case 'inject':
      return executeInject(args);
    default:
      return {
        character: null,
        changes: [],
        events: [{
          type: 'command',
          payload: { kind: 'command', input: trimmed, result: `Unknown command: /${command}`, success: false } as CommandPayload,
        }],
        error: `Unknown command: /${command}`,
      };
  }
}

// ── /roll ──────────────────────────────────────────────────────────────────

function executeRoll(args: ParsedArgs, character: GrowthCharacter | null): CommandResult {
  // Quick die roll: /roll d20, /roll d6, /roll d8 d6
  const dieArgs = args.positional.filter(p => p.match(/^d\d+$/));
  if (dieArgs.length > 0 && dieArgs.length === args.positional.length) {
    // Validate all dice
    for (const die of dieArgs) {
      if (parseDie(die) === 0) {
        return makeError(`/roll ${die}`, `Invalid die: ${die}`);
      }
    }

    const rollResult = dieArgs.length === 1
      ? DiceService.quickRoll(dieArgs[0] as DieType, `Quick roll ${dieArgs[0]}`)
      : DiceService.quickRollMultiple(dieArgs as DieType[], `Quick roll ${dieArgs.join(' + ')}`);

    const payload: DiceRollPayload = {
      kind: 'dice_roll',
      context: rollResult.request.source.type === 'quick_roll' ? (rollResult.request.source as { type: 'quick_roll'; context: string }).context : 'Quick roll',
      fateDie: { die: rollResult.rolls[0].die, value: rollResult.rolls[0].value },
      total: rollResult.total,
      isSkilled: false,
    };

    return {
      character: null,
      changes: [],
      events: [{ type: 'dice_roll', payload }],
    };
  }

  // Skill check: /roll <skill> dr:<n> effort:<n> attr:<attribute>
  if (!character) {
    return makeError('/roll', 'No character selected for skill check');
  }

  const skillName = args.positional[0];
  if (!skillName) {
    return makeError('/roll', 'Usage: /roll <skill> dr:<n> effort:<n> attr:<attribute> — or /roll <die>');
  }

  const dr = parseInt(args.named.dr || '0');
  const effort = parseInt(args.named.effort || '0');
  const attrName = args.named.attr as AttributeName | undefined;

  if (!dr) {
    return makeError(`/roll ${skillName}`, 'Missing dr:<number> — the difficulty rating');
  }
  if (!attrName) {
    return makeError(`/roll ${skillName}`, 'Missing attr:<attribute> — which attribute to spend effort from');
  }

  const result: SkillCheckActionResult = performSkillCheck(character, {
    skillName,
    effortAttribute: attrName,
    effortAmount: effort,
    dr,
  });

  const roll = result.roll;
  const payload: DiceRollPayload = {
    kind: 'dice_roll',
    context: `${skillName} check vs DR ${dr}`,
    skillName,
    skillLevel: character.skills.find(s => s.name.toLowerCase() === skillName.toLowerCase())?.level,
    skillDie: roll.skillDie,
    fateDie: roll.fateDie,
    effort,
    effortAttribute: attrName,
    total: roll.total,
    dr,
    success: roll.success,
    margin: roll.margin,
    isSkilled: roll.isSkilled,
  };

  return {
    character: result.character,
    changes: result.changes,
    events: [{ type: 'dice_roll', payload }],
  };
}

// ── /check ─────────────────────────────────────────────────────────────────

function executeCheck(args: ParsedArgs, character: GrowthCharacter | null): CommandResult {
  // /check <skill> dr:<n> effort:<n> attr:<attribute>
  // Alias for /roll <skill> ... but more explicit
  if (!character) {
    return makeError('/check', 'No character selected');
  }

  const skillName = args.positional[0];
  if (!skillName) {
    return makeError('/check', 'Usage: /check <skill> dr:<n> effort:<n> attr:<attribute>');
  }

  const dr = parseInt(args.named.dr || '0');
  const effort = parseInt(args.named.effort || '0');
  const attrName = args.named.attr as AttributeName | undefined;

  if (!dr) {
    return makeError(`/check ${skillName}`, 'Missing dr:<number>');
  }
  if (!attrName) {
    return makeError(`/check ${skillName}`, 'Missing attr:<attribute>');
  }

  const skill = character.skills.find(s => s.name.toLowerCase() === skillName.toLowerCase());
  const fateDie = (character.creation?.seed?.baseFateDie || 'd6') as FateDie;

  const rollResult = skill
    ? DiceService.skilledCheck({
        characterId: character.identity?.name || 'unknown',
        skillName: skill.name,
        skillLevel: skill.level,
        fateDie,
        effort,
        effortAttribute: attrName,
        dr,
      })
    : DiceService.unskilledCheck({
        characterId: character.identity?.name || 'unknown',
        fateDie,
        effort,
        effortAttribute: attrName,
        dr,
      });

  // Spend effort from character (effort is always spent)
  const spendResult = spendAttribute(character, attrName, effort);

  const sdRoll = rollResult.rolls.find(r => r.label === 'Skill Die');
  const fdRoll = rollResult.rolls.find(r => r.label === 'Fate Die') || rollResult.rolls[0];

  const payload: DiceRollPayload = {
    kind: 'dice_roll',
    context: `${skillName} check vs DR ${dr}`,
    skillName: skill?.name,
    skillLevel: skill?.level,
    skillDie: sdRoll ? { die: sdRoll.die, value: sdRoll.value, isFlat: sdRoll.die === 'flat' } : undefined,
    fateDie: { die: fdRoll.die, value: fdRoll.value },
    effort,
    effortAttribute: attrName,
    total: rollResult.total,
    dr,
    success: rollResult.success,
    margin: rollResult.margin,
    isSkilled: !!skill,
  };

  const resultLabel = rollResult.success ? 'SUCCESS' : 'FAILURE';
  const skillLabel = skill ? skill.name : `${skillName} (unskilled)`;

  return {
    character: spendResult.character,
    changes: [
      `${skillLabel} check vs DR ${dr}: ${resultLabel} (total ${rollResult.total}, margin ${rollResult.margin})`,
      ...spendResult.changes,
    ],
    events: [{ type: 'dice_roll', payload }],
  };
}

// ── /deathsave ────────────────────────────────────────────────────────────

function executeDeathSave(args: ParsedArgs, character: GrowthCharacter | null): CommandResult {
  if (!character) {
    return makeError('/deathsave', 'No character selected');
  }

  const fateDie = (character.creation?.seed?.baseFateDie || 'd6') as FateDie;
  const healthLevel = character.attributes?.constitution?.level ?? 1;
  const ladyDeathDr = parseInt(args.named.dr || '10');

  const rollResult = DiceService.deathSave({
    characterId: character.identity?.name || 'unknown',
    fateDie,
    healthLevel,
    ladyDeathDr,
  });

  const fdRoll = rollResult.rolls[0];
  const payload: DiceRollPayload = {
    kind: 'dice_roll',
    context: `Death Save vs Lady Death (DR ${ladyDeathDr})`,
    fateDie: { die: fdRoll.die, value: fdRoll.value },
    total: rollResult.total,
    dr: ladyDeathDr,
    success: rollResult.success,
    margin: rollResult.margin,
    isSkilled: false,
  };

  const resultLabel = rollResult.success ? 'SURVIVED' : 'FALLEN';

  return {
    character: null,
    changes: [`Death Save: ${resultLabel} (${fdRoll.die}[${fdRoll.value}] + ${healthLevel} health = ${rollResult.total} vs DR ${ladyDeathDr})`],
    events: [{ type: 'dice_roll', payload }],
  };
}

// ── /inject (Godhead only) ────────────────────────────────────────────────

function executeInject(args: ParsedArgs): CommandResult {
  // Lazy import to avoid circular deps at module level
  const { injectionRegistry } = require('@/services/dice-injection');

  const action = args.positional[0];

  if (action === 'list') {
    const injections = injectionRegistry.list();
    const lines = injections.length === 0
      ? ['No active injections']
      : injections.map((inj: { id: string; filter: { type: string }; override: { type: string }; reason: string }) =>
          `[${inj.id}] filter:${inj.filter.type} override:${inj.override.type} — ${inj.reason}`
        );
    const cmdPayload: CommandPayload = {
      kind: 'command',
      input: '/inject list',
      result: lines.join('\n'),
      success: true,
    };
    return { character: null, changes: [], events: [{ type: 'command', payload: cmdPayload }] };
  }

  if (action === 'clear') {
    injectionRegistry.clear();
    const cmdPayload: CommandPayload = {
      kind: 'command',
      input: '/inject clear',
      result: 'All injections cleared',
      success: true,
    };
    return { character: null, changes: [], events: [{ type: 'command', payload: cmdPayload }] };
  }

  if (action === 'remove' && args.positional[1]) {
    const removed = injectionRegistry.remove(args.positional[1]);
    const cmdPayload: CommandPayload = {
      kind: 'command',
      input: `/inject remove ${args.positional[1]}`,
      result: removed ? `Removed injection ${args.positional[1]}` : `Injection ${args.positional[1]} not found`,
      success: removed,
    };
    return { character: null, changes: [], events: [{ type: 'command', payload: cmdPayload }] };
  }

  // /inject ensure-success next — next roll auto-succeeds
  if (action === 'ensure-success') {
    const id = `inj_${Date.now().toString(36)}`;
    const target = args.positional[1] || 'next';
    const filter = target === 'next'
      ? { type: 'next_roll' as const }
      : args.named.char
        ? { type: 'character' as const, characterId: args.named.char }
        : { type: 'next_roll' as const };

    injectionRegistry.register({
      id,
      priority: 10,
      filter,
      override: { type: 'ensure_success' },
      oneShot: true,
      reason: `Terminal /inject ensure-success`,
      createdBy: 'godhead',
    });

    const cmdPayload: CommandPayload = {
      kind: 'command',
      input: `/inject ensure-success ${target}`,
      result: `Injection ${id}: next matching roll will succeed`,
      success: true,
    };
    return { character: null, changes: [], events: [{ type: 'command', payload: cmdPayload }] };
  }

  if (action === 'ensure-failure') {
    const id = `inj_${Date.now().toString(36)}`;
    const target = args.positional[1] || 'next';
    const filter = target === 'next'
      ? { type: 'next_roll' as const }
      : args.named.char
        ? { type: 'character' as const, characterId: args.named.char }
        : { type: 'next_roll' as const };

    injectionRegistry.register({
      id,
      priority: 10,
      filter,
      override: { type: 'ensure_failure' },
      oneShot: true,
      reason: `Terminal /inject ensure-failure`,
      createdBy: 'godhead',
    });

    const cmdPayload: CommandPayload = {
      kind: 'command',
      input: `/inject ensure-failure ${target}`,
      result: `Injection ${id}: next matching roll will fail`,
      success: true,
    };
    return { character: null, changes: [], events: [{ type: 'command', payload: cmdPayload }] };
  }

  // /inject set <value> next — set next roll to specific value
  if (action === 'set' && args.positional[1]) {
    const value = parseInt(args.positional[1]);
    if (isNaN(value)) {
      return makeError('/inject set', `Invalid value: ${args.positional[1]}`);
    }

    const id = `inj_${Date.now().toString(36)}`;
    injectionRegistry.register({
      id,
      priority: 10,
      filter: { type: 'next_roll' },
      override: { type: 'set_values', values: [value, value] },
      oneShot: true,
      reason: `Terminal /inject set ${value}`,
      createdBy: 'godhead',
    });

    const cmdPayload: CommandPayload = {
      kind: 'command',
      input: `/inject set ${value}`,
      result: `Injection ${id}: next roll dice set to ${value}`,
      success: true,
    };
    return { character: null, changes: [], events: [{ type: 'command', payload: cmdPayload }] };
  }

  return makeError('/inject', 'Usage: /inject list | clear | remove <id> | ensure-success [next|char:<id>] | ensure-failure [next|char:<id>] | set <value> next');
}

// ── /spend ─────────────────────────────────────────────────────────────────

function executeSpend(args: ParsedArgs, character: GrowthCharacter | null): CommandResult {
  if (!character) {
    return makeError('/spend', 'No character selected');
  }

  const attrName = args.positional[0] as AttributeName | undefined;
  const amount = parseInt(args.positional[1] || '0');

  if (!attrName || !amount) {
    return makeError('/spend', 'Usage: /spend <attribute> <amount>');
  }

  const result: ActionResult = spendAttribute(character, attrName, amount);
  const cmdPayload: CommandPayload = {
    kind: 'command',
    input: `/spend ${attrName} ${amount}`,
    result: result.changes.join('; ') || 'No change',
    success: result.changes.length > 0,
  };

  return {
    character: result.character,
    changes: result.changes,
    events: [{ type: 'command', payload: cmdPayload }],
  };
}

// ── /restore ───────────────────────────────────────────────────────────────

function executeRestore(args: ParsedArgs, character: GrowthCharacter | null): CommandResult {
  if (!character) {
    return makeError('/restore', 'No character selected');
  }

  const attrName = args.positional[0] as AttributeName | undefined;
  const amount = parseInt(args.positional[1] || '0');

  if (!attrName || !amount) {
    return makeError('/restore', 'Usage: /restore <attribute> <amount>');
  }

  const result: ActionResult = restoreAttribute(character, attrName, amount);
  const cmdPayload: CommandPayload = {
    kind: 'command',
    input: `/restore ${attrName} ${amount}`,
    result: result.changes.join('; ') || 'No change',
    success: result.changes.length > 0,
  };

  return {
    character: result.character,
    changes: result.changes,
    events: [{ type: 'command', payload: cmdPayload }],
  };
}

// ── /session ───────────────────────────────────────────────────────────────

function executeSession(args: ParsedArgs): CommandResult {
  const action = args.positional[0];
  if (action === 'start' || action === 'end') {
    // Session commands are handled server-side by the caller
    // We return a game_event payload that the terminal component will
    // intercept and call the session API
    const name = action === 'start' ? args.positional.slice(1).join(' ') || undefined : undefined;
    const payload: GameEventPayload = {
      kind: 'game_event',
      eventType: action === 'start' ? 'session_start' : 'session_end',
      description: action === 'start'
        ? `Session started${name ? `: ${name}` : ''}`
        : 'Session ended',
    };

    return {
      character: null,
      changes: [],
      events: [{ type: 'game_event', payload }],
    };
  }

  return makeError('/session', 'Usage: /session start [name] — or /session end');
}

// ── Helpers ────────────────────────────────────────────────────────────────

function makeError(input: string, message: string): CommandResult {
  return {
    character: null,
    changes: [],
    events: [{
      type: 'command',
      payload: { kind: 'command', input, result: message, success: false } as CommandPayload,
    }],
    error: message,
  };
}
