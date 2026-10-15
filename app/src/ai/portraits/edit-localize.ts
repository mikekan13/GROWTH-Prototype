/**
 * LOCALIZED EDITS (Mike, 15 Oct 2026: a navel piercing on Violet "shifted the
 * entire body … definitely wasn't a localized edit").
 *
 * Qwen-Image-2.1's edit node has no mask input: an instruction edit repaints
 * the WHOLE frame, and everything drifts a little (waist, colour, lace, even
 * the canvas height). The painted-mask path already fixes that by compositing
 * only the masked area over the base — this module makes the mask by itself,
 * from the vision lane in TWO looks:
 *
 *   1. COARSE — where did the edit land on the whole edited image? (a box)
 *   2. FINE   — the window round that box, cropped at full resolution, asked
 *               again: the mark is now large in the picture, so the box is
 *               precise (a coarse box on a navel ring sat ~4 % high).
 *
 * The fine box, modestly padded, is the mask; the repaint is colour-matched
 * to the base round it so the seam does not read. No box → no mask (the
 * caller keeps the whole repaint and says so). A pixel-difference mask was
 * tried and dropped: a repaint re-renders every highlight and fold, and the
 * bra's sheen out-scored the ring, so no threshold separates mark from noise.
 *
 * The vision call goes through ai/network/vision like the lock gate: the image
 * derives from a real person, so it is judged inside the wall (pod by default).
 * Box maths and masks are pure and unit-tested; only the two locate calls
 * talk to a model, and they never throw.
 */

import sharp from 'sharp';
import { describeImage, resolveVisionProvider, type VisionProvider } from '@/ai/network/vision';

/** Normalized 0..1 box, x left→right, y top→bottom. */
export interface EditBox { x0: number; y0: number; x1: number; y1: number }

export type Localized = 'bbox' | 'none';

export const LOCATE_TIMEOUT_MS = 90_000;
const LOCATE_IMAGE_DIM = 768;
/** The FINE box's padding: a fraction of its own size plus a fraction of the frame, so a mark keeps a little skin round it. */
export const BOX_PAD_SELF = 0.3;
export const BOX_PAD_FRAME = 0.008;
/** The zoom WINDOW round the coarse box (what the fine look sees), and its smallest size as a fraction of the frame's long side. */
export const WINDOW_PAD_SELF = 1.5;
export const WINDOW_PAD_FRAME = 0.06;
export const WINDOW_MIN_FRAC = 0.22;
/** When the fine look fails, the coarse box is used with this (wider) padding. */
export const COARSE_PAD_SELF = 1.0;
export const COARSE_PAD_FRAME = 0.04;
/** Seam softening passed to prepareEditMask (px at the base image's size). */
export const LOCALIZE_FEATHER = 24;

export interface LocateOpts { timeoutMs?: number; provider?: VisionProvider; model?: string }

const stripSuffix = (instruction: string) => instruction.replace(/\s*change nothing else\.?\s*$/i, '').trim();

export function locatePrompt(instruction: string): string {
  return `This picture was just edited with the instruction: "${stripSuffix(instruction)}". Find the area that instruction changed or added (for example a new piercing, scar, tattoo, birthmark, makeup, a changed hairstyle, or a changed garment). Reply with ONLY this JSON and no other text: {"found": true, "bbox": [x1, y1, x2, y2]} where the four numbers are the box's left, top, right and bottom as integers from 0 to 1000 (fractions of the image width and height), drawn tightly around the changed area. If you cannot see any such area, reply {"found": false}.`;
}

export function refinePrompt(instruction: string): string {
  return `This is a close-up crop of a picture that was just edited with the instruction: "${stripSuffix(instruction)}". The changed or added thing (for example a piercing, scar, tattoo, birthmark, makeup or hair) is somewhere in this crop. Reply with ONLY this JSON and no other text: {"found": true, "bbox": [x1, y1, x2, y2]} where the four numbers are the box's left, top, right and bottom as integers from 0 to 1000 (fractions of THIS crop's width and height), drawn tightly around that thing only. If it is not in this crop, reply {"found": false}.`;
}

