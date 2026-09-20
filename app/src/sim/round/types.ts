/**
 * Reality Simulation — combat round types (Unit 1, 2026-09-05).
 *
 * Authority: REALITY-SIM-DESIGN-2026-09-02.md §6.1 (Mike's round walkthrough).
 * A round is 6 seconds sliced into as many slots as the fastest participant
 * has actions. Every entity — PC, NPC, creature, object — runs the same loop;
 * a player or the GM may override the ACT step only.
 */

export type Pillar = 'body' | 'spirit' | 'soul';

export const PILLARS: Pillar[] = ['body', 'spirit', 'soul'];

/** Per-pillar action pool for one round (canon: max(1, floor(sum levels/25)) + ActionMod). */
export interface ActionPools {
  body: number;
  spirit: number;
  soul: number;
}

/** The three speed gauges (Mike 09-03): Celerity for Body, Frequency for Spirit, Wisdom for Soul. Max-pool values. */
export interface SpeedGauges {
  celerity: number;
  frequency: number;
  wisdom: number;
}

export type Governor =
  | 'clout' | 'celerity' | 'constitution'
  | 'flow' | 'focus'
  | 'willpower' | 'wisdom' | 'wit';

export type AttrKey = Governor | 'frequency';

export const ATTR_KEYS: AttrKey[] = ['clout', 'celerity', 'constitution', 'flow', 'frequency', 'focus', 'willpower', 'wisdom', 'wit'];

export interface ParticipantSkill {
  name: string;
  level: number;
  governors: Governor[];
}

export type Control = 'player' | 'gm' | 'branch';

export type FateDie = 'd4' | 'd6' | 'd8' | 'd12' | 'd20';

/**
 * Snapshot of one participant for the round engine. Built from the character
 * sheet at encounter creation and refreshed after every round (attribute
 * currents move with Effort spend and attribute damage).
 */
export interface Participant {
  id: string;            // characterId
  name: string;
  side: string;          // 'party' | 'hostile' | any label the GM assigns
  control: Control;      // who supplies the ACT step
  pools: ActionPools;
  actionMod: number;     // items/Nectars/conditions — v0 always 0 (layer 4 hook)
  gauges: SpeedGauges;
  skills: ParticipantSkill[];
  fateDie: FateDie;
  /** Attribute pools (current / max) — Effort is wagered from these; Frequency is the life pool. */
  attrs: Record<AttrKey, { current: number; max: number }>;
  /** EFFECTIVE resist of the held interposable item (base, halved when Broken, 0 when Destroyed). */
  heldResist: number;
  /** The item's base resist (condition-independent). */
  heldBaseResist: number;
  /** Condition tier 0–4 (4 Indestructible, 3 Undamaged, 2 Worn, 1 Broken, 0 Destroyed). */
  heldCondition: number;
  heldItemId: string | null;
  heldItemName: string | null;
  downed: boolean;
}

export type IntentionKind =
  | 'attack'   // a skill/unskilled check against a target, damage on success
  | 'skill'    // any non-attack skill check (perception, stabilize, climb…)
  | 'move'     // movement (universal substitution — any pillar's action)
  | 'negate'   // readied Negate against a named attacker (skill check, matching governor, contested)
  | 'block'    // readied deliberate block (skill check; skips speed gate; total = extra resist)
  | 'reserve'  // unassigned — kept in hand; using it reactively costs priority
  | 'hold';    // committed (e.g. a grapple hold) — occupies the slot, no new roll unless re-rolled

export type DamageType = 'piercing' | 'slashing' | 'bashing' | 'heat' | 'cold' | 'decay' | 'energy';

export interface Intention {
  id: string;
  participantId: string;
  pillar: Pillar;
  kind: IntentionKind;
  description: string;
  /** Skill used, if any (must exist on the participant's sheet and be usable from `pillar`). */
  skillName?: string;
  /** UNSKILLED checks still use an attribute (Mike 09-20): the governing attribute of the raw
   *  check, from the action's pillar. A negate against an unskilled attack must have it as a governor. */
  attribute?: Governor;
  /** Target participant for attack / negate / block-against. */
  targetId?: string;
  /** Attack fields (v0: the sim has no weapon model yet — declared on the intention). */
  damageType?: DamageType;
  baseDamage?: number;
  /** Situational DR for attack/skill checks — the GM's call in v0 (default DEFAULT_DR); the sim derives it later. */
  dr?: number;
  /** Effort wagered (canon: ALWAYS spent, from a governor of the action's pillar; capped by FD max + skill level). */
  effort?: number;
  /** Which attribute the Effort comes from — must belong to the action's pillar. Defaults at declare time. */
  effortAttribute?: Governor;
  /** Piercing only: partName path below the root the attacker designates. */
  piercingTargetPath?: string[];
  /**
   * Redirect preference (Mike 09-05: the PLAYER decides where a reflex
   * redirect sends the hit). v0: 'held' = the held item interposes; a
   * partName = that part takes it (piercing path semantics).
   */
  redirectTo?: 'held' | string;
}

/** One participant's action placed in one slot. */
export interface SlotEntry {
  participantId: string;
  actionIndex: number;   // 0-based within that participant's round
  intentionId: string | null; // null = unassigned (reserve)
}

export interface Slot {
  index: number;
  entries: SlotEntry[];
}

export interface OrderedSlotEntry extends SlotEntry {
  speedScore: number;
  /** Explanation of the layers that produced the score, for the GM's eyes and the fine-tune corpus. */
  speedTrace: string;
}

export interface OrderedSlot {
  index: number;
  entries: OrderedSlotEntry[];
}

export type RoundLogKind =
  | 'order' | 'action' | 'check' | 'effort' | 'negate' | 'redirect' | 'block'
  | 'damage' | 'downed' | 'skip' | 'note';

export interface RoundLogEntry {
  slot: number;
  kind: RoundLogKind;
  actorId: string | null;
  targetId: string | null;
  text: string;
  /** Structured detail (rolls, totals, damage events) for replay. */
  detail?: Record<string, unknown>;
  /** Diegetic line — what a witness perceives, no numbers. This is what enters memory ledgers. */
  narration?: string;
}

export interface RoundResult {
  round: number;
  slots: OrderedSlot[];
  log: RoundLogEntry[];
  /** Participants downed during this round (vital destroyed or Frequency crossed to ≤ 0). */
  downed: string[];
}
