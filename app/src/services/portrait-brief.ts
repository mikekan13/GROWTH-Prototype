/**
 * PORTRAIT BRIEF (plan PORTRAIT-STAGE-PLAN-2026-10-15 §4 step C, Mike 16 Oct):
 * JEWL (he) reads everything the designer, the sheet, the inventory, the
 * world and DAYA know about a character and writes the brief the paint
 * stands on — setting, bearing, expression, clothes, marks, light — and the
 * paint prompt itself. One local-lane text call; the photos never go.
 *
 *   gatherPortraitInputs  DB → the facts (location, live world facts, persona,
 *                         affect, EQUIPPED clothes, marks, means)
 *   draftBrief            pure: the deterministic brief (no model) — the
 *                         fallback when JEWL is cold, slow or unparseable
 *   askJewlForBrief       the ONE call (lane local, class fiction)
 *   buildPortraitBrief    gather → hash → reuse the stored brief when the
 *                         inputs match → else JEWL → store at identity.portraitBrief
 *
 * The brief is campaign-local prose; the paint (providers/qwen21 renderPortrait)
 * adds the fixed framing, the realism dial and the campaign mood. Clothes come
 * ONLY from what is EQUIPPED (inventory law); nothing is invented — a character
 * with nothing equipped is painted "in the clothes she would wear at home".
 */
import 'server-only';
import crypto from 'crypto';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { routedChatText } from '@/ai/network';
import { PLACE_RELATIONS } from '@/lib/genesis-stages';
import { possessiveFor, restoreDesigner, type DesignerState, type Possessive } from '@/lib/appearance-designer';
import { renderDispositionLine } from './daya-affect';
import { factPrefix } from './genesis-reset';
import { extractJson } from './sketch-genesis-rules';
import { getConditionLabel } from '@/types/item';
import { clothesClause, marksClause, readPose, viewBody, type Camera, type Visibility } from '@/lib/portrait-visibility';

export type PortraitFrame = 'bust' | 'figure';

export const PORTRAIT_BRIEF_TIMEOUT_MS = 25_000;
const BACKSTORY_CHARS = 700;
const MAX_FACT_LINES = 10;

const MARK_KINDS: ReadonlySet<string> = new Set(['scar', 'tattoo', 'piercing', 'birthmark', 'bodymod', 'makeup']);

// ── Types ───────────────────────────────────────────────────────────────

export interface PortraitBrief {
  setting: string;
  pose: string;
  expression: string;
  clothes: string;
  marks: string;
  light: string;
  /** The paint prompt: "A painted character illustration of the person in <image1> with the body in <image2>, …". */
  prompt: string;
}

export interface StoredPortraitBrief extends PortraitBrief {
  /** sha1 of the gathered inputs — a changed outfit, scene, face or body invalidates it. */
  hash: string;
  at: string;
  /** False when JEWL's answer did not arrive and the deterministic draft stands. */
  byJewl: boolean;
}

export interface EquippedPiece {
  itemId: string;
  name: string;
  archetype: string | null;
  /** Body-region key ('Body/Torso'). */
  region: string;
  description: string | null;
  material: string | null;
  /** Clothing | Light | Heavy | null (non-armour gear). */
  category: string | null;
}

export interface PortraitInputs {
  characterId: string;
  campaignId: string | null;
  name: string;
  possessive: Possessive;
  pronoun: 'she' | 'he' | 'they';
  seed: string | null;
  age: number | null;
  backstory: string;
  location: { name: string; type: string; description: string; environment: string | null; imageUrl: string | null; relation: string } | null;
  /** Live world facts under her first-name prefix (key → fact). */
  facts: Array<{ key: string; fact: string }>;
  persona: { identityNarrative: string | null; voiceNotes: string | null };
  /** renderDispositionLine, null at baseline. */
  disposition: string | null;
  /** The raw drives (null = no DAYA entity) — posture reads them. */
  affect: { morale: number; stress: number; grief: number } | null;
  /**
   * HER DAY (Mike 2026-10-16: "her pose… should be based on her day, mood,
   * condition"): `now` = the live facts that say what is happening at this
   * hour; `lived` = her latest memories from play (newest first); `habits` =
   * routines from her genesis memories (what she does at this hour).
   */
  day: { now: string[]; lived: string[]; habits: string[] };
  /** Her body now: active conditions, hurt parts, drained pools (empty = whole and rested). */
  bodyState: string[];
  equipped: EquippedPiece[];
  /** The marks' sentences from the FACE + BODY stacks. */
  marks: string[];
  underclothing: string | null;
  means: string[];
  /** The references the paint uses (part of the hash). */
  refs: { face: string | null; body: string | null };
}

// ── Pure helpers ────────────────────────────────────────────────────────

const OUTER_RANK: Record<string, number> = { Heavy: 0, Light: 1, Clothing: 2 };

