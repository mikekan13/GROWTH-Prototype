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
 * What the designer may change (Mike 2026-10-15): hair, scars, tattoos and
 * body mods on the face or body, plus the underwear design on the body. Age
 * is the sheet's (never picked here); skin, eyes, face shape and build are the
 * locked identity; cuts, bruises, tiredness, expression and the like belong
 * to the live in-play portrait, not the base.
 */
export type EditTarget = 'face' | 'body';

export type ShapeCategory = 'Hair' | 'Marks' | 'Underwear';
export const SHAPE_CATEGORIES: ShapeCategory[] = ['Hair', 'Marks', 'Underwear'];

/** Which chips a target offers: hair is face-only (the body follows the face), underwear is body-only. */
export function shapeCategoriesFor(target: EditTarget): ShapeCategory[] {
  return target === 'body' ? ['Marks', 'Underwear'] : ['Hair', 'Marks'];
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
  Underwear: [],
};

/** Sentence head per category; the preset phrase (or own words) finishes it. */
const SHAPE_HEAD: Record<Exclude<ShapeCategory, 'Marks'>, (p: Possessive) => string> = {
  Hair: p => `Change ${p} hair to`,
  Underwear: p => `Change ${p} underwear to`,
};

/** The part name used when own words replace the preset ("Change her hair: …"). */
const SHAPE_PART: Record<Exclude<ShapeCategory, 'Marks'>, string> = {
  Hair: 'hair', Underwear: 'underwear',
};

/** Placeholder for the own-words box per category. */
export const SHAPE_WORDS_PLACEHOLDER: Record<Exclude<ShapeCategory, 'Marks'>, string> = {
  Hair: 'Or your own words',
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

/** Permanent marks only: scars, tattoos, piercings and other body mods (gauges, implants, brands…). */
export type MarkKind = 'Scar' | 'Tattoo' | 'Piercing' | 'Body mod';
export const MARK_KINDS: MarkKind[] = ['Scar', 'Tattoo', 'Piercing', 'Body mod'];
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
  const noun = kind === 'Body mod' ? 'a body modification' : `a ${kind.toLowerCase()}`;
  return sentence(`Add ${noun} to ${p} ${place.toLowerCase()}${desc ? `: ${desc}` : ''}`);
}

/** TELL JEWL: the user's sentence, tidied. */
export function composeTellText(text: string): string | null {
  const t = sentence(text.replace(/\s*change nothing else\.?\s*$/i, ''));
  return t || null;
}

/** Quick tells stay inside the allowed scope (hair, scars, tattoos, body mods). */
export const QUICK_TELLS = ['A scar through the left eyebrow', 'A silver streak in the hair', 'A small ring in the left nostril'];

// ── Clothing / gear guard ───────────────────────────────────────────────

/**
 * Clothing and gear come from inventory, never from the designer (Mike
 * 2026-10-13). Shared by the client (inline note, nothing sent) and the
 * /api/portraits/edit route (422 CLOTHING_FROM_INVENTORY on qwen21).
 */
export const CLOTHING_GEAR_RE = /\b(?:coats?|jackets?|dress(?:es)?|shirts?|armou?rs?|cloaks?|robes?|hats?|helmets?|boots?|gloves?|clothes|clothing|outfits?|gowns?|pants|trousers|swords?|shields?|weapons?|necklaces?|jewel\w*)\b/i;

export const CLOTHING_NOTE =
  'Clothing and gear come from inventory. Give the character the item as a possession and it shows up on the portrait by itself.';

export function isClothingOrGear(text: string | null | undefined): boolean {
  return CLOTHING_GEAR_RE.test(text ?? '');
}

// ── Edit scope (Mike 2026-10-15: "everything else is restricted") ───────

/**
 * Hard refusals regardless of subject: age (the sheet sets it), wounds /
 * tiredness / expression / makeup (the live in-play portrait, not the base).
 * "cut her hair" passes; "a cut on her cheek" and "fresh cut" do not.
 */
