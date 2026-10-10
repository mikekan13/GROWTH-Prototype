/**
 * Senses contract v0 — the raw sensory field a branch receives at Intention.
 *
 * Mike 09-05: senses are raw input determined by BODY PARTS (eyesight range,
 * low-light, hearing, taste, non-human senses). Raw input is passive, full-
 * field, free: "if I sit in my room and look at my desk, I see it all."
 * NOTICING is conscious effort — a skill check, an action. Involuntary
 * salience (a bang, sudden movement) pops out for free.
 *
 * v0 filters by body only coarsely: an entity with no working eye/ear part is
 * told so. Unit 5 (below) lists every sensing organ with its condition and
 * gives each sense an effectiveness; the round engine still reads the flags. Everything else at the scene is in the field (theater-of-mind
 * encounter; no grid positions yet). The field is deliberately plain,
 * diegetic text — it is what the branch's planner reads and what gets
 * ledgered as the perception memory, so it must contain nothing the body
 * could not sense: no round numbers, no rolls, no DRs.
 */
import type { Participant, RoundLogEntry } from '../round/types';

export interface SensoryField {
  forParticipantId: string;
  /** Plain-text field, second person, present tense. */
  text: string;
  /** Participants visible to this entity (v0: all not-downed others at the scene). */
  visible: Array<{ id: string; name: string; side: string; downed: boolean }>;
  /** Free involuntary salience — what popped out last round (downs, hits on self). */
  salient: string[];
}

export interface FieldInput {
  self: Participant;
  participants: Participant[];
  round: number;
  /** Last round's log — what this entity witnessed (v0: everything at the scene). */
  lastRoundLog: RoundLogEntry[];
  /** GM's scene setup narration, if any (Stage 1: "GM narrates and gives the players the setup"). */
  sceneNarration?: string | null;
  /** Coarse body capability flags derived from anatomy (v0). */
  body?: { canSee: boolean; canHear: boolean };
}

// ── Sensing organs (perception unit 5) ──────────────────────────────────────
//
// Mike 2026-10-09 (Q9): the world sim receives each organ with its condition +
// properties; condition degrades the sense — "when something is broken its
// effectiveness is halved in everything." Canon tiers
// (03_ITEMS_CRAFTING/Equipment_Conditions.md): 4 Indestructible, 3 Undamaged,
// 2 Worn, 1 Broken (halved), 0 Destroyed. Body parts are items with a
// condition (body-parts-are-items ruling), so an organ is just a part whose
// name says what it senses.

export type SenseKind = 'sight' | 'hearing' | 'smell' | 'taste' | 'touch';
export const SENSE_KINDS: readonly SenseKind[] = ['sight', 'hearing', 'smell', 'taste', 'touch'];

/** Part name → the sense it carries. Word-bounded: "Heart" must not read as an ear. */
const ORGAN_PATTERNS: Record<SenseKind, RegExp> = {
  sight: /\beyes?\b/,
  hearing: /\bears?\b/,
  smell: /\b(nose|nostrils?)\b/,
  taste: /\btongue\b/,
  touch: /\bskin\b/,
};

/** The organ a default human has for each sense (used when anatomy does not model one). */
const DEFAULT_HUMAN_ORGAN: Record<SenseKind, string> = { sight: 'Eyes', hearing: 'Ears', smell: 'Nose', taste: 'Tongue', touch: 'Skin' };

const CONDITION_LABEL: Record<number, string> = { 4: 'Indestructible', 3: 'Undamaged', 2: 'Worn', 1: 'Broken', 0: 'Destroyed' };

/**
 * Canon condition → how effective the organ is. Destroyed 0, Broken halved,
 * Worn/Undamaged/Indestructible full (Equipment_Conditions.md gives Worn only
 * "minor penalties to precision tasks" — no number, so none is invented here).
 */
export function conditionEffectiveness(condition: number): number {
  if (condition <= 0) return 0;
  if (condition < 2) return 0.5;
  return 1;
}

