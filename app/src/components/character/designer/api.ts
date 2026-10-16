/**
 * Designer → existing portrait routes. Every failure comes back as ONE plain
 * line (endpoint codes, the clothing guard, then portraitErrorLine) — never raw.
 */

import { portraitErrorLine } from '@/lib/entity-view';
import { designerErrorLine, readDesignerGate, type DesignerLevers, type DesignerState, type EditTarget } from '@/lib/appearance-designer';

export type CallResult =
  | { ok: true; imagePath: string; seed: number | null; levers: DesignerLevers; localized: 'bbox' | 'diff' | 'none' | null; extra?: Record<string, unknown> }
  | { ok: false; line: string };

async function readBody(res: Response): Promise<Record<string, unknown> | null> {
  const text = await res.text().catch(() => '');
  if (!text) return null;
  try { return JSON.parse(text) as Record<string, unknown>; } catch { return { error: text }; }
}

async function post(url: string, payload: unknown, refs: number, extra?: (body: Record<string, unknown>) => Record<string, unknown>): Promise<CallResult> {
  let res: Response;
  try {
    res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  } catch (e) {
    return { ok: false, line: portraitErrorLine(e instanceof Error ? e.message : String(e)) };
  }
  const body = await readBody(res);
  if (!res.ok || !body || typeof body.imagePath !== 'string') {
    return { ok: false, line: designerErrorLine(body, portraitErrorLine) };
  }
  const meta = (body.metadata ?? {}) as Record<string, unknown>;
  const n = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const seed = n(meta.seed);
  const localized = meta.localized === 'bbox' || meta.localized === 'diff' || meta.localized === 'none' ? meta.localized : null;
  return { ok: true, imagePath: body.imagePath, seed, localized, levers: { seed, guidance: n(meta.cfg), steps: n(meta.steps), refs, gate: readDesignerGate(meta.gate) }, ...(extra ? { extra: extra(body) } : {}) };
}

const randomSeed = () => Math.floor(Math.random() * 2147483647);

/**
 * LOCK IDENTITY: photos as refs → qwen21 runs lockIdentity → applyStyle
 * (uploaded photos, not a stored /portraits/ path, so it takes the two-step).
 */
export function lockIdentity(characterData: unknown, photos: string[]): Promise<CallResult> {
  return post('/api/portraits/generate', {
    characterData,
    creationMode: true,
    referenceImagePath: photos[0],
    referenceImagePaths: photos,
    overrides: { seed: randomSeed() },
  }, photos.length);
}

/**
 * Instruction edit on the current face layer or the body render. `instruction`
 * already ends "Change nothing else."; `target` turns on the server's scope guard.
 */
export function editLayer(characterId: string, sourceImagePath: string, instruction: string, target: EditTarget): Promise<CallResult> {
  return post('/api/portraits/edit', { sourceImagePath, editPrompt: instruction, characterId, seed: randomSeed(), target }, 1);
}

/**
 * POLISH (APPROVE, 15 Oct): a clean re-render of the face or body image — the picture finished again from
 * itself so compositing seams and artifacts go, identity and marks stay.
 */
export function polishImage(characterId: string, imagePath: string, target: EditTarget): Promise<CallResult> {
  return post('/api/portraits/polish', { characterId, imagePath, target, seed: randomSeed() }, 1);
}

/** BODY: full-body from the approved bust (qwen21: composition full_body → generateBody(refs[0])). */
export function generateBody(characterData: unknown, bustPath: string): Promise<CallResult> {
  return post('/api/portraits/generate', {
    characterData,
    creationMode: true,
    referenceImagePath: bustPath,
    referenceImagePaths: [bustPath],
    overrides: { composition: 'full_body', seed: randomSeed() },
  }, 1);
}

export type PaintResult =
  | { ok: true; imagePath: string; seed: number | null; levers: DesignerLevers; brief: PaintBrief | null }
  | { ok: false; line: string };

/** The brief the paint stood on (identity.portraitBrief, as the route returns it). */
export interface PaintBrief {
  setting: string; pose: string; expression: string; clothes: string; marks: string; light: string;
  byJewl: boolean; reused: boolean;
}

/** Read a brief object (the route's `brief` or identity.portraitBrief). Pure. */
export function readPortraitBrief(v: unknown): PaintBrief | null {
  if (!v || typeof v !== 'object') return null;
  const o = v as Record<string, unknown>;
  const s = (k: string) => (typeof o[k] === 'string' ? (o[k] as string) : '');
  if (!s('setting') && !s('clothes') && !s('prompt')) return null;
  return { setting: s('setting'), pose: s('pose'), expression: s('expression'), clothes: s('clothes'), marks: s('marks'), light: s('light'), byJewl: o.byJewl === true, reused: o.reused === true || !!s('hash') };
}

/**
 * PAINT PORTRAIT (Mike 16 Oct; plan §4 C): JEWL writes the brief from everything known (reused while
 * nothing changed), the engine paints it from the approved face + body on the v1 recipe. A new seed
 * every call = REGENERATE; `force` rewrites the brief.
 */