export const RESTRICTED_EDIT_RE = new RegExp([
  // age
  '\\b(?:ages?d?|ageing|aging|older|younger|elderly|teen(?:age[rd]?)?s?|child(?:like|ish)?|wrinkl\\w*|years\\s+old|twenties|thirties|forties|fifties|sixties|seventies|eighties)\\b',
  // wounds and state
  '\\b(?:wound\\w*|bruis\\w*|bleed\\w*|blood\\w*|bandag\\w*|black\\s+eye|swollen|gash\\w*|lacerat\\w*|stitch\\w*|(?:fresh|open|deep|new|small|thin)\\s+cuts?|cuts?\\s+(?:on|across|over|along|under)|dark\\s+circles|tired|exhaust\\w*|sweat\\w*|dirty|muddy|dusty|sunburn\\w*|sick(?:ly)?|feverish)\\b',
  // expression
  '\\b(?:expression|smil\\w*|frown\\w*|scowl\\w*|grin\\w*|crying|tears|angry|furious|sad|laugh\\w*)\\b',
  // makeup (temporary; the live portrait's business)
  '\\b(?:make-?up|lipstick|eyeliner|mascara|eyeshadow|blusher|rouge|war\\s*paint|face\\s*paint)\\b',
].join('|'), 'i');

/** What the designer changes: hair, scars, tattoos, piercings and other body mods, and (body) underwear. */
export const ALLOWED_EDIT_RE = /\b(?:hair\w*|beard\w*|moustache|mustache|stubble|bald|braid\w*|fringe|bangs|ponytail|dreadlocks?|locs|cornrows|undercut|scar\w*|tattoo\w*|inked?|pierc\w*|studs?|rings?|earrings?|hoops?|gauges?|plugs?|septum|body\s*mod\w*|modification\w*|implants?|brand(?:ed|ing)?|underwear)\b/i;

export const UNDERWEAR_RE = /\b(?:underwear|undergarment\w*|briefs|boxers|knickers|panties|bra|lingerie|loincloth)\b/i;

export const RESTRICTED_NOTE =
  'The base stays as they are: age comes from the sheet; cuts, tiredness, expression and makeup belong to the live portrait in play.';
export const SCOPE_NOTE =
  'The designer changes hair, scars, tattoos and body mods only (and the underwear design on the body). The face itself is the locked identity.';
export const UNDERWEAR_BODY_NOTE = 'Underwear is designed on the BODY view.';

export type EditScope = { ok: true } | { ok: false; line: string };

/**
 * Allow-list check for one edit sentence against a target. Clothing/gear →
 * the inventory line; the hard refusals → RESTRICTED_NOTE; underwear on the
 * face → UNDERWEAR_BODY_NOTE; no allowed subject at all → SCOPE_NOTE. Pure,
 * shared by the client (nothing sent) and the edit route (422).
 */