/** One piece per body region: the outermost (Heavy → Light → Clothing → other). Stable order by region. Pure. */
export function outermostPerRegion(pieces: EquippedPiece[]): EquippedPiece[] {
  const byRegion = new Map<string, EquippedPiece>();
  for (const p of pieces) {
    const cur = byRegion.get(p.region);
    const rank = (x: EquippedPiece) => OUTER_RANK[x.category ?? ''] ?? 3;
    if (!cur || rank(p) < rank(cur)) byRegion.set(p.region, p);
  }
  return [...byRegion.values()];
}

/** 'Body/Torso' → 'torso'; 'Body' → 'body'. Pure. */
export function regionLabel(key: string): string {
  const last = key.split('/').filter(Boolean).pop() ?? key;
  return last.toLowerCase();
}

/** How far out a garment sits by its words: coats 0 … sweaters 1 … shirts 2 … underwear 3. Pure. */
export function layerRank(p: Pick<EquippedPiece, 'name' | 'category'>): number {
  const base = OUTER_RANK[p.category ?? ''] ?? 3;
  const n = p.name.toLowerCase();
  const word = /\b(coat|jacket|parka|raincoat|cloak|poncho)\b/.test(n) ? 0
    : /\b(cardigan|sweater|jumper|hoodie|sweatshirt|blazer|vest|flannel)\b/.test(n) ? 1
      : /\b(tee|t-shirt|shirt|blouse|top|tank|camisole|dress)\b/.test(n) ? 2
        : /\b(bra|underwear|briefs|panties|boxers|undershirt|thermal)\b/.test(n) ? 3 : 1.5;
  return base * 10 + word;
}

/**
 * The clothes clause: ONLY what the camera sees (lib/portrait-visibility —
 * Mike 2026-10-16: "determine what will be showing based on camera angle and
 * layers / how they lay"). Waist up by default: boots are out of frame, the
 * jeans show at the waist, an open cardigan hangs open over the tee, the bra
 * under the tee is never named. Nothing equipped → the at-home line. Pure.
 */
export function clothesLine(pieces: EquippedPiece[], pronoun: PortraitInputs['pronoun'], frame: 'bust' | 'figure' = 'bust'): string {
  return clothesClause(viewBody(pieces, [], { frame, facing: 'front' }), pronoun);
}

/**
 * "Add a scar to her face: a thin pale line through the left eyebrow." →
 * "a scar on her face: a thin pale line through the left eyebrow". Pure.
 */
export function markSentence(layerText: string): string {
  const t = layerText.trim().replace(/\s*change nothing else\.?\s*$/i, '').replace(/[.!?]+$/, '');
  const m = t.match(/^add\s+(.+?)\s+to\s+(her|his|their)\s+([a-z ]+?)(?::\s*(.*))?$/i);
  if (m) {
    const [, noun, poss, place, desc] = m;
    return `${noun.toLowerCase()} on ${poss.toLowerCase()} ${place.trim().toLowerCase()}${desc ? `: ${desc.trim()}` : ''}`;
  }
  // Free-typed edit commands ("Add a cross belly button piercing", "Putt \"777\"
  // running down…") read as descriptions in the prompt, never as orders.
  return t.replace(/^(please\s+)?(add|put+|place|give her|give him|make)\s+/i, '').replace(/^(a|an)\s+/i, m0 => m0.toLowerCase());
}

/** The mark sentences of the FACE and BODY stacks (scar, tattoo, piercing, birthmark, body mod, makeup). Pure. */
export function markSentences(designer: Partial<DesignerState> | null | undefined): string[] {
  const out: string[] = [];
  for (const l of [...(designer?.layers ?? []), ...(designer?.bodyLayers ?? [])]) {
    if (MARK_KINDS.has(l.kind) && l.text.trim()) out.push(markSentence(l.text));
  }
  return out;
}

/** Which marks the camera sees through her clothes: shown, half-hidden at an edge, or hidden (never named). Pure. */
export function markVisibility(marks: string[], equipped: EquippedPiece[], frame: 'bust' | 'figure' = 'bust'): Visibility['marks'] {
  return viewBody(equipped, marks, { frame, facing: 'front' }).marks;
}

/** The marks clause for the prompt. Pure. */
export function marksLine(marks: string[]): string {
  return marks.length ? `keeping every mark exactly as it is — ${marks.join('; ')}` : '';
}

const LIGHT_KEY = /(light|lamp|time|hour|weather|atmosphere|window|sky|season|sun|moon|night|day)/i;

/** The facts that say what the light and the hour are (keys with light/time/weather words). Pure. */
export function lightFacts(facts: Array<{ key: string; fact: string }>): Array<{ key: string; fact: string }> {
  return facts.filter(f => LIGHT_KEY.test(f.key.split('.').pop() ?? f.key) || LIGHT_KEY.test(f.key));
}

