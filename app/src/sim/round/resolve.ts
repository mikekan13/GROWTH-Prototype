/**
 * Round resolver (pure core, side-effects injected).
 *
 * Walks the ordered slots and resolves each action under Mike's rulings
 * (REALITY-SIM-DESIGN §6.1):
 *  - Consequences land AS EACH SLOT RESOLVES ("Impact" = the components of a
 *    hit apply together when it hits — not deferral to end of round). A
 *    creature downed in slot 2 does not act in slot 4.
 *  - Within a shared slot the faster action lands first and may pre-empt
 *    (the sim's call; v0 = deterministic pre-emption, logged).
 *  - Defense ladder: reflex REDIRECT (free; needs ≥1 action remaining;
 *    speed-gated, defender-favored; the defender chose the interposition at
 *    Intention) → deliberate BLOCK (spends an action; skips the gate; check
 *    total = extra resist on the interposed item) → NEGATE (spends an action;
 *    skill check with a governor matching the attack's skill; CONTESTED —
 *    attacker must beat the negate total, ties to the defender).
 *  - Grapple hold / re-roll, mid-round reactive changes (one free change,
 *    reserve-with-priority-loss) are Unit 2: v0 defenses are declared at
 *    Intention as readied negate/block intentions naming the attacker.
 *  - No weapons model yet: damage type/base ride on the attack intention.
 *    Damage on hit = baseDamage + margin (v0 placeholder — the sim will
 *    derive this once items carry damage values).
 */
import type {
  DamageType, Intention, OrderedSlot, Participant, RoundLogEntry, RoundResult,
} from './types';
import { actionsRemainingAt } from './slots';
import { gaugeForPillar, pillarOfGovernor } from './action-economy';

/** Defender-favored margin for the reflex speed gate (Mike 09-05: "defender should get an advantage"). */
export const REDIRECT_DEFENDER_ADVANTAGE = 1.25;
/** Default situational DR when nothing contests the check (v0 reality default; the sim will derive it). */
export const DEFAULT_DR = 10;

export interface CheckOutcome {
  total: number;
  success: boolean;
  margin: number;
  dr: number;
  isSkilled: boolean;
  skillDie?: string;
  fateDie?: string;
  effort: number;
}

/** Injected: performs a skill/unskilled check for a participant. */
export type CheckFn = (args: {
  participant: Participant;
  skillName?: string;
  effort: number;
  dr: number;
}) => CheckOutcome;

export interface DamageOutcome {
  /** Human-readable summary of the cascade (parts hit, conditions). */
  summary: string;
  /** True when a Seed-declared VITAL part hit condition 0 → Facing Death door opens (GM-enacted). */
  vitalDestroyed: boolean;
  /** True when the target's Frequency is at/below 0 after this hit (if known). */
  frequencyOut: boolean;
  detail?: Record<string, unknown>;
}

/** Injected: applies damage to a participant's body (services/damage in production). */
export type DamageFn = (args: {
  targetId: string;
  damageType: DamageType;
  amount: number;
  piercingTargetPath?: string[];
  note: string;
}) => Promise<DamageOutcome>;

export interface ResolveDeps {
  check: CheckFn;
  applyDamage: DamageFn;
}

interface ResolveState {
  participants: Map<string, Participant>;
  intentions: Map<string, Intention>;
  /** Readied defenses consumed when used. intentionId → used */
  consumedIntentions: Set<string>;
  downed: Set<string>;
  log: RoundLogEntry[];
}

function findReadiedDefense(state: ResolveState, defenderId: string, attackerId: string, kind: 'negate' | 'block'): Intention | null {
  for (const i of state.intentions.values()) {
    if (i.participantId !== defenderId || i.kind !== kind) continue;
    if (state.consumedIntentions.has(i.id)) continue;
    if (i.targetId && i.targetId !== attackerId) continue;
    return i;
  }
  return null;
}

