/**
 * Appearance designer (ruling 2026-10-13, image-designer redesign) — the
 * UI-free rules: shape/marks/tell instruction sentences, the clothing/gear
 * guard, the edit-stack reducer (persisted in identity.designer), status, and
 * the one plain error line. Pure: no React, no fetch, no server imports.
 *
 * The sheet owns the character's facts; the designer owns her image.
 */

// ── Instruction composition ─────────────────────────────────────────────

export const NOTHING_ELSE = 'Change nothing else.';

/**
 * What the designer may change (Mike 2026-10-15): FACE — hair and marks
 * (scars, tattoos, piercings, makeup, birthmarks, body mods); BODY — build
 * (weight), marks, and the underwear design. Age is the sheet's (never picked
 * here); skin, eyes and face shape are the locked identity; cuts, bruises,
 * tiredness, expression and the like belong to the live in-play portrait.
 */
export type EditTarget = 'face' | 'body';

export type ShapeCategory = 'Hair' | 'Marks' | 'Build' | 'Underwear';
export const SHAPE_CATEGORIES: ShapeCategory[] = ['Hair', 'Marks', 'Build', 'Underwear'];

/** The chips per tab: hair is the face's (the body follows it); build and underwear are the body's. */
export function shapeCategoriesFor(target: EditTarget): ShapeCategory[] {
  return target === 'body' ? ['Build', 'Marks', 'Underwear'] : ['Hair', 'Marks'];
}

export type Possessive = 'her' | 'his' | 'their';

/** her / his / their from the sheet's sex field (anything unclear → their). */
export function possessiveFor(sex: string | null | undefined): Possessive {
  const s = (sex ?? '').trim().toLowerCase();
  if (/^(f|female|woman|girl)\b/.test(s)) return 'her';
  if (/^(m|male|man|boy)\b/.test(s)) return 'his';
  return 'their';
}

export interface ShapePreset {
  label: string;
  /** The words that finish the category's sentence. */
  phrase: (p: Possessive) => string;
}

const fixed = (s: string) => () => s;

/** Presets per chip. Marks has none — it has kinds + where. Underwear is own words only (a design). */
export const SHAPE_PRESETS: Record<Exclude<ShapeCategory, 'Marks'>, ShapePreset[]> = {
  Hair: [
    { label: 'Long, tied up', phrase: fixed('long and tied up') },
    { label: 'Short crop', phrase: fixed('a short crop') },
    { label: 'Braids', phrase: fixed('braids') },
    { label: 'Shaved', phrase: fixed('shaved close to the scalp') },
  ],
  Build: [
    { label: 'Slight', phrase: fixed('slight') },
    { label: 'Lean', phrase: fixed('lean and wiry') },
    { label: 'Athletic', phrase: fixed('athletic') },
    { label: 'Heavy', phrase: fixed('heavy-set') },
    { label: 'Broad', phrase: fixed('broad-shouldered and muscular') },
  ],
  Underwear: [],
};

/** Sentence head per category; the preset phrase (or own words) finishes it. */
const SHAPE_HEAD: Record<Exclude<ShapeCategory, 'Marks'>, (p: Possessive) => string> = {
  Hair: p => `Change ${p} hair to`,
  Build: p => `Change ${p} build to`,
  Underwear: p => `Change ${p} underwear to`,
};

/** The part name used when own words replace the preset ("Change her hair: …"). */
const SHAPE_PART: Record<Exclude<ShapeCategory, 'Marks'>, string> = {
  Hair: 'hair', Build: 'build', Underwear: 'underwear',
};

/** Placeholder for the own-words box per category. */
export const SHAPE_WORDS_PLACEHOLDER: Record<Exclude<ShapeCategory, 'Marks'>, string> = {
  Hair: 'Or your own words',
  Build: 'Or your own words: heavier, thinner, taller…',
  Underwear: 'Describe the design: plain dark wrap, cloth bindings…',
};