/**
 * Read the model's reply. Accepts {found,bbox}, {bbox_2d}, {x1,y1,x2,y2};
 * numbers ≤ 1 are fractions, otherwise thousandths (the prompt's convention).
 * Null = no usable box (not found, malformed, inverted, hairline-thin, or the
 * whole frame — a whole-frame box localizes nothing).
 */
export function parseEditBox(text: string): EditBox | null {
  const m = typeof text === 'string' ? text.match(/\{[\s\S]*\}/) : null;
  if (!m) return null;
  let obj: Record<string, unknown>;
  try { obj = JSON.parse(m[0]) as Record<string, unknown>; } catch { return null; }
  if (!obj || typeof obj !== 'object') return null;
  if (obj.found === false || obj.found === 'false') return null;
  const arr = Array.isArray(obj.bbox) ? obj.bbox : Array.isArray(obj.bbox_2d) ? obj.bbox_2d : null;
  const nums = (arr ?? [obj.x1, obj.y1, obj.x2, obj.y2]).map(v => (typeof v === 'string' ? Number(v) : v));
  if (nums.length < 4 || nums.some(n => typeof n !== 'number' || !Number.isFinite(n))) return null;
  const [a, b, c, d] = nums as number[];
  const frac = Math.max(a, b, c, d) <= 1;
  const n = (v: number) => Math.min(1, Math.max(0, frac ? v : v / 1000));
  const box = { x0: n(Math.min(a, c)), y0: n(Math.min(b, d)), x1: n(Math.max(a, c)), y1: n(Math.max(b, d)) };
  const w = box.x1 - box.x0;
  const h = box.y1 - box.y0;
  if (w < 0.01 || h < 0.01) return null;
  if (w * h > 0.9) return null;
  return box;
}

/** Pad a box (fraction of its own size + of the frame), clamped to the frame. */
export function padEditBox(box: EditBox, padSelf = BOX_PAD_SELF, padFrame = BOX_PAD_FRAME): EditBox {
  const w = box.x1 - box.x0;
  const h = box.y1 - box.y0;
  const px = w * padSelf + padFrame;
  const py = h * padSelf + padFrame;
  return {
    x0: Math.max(0, box.x0 - px), y0: Math.max(0, box.y0 - py),
    x1: Math.min(1, box.x1 + px), y1: Math.min(1, box.y1 + py),
  };
}

/**
 * The zoom window round a coarse box: padded, then grown to at least
 * WINDOW_MIN_FRAC of the frame's long side in each direction (a tiny mark
 * still needs context in the crop), kept inside the frame. `aspect` = W/H.
 */
export function zoomWindow(box: EditBox, aspect: number, minFrac = WINDOW_MIN_FRAC): EditBox {
  const p = padEditBox(box, WINDOW_PAD_SELF, WINDOW_PAD_FRAME);
  // minimum size as fractions of each axis (long side = 1 frame unit)
  const minW = aspect >= 1 ? minFrac : minFrac / aspect;
  const minH = aspect >= 1 ? minFrac * aspect : minFrac;
  const grow = (lo: number, hi: number, min: number) => {
    const size = hi - lo;
    if (size >= min) return [lo, hi];
    const c = (lo + hi) / 2;
    let a = c - min / 2; let b = c + min / 2;
    if (a < 0) { b -= a; a = 0; }
    if (b > 1) { a -= b - 1; b = 1; }
    return [Math.max(0, a), Math.min(1, b)];
  };
  const [x0, x1] = grow(p.x0, p.x1, Math.min(1, minW));
  const [y0, y1] = grow(p.y0, p.y1, Math.min(1, minH));
  return { x0, y0, x1, y1 };
}