/** The light clause: the light facts as prose, else a plain indoor default. Pure. */
export function lightLine(facts: Array<{ key: string; fact: string }>, location: PortraitInputs['location']): string {
  // One clause per fact, first sentence only — the brief names the light, it does not paste the facts.
  const firstSentence = (s: string) => (s.trim().split(/(?<=[.!?])\s+/)[0] ?? s).replace(/[.!?]+$/, '').slice(0, 120);
  const lf = [...lightFacts(facts)]
    .sort((a, b) => Number(/light_now|light/.test(b.key)) - Number(/light_now|light/.test(a.key)))
    .slice(0, 2).map(f => firstSentence(f.fact));
  if (lf.length) return lf.join('; ');
  if (location?.environment) return `lit as the place is — ${location.environment.trim().replace(/[.!?]+$/, '')}`;
  return 'soft daylight from one window';
}

/** The setting clause: the place's name and description, else a neutral interior. Pure. */
export function settingLine(location: PortraitInputs['location'], pronoun: PortraitInputs['pronoun']): string {
  if (!location) return `a quiet, plain interior where ${pronoun} lives`;
  const desc = location.description.trim().replace(/\s+/g, ' ');
  const first = (desc.split(/(?<=[.!?])\s+/)[0] ?? '').replace(/[.!?]+$/, '').slice(0, 140);
  return first ? `${location.name} — ${first}` : location.name;
}

/**
 * What she is DOING at this hour, from today's facts and her lived memories
 * (never from what merely exists in the room). Null = nothing says. Pure.
 */
export function activityLine(day: PortraitInputs['day'], possessive: Possessive): string | null {
  const today = [...day.lived.slice(0, 2), ...day.now].join(' ').toLowerCase();
  if (/\b(writing|typing|draft|manuscript|laptop|chapter|editing)\b/.test(today)) return `seated at ${possessive} desk, turned from the work toward the viewer, one forearm resting on the desk`;
  if (/\b(cooking|chopping|stirring|stove|baking|dishes)\b/.test(today)) return `standing at the counter, turned from it toward the viewer`;
  if (/\b(woke|waking|asleep|in bed|getting up)\b/.test(today)) return `sitting on the edge of the bed, just up`;
  if (/\b(reading)\b/.test(today)) return `settled in a seat with a book lowered to ${possessive} lap`;
  if (/\b(arriv|came home|just got (home|in)|coming in|leaving|on (her|his|their) way)\b/.test(today)) return `just inside the door, not yet settled`;
  return null;
}

/** How her body is carried now: conditions, hurt parts, drained pools, then the drives. Pure. */
export function bearingLine(bodyState: string[], affect: PortraitInputs['affect'], possessive: Possessive): string[] {
  const s = bodyState.join(' ').toLowerCase();
  const out: string[] = [];
  if (/exhausted|constitution low/.test(s)) out.push('shoulders heavy with tiredness');
  if (/weak|clout low/.test(s)) out.push('arms hanging heavy');
  const hurt = bodyState.find(b => /^hurt:/i.test(b));
  if (hurt) out.push(`favouring ${possessive} ${hurt.replace(/^hurt:\s*/i, '').split(' (')[0].toLowerCase()}`);
  if (/overwhelmed|confused|incoherent/.test(s)) out.push('a little unmoored, attention drifting');
  if (affect) {
    if (affect.stress >= 0.5) out.push('shoulders tight');
    if (affect.grief >= 0.5) out.push('head a little bowed');
    if (affect.morale >= 0.5) out.push('chin lifted');
    else if (affect.morale <= -0.5) out.push('shoulders curled in');
  }
  return out;
}

/**
 * The pose: what her day has her doing (else the persona's bearing), then
 * how her body and mood carry it. Deterministic — JEWL rewrites it from the
 * same day, body and mood when he answers. Pure.
 */
export function poseLine(i: Pick<PortraitInputs, 'persona' | 'day' | 'bodyState' | 'affect' | 'possessive'>): string {
  const text = `${i.persona.identityNarrative ?? ''} ${i.persona.voiceNotes ?? ''}`.toLowerCase();
  const base = activityLine(i.day, i.possessive)
    ?? (/\b(shy|withdrawn|solitary|quiet|guarded|reserved|anxious)\b/.test(text) ? 'standing a half-turn from the viewer, shoulders drawn in, hands close to the body'
      : /\b(bold|confident|loud|brash|commanding|proud|fierce)\b/.test(text) ? 'standing square to the viewer, chin level, weight forward, hands easy'
        : 'standing square to the viewer, weight settled, arms loose at the sides');
  const bearing = bearingLine(i.bodyState, i.affect, i.possessive);
  return bearing.length ? `${base}, ${bearing.join(', ')}` : base;
}

/** The expression from mood and body (baseline = the resting face). Pure. */
export function expressionLine(disposition: string | null, bodyState: string[] = []): string {
  const tired = /exhausted|constitution low/i.test(bodyState.join(' ')) ? 'tired eyes' : '';
  if (!disposition) return tired ? `the face at rest, ${tired}, eyes on the viewer` : 'the face at rest, eyes on the viewer';
  return `the face showing it — ${disposition}${tired ? `, ${tired}` : ''}`;
}

