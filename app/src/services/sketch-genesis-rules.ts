/**
 * SKETCH genesis — the pure half (Mike 2026-10-12: improvised NPCs "need a
 * mechanically valid sheet as fast as possible").
 *
 * Everything here is deterministic and DB-free: parse the one model answer,
 * repair it into canon, build the sheet, and fit it to the Watcher's wallet.
 * A sketch is REPAIRED, never rejected for shape or length: an over-long
 * name is clipped, a d2 skill becomes d4, an attribute of 40 becomes 20, a
 * sheet over the wallet is lowered skill-level by skill-level, then
 * attribute-level by attribute-level, until it fits. The only refusal is a
 * wallet that cannot cover even the bare seed (the wallet is never bypassed).
 *
 * Canon used:
 *   - 1 KRMA per attribute level, 1 per skill level (attributes-and-skills-krma-rates)
 *   - skill levels 1–20; 1–3 are flat bonuses, the DIE starts at level 4 = d4;
 *     tiers d4(4) d6(6) d8(8) d12(12) d20(20) — there is no d2/d3 (skill-tiers-start-at-d4)
 *   - TKV = lib/kv-calculator (the one formula the sheet and the ledger share)
 *   - Frequency comes from the seed (Human 40); the model does not set it.
 */
import type { GrowthCharacter, SkillGovernor, GrowthSkill } from '@/types/growth';
import { SKILL_GOVERNORS } from '@/types/growth';
import { calculateCharacterTKV } from '@/lib/kv-calculator';

export const SKETCH_ATTRS = ['clout', 'celerity', 'constitution', 'flow', 'focus', 'willpower', 'wisdom', 'wit'] as const;
export type SketchAttr = typeof SKETCH_ATTRS[number];

export const SKETCH_LIMITS = {
  attrMin: 1,
  attrMax: 20,
  skillMin: 1,
  skillMax: 20,
  maxSkills: 8,
  maxTraitHints: 2,
  minMemories: 3,
  maxMemories: 5,
  nameChars: 60,
  personaChars: 240,
  voiceChars: 240,
  memoryChars: 280,
  skillNameChars: 60,
  seedTextChars: 4000,
} as const;

/** Skill die → the lowest level of that tier. Anything below d4 is d4 (no d2/d3 in canon). */
export function levelForDie(die: string): number | null {
  const m = /d\s*(\d+)/i.exec(die);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  if (n <= 4) return 4;
  if (n <= 6) return 6;
  if (n <= 8) return 8;
  if (n <= 12) return 12;
  return 20;
}

export function clampInt(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v) : NaN;
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.round(n)));
}

/** Clip to n chars at a word boundary when one is near; never throws. */
export function clip(s: unknown, n: number): string {
  const t = typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : '';
  if (t.length <= n) return t;
  const cut = t.slice(0, n);
  const sp = cut.lastIndexOf(' ');
  return (sp > n * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:.-]+$/, '') + '…';
}

export interface SketchTraitHint { name: string; type: 'nectar' | 'thorn'; note?: string }