function sentence(s: string): string {
  const t = s.trim().replace(/\s+/g, ' ');
  if (!t) return '';
  const cap = t.charAt(0).toUpperCase() + t.slice(1);
  return /[.!?]$/.test(cap) ? cap : `${cap}.`;
}

/** Append " Change nothing else." unless the sentence already says it. */
export function withNothingElse(s: string): string {
  const t = sentence(s);
  if (!t) return '';
  return /change nothing else/i.test(t) ? t : `${t} ${NOTHING_ELSE}`;
}

/**
 * The visible sentence for a SHAPE apply (without the "change nothing else"
 * suffix). Own words win over the preset. Null = nothing to apply.
 */
export function composeShapeText(
  category: Exclude<ShapeCategory, 'Marks'>,
  presetLabel: string | null,
  ownWords: string,
  p: Possessive,
): string | null {
  const words = ownWords.trim();
  if (words) return sentence(`Change ${p} ${SHAPE_PART[category]}: ${words.replace(/[.!?]+$/, '')}`);
  const preset = SHAPE_PRESETS[category].find(x => x.label === presetLabel);
  if (!preset) return null;
  return sentence(`${SHAPE_HEAD[category](p)} ${preset.phrase(p)}`);
}

/** Marks: scars, tattoos, piercings, makeup, birthmarks and other body mods (gauges, implants, brands…). */
export type MarkKind = 'Scar' | 'Tattoo' | 'Piercing' | 'Makeup' | 'Birthmark' | 'Body mod';
export const MARK_KINDS: MarkKind[] = ['Scar', 'Tattoo', 'Piercing', 'Makeup', 'Birthmark', 'Body mod'];
export type MarkPlace = 'Face' | 'Neck' | 'Arms' | 'Hands' | 'Torso' | 'Back' | 'Legs';
export const MARK_PLACES: MarkPlace[] = ['Face', 'Neck', 'Arms', 'Hands', 'Torso', 'Back', 'Legs'];

/** The places a target shows: the face image is a bust, the body is everything. */
export function markPlacesFor(target: EditTarget): MarkPlace[] {
  return target === 'body' ? ['Neck', 'Arms', 'Hands', 'Torso', 'Back', 'Legs'] : ['Face', 'Neck'];
}

/** The stack tag for a mark kind. */
export function markLayerKind(kind: MarkKind): LayerKind {
  return kind === 'Body mod' ? 'bodymod' : (kind.toLowerCase() as LayerKind);
}

/**
 * "Add a scar to her face: a thin pale line through the left eyebrow." A body
 * mod needs its words (there is no default body mod) → '' until described.
 */
export function composeMarkText(kind: MarkKind, place: MarkPlace, description: string, p: Possessive): string {
  const desc = description.trim().replace(/[.!?]+$/, '');
  if (kind === 'Body mod' && !desc) return '';
  const noun = kind === 'Body mod' ? 'a body modification' : kind === 'Makeup' ? 'makeup' : `a ${kind.toLowerCase()}`;
  return sentence(`Add ${noun} to ${p} ${place.toLowerCase()}${desc ? `: ${desc}` : ''}`);
}

/** The typed sentence, tidied (the suffix is added later, never doubled). */
export function composeTellText(text: string): string | null {
  const t = sentence(text.replace(/\s*change nothing else\.?\s*$/i, ''));
  return t || null;
}

/**
 * One section, one sentence (Mike 2026-10-15: Shape and Tell JEWL were the
 * same action twice). A part chip writes into the sentence box: a preset
 * writes the whole sentence; a mark or an own-words part writes an open stub
 * ("Add a scar to her face: ") for the user to finish. The box is what is sent.
 */
export type Part = 'Hair' | 'Build' | 'Underwear' | MarkKind;
export const MARK_PART_SET: ReadonlySet<string> = new Set<MarkKind>(MARK_KINDS);
export function isMarkPart(part: Part): part is MarkKind {
  return MARK_PART_SET.has(part);
}