/** JEWL's sentences as one clause: "The desk sits … window. The fire escape …" → "the desk sits … window; the fire escape …". Pure. */
function asClause(s: string): string {
  return s.trim().replace(/[.!]+\s+(?=[A-Z])/g, '; ').replace(/[.!]+$/, '').replace(/^(The|A|An)\b/, w => w.toLowerCase())
    .replace(/; (The|A|An)\b/g, (_, w: string) => `; ${w.toLowerCase()}`);
}

/** The fixed paint prompt. Pure. */
export function composePrompt(b: Omit<PortraitBrief, 'prompt'>): string {
  const bits = [
    `A painted character illustration of the person in <image1> with the body in <image2>`,
    b.clothes.trim(),
    b.pose.trim(),
    b.expression.trim(),
    `in ${asClause(b.setting)}`,
    asClause(b.light),
  ].filter(Boolean);
  const marks = b.marks.trim();
  return `${bits.join(', ')}${marks ? `, ${marks}` : ''}.`;
}

/**
 * What the camera sees for THIS pose: the pose sets the camera (a half-turn
 * hides the far arm) and how the clothes lie (sleeves pushed up, a cardigan
 * pulled closed); clothes and marks follow. The pose comes back with the
 * turned shoulder named when it did not say. Pure.
 */
export function seenForPose(
  pose: string,
  i: Pick<PortraitInputs, 'equipped' | 'marks' | 'pronoun'>,
  frame: PortraitFrame = 'bust',
): { pose: string; clothes: string; marks: string; camera: Camera; view: Visibility } {
  const r = readPose(pose, frame);
  const view = viewBody(i.equipped, i.marks, r.camera, r.effects);
  return { pose: r.pose, clothes: clothesClause(view, i.pronoun), marks: marksClause(view), camera: r.camera, view };
}

/** The deterministic brief (no model). Pure. */
export function draftBrief(inputs: PortraitInputs): PortraitBrief {
  const seen = seenForPose(poseLine(inputs), inputs);
  const parts = {
    setting: settingLine(inputs.location, inputs.pronoun),
    pose: seen.pose,
    expression: expressionLine(inputs.disposition, inputs.bodyState),
    clothes: seen.clothes,
    marks: seen.marks,
    light: lightLine(inputs.facts, inputs.location),
  };
  return { ...parts, prompt: composePrompt(parts) };
}

/**
 * The brief re-seen for another frame: the FIGURE (head to feet, for the
 * inventory) keeps the bust's pose, place and light, but its own camera names
 * the boots and the jeans and the marks the legs carry. Pure.
 */
export function briefForFrame(brief: PortraitBrief, i: Pick<PortraitInputs, 'equipped' | 'marks' | 'pronoun'>, frame: PortraitFrame): PortraitBrief {
  if (frame === 'bust') return brief;
  const seen = seenForPose(brief.pose, i, frame);
  const parts = { ...brief, pose: seen.pose, clothes: seen.clothes, marks: seen.marks };
  return { ...parts, prompt: composePrompt(parts) };
}

/** sha1 of what the brief stands on. Pure. */
export function briefInputHash(inputs: PortraitInputs): string {
  const { characterId: _c, backstory: _b, ...rest } = inputs;
  return crypto.createHash('sha1').update(JSON.stringify(rest)).digest('hex').slice(0, 16);
}

const answerSchema = z.object({
  setting: z.string().max(600).optional(),
  pose: z.string().max(300).optional(),
  expression: z.string().max(300).optional(),
  clothes: z.string().max(600).optional(),
  marks: z.string().max(600).optional(),
  light: z.string().max(300).optional(),
  prompt: z.string().max(1600).optional(),
});

/**
 * JEWL's answer → a brief. Missing fields fall back to the draft; a prompt
 * that forgets the references is recomposed from the fields. Null = no JSON.
 * Pure.
 */
export function parseBriefAnswer(
  text: string,
  draft: PortraitBrief,
  inputs: Pick<PortraitInputs, 'equipped' | 'marks' | 'pronoun'>,
): PortraitBrief | null {
  const json = extractJson(text);
  if (!json || typeof json !== 'object') return null;
  const r = answerSchema.safeParse(json);
  if (!r.success) return null;
  const pick = (v: string | undefined, fallback: string) => (v && v.trim() ? v.trim().replace(/\s+/g, ' ') : fallback);
  // Clothes and marks are TRUTH (inventory + designer), never JEWL's prose:
  // 2026-10-16 his rewrite dropped the tee under her open cardigan and the
  // painter filled the gap with the body reference's bra; a rewritten marks
  // clause can name a mark her clothes cover (it then shows through the cloth).
  // They are re-seen for HIS pose — his half-turn or pushed-up sleeves change what shows.
  const seen = seenForPose(pick(r.data.pose, draft.pose), inputs);
  const fields = {
    setting: pick(r.data.setting, draft.setting),
    pose: seen.pose,
    expression: pick(r.data.expression, draft.expression),
    clothes: seen.clothes,
    marks: seen.marks,
    light: pick(r.data.light, draft.light),
  };
  // The prompt is always composed from the fields — his free prompt could drop a layer.
  return { ...fields, prompt: composePrompt(fields) };
}

// ── Gather ──────────────────────────────────────────────────────────────