export interface SketchProposal {
  name: string;
  persona: string;
  voice: string;
  memories: string[];
  seedName: string | null;
  attributes: Record<SketchAttr, number>;
  skills: GrowthSkill[];
  traitHints: SketchTraitHint[];
  /** What was repaired, for the Watcher's summary and the log. */
  repairs: string[];
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/** Repair one skill proposal into canon. Returns null when it has no name. */
export function normalizeSkill(raw: unknown, repairs: string[]): GrowthSkill | null {
  const r = asRecord(raw);
  const name = clip(r.name, SKETCH_LIMITS.skillNameChars);
  if (!name) return null;
  let level: number;
  const rawLevel = typeof r.level === 'number' || (typeof r.level === 'string' && /^\s*\d+\s*$/.test(r.level)) ? Number(r.level) : NaN;
  if (Number.isFinite(rawLevel)) {
    level = clampInt(rawLevel, SKETCH_LIMITS.skillMin, SKETCH_LIMITS.skillMax, SKETCH_LIMITS.skillMin);
    if (level !== rawLevel) repairs.push(`skill ${name}: level ${rawLevel} → ${level}`);
  } else {
    const dieStr = typeof r.die === 'string' ? r.die : typeof r.level === 'string' ? r.level : '';
    const fromDie = levelForDie(dieStr);
    level = fromDie ?? 4;
    if (dieStr && /d\s*[0-3]\b/i.test(dieStr)) repairs.push(`skill ${name}: ${dieStr} → d4 (no skill die below d4)`);
    else if (fromDie === null) repairs.push(`skill ${name}: no level → d4`);
  }
  const govIn = Array.isArray(r.governors) ? r.governors : typeof r.governor === 'string' ? [r.governor] : [];
  const governors = govIn
    .map((g) => (typeof g === 'string' ? g.toLowerCase().trim() : ''))
    .filter((g): g is SkillGovernor => (SKILL_GOVERNORS as string[]).includes(g))
    .filter((g, i, a) => a.indexOf(g) === i)
    .slice(0, 3);
  if (governors.length === 0) {
    repairs.push(`skill ${name}: no valid governor → focus`);
    governors.push('focus');
  }
  const description = clip(r.note ?? r.description, 160) || undefined;
  return { name, level, governors, ...(description ? { description } : {}) };
}

/**
 * Repair the model's answer into a canon-shaped proposal. Accepts anything
 * (null when the answer was not JSON) and always returns a usable proposal.
 */
export function normalizeProposal(raw: unknown, seedText: string): SketchProposal {
  const r = asRecord(raw);
  const repairs: string[] = [];
  if (!raw) repairs.push('model answer unreadable — bare stock sketch');

  let name = clip(r.name, SKETCH_LIMITS.nameChars);
  if (!name) { name = 'Stranger'; repairs.push('no name → "Stranger"'); }
  const persona = clip(r.persona, SKETCH_LIMITS.personaChars) || clip(seedText, SKETCH_LIMITS.personaChars);
  const voice = clip(r.voice ?? r.voiceRegister, SKETCH_LIMITS.voiceChars) || 'Plain, direct, their own cadence.';

  const memIn = Array.isArray(r.memories) ? r.memories : [];
  const memories = memIn
    .map((m) => clip(typeof m === 'string' ? m : asRecord(m).content, SKETCH_LIMITS.memoryChars))
    .filter((m) => m.length > 0)
    .slice(0, SKETCH_LIMITS.maxMemories);
  if (memIn.length > SKETCH_LIMITS.maxMemories) repairs.push(`memories ${memIn.length} → ${SKETCH_LIMITS.maxMemories}`);

  const seedName = typeof r.seedName === 'string' && r.seedName.trim() ? clip(r.seedName, 60) : null;

  const attrIn = asRecord(r.attributes);
  const attributes = {} as Record<SketchAttr, number>;
  for (const k of SKETCH_ATTRS) {
    const v = clampInt(attrIn[k], SKETCH_LIMITS.attrMin, SKETCH_LIMITS.attrMax, SKETCH_LIMITS.attrMin);
    const rawN = typeof attrIn[k] === 'number' ? (attrIn[k] as number) : Number(attrIn[k]);
    if (Number.isFinite(rawN) && rawN !== v) repairs.push(`${k} ${rawN} → ${v}`);
    attributes[k] = v;
  }

  const skillIn = Array.isArray(r.skills) ? r.skills : [];
  const byName = new Map<string, GrowthSkill>();
  for (const s of skillIn) {
    const n = normalizeSkill(s, repairs);
    if (!n) continue;
    const key = n.name.toLowerCase();
    const prev = byName.get(key);
    if (!prev || n.level > prev.level) byName.set(key, n);
  }
  let skills = Array.from(byName.values());
  if (skills.length > SKETCH_LIMITS.maxSkills) {
    repairs.push(`skills ${skills.length} → ${SKETCH_LIMITS.maxSkills}`);
    skills = skills.sort((a, b) => b.level - a.level).slice(0, SKETCH_LIMITS.maxSkills);
  }

  const traitIn = Array.isArray(r.traitHints) ? r.traitHints : Array.isArray(r.traits) ? r.traits : [];
  const traitHints: SketchTraitHint[] = [];
  for (const t of traitIn) {
    const tr = asRecord(t);
    const tname = clip(typeof t === 'string' ? t : tr.name, 60);
    if (!tname) continue;
    const type = tr.type === 'thorn' ? 'thorn' : 'nectar';
    const note = clip(tr.note, 160) || undefined;
    traitHints.push({ name: tname, type, ...(note ? { note } : {}) });
    if (traitHints.length >= SKETCH_LIMITS.maxTraitHints) break;
  }

  return { name, persona, voice, memories, seedName, attributes, skills, traitHints, repairs };
}

/** Extract the first balanced JSON object from model text; null when none parses. */
export function extractJson(text: string): unknown {
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fence ? fence[1] : text;
  const start = candidate.indexOf('{');
  if (start < 0) return null;
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < candidate.length; i++) {
    const c = candidate[i];
    if (inStr) {
      if (esc) esc = false;
      else if (c === '\\') esc = true;
      else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') inStr = true;
    else if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) {
        try { return JSON.parse(candidate.slice(start, i + 1)); } catch { return null; }
      }
    }
  }
  return null;
}