export async function paintPortrait(characterId: string, opts: { force?: boolean } = {}): Promise<PaintResult> {
  const r = await post('/api/portraits/paint', { characterId, seed: randomSeed(), ...(opts.force ? { force: true } : {}) }, 2, b => ({ brief: readPortraitBrief(b.brief) }));
  if (!r.ok) return r;
  return { ok: true, imagePath: r.imagePath, seed: r.seed, levers: r.levers, brief: (r.extra?.brief as PaintBrief | null) ?? null };
}

// ── DRESS (her own things only) ──────────────────────────────────────────

export interface WardrobeRow {
  id: string; name: string; archetype: string | null; type: string; description: string | null; material: string | null;
  category: string | null; garment: boolean; state: 'worn' | 'carried' | 'owned'; region: string | null; where: string | null;
}
export interface WardrobeView { regions: string[]; garments: WardrobeRow[]; things: WardrobeRow[]; empty: boolean }
export interface OutfitPieceView { itemId: string; name: string; state: 'worn' | 'carried'; region: string | null; why: string }
export interface OutfitProposalView { pieces: OutfitPieceView[]; byJewl: boolean; empty: boolean }

type Lined<T> = { ok: true; value: T } | { ok: false; line: string };

async function call<T>(url: string, init: RequestInit | undefined, pick: (body: Record<string, unknown>) => T | null): Promise<Lined<T>> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch (e) {
    return { ok: false, line: portraitErrorLine(e instanceof Error ? e.message : String(e)) };
  }
  const body = await readBody(res);
  const value = res.ok && body ? pick(body) : null;
  if (value === null) return { ok: false, line: designerErrorLine(body, portraitErrorLine) };
  return { ok: true, value };
}

const json = (payload: unknown): RequestInit => ({ method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });

export function loadWardrobe(characterId: string): Promise<Lined<WardrobeView>> {
  return call(`/api/characters/${characterId}/dress`, undefined, b => (b.wardrobe as WardrobeView | undefined) ?? null);
}

/** One thing → worn (over a region) | carried | owned (put down at home). */
export function setDressState(characterId: string, itemId: string, state: 'worn' | 'carried' | 'owned', region?: string | null): Promise<Lined<WardrobeRow>> {
  return call(`/api/characters/${characterId}/dress`, json({ itemId, state, ...(region ? { region } : {}) }), b => (b.item as WardrobeRow | undefined) ?? null);
}

/** LET JEWL DRESS HER: a proposal from her own things; nothing written until approved. */
export function proposeOutfit(characterId: string): Promise<Lined<OutfitProposalView>> {
  return call(`/api/characters/${characterId}/dress/propose`, json({}), b => (b.proposal as OutfitProposalView | undefined) ?? null);
}

/** APPROVE OUTFIT → the states are written (garments left out come off). */
export function applyOutfit(characterId: string, pieces: OutfitPieceView[]): Promise<Lined<WardrobeView>> {
  return call(`/api/characters/${characterId}/dress/apply`, json({ pieces: pieces.map(p => ({ itemId: p.itemId, state: p.state, region: p.region })) }), b => (b.wardrobe as WardrobeView | undefined) ?? null);
}

/** APPROVE AS BASE → Character.portrait. */
export async function approveBase(characterId: string, imagePath: string): Promise<{ ok: true } | { ok: false; line: string }> {
  try {
    const res = await fetch('/api/portraits/lock', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ characterId, imagePath }),
    });
    if (res.ok) return { ok: true };
    return { ok: false, line: designerErrorLine(await readBody(res), portraitErrorLine) };
  } catch (e) {
    return { ok: false, line: portraitErrorLine(e instanceof Error ? e.message : String(e)) };
  }
}

/** Load identity JSON (designer + photos) fresh from the server. */
export async function loadIdentity(characterId: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await fetch(`/api/characters/${characterId}`);
    if (!res.ok) return null;
    const { character } = await res.json();
    const data = typeof character?.data === 'string' ? JSON.parse(character.data) : (character?.data ?? {});
    return (data.identity ?? {}) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Persist the stack into identity.designer (migration-free; read-modify-write
 * like the old wizard's portrait save). Photos ride along so a reload matches.
 */
export async function persistDesigner(characterId: string, designer: DesignerState, referencePhotos: string[]): Promise<boolean> {
  try {
    const res = await fetch(`/api/characters/${characterId}`);
    if (!res.ok) return false;
    const { character } = await res.json();
    const data = typeof character.data === 'string' ? JSON.parse(character.data) : (character.data ?? {});
    data.identity = {
      ...data.identity,
      designer,
      referencePhotos,
      // The approved base is the official bust (what completion + old readers use).
      ...(designer.approvedImagePath ? { generatedBust: designer.approvedImagePath } : {}),
      ...(designer.approvedImagePath && designer.bodyImagePath ? { generatedFullBody: designer.bodyImagePath } : {}),
    };
    const put = await fetch(`/api/characters/${characterId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data }),
    });
    return put.ok;
  } catch {
    return false;
  }
}