/** The part chips per tab, flat: FACE = hair + the marks; BODY = build + the marks + underwear. */
export function partsFor(target: EditTarget): Part[] {
  return target === 'body' ? ['Build', ...MARK_KINDS, 'Underwear'] : ['Hair', ...MARK_KINDS];
}

/** Open stub for a part (no full stop; the user finishes it). */
export function composeStub(part: Part, place: MarkPlace, p: Possessive): string {
  if (isMarkPart(part)) {
    const noun = part === 'Body mod' ? 'a body modification' : part === 'Makeup' ? 'makeup' : `a ${part.toLowerCase()}`;
    return `Add ${noun} to ${p} ${place.toLowerCase()}: `;
  }
  return `Change ${p} ${SHAPE_PART[part]}: `;
}

/** A stub left unfinished ("…: ") is nothing to send. */
export function isUnfinishedStub(text: string): boolean {
  return /:\s*$/.test(text.trim()) || !text.trim();
}

/** The stack tag for what the sentence is about, by the part named in it (else JEWL's). */
export function layerKindFor(text: string, part: Part | null): LayerKind {
  const t = text.toLowerCase();
  if (part) {
    const word = part === 'Body mod' ? 'body modification' : part.toLowerCase();
    if (t.includes(word)) return isMarkPart(part) ? markLayerKind(part) : (part.toLowerCase() as LayerKind);
  }
  if (/\btattoo/.test(t)) return 'tattoo';
  if (/\bscar/.test(t)) return 'scar';
  if (/\bpierc/.test(t)) return 'piercing';
  if (/\bmake-?up/.test(t)) return 'makeup';
  if (/\bbirthmark/.test(t)) return 'birthmark';
  if (/\bhair|\bbeard|\bbraid/.test(t)) return 'hair';
  if (/\bbuild|\bheavier|\bthinner|\bmuscular/.test(t)) return 'build';
  if (/\bunderwear/.test(t)) return 'underwear';
  return 'jewl';
}

/** Quick tells per tab, all inside the allowed scope. */
export const QUICK_TELLS: Record<EditTarget, string[]> = {
  face: ['A scar through the left eyebrow', 'A silver streak in the hair', 'A small ring in the left nostril'],
  body: ['A tattoo down the left forearm', 'Heavier, broad through the shoulders', 'A long scar across the ribs'],
};

// ── Clothing / gear guard ───────────────────────────────────────────────

/**
 * Clothing and gear come from inventory, never from the designer (Mike
 * 2026-10-13). Shared by the client (inline note, nothing sent) and the
 * /api/portraits/edit route (422 CLOTHING_FROM_INVENTORY on qwen21).
 */
export const CLOTHING_GEAR_RE = /\b(?:coats?|jackets?|dress(?:es)?|shirts?|armou?rs?|cloaks?|robes?|hats?|helmets?|boots?|gloves?|clothes|clothing|outfits?|gowns?|pants|trousers|swords?|shields?|weapons?|necklaces?|jewel\w*)\b/i;

export const CLOTHING_NOTE =
  'Clothing and gear come from inventory. Dress the character on the PORTRAIT tab — what is EQUIPPED is what the portrait paints.';

export function isClothingOrGear(text: string | null | undefined): boolean {
  return CLOTHING_GEAR_RE.test(text ?? '');
}

// ── Edit scope (Mike 2026-10-15: "everything else is restricted") ───────

/**
 * Hard refusals regardless of subject: age (the sheet sets it), wounds /
 * tiredness / expression (the live in-play portrait, not the base).
 * "cut her hair" passes; "a cut on her cheek" and "fresh cut" do not.
 */