function attackGovernors(attacker: Participant, attack: Intention): string[] {
  if (attack.skillName) {
    const s = attacker.skills.find(k => k.name === attack.skillName);
    if (s) return s.governors;
  }
  // Unskilled attack: no skill governors — the negate rule falls back to pillar matching.
  return [];
}

/** Negate rule: the negating skill must share ≥1 governor with the attacking skill (Mike 09-05). */
function negateGovernorMatches(defender: Participant, negate: Intention, attacker: Participant, attack: Intention): boolean {
  const attackGov = new Set(attackGovernors(attacker, attack));
  if (attackGov.size === 0) {
    // Unskilled attack: match on the attack's PILLAR instead (a raw Body swing is negated by any Body-governed skill).
    const negSkill = defender.skills.find(s => s.name === negate.skillName);
    if (!negSkill) return negate.pillar === attack.pillar;
    return negSkill.governors.some(g => pillarOfGovernor(g) === attack.pillar);
  }
  const negSkill = defender.skills.find(s => s.name === negate.skillName);
  if (!negSkill) return false;
  return negSkill.governors.some(g => attackGov.has(g));
}

function push(state: ResolveState, slot: number, kind: RoundLogEntry['kind'], actorId: string | null, targetId: string | null, text: string, detail?: Record<string, unknown>) {
  state.log.push({ slot, kind, actorId, targetId, text, detail });
}