type SheetJson = {
  identity?: { sex?: string; age?: number; underclothing?: string; designer?: unknown; portraitBrief?: unknown } & Record<string, unknown>;
  creation?: { seed?: { name?: string } };
  backstory?: { backstory?: string };
  wealth?: { holdings?: Array<{ amount: number; code: string; where?: string }>; income?: Array<{ amountPerYear: number; code: string; source: string }> };
  conditions?: Record<string, boolean>;
  attributes?: Record<string, { level?: number; current?: number; augmentPositive?: number | null; augmentNegative?: number | null }>;
  bodyAnatomy?: unknown;
} & Record<string, unknown>;

const NOW_KEY = /(atmosphere|time|hour|now|today|tonight)$/i;
const NOW_TEXT = /\b(now|today|tonight|this (morning|afternoon|evening)|current(ly)?|forgot|~?\d{1,2}(:\d{2})?\s?(am|pm))\b/i;
const ROUTINE = /\b(every (day|morning|night|evening)|most (mornings|nights|days|evenings)|always|when I (sit|get|wake|come|go)|uniform|habit|routine)\b/i;

function clip(s: string, n: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  return t.length > n ? `${t.slice(0, n - 1)}…` : t;
}

const CONDITION_WORDS: Record<string, string> = {
  weak: 'weak', clumsy: 'clumsy', exhausted: 'exhausted', deafened: 'deafened', deathsDoor: "at death's door",
  muted: 'muted', overwhelmed: 'overwhelmed', confused: 'confused', incoherent: 'incoherent',
};

/** Her body now from the sheet: active conditions, hurt parts (condition below whole), pools at half or less. Pure. */
export function readBodyState(sheet: SheetJson): string[] {
  const out: string[] = [];
  for (const [k, on] of Object.entries(sheet.conditions ?? {})) if (on && CONDITION_WORDS[k]) out.push(CONDITION_WORDS[k]);
  type Part = { partName?: string; condition?: number; isInternal?: boolean; contains?: Part[] };
  const walk = (n: Part | undefined) => {
    if (!n) return;
    if (n.partName && typeof n.condition === 'number' && n.condition < 3) out.push(`hurt: ${n.partName} (${getConditionLabel(n.condition)})`);
    for (const c of n.contains ?? []) walk(c);
  };
  walk(sheet.bodyAnatomy as Part | undefined);
  for (const [k, a] of Object.entries(sheet.attributes ?? {})) {
    const max = (a.level ?? 0) + (a.augmentPositive ?? 0) - (a.augmentNegative ?? 0);
    if (k !== 'frequency' && max > 0 && typeof a.current === 'number' && a.current <= max / 2) {
      out.push(`${k[0].toUpperCase()}${k.slice(1)} low (${a.current}/${max})`);
    }
  }
  return out;
}

function parseSheet(raw: string): SheetJson {
  try { return JSON.parse(raw) as SheetJson; } catch { return {}; }
}

function pronounFor(p: Possessive): PortraitInputs['pronoun'] {
  return p === 'her' ? 'she' : p === 'his' ? 'he' : 'they';
}

/** The approved face + the current body the paint references. Throws until both exist. */
export async function readPortraitRefs(characterId: string): Promise<{ face: string; body: string }> {
  const c = await prisma.character.findUnique({ where: { id: characterId }, select: { data: true } });
  if (!c) throw new NotFoundError('Character not found');
  const d = restoreDesigner(parseSheet(c.data).identity);
  if (!d.approvedImagePath || !d.bodyImagePath) {
    throw new ValidationError('Approve the face and render the body before painting the portrait.');
  }
  return { face: d.approvedImagePath, body: d.bodyImagePath };
}