export const RESTRICTED_EDIT_RE = new RegExp([
  // age
  '\\b(?:ages?d?|ageing|aging|older|younger|elderly|teen(?:age[rd]?)?s?|child(?:like|ish)?|wrinkl\\w*|years\\s+old|twenties|thirties|forties|fifties|sixties|seventies|eighties)\\b',
  // wounds and state
  '\\b(?:wound\\w*|bruis\\w*|bleed\\w*|blood\\w*|bandag\\w*|black\\s+eye|swollen|gash\\w*|lacerat\\w*|stitch\\w*|(?:fresh|open|deep|new|small|thin)\\s+cuts?|cuts?\\s+(?:on|across|over|along|under)|dark\\s+circles|tired|exhaust\\w*|sweat\\w*|dirty|muddy|dusty|sunburn\\w*|sick(?:ly)?|feverish)\\b',
  // expression
  '\\b(?:expression|smil\\w*|frown\\w*|scowl\\w*|grin\\w*|crying|tears|angry|furious|sad|laugh\\w*)\\b',
].join('|'), 'i');

/** Face or body: hair, scars, tattoos, piercings, makeup, birthmarks and other body mods. */
export const ALLOWED_EDIT_RE = /\b(?:hair\w*|beard\w*|moustache|mustache|stubble|bald|braid\w*|fringe|bangs|ponytail|dreadlocks?|locs|cornrows|undercut|streak\w*|scar\w*|tattoo\w*|inked?|pierc\w*|studs?|rings?|earrings?|hoops?|gauges?|plugs?|septum|body\s*mod\w*|modification\w*|implants?|brand(?:ed|ing)?|make-?up|lipstick|eyeliner|mascara|eyeshadow|kohl|war\s*paint|face\s*paint|birthmarks?|moles?|freckle\w*)\b/i;

/** Body only: the underwear design and the build (weight, frame). */
export const BODY_ONLY_RE = /\b(?:underwear|undergarment\w*|briefs|boxers|knickers|panties|bra|lingerie|loincloth|build|weight|heavier|thinner|slimmer|wiry|stocky|muscular|muscles?|athletic|heavy-?set|broad-shouldered|curvier|curvy|taller|shorter|bulkier)\b/i;

export const RESTRICTED_NOTE =
  'The base stays as they are: age comes from the sheet; cuts, tiredness and expression belong to the live portrait in play.';
export const SCOPE_NOTE =
  'The designer changes hair, marks (scars, tattoos, piercings, makeup, birthmarks, body mods), and on the body the build and underwear. The face itself is the locked identity.';
export const BODY_ONLY_NOTE = 'Build and underwear are designed on the BODY tab.';

export type EditScope = { ok: true } | { ok: false; line: string };

/**
 * Allow-list check for one edit sentence against a target. Clothing/gear →
 * the inventory line; the hard refusals → RESTRICTED_NOTE; build or
 * underwear on the face → BODY_ONLY_NOTE; no allowed subject at all →
 * SCOPE_NOTE. Pure, shared by the client (nothing sent) and the edit route (422).
 */
export function editScope(text: string | null | undefined, target: EditTarget): EditScope {
  const t = text ?? '';
  if (isClothingOrGear(t)) return { ok: false, line: CLOTHING_NOTE };
  if (RESTRICTED_EDIT_RE.test(t)) return { ok: false, line: RESTRICTED_NOTE };
  if (BODY_ONLY_RE.test(t)) return target === 'body' ? { ok: true } : { ok: false, line: BODY_ONLY_NOTE };
  if (ALLOWED_EDIT_RE.test(t)) return { ok: true };
  return { ok: false, line: SCOPE_NOTE };
}

// ── Edit stack (persisted as identity.designer) ─────────────────────────

/**
 * Stack tags. skin/eyes/face/build/age/makeup/birthmark are LEGACY (read from
 * old stacks, never made since 2026-10-15); new edits are hair, the marks,
 * underwear or jewl.
 */
export type LayerKind =
  | 'base'
  | 'skin' | 'hair' | 'eyes' | 'face' | 'build' | 'age'
  | 'scar' | 'tattoo' | 'makeup' | 'piercing' | 'birthmark' | 'bodymod'
  | 'underwear'
  | 'jewl'
  /** The clean re-render made by APPROVE (15 Oct): the approved image itself. */
  | 'polish'
  /** A painted PORTRAIT (16 Oct): JEWL's brief rendered from the face + body references. */
  | 'portrait';