/**
 * Lay the proposal onto a seed-applied base sheet: attribute LEVELS (seed
 * augments stay as they are), pools full, skills merged over any seed
 * skills, the persona as `_npc.description` (what perception reads), and
 * the trait hints as plain text under `_sketch` (NOT priced, NOT traits —
 * the deep pipeline / Forge authors real ones).
 */
export function buildSketchSheet(base: GrowthCharacter, p: SketchProposal, seedText: string): GrowthCharacter {
  const next: GrowthCharacter = JSON.parse(JSON.stringify(base));
  next.identity = { ...next.identity, name: p.name };
  for (const k of SKETCH_ATTRS) {
    const a = next.attributes[k] ?? { level: 1, current: 1, augmentPositive: 0, augmentNegative: 0 };
    a.level = p.attributes[k];
    next.attributes[k] = a;
  }
  const byName = new Map<string, GrowthSkill>();
  for (const s of next.skills ?? []) byName.set(s.name.toLowerCase(), s);
  for (const s of p.skills) {
    const prev = byName.get(s.name.toLowerCase());
    byName.set(s.name.toLowerCase(), prev ? { ...prev, level: Math.max(prev.level, s.level) } : s);
  }
  next.skills = Array.from(byName.values());
  fillPools(next);
  const extra = next as unknown as Record<string, unknown>;
  extra._npc = { description: p.persona };
  extra._sketch = {
    tier: 'SKETCH',
    seedText: clip(seedText, 600),
    voice: p.voice,
    traitHints: p.traitHints,
    repairs: p.repairs,
  };
  return next;
}

/** Pools start full: current = level + augPos − augNeg (Frequency: current = level). */
export function fillPools(sheet: GrowthCharacter): void {
  for (const k of SKETCH_ATTRS) {
    const a = sheet.attributes[k];
    if (!a) continue;
    a.current = Math.max(0, a.level + (a.augmentPositive ?? 0) - (a.augmentNegative ?? 0));
  }
  const f = sheet.attributes.frequency;
  if (f) f.current = f.level;
}

export interface FitResult {
  sheet: GrowthCharacter;
  tkv: number;
  /** The sheet's TKV before any wallet clamp. */
  proposedTkv: number;
  /** The cheapest valid sheet (all levels 1, no proposed skills). */
  floorTkv: number;
  clamped: boolean;
  affordable: boolean;
}

/**
 * Lower the sheet until its TKV fits `budget`: skills first (highest level
 * down by one each step; a skill at 0 is dropped), then attributes (highest
 * level down toward 1). Seed contributions (augments, Fate Die, Frequency,
 * resist, fated age, seed traits) are the floor and are never touched.
 */