export async function gatherPortraitInputs(characterId: string): Promise<PortraitInputs> {
  const c = await prisma.character.findUnique({ where: { id: characterId }, select: { id: true, name: true, campaignId: true, data: true } });
  if (!c) throw new NotFoundError('Character not found');
  const sheet = parseSheet(c.data);
  const designer = restoreDesigner(sheet.identity);
  const possessive = possessiveFor(sheet.identity?.sex);
  const campaignId = c.campaignId ?? null;

  // Where she is: located_at first, else her home (PLACE_RELATIONS order).
  const edges = await prisma.entityRelationship.findMany({
    where: { sourceId: characterId, targetType: 'LOCATION', relationshipType: { in: ['located_at', ...PLACE_RELATIONS] } },
    select: { targetId: true, relationshipType: true },
  });
  const order = ['located_at', ...PLACE_RELATIONS];
  const edge = [...edges].sort((a, b) => order.indexOf(a.relationshipType) - order.indexOf(b.relationshipType))[0];
  let location: PortraitInputs['location'] = null;
  if (edge) {
    const loc = await prisma.location.findUnique({ where: { id: edge.targetId }, select: { name: true, type: true, data: true } });
    if (loc) {
      let d: { description?: string; environment?: string; imageUrl?: string } = {};
      try { d = JSON.parse(loc.data) as typeof d; } catch { d = {}; }
      location = { name: loc.name, type: loc.type, description: d.description ?? '', environment: d.environment ?? null, imageUrl: d.imageUrl ?? null, relation: edge.relationshipType };
    }
  }

  // Live world facts under her first-name prefix; light/time keys first.
  let facts: PortraitInputs['facts'] = [];
  let allFacts: PortraitInputs['facts'] = [];
  if (campaignId) {
    const rows = await prisma.worldFact.findMany({
      where: { campaignId, supersededById: null, subjectKey: { startsWith: factPrefix(c.name) } },
      select: { subjectKey: true, fact: true },
      orderBy: { establishedAtCycle: 'asc' },
    });
    const all = rows.map(r => ({ key: r.subjectKey, fact: r.fact })).filter(f => !/^\(removed\)/i.test(f.fact));
    allFacts = all;
    const light = lightFacts(all);
    const rest = all.filter(f => !light.includes(f));
    facts = [...light, ...rest].slice(0, MAX_FACT_LINES);
  }

  // Persona + affect (one row).
  const entity = await prisma.dayaEntity.findUnique({
    where: { characterId },
    select: { id: true, personaProfile: true, affect: { select: { morale: true, stress: true, grief: true } } },
  });
  let persona: PortraitInputs['persona'] = { identityNarrative: null, voiceNotes: null };
  if (entity) {
    try {
      const p = JSON.parse(entity.personaProfile) as { identityNarrative?: string; voiceNotes?: string };
      persona = { identityNarrative: p.identityNarrative?.slice(0, 500) ?? null, voiceNotes: p.voiceNotes?.slice(0, 300) ?? null };
    } catch { /* unreadable persona */ }
  }
  const disposition = renderDispositionLine(entity?.affect ?? null);

  // Her day: what the live facts say is happening now, her latest lived
  // memories, and her routines (genesis memories that say when she does what).
  // Light facts are the light line's (and a dark bathroom bulb says nothing about her hour).
  const nowScore = (f: { key: string; fact: string }) => (/light/i.test(f.key) ? 0 : NOW_KEY.test(f.key) ? 2 : NOW_TEXT.test(f.fact) ? 1 : 0);
  const now = allFacts.map(f => ({ f, s: nowScore(f) })).filter(x => x.s > 0)
    .sort((a, b) => b.s - a.s).slice(0, 5).map(x => clip(x.f.fact, 200));
  let lived: string[] = [];
  let habits: string[] = [];
  if (entity?.id) {
    const mems = (await prisma.dayaMemoryEntry.findMany({
      where: { entityId: entity.id },
      orderBy: [{ narrativeCycle: 'desc' }, { realTime: 'desc' }],
      take: 80,
      select: { source: true, content: true, salience: true, narrativeCycle: true },
    })) ?? [];
    // Lived = after play began (clock > 0); everything at 0 was written at creation (her past).
    lived = mems.filter(m => (m.narrativeCycle ?? 0) > 0).slice(0, 4).map(m => clip(m.content, 220));
    habits = mems.filter(m => (m.narrativeCycle ?? 0) <= 0 && ROUTINE.test(m.content))
      .sort((a, b) => b.salience - a.salience).slice(0, 3).map(m => clip(m.content, 220));
  }

  const bodyState = readBodyState(sheet);

  // EQUIPPED = held + data.equippedTo (inventory law: worn OVER a region).
  const held = await prisma.campaignItem.findMany({
    where: { holderId: characterId, status: 'ACTIVE' },
    select: { id: true, name: true, data: true, sourceForgeItemId: true },
    orderBy: { name: 'asc' },
  });
  const archIds = [...new Set(held.map(h => h.sourceForgeItemId).filter((x): x is string => !!x))];
  const archetypes = archIds.length ? await prisma.forgeItem.findMany({ where: { id: { in: archIds } }, select: { id: true, name: true } }) : [];
  const archName = new Map(archetypes.map(a => [a.id, a.name]));
  const equipped: EquippedPiece[] = [];
  for (const h of held) {
    let d: { equippedTo?: string; description?: string; primaryMaterial?: string; material?: string; armorCategory?: string } = {};
    try { d = JSON.parse(h.data) as typeof d; } catch { d = {}; }
    if (!d.equippedTo) continue;
    equipped.push({
      itemId: h.id, name: h.name, archetype: h.sourceForgeItemId ? archName.get(h.sourceForgeItemId) ?? null : null,
      region: d.equippedTo, description: d.description ?? null, material: d.primaryMaterial ?? d.material ?? null, category: d.armorCategory ?? null,
    });
  }

  const means = [
    ...(sheet.wealth?.holdings ?? []).map(h => `${h.amount} ${h.code} (${h.where ?? 'cash'})`),
    ...(sheet.wealth?.income ?? []).map(i => `${i.amountPerYear} ${i.code}/yr — ${i.source}`),
  ];

  return {
    characterId,
    campaignId,
    name: c.name,
    possessive,
    pronoun: pronounFor(possessive),
    seed: sheet.creation?.seed?.name ?? null,
    age: typeof sheet.identity?.age === 'number' ? sheet.identity.age : null,
    backstory: (sheet.backstory?.backstory ?? '').slice(0, BACKSTORY_CHARS),
    location,
    facts,
    persona,
    disposition,
    affect: entity?.affect ? { morale: entity.affect.morale, stress: entity.affect.stress, grief: entity.affect.grief } : null,
    day: { now, lived, habits },
    bodyState,
    equipped,
    marks: markSentences(designer),
    underclothing: sheet.identity?.underclothing ?? null,
    means,
    refs: { face: designer.approvedImagePath ?? null, body: designer.bodyImagePath ?? null },
  };
}