/**
 * The three stacks: FACE and BODY take edits (EditTarget); PORTRAIT only
 * holds paints (each a fresh render from the approved face + body, so a
 * layer is never "painted on" the one before — every row can be deleted).
 */
export type StackTarget = EditTarget | 'portrait';

export interface DesignerLayer {
  imagePath: string;
  /** The visible sentence (no "change nothing else" suffix); base = what it came from. */
  text: string;
  kind: LayerKind;
  seed: number | null;
  /** ISO timestamp. */
  at: string;
}

export interface DesignerLevers {
  seed: number | null;
  guidance: number | null;
  steps: number | null;
  refs: number;
  /** Base-lock gate verdict on a lock call (metadata.gate); absent on edits/body. */
  gate?: DesignerGate | null;
}

/** metadata.gate from qwen21 lockIdentity (ai/portraits/lock-gate.ts LockGateMeta). */
export interface DesignerGate {
  pass: boolean;
  reasons: string[];
  attempts: number;
  bypassed?: boolean;
}

/** Read metadata.gate defensively (null when absent or malformed). Pure. */
export function readDesignerGate(v: unknown): DesignerGate | null {
  if (!v || typeof v !== 'object') return null;
  const g = v as Record<string, unknown>;
  if (typeof g.pass !== 'boolean') return null;
  return {
    pass: g.pass,
    reasons: Array.isArray(g.reasons) ? g.reasons.filter((r): r is string => typeof r === 'string') : [],
    attempts: typeof g.attempts === 'number' && g.attempts > 0 ? Math.floor(g.attempts) : 1,
    ...(g.bypassed === true ? { bypassed: true } : {}),
  };
}

/** Tiny caption text: "gate: pass" / "re-rolled ×N" / "flagged: <reason>". Pure. */
export function gateLine(g: DesignerGate | null | undefined): string | null {
  if (!g) return null;
  if (g.bypassed) return 'gate: off';
  if (!g.pass) return `flagged: ${(g.reasons[0] ?? 'off-composition').replace(/\s*\(.*\)$/, '')}`;
  if (g.reasons.some(r => r.startsWith('gate unavailable'))) return 'gate: unavailable';
  return g.attempts > 1 ? `re-rolled ×${g.attempts - 1}` : 'gate: pass';
}

export const GATE_FLAGGED_NOTE = 'The base came back dressed or off-pose; tap regenerate.';
export const NOT_LOCALIZED_NOTE = 'JEWL could not find where that edit landed, so the whole frame was repainted. Check it; ⊗ the layer if it drifted.';

export interface DesignerState {
  /** The styled bust from LOCK IDENTITY (= layers[0].imagePath). */
  baseImagePath: string | null;
  /** FACE, oldest first: base → edit 1 → edit 2…; the last one is the current layer. */
  layers: DesignerLayer[];
  /** "Or describe them" text (kept with the image, not the sheet). */
  description?: string;
  /** The current body render (= the top of bodyLayers; mirrored to generatedFullBody). */
  bodyImagePath?: string | null;
  /** BODY, oldest first: the render from the approved base → body edit 1 → …  (Mike 2026-10-15). */
  bodyLayers?: DesignerLayer[];
  /** The layer approved as the base (Character.portrait). */
  approvedImagePath?: string | null;
  approvedAt?: string | null;
  /** PORTRAIT, oldest first: each a paint of JEWL's brief from the approved face + body (Mike 2026-10-16). */
  portraitLayers?: DesignerLayer[];
  /** The portrait approved as Character.portrait — the canvas image. */
  approvedPortraitPath?: string | null;
  portraitApprovedAt?: string | null;
  /** What the last call used (read-only display). */
  levers?: DesignerLevers | null;
}