/** One sensing organ, serialisable — what unit 6 hands the world-sim LLM. */
export interface SenseOrgan {
  sense: SenseKind;
  /** The part's name as on the sheet ('Left Eye'), or the default human organ ('Eyes'). */
  partName: string;
  /** partName segments from the anatomy root, joined by '/' ('Body/Head/Left Eye'); null for an assumed organ. */
  path: string | null;
  condition: number;
  conditionLabel: string;
  /** The part's item properties (Sharp, Brittle… or sense-specific ones a GM writes, e.g. 'Low-light'). */
  properties: string[];
  primaryMaterial: string | null;
  effectiveness: number;
  /** true = not modelled on the sheet; a default human organ, Undamaged. */
  assumed: boolean;
}

/** Every sense a being has, from its organs. JSON-safe. */
export interface SenseProfile {
  /** false = the sheet has no anatomy; every organ is the default human one. */
  anatomyModelled: boolean;
  organs: SenseOrgan[];
  /** Per sense: the BEST organ's effectiveness (0 = the sense is gone). */
  effectiveness: Record<SenseKind, number>;
  /**
   * SENSE GRANTS (Mike 2026-10-09 morning: mind-reading "could come from anything. It would be like any
   * other sense. could be an organ an item a spell... just about anything") — every sense granted by
   * something active on the being: a body part's or held item's `grantsSenses`, their item abilities',
   * its traits' (nectars, thorns, unexpired blossoms — spells act through blossoms). Organ-kind grants
   * also raise `effectiveness`; 'mind' grants are the senses that reach thoughts (mindSensesOf).
   * Empty = none (the default: no being reads minds by nature).
   */
  grants: SenseGrant[];
}

/** One granted sense, resolved from its source. JSON-safe. */
export interface SenseGrant {
  /** 'sight' | 'hearing' | 'smell' | 'taste' | 'touch' | 'mind' | another name (kept, not yet modelled). */
  sense: string;
  /** Shown to the world-sim and used as the `via` name for a mind sense ('mind reading', or the source's label). */
  name: string;
  /** 0..1 — the grant's own, scaled by its source's condition (Broken halves, Destroyed 0). */
  effectiveness: number;
  source: { kind: 'organ' | 'item' | 'ability' | 'trait'; id: string | null; label: string };
}

/** The 'mind' grants that work (effectiveness > 0), one per name (best wins). Pure. */
export function mindSensesOf(profile: Pick<SenseProfile, 'grants'> | null | undefined): Array<{ name: string; effectiveness: number }> {
  const best = new Map<string, number>();
  for (const g of profile?.grants ?? []) {
    if (g.sense !== 'mind' || !(g.effectiveness > 0)) continue;
    best.set(g.name, Math.max(best.get(g.name) ?? 0, g.effectiveness));
  }
  return [...best].map(([name, effectiveness]) => ({ name, effectiveness }));
}

/** A source's declared grants (types/growth SenseGrantSpec), validated loosely. */
type GrantSpec = { sense?: unknown; effectiveness?: unknown; name?: unknown };
function specsOf(v: unknown): Array<{ sense: string; effectiveness: number; name: string | null }> {
  if (!Array.isArray(v)) return [];
  return (v as GrantSpec[]).flatMap((g) => {
    if (!g || typeof g !== 'object' || typeof g.sense !== 'string' || !g.sense.trim()) return [];
    const e = typeof g.effectiveness === 'number' && Number.isFinite(g.effectiveness) ? Math.min(1, Math.max(0, g.effectiveness)) : 1;
    return [{ sense: g.sense.trim().toLowerCase(), effectiveness: e, name: typeof g.name === 'string' && g.name.trim() ? g.name.trim() : null }];
  });
}

