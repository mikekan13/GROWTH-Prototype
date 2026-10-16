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

function article(name: string): string {
  const n = name.trim();
  if (!n) return '';
  if (/^(a|an|the|her|his|their|some)\s/i.test(n) || /s$/i.test(n)) return n.toLowerCase();
  return `${/^[aeiou]/i.test(n) ? 'an' : 'a'} ${n.toLowerCase()}`;
}

/** The clothes clause from what is EQUIPPED; nothing equipped → the at-home line (never an invented wardrobe). Pure. */
export function clothesLine(pieces: EquippedPiece[], pronoun: PortraitInputs['pronoun']): string {
  const outer = outermostPerRegion(pieces);
  if (outer.length === 0) return `in the clothes ${pronoun} would wear at home`;
  const parts = outer.map(p => {
    const mat = p.material ? ` of ${p.material.toLowerCase()}` : '';
    const over = p.region.toLowerCase() === 'body' ? '' : ` over the ${regionLabel(p.region)}`;
    return `${article(p.name)}${mat}${over}`;
  });
  const list = parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
  return `wearing ${list}`;
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

/** The bearing from the persona text, deterministic (JEWL rewrites it when he answers). Pure. */
export function poseLine(persona: PortraitInputs['persona']): string {
  const text = `${persona.identityNarrative ?? ''} ${persona.voiceNotes ?? ''}`.toLowerCase();
  if (/\b(shy|withdrawn|solitary|quiet|guarded|reserved|anxious)\b/.test(text)) return 'standing a half-turn from the viewer, shoulders drawn in, hands close to the body';
  if (/\b(bold|confident|loud|brash|commanding|proud|fierce)\b/.test(text)) return 'standing square to the viewer, chin level, weight forward, hands easy';
  if (/\b(tired|weary|grieving|heavy|slow)\b/.test(text)) return 'standing with the weight settled on one leg, shoulders low, one hand resting on something near';
  return 'standing square to the viewer, weight settled, arms loose at the sides';
}

/** The expression from affect (baseline = the resting face). Pure. */
export function expressionLine(disposition: string | null): string {
  if (!disposition) return 'the face at rest, eyes on the viewer';
  return `the face showing it — ${disposition}`;
}

/** The fixed paint prompt. Pure. */
export function composePrompt(b: Omit<PortraitBrief, 'prompt'>): string {
  const bits = [
    `A painted character illustration of the person in <image1> with the body in <image2>`,
    b.clothes.trim(),
    b.pose.trim(),
    b.expression.trim(),
    `in ${b.setting.trim()}`,
    b.light.trim(),
  ].filter(Boolean);
  const marks = b.marks.trim();
  return `${bits.join(', ')}${marks ? `, ${marks}` : ''}.`;
}

/** The deterministic brief (no model). Pure. */
export function draftBrief(inputs: PortraitInputs): PortraitBrief {
  const parts = {
    setting: settingLine(inputs.location, inputs.pronoun),
    pose: poseLine(inputs.persona),
    expression: expressionLine(inputs.disposition),
    clothes: clothesLine(inputs.equipped, inputs.pronoun),
    marks: marksLine(inputs.marks),
    light: lightLine(inputs.facts, inputs.location),
  };
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
export function parseBriefAnswer(text: string, draft: PortraitBrief, equippedCount: number): PortraitBrief | null {
  const json = extractJson(text);
  if (!json || typeof json !== 'object') return null;
  const r = answerSchema.safeParse(json);
  if (!r.success) return null;
  const pick = (v: string | undefined, fallback: string) => (v && v.trim() ? v.trim().replace(/\s+/g, ' ') : fallback);
  const fields = {
    setting: pick(r.data.setting, draft.setting),
    pose: pick(r.data.pose, draft.pose),
    expression: pick(r.data.expression, draft.expression),
    // Clothes are the inventory's: with nothing equipped JEWL may not dress her.
    clothes: equippedCount > 0 ? pick(r.data.clothes, draft.clothes) : draft.clothes,
    marks: pick(r.data.marks, draft.marks),
    light: pick(r.data.light, draft.light),
  };
  const prompt = r.data.prompt?.trim() ?? '';
  const ok = prompt.includes('<image1>') && prompt.includes('<image2>') && (equippedCount > 0 || prompt.includes(draft.clothes));
  return { ...fields, prompt: ok ? prompt.replace(/\s+/g, ' ') : composePrompt(fields) };
}

// ── Gather ──────────────────────────────────────────────────────────────

type SheetJson = {
  identity?: { sex?: string; age?: number; underclothing?: string; designer?: unknown; portraitBrief?: unknown } & Record<string, unknown>;
  creation?: { seed?: { name?: string } };
  backstory?: { backstory?: string };
  wealth?: { holdings?: Array<{ amount: number; code: string; where?: string }>; income?: Array<{ amountPerYear: number; code: string; source: string }> };
} & Record<string, unknown>;

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
  if (campaignId) {
    const rows = await prisma.worldFact.findMany({
      where: { campaignId, supersededById: null, subjectKey: { startsWith: factPrefix(c.name) } },
      select: { subjectKey: true, fact: true },
      orderBy: { establishedAtCycle: 'asc' },
    });
    const all = rows.map(r => ({ key: r.subjectKey, fact: r.fact }));
    const light = lightFacts(all);
    const rest = all.filter(f => !light.includes(f));
    facts = [...light, ...rest].slice(0, MAX_FACT_LINES);
  }

  // Persona + affect (one row).
  const entity = await prisma.dayaEntity.findUnique({
    where: { characterId },
    select: { personaProfile: true, affect: { select: { morale: true, stress: true, grief: true } } },
  });
  let persona: PortraitInputs['persona'] = { identityNarrative: null, voiceNotes: null };
  if (entity) {
    try {
      const p = JSON.parse(entity.personaProfile) as { identityNarrative?: string; voiceNotes?: string };
      persona = { identityNarrative: p.identityNarrative?.slice(0, 500) ?? null, voiceNotes: p.voiceNotes?.slice(0, 300) ?? null };
    } catch { /* unreadable persona */ }
  }
  const disposition = renderDispositionLine(entity?.affect ?? null);

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
    i.location
      ? `WHERE (${i.location.relation}): ${i.location.name} [${i.location.type}] — ${i.location.description || 'no description'}${i.location.environment ? ` · ${i.location.environment}` : ''}`
      : 'WHERE: no place recorded — a plain interior.',
    i.facts.length ? `LIVE FACTS:\n${i.facts.map(f => `- ${f.key}: ${f.fact}`).join('\n')}` : 'LIVE FACTS: none.',
    i.equipped.length
      ? `EQUIPPED (the only clothes that may be painted; outermost per region):\n${outermostPerRegion(i.equipped).map(p => `- ${p.name}${p.archetype && p.archetype !== p.name ? ` [${p.archetype}]` : ''} over ${p.region}${p.material ? `, ${p.material}` : ''}${p.description ? ` — ${p.description}` : ''}`).join('\n')}`
      : `EQUIPPED: nothing. Paint ${i.pronoun} "${draft.clothes}" — do not invent garments.`,
    i.marks.length ? `MARKS (must stay): ${i.marks.join('; ')}` : 'MARKS: none.',
    i.means.length ? `MEANS: ${i.means.join(' · ')}` : '',
  ];
  return lines.filter(Boolean).join('\n');
}

const SYSTEM =
  'You are JEWL, the AI in a tabletop game. You write the PORTRAIT BRIEF for a character portrait painted from two reference images: ' +
  '<image1> is the approved face, <image2> the body. Answer with ONE JSON object and nothing else: ' +
  '{"setting","pose","expression","clothes","marks","light","prompt"}. ' +
  'setting = two short sentences of the place as it is now; pose = one clause of bearing that fits who they are (never a named pose, never a prop they do not own); ' +
  'expression = one clause from the mood; clothes = a clause naming ONLY the equipped pieces (materials, colours), outermost per region — with nothing equipped, repeat the given at-home line; ' +
  'marks = a clause restating every mark so the painter keeps them; light = one clause of light and hour from the facts. ' +
  'prompt = exactly: "A painted character illustration of the person in <image1> with the body in <image2>, <clothes>, <pose>, <expression>, in <setting>, <light>, <marks>." ' +
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
      const parsed = parseBriefAnswer(text, draft, inputs.equipped.length);
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