export const EMPTY_DESIGNER: DesignerState = { baseImagePath: null, layers: [] };

export const BODY_BASE_TEXT = 'Rendered from the approved base';
export const PORTRAIT_TEXT = 'Painted from the face and body';

export type DesignerAction =
  | { type: 'lock'; layer: DesignerLayer }
  | { type: 'append'; layer: DesignerLayer; target?: StackTarget }
  | { type: 'replaceTop'; layer: DesignerLayer; target?: StackTarget }
  | { type: 'revertTo'; index: number; target?: StackTarget }
  /** Delete layer `index` and every layer painted on it (never the base, index 0 — except on the portrait stack, where every paint stands alone). */
  | { type: 'dropFrom'; index: number; target?: StackTarget }
  | { type: 'approved'; imagePath: string; at: string }
  /** APPROVE PORTRAIT: this paint is Character.portrait. */
  | { type: 'portraitApproved'; imagePath: string; at: string }
  /** A fresh body render from the approved base: the body stack restarts from it. */
  | { type: 'body'; imagePath: string | null; seed?: number | null; at?: string }
  | { type: 'levers'; levers: DesignerLevers }
  | { type: 'describe'; text: string };

/** The stack for a target. */
export function layersOf(s: DesignerState, target: StackTarget): DesignerLayer[] {
  if (target === 'portrait') return s.portraitLayers ?? [];
  return target === 'body' ? (s.bodyLayers ?? []) : s.layers;
}

function withLayers(s: DesignerState, target: StackTarget, layers: DesignerLayer[]): DesignerState {
  if (target === 'portrait') return { ...s, portraitLayers: layers };
  if (target === 'body') {
    return { ...s, bodyLayers: layers, bodyImagePath: layers.length ? layers[layers.length - 1].imagePath : null };
  }
  return { ...s, layers };
}

export function designerReducer(state: DesignerState, action: DesignerAction): DesignerState {
  switch (action.type) {
    case 'lock':
      // A new identity: the old stacks, body and portrait no longer describe her.
      return {
        ...state, baseImagePath: action.layer.imagePath, layers: [{ ...action.layer, kind: 'base' }],
        bodyImagePath: null, bodyLayers: [], portraitLayers: [], approvedPortraitPath: null, portraitApprovedAt: null,
      };
    case 'append': {
      const target = action.target ?? 'face';
      const layers = layersOf(state, target);
      if (layers.length === 0 && target !== 'portrait') return state; // edits need a base; paints stand alone
      return withLayers(state, target, [...layers, action.layer]);
    }
    case 'replaceTop': {
      const target = action.target ?? 'face';
      const prev = layersOf(state, target);
      if (prev.length === 0) return state;
      const layers = [...prev.slice(0, -1), action.layer];
      const next = withLayers(state, target, layers);
      if (target !== 'face' || layers.length > 1) return next;
      // A re-rolled face base: the body was made from the old one.
      return { ...next, baseImagePath: layers[0].imagePath, bodyImagePath: null, bodyLayers: [] };
    }
    case 'revertTo': {
      const target = action.target ?? 'face';
      const layers = layersOf(state, target);
      if (action.index < 0 || action.index >= layers.length) return state;
      return withLayers(state, target, layers.slice(0, action.index + 1));
    }
    case 'dropFrom': {
      const target = action.target ?? 'face';
      const layers = layersOf(state, target);
      if (action.index < 0 || action.index >= layers.length) return state;
      if (target === 'portrait') {
        // Paints are independent: only this one goes.
        const kept = layers.filter((_, i) => i !== action.index);
        const next = withLayers(state, target, kept);
        const approvedStill = kept.some(l => l.imagePath === state.approvedPortraitPath);
        return approvedStill ? next : { ...next, approvedPortraitPath: null, portraitApprovedAt: null };
      }
      if (action.index < 1) return state;
      return withLayers(state, target, layers.slice(0, action.index));
    }
    case 'approved':
      return { ...state, approvedImagePath: action.imagePath, approvedAt: action.at };
    case 'portraitApproved':
      return { ...state, approvedPortraitPath: action.imagePath, portraitApprovedAt: action.at };
    case 'body':
      if (!action.imagePath) return { ...state, bodyImagePath: null, bodyLayers: [] };
      return {
        ...state,
        bodyImagePath: action.imagePath,
        bodyLayers: [{ imagePath: action.imagePath, text: BODY_BASE_TEXT, kind: 'base', seed: action.seed ?? null, at: action.at ?? '' }],
      };
    case 'levers':
      return { ...state, levers: action.levers };
    case 'describe':
      return { ...state, description: action.text };
    default:
      return state;
  }
}