// ── JEWL ────────────────────────────────────────────────────────────────

/** The brief as JEWL sees it. Pure. */
export function renderBriefContext(i: PortraitInputs, draft: PortraitBrief): string {
  const lines = [
    `CHARACTER: ${i.name}${i.seed ? ` (${i.seed})` : ''}${i.age != null ? `, ${i.age}` : ''} — pronouns ${i.pronoun}/${i.possessive}.`,
    i.backstory ? `STORY (start): ${i.backstory.replace(/\s+/g, ' ')}` : '',
    i.persona.identityNarrative ? `WHO ${i.pronoun.toUpperCase()} IS (persona): ${i.persona.identityNarrative}` : '',
    i.persona.voiceNotes ? `VOICE: ${i.persona.voiceNotes}` : '',
    `MOOD NOW: ${i.disposition ?? 'at baseline (the resting face)'}.`,
    `BODY NOW: ${i.bodyState.length ? i.bodyState.join('; ') : 'whole and rested'}.`,
    i.day.now.length ? `HER DAY — what is happening at this hour:\n${i.day.now.map(s => `- ${s}`).join('\n')}` : 'HER DAY: nothing recorded for this hour.',
    i.day.lived.length ? `WHAT SHE JUST LIVED (newest first):\n${i.day.lived.map(s => `- ${s}`).join('\n')}` : '',
    i.day.habits.length ? `HER ROUTINES (in her words):\n${i.day.habits.map(s => `- ${s}`).join('\n')}` : '',
    i.location
      ? `WHERE (${i.location.relation}): ${i.location.name} [${i.location.type}] — ${i.location.description || 'no description'}${i.location.environment ? ` · ${i.location.environment}` : ''}`
      : 'WHERE: no place recorded — a plain interior.',
    i.facts.length ? `LIVE FACTS:\n${i.facts.map(f => `- ${f.key}: ${f.fact}`).join('\n')}` : 'LIVE FACTS: none.',
    i.equipped.length
      ? `EQUIPPED (the only clothes that may be painted; outermost per region):\n${outermostPerRegion(i.equipped).map(p => `- ${p.name}${p.archetype && p.archetype !== p.name ? ` [${p.archetype}]` : ''} over ${p.region}${p.material ? `, ${p.material}` : ''}${p.description ? ` — ${p.description}` : ''}`).join('\n')}`
      : `EQUIPPED: nothing. Paint ${i.pronoun} "${draft.clothes}" — do not invent garments.`,
    (() => {
      const { view: v, camera } = seenForPose(draft.pose, i);
      const bare = v.marks.filter(m => m.view !== 'hidden').map(m => m.view === 'edge' && m.by ? `${m.mark} (half-hidden by ${m.by.name.toLowerCase()})` : m.mark);
      const under = v.marks.filter(m => m.view === 'hidden').map(m => m.mark);
      const angle = camera.facing === 'back' ? 'back to the viewer' : camera.near ? `half-turned, the ${camera.near} shoulder toward the viewer` : 'facing the viewer';
      return [
        `CAMERA (for the draft's pose): waist up, ${angle}. IN FRAME: ${v.seen.map(s => s.piece.name).join(', ') || 'no clothes'}.${v.unseen.length ? ` OUT OF SIGHT: ${v.unseen.map(p => p.name).join(', ')}.` : ''}`,
        bare.length ? `MARKS THE CAMERA SEES: ${bare.join('; ')}` : 'MARKS THE CAMERA SEES: none.',
        under.length ? `MARKS UNDER HER CLOTHES OR TURNED AWAY (never mention them): ${under.join('; ')}` : '',
      ].filter(Boolean).join('\n');
    })(),
    i.means.length ? `MEANS: ${i.means.join(' · ')}` : '',
  ];
  return lines.filter(Boolean).join('\n');
}

