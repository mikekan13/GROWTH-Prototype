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
 *  - Defense ladder: reflex REDIRECT (free; needs ≥1 UNSPENT action;
 *    speed-gated, defender-favored; the defender chose the interposition at
 *    Intention) → deliberate BLOCK (spends an action; skips the gate; check
 *    total = extra resist on the interposed item) → NEGATE (spends an action;
 *    a SKILL check with a governor matching the attack's skill; CONTESTED —
 *    attacker must beat the negate total, ties to the defender).
 *  - The interposed item WEARS: a hit that reaches its effective resist drops
 *    its condition one tier (canon Damage_Type_Interactions); 3× resist
 *    destroys it. Broken (1) = half resist; Destroyed (0) = nothing left.
 *  - Effort (canon §5): ALWAYS spent, from the action-pillar's governor; the
 *    injected `check` performs the spend and reports what was actually
 *    wagered (a Muted or empty pool may reduce it).
 *  - Every consequential log entry also carries a diegetic `narration` — what
 *    a witness would perceive — which is what enters memory ledgers (the
 *    numbers are the sim's, not the being's).
 *  - A failure inside one action is logged and the round continues, so the
 *    record is always complete and persisted (consequences already landed).
 *  - Grapple hold / re-roll, mid-round reactive changes (one free change,
 *    reserve-with-priority-loss) are Unit 2: v0 defenses are declared at
 *    Intention as readied negate/block intentions naming the attacker.
 *  - No weapons model yet: damage type/base ride on the attack intention.
 *    Damage on hit = baseDamage + margin (v0 placeholder — the sim will
 *    derive this once items carry damage values).
 */
import type {
  DamageType, Governor, Intention, OrderedSlot, Participant, RoundLogEntry, RoundResult,
} from './types';
import { gaugeForPillar, pillarOfGovernor, totalActions } from './action-economy';

/** Defender-favored margin for the reflex speed gate (Mike 09-05: "defender should get an advantage"). Must beat the largest pillar bias (1.3) at equal gauges. */
export const REDIRECT_DEFENDER_ADVANTAGE = 1.5;
/** Below a full reflex, a near-miss still allows a CONSTRAINED pick (held item only). Ratio of reflex/attack speed. */
export const REDIRECT_CONSTRAINED_BAND = 0.8;
/** Default situational DR when nothing contests the check (v0 reality default; the sim will derive it). */
export const DEFAULT_DR = 10;
/** Canon: a hit of 3× resist destroys the item outright. */
export const MASSIVE_DAMAGE_MULTIPLIER = 3;

export interface CheckOutcome {
  total: number;
  success: boolean;
  margin: number;
  dr: number;
  isSkilled: boolean;
  skillDie?: string;
  fateDie?: string;
  /** Effort actually wagered and spent (may be less than asked if the pool was short or Muted). */
  effort: number;
  effortAttribute?: Governor;
  /** Human note when the wager was reduced (Muted, empty pool). */
  effortNote?: string;
}

/** Injected: performs a skill/unskilled check for a participant, spending the Effort it reports. */
export type CheckFn = (args: {
  participant: Participant;
  skillName?: string;
  effort: number;
  effortAttribute?: Governor;
  dr: number;
}) => CheckOutcome | Promise<CheckOutcome>;

export interface DamageOutcome {
  /** Human-readable summary of the cascade (parts hit, conditions, pool). */
  summary: string;
  /** Diegetic version for memory (what a witness sees). */
  narration?: string;
  /** True when a Seed-declared VITAL part hit condition 0 → Facing Death door opens (GM-enacted). */
  vitalDestroyed: boolean;
  /** True when this hit took Frequency from > 0 to ≤ 0 (canon Facing Death trigger a). */
  frequencyOut: boolean;
  detail?: Record<string, unknown>;
}

/** Injected: applies damage to a participant's body + attribute pool (services/damage + character-attribute in production). */
export type DamageFn = (args: {
  targetId: string;
  damageType: DamageType;
  amount: number;
  piercingTargetPath?: string[];
  note: string;
}) => Promise<DamageOutcome>;

/** Injected: persists a held item's new condition after it wore (CampaignItem in production). */
export type WearFn = (args: { targetId: string; itemId: string | null; condition: number; destroyed: boolean }) => Promise<void>;

export interface ResolveDeps {
  check: CheckFn;
  applyDamage: DamageFn;
  wearHeld?: WearFn;
}

