/**
 * Designer → existing portrait routes. Every failure comes back as ONE plain
 * line (endpoint codes, the clothing guard, then portraitErrorLine) — never raw.
 */

import { portraitErrorLine } from '@/lib/entity-view';
import { designerErrorLine, readDesignerGate, type DesignerLevers, type DesignerState, type EditTarget } from '@/lib/appearance-designer';

export type CallResult =
  | { ok: true; imagePath: string; seed: number | null; levers: DesignerLevers; localized: 'bbox' | 'diff' | 'none' | null }
  | { ok: false; line: string };

async function readBody(res: Response): Promise<Record<string, unknown> | null> {
  const text = await res.text().catch(() => '');
  if (!text) return null;
  try { return JSON.parse(text) as Record<string, unknown>; } catch { return { error: text }; }
}

async function post(url: string, payload: unknown, refs: number): Promise<CallResult> {
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
  return { ok: true, imagePath: body.imagePath, seed, localized, levers: { seed, guidance: n(meta.cfg), steps: n(meta.steps), refs, gate: readDesignerGate(meta.gate) } };
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