export function fitToBudget(sheet: GrowthCharacter, budget: number, tkvOf: (c: GrowthCharacter) => number = (c) => calculateCharacterTKV(c).total): FitResult {
  const next: GrowthCharacter = JSON.parse(JSON.stringify(sheet));
  const proposedTkv = tkvOf(next);
  const floor: GrowthCharacter = JSON.parse(JSON.stringify(sheet));
  floor.skills = [];
  for (const k of SKETCH_ATTRS) if (floor.attributes[k]) floor.attributes[k].level = 1;
  const floorTkv = tkvOf(floor);
  if (floorTkv > budget) {
    return { sheet: next, tkv: proposedTkv, proposedTkv, floorTkv, clamped: false, affordable: false };
  }
  let tkv = proposedTkv;
  let clamped = false;
  // Bounded: every step lowers TKV by ≥1 KRMA, so ≤ proposedTkv iterations.
  while (tkv > budget) {
    clamped = true;
    const skills = next.skills ?? [];
    if (skills.length > 0) {
      let hi = 0;
      for (let i = 1; i < skills.length; i++) if (skills[i].level > skills[hi].level) hi = i;
      skills[hi].level -= 1;
      if (skills[hi].level <= 0) skills.splice(hi, 1);
    } else {
      let hiKey: SketchAttr | null = null;
      for (const k of SKETCH_ATTRS) {
        const lv = next.attributes[k]?.level ?? 1;
        if (lv > 1 && (hiKey === null || lv > (next.attributes[hiKey]?.level ?? 1))) hiKey = k;
      }
      if (!hiKey) break; // at the floor (cannot happen: floorTkv ≤ budget)
      next.attributes[hiKey].level -= 1;
    }
    tkv = tkvOf(next);
  }
  fillPools(next);
  return { sheet: next, tkv, proposedTkv, floorTkv, clamped, affordable: true };
}

/** The system prompt: one structured answer, canon numbers stated plainly. */
export function buildSketchSystemPrompt(opts: { budget: number; seedNames: string[] }): string {
  return `You sketch an improvised NPC for the GRO.WTH tabletop RPG, live at the table. Be fast and concrete. Output ONE JSON object and nothing else.

Mechanics (canon — the server re-checks every number):
- Eight trainable attributes, LEVEL 1–20 each: clout, celerity, constitution (Body); flow, focus (Spirit); willpower, wisdom, wit (Soul). These are trained levels ON TOP of the species seed; an ordinary person is 1–3, trained 3–6, veteran 6–10, elite 10–15.
- Frequency comes from the seed; do not set it.
- Skills: 0–8, each { "name", "level" 1–20, "governors" 1–3 of the eight attributes above }. Levels 1–3 are flat bonuses; the skill DIE starts at level 4 (d4), 6 = d6, 8 = d8, 12 = d12, 20 = d20. There is no d2 or d3.
- Every attribute level and skill level costs 1 KRMA. The Watcher can afford about ${Math.max(0, Math.floor(opts.budget))} KRMA for this whole sheet INCLUDING the species seed (Human ≈ 190); stay well inside it.
- 0–2 trait hints: short names, "nectar" (gift) or "thorn" (flaw), plain text only.
- Species seed: ${opts.seedNames.length > 0 ? opts.seedNames.join(', ') : 'Human'}. Use "Human" unless the Watcher clearly asked for something else.

Persona:
- name: a fitting name (the Watcher may have given one).
- persona: ONE line — who they are, what they want right now.
- voice: ONE line — how they talk (register, rhythm, a verbal habit).
- memories: 3–5 short memories they carry (one sentence each, in lived terms — no game words like "level", "skill", "KRMA", "dice").

JSON shape:
{"name":"","persona":"","voice":"","memories":["",""],"seedName":"Human","attributes":{"clout":2,"celerity":2,"constitution":2,"flow":1,"focus":2,"willpower":2,"wisdom":2,"wit":2},"skills":[{"name":"","level":4,"governors":["wit"]}],"traitHints":[{"name":"","type":"nectar","note":""}]}`;
}