interface ResolveState {
  participants: Map<string, Participant>;
  intentions: Map<string, Intention>;
  /** Readied defenses consumed when used. intentionId → used */
  consumedIntentions: Set<string>;
  /** Actions USED per participant this round (attack/skill/move/hold resolved, or a readied defense consumed). */
  spent: Map<string, number>;
  downed: Set<string>;
  log: RoundLogEntry[];
}

function spend(state: ResolveState, participantId: string) {
  state.spent.set(participantId, (state.spent.get(participantId) ?? 0) + 1);
}

/** Mike 09-05: a Redirect requires at least one action REMAINING (unspent) — it doesn't use it. */
function actionsInHand(state: ResolveState, p: Participant): number {
  return totalActions(p.pools) - (state.spent.get(p.id) ?? 0);
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

/**
 * Negate rule (Mike 09-05): the negating SKILL must share ≥1 governor with the
 * attacking skill. Against an UNSKILLED attack (no governors) v0 applies the
 * reality default — the negate skill must have a governor in the attack's
 * pillar. [QUESTION for Mike: is that the GROWTH rule for unskilled attacks?]
 */
function negateGovernorMatches(defender: Participant, negate: Intention, attacker: Participant, attack: Intention): boolean {
  const negSkill = defender.skills.find(s => s.name === negate.skillName);
  if (!negSkill) return false;
  const attackSkill = attack.skillName ? attacker.skills.find(k => k.name === attack.skillName) : undefined;
  if (!attackSkill) return negSkill.governors.some(g => pillarOfGovernor(g) === attack.pillar);
  const attackGov = new Set(attackSkill.governors);
  return negSkill.governors.some(g => attackGov.has(g));
}

function push(state: ResolveState, slot: number, kind: RoundLogEntry['kind'], actorId: string | null, targetId: string | null, text: string, detail?: Record<string, unknown>, narration?: string) {
  state.log.push({ slot, kind, actorId, targetId, text, detail, narration });
}

function effortSuffix(c: CheckOutcome): string {
  if (!c.effort && !c.effortNote) return '';
  const spent = c.effort ? ` +${c.effort} Effort from ${c.effortAttribute ?? 'pool'}` : '';
  return `${spent}${c.effortNote ? ` (${c.effortNote})` : ''}`;
}

/** Item condition tiers (canon): 4 Indestructible, 3 Undamaged, 2 Worn, 1 Broken (half resist), 0 Destroyed. */
function effectiveResist(base: number, condition: number): number {
  if (condition <= 0) return 0;
  if (condition === 1) return Math.floor(base / 2);
  return base;
}

/** Wear the held item after it absorbed a hit. Returns the new condition or null when nothing changed. */
async function wearHeldItem(state: ResolveState, deps: ResolveDeps, slot: number, target: Participant, incoming: number, resistApplied: number): Promise<void> {
  if (!target.heldItemName || target.heldCondition <= 0 || target.heldCondition >= 4) return; // nothing, or indestructible
  if (incoming < resistApplied) return; // canon: "hits/exceeds resist → drops one tier"; block: "if not exceeded, doesn't tick"
  const before = target.heldCondition;
  const destroyed = incoming >= resistApplied * MASSIVE_DAMAGE_MULTIPLIER && resistApplied > 0;
  target.heldCondition = destroyed ? 0 : Math.max(0, before - 1);
  target.heldResist = effectiveResist(target.heldBaseResist, target.heldCondition);
  const label = target.heldCondition === 0 ? 'DESTROYED' : target.heldCondition === 1 ? 'Broken (half resist)' : target.heldCondition === 2 ? 'Worn' : 'Undamaged';
  push(state, slot, 'note', target.id, null, `${target.name}'s ${target.heldItemName} takes the hit: condition ${before}→${target.heldCondition} (${label})`, { itemId: target.heldItemId, conditionBefore: before, conditionAfter: target.heldCondition },
    target.heldCondition === 0 ? `${target.name}'s ${target.heldItemName} is smashed apart` : `${target.name}'s ${target.heldItemName} is damaged`);
  if (deps.wearHeld) {
    try { await deps.wearHeld({ targetId: target.id, itemId: target.heldItemId, condition: target.heldCondition, destroyed: target.heldCondition === 0 }); }
    catch (err) { push(state, slot, 'note', target.id, null, `could not persist item wear: ${(err as Error).message}`); }
  }
}

async function resolveAttack(
  state: ResolveState,
  deps: ResolveDeps,
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

  // ── Negate (contested; a skill check, spends the readied action when it applies) ──
  // The situational DR is the GM's call (v0: declared on the intention; the sim will derive it later).
  const situationalDr = attack.dr ?? DEFAULT_DR;
  let dr = situationalDr;
  const negate = findReadiedDefense(state, target.id, attacker.id, 'negate');
  let negateTotal: number | null = null;
  if (negate) {
    if (!negate.skillName) {
      push(state, slotIndex, 'negate', target.id, attacker.id, `${target.name}'s readied negate has no skill — a negate is a skill check; it stays unused`);
    } else if (!negateGovernorMatches(target, negate, attacker, attack)) {
      push(state, slotIndex, 'negate', target.id, attacker.id,
        `${target.name}'s ${negate.skillName} shares no governor with this attack — the negate doesn't apply here and stays in hand`);
    } else {
      state.consumedIntentions.add(negate.id);
      spend(state, target.id);
      const n = await deps.check({ participant: target, skillName: negate.skillName, effort: negate.effort ?? 0, effortAttribute: negate.effortAttribute, dr: DEFAULT_DR });
      negateTotal = n.total;
      // A weak negate never makes you EASIER to hit than standing still: the situational DR still floors it.
      dr = Math.max(situationalDr, n.total);
      push(state, slotIndex, 'negate', target.id, attacker.id,
        `${target.name} negates with ${negate.skillName} → ${n.total}${effortSuffix(n)}; DR ${dr} (ties to defender)`, { negate: n },
        `${target.name} moves to slip ${attacker.name}'s ${attack.description}`);
    }
  }

  // ── Attacker's check ────────────────────────────────────────────────
  spend(state, attacker.id);
  const c = await deps.check({ participant: attacker, skillName: attack.skillName, effort: attack.effort ?? 0, effortAttribute: attack.effortAttribute, dr });
  // Contested: attacker must BEAT the negate total (ties → defender) and still meet the floor.
  const hit = c.total >= dr && (negateTotal === null || c.total > negateTotal);
  const described = attack.description.includes(target.name) ? attack.description : `${attack.description} at ${target.name}`;
  push(state, slotIndex, 'check', attacker.id, target.id,
    `${attacker.name} ${attack.description} (${attack.skillName ?? 'unskilled'}): ${c.total}${effortSuffix(c)} vs DR ${dr} → ${hit ? 'HIT' : 'MISS'}`, { check: c },
    `${attacker.name} ${described} — ${hit ? 'it connects' : 'it misses'}`);
  if (!hit) {
    if (negateTotal !== null) push(state, slotIndex, 'negate', target.id, attacker.id, `${target.name} negates ${attacker.name}'s ${attack.description} completely`, undefined, `${target.name} avoids it entirely`);
    return;
  }

  // ── Damage amount (v0 placeholder — sim derives once items carry damage) ──
  const damageType: DamageType = attack.damageType ?? 'bashing';
  let amount = Math.max(1, (attack.baseDamage ?? 2) + Math.max(0, c.total - dr));
  const incoming = amount;
  let piercingTargetPath = attack.piercingTargetPath;

  // ── Deliberate block (spends an action; skips the gate; total = extra resist on the held item) ──
  const block = findReadiedDefense(state, target.id, attacker.id, 'block');
  if (block && target.heldResist > 0) {
    state.consumedIntentions.add(block.id);
    spend(state, target.id);
    const b = await deps.check({ participant: target, skillName: block.skillName, effort: block.effort ?? 0, effortAttribute: block.effortAttribute, dr: DEFAULT_DR });
    const resist = target.heldResist + b.total;
    const absorbed = Math.min(amount, resist);
    amount -= absorbed;
    push(state, slotIndex, 'block', target.id, attacker.id,
      `${target.name} blocks with ${target.heldItemName} (${block.skillName ?? 'raw'} ${b.total}${effortSuffix(b)} + resist ${target.heldResist}) — absorbs ${absorbed}${amount > 0 ? `, ${amount} gets through` : ', nothing gets through'}`, { block: b, absorbed },
      `${target.name} catches it on ${target.heldItemName}${amount > 0 ? ', but some gets through' : ''}`);
    await wearHeldItem(state, deps, slotIndex, target, incoming, resist);
    if (amount <= 0) return;
  } else {
    if (block) push(state, slotIndex, 'block', target.id, attacker.id, `${target.name} readied a block but holds nothing to interpose — it stays unused`);
    // ── Reflex redirect (free; needs ≥1 unspent action; speed-gated, defender-favored) ──
    if (actionsInHand(state, target) >= 1) {
      const reflex = gaugeForPillar(target.gauges, 'body') * REDIRECT_DEFENDER_ADVANTAGE;
      const ratio = attackSpeed > 0 ? reflex / attackSpeed : Infinity;
      const band = ratio >= 1 ? 'free' : ratio >= REDIRECT_CONSTRAINED_BAND ? 'constrained' : 'none';
      const gate = `reflex ${reflex.toFixed(0)} vs attack speed ${attackSpeed.toFixed(0)}`;
      if (band === 'none') {
        push(state, slotIndex, 'redirect', target.id, attacker.id, `${target.name} can't react in time (${gate})`, { reflex, attackSpeed, band });
      } else {
        const pref = findRedirectPreference(state, target.id);
        const to = band === 'constrained' && pref !== 'held' ? 'held' : pref; // constrained = held item only
        if (to === 'held' && target.heldResist > 0) {
          const absorbed = Math.min(amount, target.heldResist);
          amount -= absorbed;
          push(state, slotIndex, 'redirect', target.id, attacker.id,
            `${target.name}'s reflex brings ${target.heldItemName} up${band === 'constrained' ? ' (barely)' : ''} — absorbs ${absorbed}${amount > 0 ? `, ${amount} gets through` : ''} (${gate})`, { absorbed, reflex, attackSpeed, band },
            `${target.name} gets ${target.heldItemName} in the way${amount > 0 ? ', not all of it' : ''}`);
          await wearHeldItem(state, deps, slotIndex, target, incoming, target.heldResist + absorbed - absorbed);
          if (amount <= 0) return;
        } else if (to && to !== 'held') {
          if (damageType === 'piercing') {
            piercingTargetPath = [to];
            push(state, slotIndex, 'redirect', target.id, attacker.id, `${target.name} twists — takes it on the ${to} (${gate})`, { reflex, attackSpeed, to, band },
              `${target.name} twists to take it on the ${to}`);
          } else {
            // Canon: only piercing designates a single path; every other type even-splits.
            push(state, slotIndex, 'redirect', target.id, attacker.id, `${target.name} reacts in time, but ${damageType} can't be steered onto the ${to} — it spreads by canon (${gate})`, { reflex, attackSpeed, to, band });
          }
        } else {
          push(state, slotIndex, 'redirect', target.id, attacker.id, `${target.name} reacts in time but has nothing to interpose (${gate})`, { reflex, attackSpeed, band });
        }
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
  push(state, slotIndex, 'damage', attacker.id, target.id, `${amount} ${damageType} → ${target.name}: ${d.summary}`, d.detail, d.narration ?? `${target.name} is hurt`);
  if (d.vitalDestroyed || d.frequencyOut) {
    state.downed.add(target.id);
    const why = d.vitalDestroyed ? 'a vital part is destroyed' : 'Frequency is gone';
    push(state, slotIndex, 'downed', attacker.id, target.id, `${target.name} goes down — ${why}; Facing Death (GM enacts Tara's roll)`, undefined, `${target.name} goes down`);
  }
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
    spent: new Map(),
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
      try {
        switch (intention.kind) {
          case 'attack':
            await resolveAttack(state, deps, slot.index, actor, intention, entry.speedScore);
            break;
          case 'skill': {
            spend(state, actor.id);
            const c = await deps.check({ participant: actor, skillName: intention.skillName, effort: intention.effort ?? 0, effortAttribute: intention.effortAttribute, dr: intention.dr ?? DEFAULT_DR });
            push(state, slot.index, 'check', actor.id, intention.targetId ?? null,
              `${actor.name} ${intention.description} (${intention.skillName ?? 'unskilled'}): ${c.total}${effortSuffix(c)} vs DR ${c.dr} → ${c.success ? 'success' : 'fail'}`, { check: c },
              `${actor.name} ${intention.description} — ${c.success ? 'and manages it' : 'and fails'}`);
            break;
          }
          case 'move':
            spend(state, actor.id);
            push(state, slot.index, 'action', actor.id, intention.targetId ?? null, `${actor.name} moves: ${intention.description}`, undefined, `${actor.name} moves: ${intention.description}`);
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
            spend(state, actor.id);
            push(state, slot.index, 'action', actor.id, intention.targetId ?? null, `${actor.name} holds: ${intention.description}`, undefined, `${actor.name} holds: ${intention.description}`);
            break;
          case 'reserve':
            push(state, slot.index, 'action', actor.id, null, `${actor.name} keeps an action unassigned`);
            break;
        }
      } catch (err) {
        // The record stays complete: consequences that already landed are persisted by the deps; this action is marked failed.
        push(state, slot.index, 'note', actor.id, intention.targetId ?? null, `${actor.name}'s ${intention.kind} could not be resolved: ${(err as Error)?.message ?? String(err)}`);
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