/** Grants on one item-shaped source (a body part / a held item) and its item abilities, scaled by its condition. */
function grantsOnItem(node: { grantsSenses?: unknown; itemAbilities?: unknown; condition?: unknown }, kind: 'organ' | 'item', id: string | null, label: string): SenseGrant[] {
  const scale = conditionEffectiveness(typeof node.condition === 'number' ? node.condition : 3);
  const out: SenseGrant[] = specsOf(node.grantsSenses).map((g) => ({ sense: g.sense, name: g.name ?? (g.sense === 'mind' ? label : g.sense), effectiveness: g.effectiveness * scale, source: { kind, id, label } }));
  if (Array.isArray(node.itemAbilities)) {
    for (const a of node.itemAbilities as Array<{ name?: unknown; grantsSenses?: unknown }>) {
      const aLabel = typeof a?.name === 'string' && a.name ? a.name : label;
      for (const g of specsOf(a?.grantsSenses)) out.push({ sense: g.sense, name: g.name ?? (g.sense === 'mind' ? aLabel : g.sense), effectiveness: g.effectiveness * scale, source: { kind: 'ability', id, label: `${label}: ${aLabel}` } });
    }
  }
  return out;
}

/** A held item as the sense pass reads it (CampaignItem row; `data` = GrowthWorldItem JSON or parsed). */
export interface SenseItemSource { id: string; name: string; data: unknown }

export interface SenseProfileOptions {
  /** ACTIVE items the being holds (equipped or carried) — their grants and their abilities' grants. */
  items?: SenseItemSource[];
  /** Campaign clock: blossoms with expiresAtCycle <= nowCycle grant nothing. Omitted = every trait on the sheet counts. */
  nowCycle?: number;
}

function assumedOrgan(sense: SenseKind): SenseOrgan {
  return { sense, partName: DEFAULT_HUMAN_ORGAN[sense], path: null, condition: 3, conditionLabel: 'Undamaged', properties: [], primaryMaterial: null, effectiveness: 1, assumed: true };
}

/**
 * The being's sensing organs and per-sense effectiveness from its sheet.
 * No anatomy → a default human (every sense at 1). Anatomy that models no organ
 * for a sense → that sense is the default human one (as v0 did for eyes/ears:
 * a head with no eye parts still sees). Several organs for one sense → the best
 * one counts (one good eye sees). Pure.
 */
export function senseProfileFromSheet(sheet: { bodyAnatomy?: unknown; traits?: unknown } | null | undefined, opts: SenseProfileOptions = {}): SenseProfile {
  type Part = { partName?: string; condition?: number; properties?: unknown; primaryMaterial?: string; contains?: Part[]; grantsSenses?: unknown; itemAbilities?: unknown; id?: string };
  const root = sheet?.bodyAnatomy as Part | undefined;
  const organs: SenseOrgan[] = [];
  const grants: SenseGrant[] = [];
  if (root && typeof root === 'object') {
    const walk = (n: Part, parentPath: string[]) => {
      const partName = n.partName ?? '';
      const path = [...parentPath, partName];
      const name = partName.toLowerCase();
      for (const sense of SENSE_KINDS) {
        if (!ORGAN_PATTERNS[sense].test(name)) continue;
        const condition = typeof n.condition === 'number' ? n.condition : 3;
        organs.push({
          sense, partName, path: path.join('/'), condition,
          conditionLabel: CONDITION_LABEL[condition] ?? 'Unknown',
          properties: Array.isArray(n.properties) ? n.properties.filter((p): p is string => typeof p === 'string') : [],
          primaryMaterial: n.primaryMaterial ?? null,
          effectiveness: conditionEffectiveness(condition),
          assumed: false,
        });
      }
      grants.push(...grantsOnItem(n, 'organ', typeof n.id === 'string' ? n.id : null, partName || 'body'));
      for (const c of n.contains ?? []) walk(c, path);
    };
    walk(root, []);
  }
  for (const sense of SENSE_KINDS) if (!organs.some((o) => o.sense === sense)) organs.push(assumedOrgan(sense));
  for (const it of opts.items ?? []) {
    let d: unknown = it.data;
    if (typeof d === 'string') { try { d = JSON.parse(d); } catch { d = null; } }
    // A loose body part (a severed eye) grants nothing to its holder.
    if (!d || typeof d !== 'object' || (d as { isBodyPart?: boolean }).isBodyPart) continue;
    grants.push(...grantsOnItem(d as Part, 'item', it.id, it.name));
  }
  if (Array.isArray(sheet?.traits)) {
    for (const t of sheet.traits as Array<{ name?: unknown; type?: unknown; grantsSenses?: unknown; expiresAtCycle?: unknown }>) {
      if (!t || typeof t !== 'object') continue;
      if (t.type === 'blossom' && typeof t.expiresAtCycle === 'number' && typeof opts.nowCycle === 'number' && t.expiresAtCycle <= opts.nowCycle) continue;
      const label = typeof t.name === 'string' && t.name ? t.name : 'trait';
      for (const g of specsOf(t.grantsSenses)) grants.push({ sense: g.sense, name: g.name ?? (g.sense === 'mind' ? label : g.sense), effectiveness: g.effectiveness, source: { kind: 'trait', id: null, label } });
    }
  }
  // An organ-kind grant (goggles that see, a blossom of keen hearing) counts like an organ: the best source wins.
  const effectiveness = Object.fromEntries(
    SENSE_KINDS.map((s) => [s, Math.max(...organs.filter((o) => o.sense === s).map((o) => o.effectiveness), ...grants.filter((g) => g.sense === s).map((g) => g.effectiveness))]),
  ) as Record<SenseKind, number>;
  return { anatomyModelled: !!root && typeof root === 'object', organs, effectiveness, grants };
}