/** A box given in a crop's own fractions → the frame's fractions. Pure. */
export function mapBoxFromCrop(inCrop: EditBox, crop: EditBox): EditBox {
  const w = crop.x1 - crop.x0;
  const h = crop.y1 - crop.y0;
  return {
    x0: crop.x0 + inCrop.x0 * w, y0: crop.y0 + inCrop.y0 * h,
    x1: crop.x0 + inCrop.x1 * w, y1: crop.y0 + inCrop.y1 * h,
  };
}

/** A white rectangle on black (PNG, W×H) for compositeEditWithMask. */
export async function boxMaskPng(box: EditBox, width: number, height: number): Promise<Buffer> {
  const left = Math.round(box.x0 * width);
  const top = Math.round(box.y0 * height);
  const w = Math.max(1, Math.round((box.x1 - box.x0) * width));
  const h = Math.max(1, Math.round((box.y1 - box.y0) * height));
  const rect = await sharp({ create: { width: w, height: h, channels: 3, background: { r: 255, g: 255, b: 255 } } }).png().toBuffer();
  return sharp({ create: { width, height, channels: 3, background: { r: 0, g: 0, b: 0 } } })
    .composite([{ input: rect, left: Math.min(left, width - w), top: Math.min(top, height - h) }])
    .png()
    .toBuffer();
}

/** Fraction of mask pixels that are "on" (tests). */
export async function maskCoverage(maskPng: Buffer): Promise<number> {
  const { data, info } = await sharp(maskPng).grayscale().threshold(128).raw().toBuffer({ resolveWithObject: true });
  let on = 0;
  for (let i = 0; i < data.length; i += info.channels) if (data[i] > 0) on++;
  return on / (info.width * info.height);
}

/**
 * Shift the edited image's colour so its mean over `region` matches the
 * base's there (per channel). The repaint runs a little cooler or warmer than
 * the base every time; without this the pasted area shows as a tonal patch
 * even through the feather. Returns the edit at the base's size.
 */
export async function matchColorInRegion(base: Buffer, edited: Buffer, region: EditBox, width: number, height: number): Promise<Buffer> {
  const left = Math.max(0, Math.round(region.x0 * width));
  const top = Math.max(0, Math.round(region.y0 * height));
  const w = Math.max(1, Math.min(width - left, Math.round((region.x1 - region.x0) * width)));
  const h = Math.max(1, Math.min(height - top, Math.round((region.y1 - region.y0) * height)));
  const mean = async (b: Buffer) => {
    // Two passes: sharp runs extract before resize inside one pipeline.
    const sized = await sharp(b).resize(width, height, { fit: 'fill' }).removeAlpha().png().toBuffer();
    const { data } = await sharp(sized).extract({ left, top, width: w, height: h })
      .resize(32, 32, { fit: 'fill' }).raw().toBuffer({ resolveWithObject: true });
    const m = [0, 0, 0];
    for (let i = 0; i < data.length; i += 3) { m[0] += data[i]; m[1] += data[i + 1]; m[2] += data[i + 2]; }
    const n = data.length / 3;
    return m.map(v => v / n);
  };
  const [mb, me] = await Promise.all([mean(base), mean(edited)]);
  const delta = mb.map((v, i) => Math.max(-40, Math.min(40, v - me[i])));
  if (delta.every(d => Math.abs(d) < 0.5)) return edited;
  return sharp(edited).resize(width, height, { fit: 'fill' }).removeAlpha().linear([1, 1, 1], delta).png().toBuffer();
}