const SYSTEM =
  'You are JEWL, the AI in a tabletop game. You write the PORTRAIT BRIEF for a character portrait painted from two reference images: ' +
  '<image1> is the approved face, <image2> the body. Answer with ONE JSON object and nothing else: ' +
  '{"setting","pose","expression","light"}. The picture is a WAIST-UP portrait in the place where they are. ' +
  'setting = two short sentences of the place as it is now; ' +
  'pose = one clause of what their body is doing AT THIS MOMENT OF THEIR DAY — read HER DAY, WHAT SHE JUST LIVED and HER ROUTINES for where they are and what they are in the middle of, ' +
  'then let BODY NOW and MOOD NOW shape how they carry it (tired, hurt, tense, low, bright); it must read from the waist up, use only things in the place, and never be a named or posed-for-the-camera stance; ' +
  'expression = one clause from MOOD NOW and BODY NOW; light = one clause of light and hour from the facts. ' +
  'Clothes and marks are fixed by the engine — do not write them, and never mention a mark under the clothes. ' +
  'The engine re-reads your pose to see what shows: if you turn them, say which shoulder is toward the viewer; ' +
  'if the moment changes how a garment lies (sleeves pushed up, a cardigan pulled closed or hanging open), say it in the pose. ' +
  'Plain content words only — no style words, no medium, no game terms, no names of real people.';

/** The ONE local-lane call. Throws on timeout / transport error. */
export async function askJewlForBrief(inputs: PortraitInputs, draft: PortraitBrief): Promise<string> {
  const call = routedChatText(
    { caller: 'portrait-brief', lane: 'local', contentClass: 'fiction', ...(inputs.campaignId ? { campaignId: inputs.campaignId } : {}) },
    {
      system: SYSTEM,
      user: `${renderBriefContext(inputs, draft)}\n\nDRAFT (improve it; keep its facts):\n${JSON.stringify(draft)}\n\nWrite the brief as JSON.`,
      maxTokens: 700,
      temperature: 0.4,
      timeoutMs: PORTRAIT_BRIEF_TIMEOUT_MS,
      participantCharacterIds: [inputs.characterId],
    },
  );
  let timer: ReturnType<typeof setTimeout> | undefined;
  const cap = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('portrait brief timed out')), PORTRAIT_BRIEF_TIMEOUT_MS);
  });
  try {
    const res = await Promise.race([call, cap]);
    return res.text;
  } finally {
    if (timer) clearTimeout(timer);
    call.catch(() => { /* a late failure after the cap is already handled */ });
  }
}

// ── Build + store ───────────────────────────────────────────────────────

function readStored(sheet: SheetJson): StoredPortraitBrief | null {
  const b = sheet.identity?.portraitBrief;
  if (!b || typeof b !== 'object') return null;
  const o = b as Record<string, unknown>;
  const s = (k: string) => (typeof o[k] === 'string' ? (o[k] as string) : null);
  const hash = s('hash'); const prompt = s('prompt');
  if (!hash || !prompt) return null;
  return {
    setting: s('setting') ?? '', pose: s('pose') ?? '', expression: s('expression') ?? '', clothes: s('clothes') ?? '',
    marks: s('marks') ?? '', light: s('light') ?? '', prompt, hash, at: s('at') ?? '', byJewl: o.byJewl === true,
  };
}

export interface BuildBriefResult {
  brief: StoredPortraitBrief;
  inputs: PortraitInputs;
  /** True when the stored brief's hash matched and no call was made. */
  reused: boolean;
  modelCalled: boolean;
}

/**
 * The brief for a character: reused from identity.portraitBrief when its
 * hash still matches the gathered inputs; else JEWL writes it (falling back
 * to the deterministic draft when he does not answer) and it is stored.
 * `force` always rewrites; `jewl: false` never calls the model (labs).
 */
export async function buildPortraitBrief(
  characterId: string,
  opts: { force?: boolean; jewl?: boolean } = {},
): Promise<BuildBriefResult> {
  const inputs = await gatherPortraitInputs(characterId);
  const hash = briefInputHash(inputs);
  const row = await prisma.character.findUnique({ where: { id: characterId }, select: { data: true } });
  if (!row) throw new NotFoundError('Character not found');
  const sheet = parseSheet(row.data);
  const stored = readStored(sheet);
  if (stored && stored.hash === hash && !opts.force) return { brief: stored, inputs, reused: true, modelCalled: false };

  const draft = draftBrief(inputs);
  let brief: PortraitBrief = draft;
  let byJewl = false;
  let modelCalled = false;
  if (opts.jewl !== false) {
    modelCalled = true;
    try {
      const text = await askJewlForBrief(inputs, draft);
      const parsed = parseBriefAnswer(text, draft, inputs);
      if (parsed) { brief = parsed; byJewl = true; }
      else console.warn('[portrait-brief] JEWL answer unparseable — the draft stands');
    } catch (e) {
      console.warn(`[portrait-brief] JEWL call failed (${e instanceof Error ? e.message : 'error'}) — the draft stands`);
    }
  }
  const next: StoredPortraitBrief = { ...brief, hash, at: new Date().toISOString(), byJewl };
  // Read-modify-write of the sheet JSON (the designer save does the same; no schema change).
  const fresh = await prisma.character.findUnique({ where: { id: characterId }, select: { data: true } });
  const latest = parseSheet(fresh?.data ?? row.data);
  latest.identity = { ...(latest.identity ?? {}), portraitBrief: next };
  await prisma.character.update({ where: { id: characterId }, data: { data: JSON.stringify(latest) } });
  return { brief: next, inputs, reused: false, modelCalled };
}