async function resolveAttack(
  state: ResolveState,
  deps: ResolveDeps,
  slots: OrderedSlot[],
  slotIndex: number,
  attacker: Participant,
  attack: Intention,
  attackSpeed: number,
): Promise<void> {
  const target = attack.targetId ? state.participants.get(attack.targetId) : undefined;
  if (!target) {
    push(state, slotIndex, 'note', attacker.id, null, `${attacker.name}: ${attack.description} — no target`);
    return;
  }
  if (state.downed.has(target.id)) {
    push(state, slotIndex, 'skip', attacker.id, target.id, `${attacker.name}'s ${attack.description} — ${target.name} is already down`);
    return;
  }

  // ── Negate (contested) ──────────────────────────────────────────────
  let dr = DEFAULT_DR;
  let negated = false;
  const negate = findReadiedDefense(state, target.id, attacker.id, 'negate');
  let negateTotal: number | null = null;
  if (negate) {
    state.consumedIntentions.add(negate.id);
    if (!negateGovernorMatches(target, negate, attacker, attack)) {
      push(state, slotIndex, 'negate', target.id, attacker.id,
        `${target.name} tries to negate with ${negate.skillName ?? 'no skill'} — no governor in common with the attack; the negate fails to apply`);
    } else {
      const n = deps.check({ participant: target, skillName: negate.skillName, effort: negate.effort ?? 0, dr: DEFAULT_DR });
      negateTotal = n.total;
      dr = Math.max(dr, n.total);
      push(state, slotIndex, 'negate', target.id, attacker.id,
        `${target.name} negates with ${negate.skillName ?? 'raw'} → ${n.total} becomes the DR (ties to defender)`, { negate: n });
    }
  }

  // ── Attacker's check ────────────────────────────────────────────────
  const c = deps.check({ participant: attacker, skillName: attack.skillName, effort: attack.effort ?? 0, dr });
  // Contested: attacker must BEAT the negate total (ties → defender). Uncontested: total ≥ DR.
  const hit = negateTotal !== null ? c.total > negateTotal : c.success;
  push(state, slotIndex, 'check', attacker.id, target.id,
    `${attacker.name} ${attack.description} (${attack.skillName ?? 'unskilled'}): ${c.total} vs DR ${dr} → ${hit ? 'HIT' : 'MISS'}`, { check: c });
  if (!hit) {
    if (negateTotal !== null) negated = true;
    if (negated) push(state, slotIndex, 'negate', target.id, attacker.id, `${target.name} negates ${attacker.name}'s ${attack.description} completely`);
    return;
  }

  // ── Damage amount (v0 placeholder — sim derives once items carry damage) ──
  const damageType: DamageType = attack.damageType ?? 'bashing';
  let amount = Math.max(1, (attack.baseDamage ?? 2) + Math.max(0, c.total - dr));
  let piercingTargetPath = attack.piercingTargetPath;

  // ── Deliberate block (spends an action; skips the gate; total = extra resist) ──
  const block = findReadiedDefense(state, target.id, attacker.id, 'block');
  if (block) {
    state.consumedIntentions.add(block.id);
    const b = deps.check({ participant: target, skillName: block.skillName, effort: block.effort ?? 0, dr: DEFAULT_DR });
    const resist = target.heldResist + b.total;
    const absorbed = Math.min(amount, resist);
    amount -= absorbed;
    push(state, slotIndex, 'block', target.id, attacker.id,
      `${target.name} blocks with ${target.heldItemName ?? 'a guard'} (${block.skillName ?? 'raw'} ${b.total} + resist ${target.heldResist}) — absorbs ${absorbed}${amount > 0 ? `, ${amount} gets through` : ', nothing gets through'}`, { block: b, absorbed });
    if (amount <= 0) return;
  } else {
    // ── Reflex redirect (free; needs ≥1 action remaining; speed-gated, defender-favored) ──
    const remaining = actionsRemainingAt(slots, target.id, slotIndex + 1) + (slotHasLaterEntry(slots[slotIndex], target.id, attacker.id) ? 1 : 0);
    if (remaining >= 1) {
      const reflex = gaugeForPillar(target.gauges, 'body') * REDIRECT_DEFENDER_ADVANTAGE;
      if (reflex >= attackSpeed) {
        const to = findRedirectPreference(state, target.id);
        if (to === 'held' && target.heldResist > 0) {
          const absorbed = Math.min(amount, target.heldResist);
          amount -= absorbed;
          push(state, slotIndex, 'redirect', target.id, attacker.id,
            `${target.name}'s reflex brings ${target.heldItemName ?? 'the held item'} up — absorbs ${absorbed}${amount > 0 ? `, ${amount} gets through` : ''} (reflex ${reflex.toFixed(0)} ≥ attack speed ${attackSpeed.toFixed(0)})`, { absorbed, reflex, attackSpeed });
          if (amount <= 0) return;
        } else if (to && to !== 'held') {
          // Redirect onto a chosen part: expressed as the piercing path for piercing damage.
          if (damageType === 'piercing') piercingTargetPath = [to];
          push(state, slotIndex, 'redirect', target.id, attacker.id,
            `${target.name} twists — takes it on the ${to} (reflex ${reflex.toFixed(0)} ≥ attack speed ${attackSpeed.toFixed(0)})`, { reflex, attackSpeed, to });
        }
      } else {
        push(state, slotIndex, 'redirect', target.id, attacker.id,
          `${target.name} can't react in time (reflex ${reflex.toFixed(0)} < attack speed ${attackSpeed.toFixed(0)})`, { reflex, attackSpeed });
      }
    } else {
      push(state, slotIndex, 'redirect', target.id, attacker.id, `${target.name} has no action left to react with`);
    }
  }

  // ── Apply damage — consequences land now, this slot ──────────────────
  const d = await deps.applyDamage({
    targetId: target.id,
    damageType,
    amount,
    piercingTargetPath,
    note: `Round slot ${slotIndex + 1}: ${attacker.name} ${attack.description}`,
  });
  push(state, slotIndex, 'damage', attacker.id, target.id, `${amount} ${damageType} → ${target.name}: ${d.summary}`, d.detail);
  if (d.vitalDestroyed || d.frequencyOut) {
    state.downed.add(target.id);
    push(state, slotIndex, 'downed', attacker.id, target.id,
      `${target.name} goes down${d.vitalDestroyed ? ' — a vital part is destroyed; Facing Death (GM enacts Tara\'s roll)' : ''}`);
  }
}

