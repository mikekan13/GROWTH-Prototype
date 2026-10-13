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

export type ShapeCategory = 'Skin' | 'Hair' | 'Eyes' | 'Face' | 'Build' | 'Age' | 'Marks';
export const SHAPE_CATEGORIES: ShapeCategory[] = ['Skin', 'Hair', 'Eyes', 'Face', 'Build', 'Age', 'Marks'];

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
const subj = (p: Possessive) => (p === 'her' ? 'her' : p === 'his' ? 'his' : 'their');

/** Presets per chip (the mockup's lists). Marks has none — it has kinds + where. */
export const SHAPE_PRESETS: Record<Exclude<ShapeCategory, 'Marks'>, ShapePreset[]> = {
  Skin: [
    { label: 'Pale', phrase: fixed('pale') },
    { label: 'Olive', phrase: fixed('olive') },
    { label: 'Deep brown', phrase: fixed('deep brown') },
    { label: 'Freckled', phrase: fixed('freckled') },
  ],
  Hair: [
    { label: 'Long, tied up', phrase: fixed('long and tied up') },
    { label: 'Short crop', phrase: fixed('a short crop') },
    { label: 'Braids', phrase: fixed('braids') },
    { label: 'Shaved', phrase: fixed('shaved close to the scalp') },
  ],
  Eyes: [
    { label: 'Dark brown', phrase: fixed('dark brown') },
    { label: 'Grey', phrase: fixed('grey') },
    { label: 'Green', phrase: fixed('green') },
    { label: 'Heterochromia', phrase: fixed('two different colours (heterochromia)') },
  ],
  Face: [
    { label: 'Round', phrase: fixed('round') },
    { label: 'Angular', phrase: fixed('angular') },
    { label: 'Long', phrase: fixed('long') },
    { label: 'Broad', phrase: fixed('broad') },
  ],
  Build: [
    { label: 'Slight', phrase: fixed('slight') },
    { label: 'Athletic', phrase: fixed('athletic') },
    { label: 'Heavy', phrase: fixed('heavy-set') },
    { label: 'Tall', phrase: fixed('tall and long-limbed') },
  ],
  Age: [
    { label: 'Teen', phrase: fixed('like a teenager') },
    { label: '20s', phrase: p => `in ${subj(p)} twenties` },
    { label: '40s', phrase: p => `in ${subj(p)} forties` },
    { label: 'Elder', phrase: fixed('elderly') },
  ],
};

/** Sentence head per category; the preset phrase (or own words) finishes it. */
const SHAPE_HEAD: Record<Exclude<ShapeCategory, 'Marks'>, (p: Possessive) => string> = {
  Skin: p => `Make ${p} skin`,
  Hair: p => `Change ${p} hair to`,
  Eyes: p => `Change ${p} eyes to`,
  Face: p => `Change ${p} face shape to`,
  Build: p => `Change ${p} build to`,
  Age: p => `Make ${p === 'their' ? 'them' : p === 'her' ? 'her' : 'him'} look`,
};

/** The part name used when own words replace the preset ("Change her hair: …"). */
const SHAPE_PART: Record<Exclude<ShapeCategory, 'Marks'>, string> = {
  Skin: 'skin', Hair: 'hair', Eyes: 'eyes', Face: 'face', Build: 'build', Age: 'apparent age',
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

export type MarkKind = 'Scar' | 'Tattoo' | 'Makeup' | 'Piercing' | 'Birthmark';
export const MARK_KINDS: MarkKind[] = ['Scar', 'Tattoo', 'Makeup', 'Piercing', 'Birthmark'];
export type MarkPlace = 'Face' | 'Neck' | 'Arms' | 'Hands' | 'Torso' | 'Back';
export const MARK_PLACES: MarkPlace[] = ['Face', 'Neck', 'Arms', 'Hands', 'Torso', 'Back'];

/** "Add a scar to her face: a thin pale line through the left eyebrow." */
export function composeMarkText(kind: MarkKind, place: MarkPlace, description: string, p: Possessive): string {
  const noun = kind === 'Makeup' ? 'makeup' : `a ${kind.toLowerCase()}`;
  const desc = description.trim().replace(/[.!?]+$/, '');
  return sentence(`Add ${noun} to ${p} ${place.toLowerCase()}${desc ? `: ${desc}` : ''}`);
}

/** TELL JEWL: the user's sentence, tidied. */
export function composeTellText(text: string): string | null {
  const t = sentence(text.replace(/\s*change nothing else\.?\s*$/i, ''));
  return t || null;
}

export const QUICK_TELLS = ['Older by ten years', 'Tired, dark circles', 'Fresh cut on the cheek'];

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

// ── Edit stack (persisted as identity.designer) ─────────────────────────

export type LayerKind =
  | 'base'
  | 'skin' | 'hair' | 'eyes' | 'face' | 'build' | 'age'
  | 'scar' | 'tattoo' | 'makeup' | 'piercing' | 'birthmark'
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
}

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
  'scar', 'tattoo', 'makeup', 'piercing', 'birthmark', 'jewl',
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
    default:
      return fallback(code || message || null);
  }
}