async function askForBox(image: Buffer, prompt: string, caller: string, opts?: LocateOpts): Promise<EditBox | null> {
  const provider = resolveVisionProvider(opts?.provider);
  const timeoutMs = Math.min(opts?.timeoutMs ?? LOCATE_TIMEOUT_MS, 120_000);
  try {
    const jpeg = await sharp(image)
      .resize(LOCATE_IMAGE_DIM, LOCATE_IMAGE_DIM, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 88 })
      .toBuffer();
    const res = await describeImage({
      caller, contentClass: 'real', prompt, image: jpeg, mediaType: 'image/jpeg',
      json: true, temperature: 0, maxTokens: 80, timeoutMs, provider, model: opts?.model,
    });
    const box = parseEditBox(res.text);
    if (!box) console.warn(`[EditLocalize] ${caller}: no usable box — raw: ${res.text.slice(0, 160)}`);
    else console.log(`[EditLocalize] ${caller}: box ${[box.x0, box.y0, box.x1, box.y1].map(v => v.toFixed(3)).join(',')}`);
    return box;
  } catch (e) {
    console.warn(`[EditLocalize] ${caller} failed: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

/** COARSE: where did the edit land on the whole edited image? Never throws; null on any failure. */
export function locateEdit(edited: Buffer, instruction: string, opts?: LocateOpts): Promise<EditBox | null> {
  return askForBox(edited, locatePrompt(instruction), 'edit-localize', opts);
}

/**
 * FINE: crop the zoom window round the coarse box from the edited image (at
 * the base's size) and ask again; the answer comes back in frame fractions.
 * Null when the model finds nothing in the crop or the call fails.
 */
export async function refineEditBox(
  edited: Buffer, instruction: string, coarse: EditBox, width: number, height: number, opts?: LocateOpts,
): Promise<{ box: EditBox; window: EditBox } | null> {
  const window = zoomWindow(coarse, width / height);
  const left = Math.round(window.x0 * width);
  const top = Math.round(window.y0 * height);
  const w = Math.max(8, Math.min(width - left, Math.round((window.x1 - window.x0) * width)));
  const h = Math.max(8, Math.min(height - top, Math.round((window.y1 - window.y0) * height)));
  const sized = await sharp(edited).resize(width, height, { fit: 'fill' }).removeAlpha().png().toBuffer();
  const crop = await sharp(sized).extract({ left, top, width: w, height: h }).png().toBuffer();
  const inCrop = await askForBox(crop, refinePrompt(instruction), 'edit-localize-fine', opts);
  if (!inCrop) return null;
  return { box: mapBoxFromCrop(inCrop, window), window };
}

export type LocalizeResult =
  | { mask: Buffer; how: 'bbox'; /** the edited image, colour-matched to the base round the region, at the base's size */ edited: Buffer; box: EditBox }
  | { mask: null; how: 'none'; edited: Buffer };

/**
 * The mask for a localized edit: coarse look → fine look on the zoomed crop
 * → the fine box, padded a little (the coarse box, padded wider, when the
 * fine look fails). The edited image comes back colour-matched to the base
 * over the region. No coarse box → nothing (the caller keeps the whole repaint).
 */
export async function localizeMask(base: Buffer, edited: Buffer, instruction: string, opts?: LocateOpts): Promise<LocalizeResult> {
  const meta = await sharp(base).metadata();
  const W = meta.width ?? 1024;
  const H = meta.height ?? 1024;
  const coarse = await locateEdit(edited, instruction, opts);
  if (!coarse) return { mask: null, how: 'none', edited };
  const fine = await refineEditBox(edited, instruction, coarse, W, H, opts);
  const box = fine ? padEditBox(fine.box) : padEditBox(coarse, COARSE_PAD_SELF, COARSE_PAD_FRAME);
  const ring = padEditBox(box, 1.0, 0.02); // colour is matched on the surround, not just the mark
  console.log(`[EditLocalize] mask = ${fine ? 'fine box' : 'coarse box (fine look failed)'} ${[box.x0, box.y0, box.x1, box.y1].map(v => v.toFixed(3)).join(',')}`);
  const matched = await matchColorInRegion(base, edited, ring, W, H);
  return { mask: await boxMaskPng(box, W, H), how: 'bbox', edited: matched, box };
}