function slotHasLaterEntry(slot: OrderedSlot, participantId: string, currentActorId: string): boolean {
  // Within the same slot, the defender's own entry still counts as "in hand" if it hasn't resolved yet.
  const idx = slot.entries.findIndex(e => e.participantId === currentActorId);
  return slot.entries.slice(idx + 1).some(e => e.participantId === participantId);
}

function findRedirectPreference(state: ResolveState, participantId: string): 'held' | string | null {
  for (const i of state.intentions.values()) {
    if (i.participantId === participantId && i.redirectTo) return i.redirectTo;
  }
  return 'held';
}

export async function resolveRound(
  round: number,
  slots: OrderedSlot[],
  participants: Participant[],
  intentions: Intention[],
  deps: ResolveDeps,
): Promise<RoundResult> {
  const state: ResolveState = {
    participants: new Map(participants.map(p => [p.id, p])),
    intentions: new Map(intentions.map(i => [i.id, i])),
    consumedIntentions: new Set(),
    downed: new Set(participants.filter(p => p.downed).map(p => p.id)),
    log: [],
  };

  for (const slot of slots) {
    push(state, slot.index, 'order', null, null,
      `Slot ${slot.index + 1}: ` + slot.entries.map(e => `${state.participants.get(e.participantId)?.name ?? e.participantId} (${e.speedScore.toFixed(0)})`).join(' → '),
      { entries: slot.entries.map(e => ({ participantId: e.participantId, score: e.speedScore, trace: e.speedTrace })) });

    for (const entry of slot.entries) {
      const actor = state.participants.get(entry.participantId);
      if (!actor) continue;
      if (state.downed.has(actor.id)) {
        push(state, slot.index, 'skip', actor.id, null, `${actor.name} is down — action lost`);
        continue;
      }
      const intention = entry.intentionId ? state.intentions.get(entry.intentionId) : undefined;
      if (!intention) {
        push(state, slot.index, 'action', actor.id, null, `${actor.name} holds an action in reserve`);
        continue;
      }
      switch (intention.kind) {
        case 'attack':
          await resolveAttack(state, deps, slots, slot.index, actor, intention, entry.speedScore);
          break;
        case 'skill': {
          const c = deps.check({ participant: actor, skillName: intention.skillName, effort: intention.effort ?? 0, dr: DEFAULT_DR });
          push(state, slot.index, 'check', actor.id, intention.targetId ?? null,
            `${actor.name} ${intention.description} (${intention.skillName ?? 'unskilled'}): ${c.total} vs DR ${c.dr} → ${c.success ? 'success' : 'fail'}`, { check: c });
          break;
        }
        case 'move':
          push(state, slot.index, 'action', actor.id, intention.targetId ?? null, `${actor.name} moves: ${intention.description}`);
          break;
        case 'negate':
        case 'block':
          if (state.consumedIntentions.has(intention.id)) {
            push(state, slot.index, 'action', actor.id, intention.targetId ?? null, `${actor.name}'s ${intention.kind} was spent earlier this round`);
          } else {
            push(state, slot.index, 'action', actor.id, intention.targetId ?? null, `${actor.name} stays readied to ${intention.kind}${intention.targetId ? ` against ${state.participants.get(intention.targetId)?.name ?? 'a foe'}` : ''}`);
          }
          break;
        case 'hold':
          push(state, slot.index, 'action', actor.id, intention.targetId ?? null, `${actor.name} holds: ${intention.description}`);
          break;
        case 'reserve':
          push(state, slot.index, 'action', actor.id, null, `${actor.name} keeps an action unassigned`);
          break;
      }
    }
  }

  return {
    round,
    slots,
    log: state.log,
    downed: [...state.downed].filter(id => !participants.find(p => p.id === id)?.downed),
  };
}