/** v0 sense flags, now derived from organ effectiveness (> 0 = the sense works); no anatomy = human default.
 *  Shared by the round engine and the perception composer (daya/perceive.ts). */
export function senseFlagsFromSheet(sheet: { bodyAnatomy?: unknown; traits?: unknown } | null | undefined): { canSee: boolean; canHear: boolean } {
  const { effectiveness } = senseProfileFromSheet(sheet);
  return { canSee: effectiveness.sight > 0, canHear: effectiveness.hearing > 0 };
}

export function buildSensoryField(input: FieldInput): SensoryField {
  const { self, participants, round, lastRoundLog } = input;
  const canSee = input.body?.canSee ?? true;
  const canHear = input.body?.canHear ?? true;
  const others = participants.filter(p => p.id !== self.id);
  const visible = canSee ? others.map(p => ({ id: p.id, name: p.name, side: p.side, downed: p.downed })) : [];

  const salient: string[] = [];
  for (const l of lastRoundLog) {
    if (!l.narration) continue;
    if (l.kind === 'downed') salient.push(l.narration);
    else if (l.kind === 'damage' && l.targetId === self.id) salient.push(`You are hit — ${l.narration}`);
  }

  const lines: string[] = [];
  if (input.sceneNarration) lines.push(input.sceneNarration.trim());
  if (!canSee && !canHear) {
    lines.push('You cannot see or hear. You feel the ground and the air.');
  } else {
    if (canSee) {
      const allies = visible.filter(v => v.side === self.side && !v.downed).map(v => v.name);
      const foes = visible.filter(v => v.side !== self.side && !v.downed).map(v => v.name);
      const down = visible.filter(v => v.downed).map(v => v.name);
      if (foes.length) lines.push(`Against you: ${foes.join(', ')}.`);
      if (allies.length) lines.push(`With you: ${allies.join(', ')}.`);
      if (down.length) lines.push(`Down: ${down.join(', ')}.`);
      if (!foes.length && !allies.length) lines.push('No one else stands here.');
    } else {
      lines.push('You cannot see. You hear movement around you.');
    }
    if (round > 1) {
      const recent = lastRoundLog.filter(l => l.narration).slice(-6).map(l => l.narration as string);
      if (recent.length) lines.push('A moment ago: ' + recent.join('. ') + '.');
    }
  }
  if (self.downed) lines.push('You are down.');
  if (salient.length) lines.push('What grabs you: ' + salient.join('. '));

  return { forParticipantId: self.id, text: lines.join('\n'), visible, salient };
}