export function currentLayer(s: DesignerState, target: StackTarget = 'face'): DesignerLayer | null {
  const layers = layersOf(s, target);
  return layers.length ? layers[layers.length - 1] : null;
}

/** How many layers a revert to `index` drops (for the confirm line). */
export function layersDroppedBy(s: DesignerState, index: number, target: StackTarget = 'face'): number {
  return Math.max(0, layersOf(s, target).length - 1 - index);
}

/** How many layers go when layer `index` is deleted: it and every one painted on it (a portrait paint: just itself). */
export function layersDeletedBy(s: DesignerState, index: number, target: StackTarget = 'face'): number {
  const n = layersOf(s, target).length;
  if (target === 'portrait') return index < 0 || index >= n ? 0 : 1;
  return index < 1 || index >= n ? 0 : n - index;
}

const LAYER_KINDS: ReadonlySet<string> = new Set<LayerKind>([
  'base', 'skin', 'hair', 'eyes', 'face', 'build', 'age',
  'scar', 'tattoo', 'makeup', 'piercing', 'birthmark', 'bodymod', 'underwear', 'jewl', 'polish', 'portrait',
]);

export const POLISH_TEXT = 'Clean render (approved)';

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v : null;
}
function num(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

/**
 * Restore from the character's identity JSON. Bad rows are dropped. A
 * character that predates the designer but has a bust starts from it (as
 * an approved base) so nothing already made is lost.
 */
export function restoreDesigner(identity: unknown): DesignerState {
  const id = (identity && typeof identity === 'object' ? identity : {}) as Record<string, unknown>;
  const raw = (id.designer && typeof id.designer === 'object' ? id.designer : null) as Record<string, unknown> | null;
  const legacyBust = str(id.generatedBust);
  const legacyBody = str(id.generatedFullBody);

  const readLayers = (v: unknown, paints = false): DesignerLayer[] => {
    const layers = (Array.isArray(v) ? v : [])
      .map((l): DesignerLayer | null => {
        if (!l || typeof l !== 'object') return null;
        const o = l as Record<string, unknown>;
        const imagePath = str(o.imagePath);
        if (!imagePath) return null;
        const kind = paints ? 'portrait' : typeof o.kind === 'string' && LAYER_KINDS.has(o.kind) ? (o.kind as LayerKind) : 'jewl';
        return { imagePath, text: typeof o.text === 'string' ? o.text : '', kind, seed: num(o.seed), at: str(o.at) ?? '' };
      })
      .filter((l): l is DesignerLayer => !!l);
    if (layers.length && !paints) layers[0] = { ...layers[0], kind: 'base' };
    return layers;
  };
  const bodyStackFor = (bodyImagePath: string | null, saved: DesignerLayer[]): DesignerLayer[] => {
    if (saved.length) return saved;
    // A body saved before the body stack existed starts as its own base.
    return bodyImagePath ? [{ imagePath: bodyImagePath, text: BODY_BASE_TEXT, kind: 'base', seed: null, at: '' }] : [];
  };

  if (raw) {
    const layers = readLayers(raw.layers);
    const bodyLayers = readLayers(raw.bodyLayers);
    const bodyImagePath = bodyLayers.length ? bodyLayers[bodyLayers.length - 1].imagePath : (str(raw.bodyImagePath) ?? legacyBody);
    const lv = raw.levers && typeof raw.levers === 'object' ? raw.levers as Record<string, unknown> : null;
    const portraitLayers = readLayers(raw.portraitLayers, true);
    const approvedPortrait = str(raw.approvedPortraitPath);
    return {
      baseImagePath: layers[0]?.imagePath ?? str(raw.baseImagePath),
      layers,
      description: typeof raw.description === 'string' ? raw.description : undefined,
      bodyImagePath,
      bodyLayers: bodyStackFor(bodyImagePath, bodyLayers),
      approvedImagePath: str(raw.approvedImagePath),
      approvedAt: str(raw.approvedAt),
      portraitLayers,
      // An approved portrait whose paint was deleted is no longer the stack's.
      approvedPortraitPath: approvedPortrait && portraitLayers.some(l => l.imagePath === approvedPortrait) ? approvedPortrait : null,
      portraitApprovedAt: approvedPortrait ? str(raw.portraitApprovedAt) : null,
      levers: lv ? { seed: num(lv.seed), guidance: num(lv.guidance), steps: num(lv.steps), refs: num(lv.refs) ?? 0 } : null,
    };
  }

  if (legacyBust) {
    return {
      baseImagePath: legacyBust,
      layers: [{ imagePath: legacyBust, text: 'Existing portrait', kind: 'base', seed: null, at: '' }],
      bodyImagePath: legacyBody,
      bodyLayers: bodyStackFor(legacyBody, []),
      approvedImagePath: legacyBust,
      approvedAt: null,
    };
  }
  return { ...EMPTY_DESIGNER };
}

// ── Status ──────────────────────────────────────────────────────────────

export type DesignerStatus = 'awaiting' | 'locked' | 'approved';

/** Approved = the current layer IS the approved base; editing after approval needs a re-approve. */
export function deriveDesignerStatus(s: DesignerState): DesignerStatus {
  const top = currentLayer(s);
  if (!top) return 'awaiting';
  if (!s.approvedImagePath || s.approvedImagePath !== top.imagePath) return 'locked';
  // A body rendered or edited after the approval is not approved yet: APPROVE opens again so it can be
  // locked in (Mike 2026-10-17: "I can't lock in body" — the button stayed BASE APPROVED).
  const bodyTop = s.bodyLayers?.[s.bodyLayers.length - 1];
  if (bodyTop?.at && s.approvedAt && bodyTop.at > s.approvedAt) return 'locked';
  return 'approved';
}

export const STATUS_LABEL: Record<DesignerStatus, string> = {
  awaiting: 'AWAITING LOCK',
  locked: 'IDENTITY LOCKED',
  approved: 'BASE APPROVED',
};

// ── Errors ──────────────────────────────────────────────────────────────

const PAUSED_LINE = 'The portrait engine is paused or unreachable right now. Nothing was lost; try again later.';

/** One plain line for a failed portrait call: endpoint codes, the guard, then portraitErrorLine. */
export function designerErrorLine(
  body: { error?: unknown; message?: unknown } | null | undefined,
  fallback: (raw: string | null | undefined) => string,
): string {
  const code = typeof body?.error === 'string' ? body.error : '';
  const message = typeof body?.message === 'string' ? body.message : '';
  switch (code) {
    case 'ENDPOINT_PAUSED':
    case 'ENDPOINT_UNREACHABLE':
      return PAUSED_LINE;
    case 'ENDPOINT_AUTH':
      return 'The portrait engine refused the app\'s key. The RunPod key needs checking.';
    case 'ENDPOINT_ERROR':
      return fallback(message || null);
    case 'CLOTHING_FROM_INVENTORY':
      return message || CLOTHING_NOTE;
    case 'EDIT_OUT_OF_SCOPE':
      return message || SCOPE_NOTE;
    default:
      return fallback(code || message || null);
  }
}