export function editScope(text: string | null | undefined, target: EditTarget): EditScope {
  const t = text ?? '';
  if (isClothingOrGear(t)) return { ok: false, line: CLOTHING_NOTE };
  if (RESTRICTED_EDIT_RE.test(t)) return { ok: false, line: RESTRICTED_NOTE };
  if (UNDERWEAR_RE.test(t)) return target === 'body' ? { ok: true } : { ok: false, line: UNDERWEAR_BODY_NOTE };
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
  | 'jewl';

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

export interface DesignerState {
  /** The styled bust from LOCK IDENTITY (= layers[0].imagePath). */
  baseImagePath: string | null;
  /** Oldest first: base → edit 1 → edit 2…; the last one is the current layer. */
  layers: DesignerLayer[];
  /** "Or describe them" text (kept with the image, not the sheet). */
  description?: string;
  /** Full-body render made from the approved base. */
  bodyImagePath?: string | null;
  /** The layer approved as the base (Character.portrait). */
  approvedImagePath?: string | null;
  approvedAt?: string | null;
  /** What the last call used (read-only display). */
  levers?: DesignerLevers | null;
}

export const EMPTY_DESIGNER: DesignerState = { baseImagePath: null, layers: [] };

export type DesignerAction =
  | { type: 'lock'; layer: DesignerLayer }
  | { type: 'append'; layer: DesignerLayer }
  | { type: 'replaceTop'; layer: DesignerLayer }
  | { type: 'revertTo'; index: number }
  | { type: 'approved'; imagePath: string; at: string }
  | { type: 'body'; imagePath: string | null }
  | { type: 'levers'; levers: DesignerLevers }
  | { type: 'describe'; text: string };

export function designerReducer(state: DesignerState, action: DesignerAction): DesignerState {
  switch (action.type) {
    case 'lock':
      // A new identity: the old stack and body no longer describe her.
      return { ...state, baseImagePath: action.layer.imagePath, layers: [{ ...action.layer, kind: 'base' }], bodyImagePath: null };
    case 'append':
      if (state.layers.length === 0) return state; // edits need a base
      return { ...state, layers: [...state.layers, action.layer] };
    case 'replaceTop': {
      if (state.layers.length === 0) return state;
      const layers = [...state.layers.slice(0, -1), action.layer];
      const baseImagePath = layers.length === 1 ? layers[0].imagePath : state.baseImagePath;
      return { ...state, layers, baseImagePath, ...(layers.length === 1 ? { bodyImagePath: null } : {}) };
    }
    case 'revertTo': {
      if (action.index < 0 || action.index >= state.layers.length) return state;
      return { ...state, layers: state.layers.slice(0, action.index + 1) };
    }
    case 'approved':
      return { ...state, approvedImagePath: action.imagePath, approvedAt: action.at };
    case 'body':
      return { ...state, bodyImagePath: action.imagePath };
    case 'levers':
      return { ...state, levers: action.levers };
    case 'describe':
      return { ...state, description: action.text };
    default:
      return state;
  }
}

export function currentLayer(s: DesignerState): DesignerLayer | null {
  return s.layers.length ? s.layers[s.layers.length - 1] : null;
}

/** How many layers a revert to `index` drops (for the confirm line). */
export function layersDroppedBy(s: DesignerState, index: number): number {
  return Math.max(0, s.layers.length - 1 - index);
}

const LAYER_KINDS: ReadonlySet<string> = new Set<LayerKind>([
  'base', 'skin', 'hair', 'eyes', 'face', 'build', 'age',
  'scar', 'tattoo', 'makeup', 'piercing', 'birthmark', 'bodymod', 'underwear', 'jewl',
]);

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

  if (raw) {
    const layers: DesignerLayer[] = (Array.isArray(raw.layers) ? raw.layers : [])
      .map((l): DesignerLayer | null => {
        if (!l || typeof l !== 'object') return null;
        const o = l as Record<string, unknown>;
        const imagePath = str(o.imagePath);
        if (!imagePath) return null;
        const kind = typeof o.kind === 'string' && LAYER_KINDS.has(o.kind) ? (o.kind as LayerKind) : 'jewl';
        return { imagePath, text: typeof o.text === 'string' ? o.text : '', kind, seed: num(o.seed), at: str(o.at) ?? '' };
      })
      .filter((l): l is DesignerLayer => !!l);
    if (layers.length) layers[0] = { ...layers[0], kind: 'base' };
    const lv = raw.levers && typeof raw.levers === 'object' ? raw.levers as Record<string, unknown> : null;
    return {
      baseImagePath: layers[0]?.imagePath ?? str(raw.baseImagePath),
      layers,
      description: typeof raw.description === 'string' ? raw.description : undefined,
      bodyImagePath: str(raw.bodyImagePath) ?? legacyBody,
      approvedImagePath: str(raw.approvedImagePath),
      approvedAt: str(raw.approvedAt),
      levers: lv ? { seed: num(lv.seed), guidance: num(lv.guidance), steps: num(lv.steps), refs: num(lv.refs) ?? 0 } : null,
    };
  }

  if (legacyBust) {
    return {
      baseImagePath: legacyBust,
      layers: [{ imagePath: legacyBust, text: 'Existing portrait', kind: 'base', seed: null, at: '' }],
      bodyImagePath: legacyBody,
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
  if (s.approvedImagePath && s.approvedImagePath === top.imagePath) return 'approved';
  return 'locked';
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
