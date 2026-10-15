/**
 * LOCALIZED EDITS (Mike, 15 Oct 2026: a navel piercing on Violet "shifted the
 * entire body … definitely wasn't a localized edit").
 *
 * Qwen-Image-2.1's edit node has no mask input: an instruction edit repaints
 * the WHOLE frame, and everything drifts a little (waist, colour, lace, even
 * the canvas height). The painted-mask path already fixes that by compositing
 * only the masked area over the base — this module makes the mask by itself:
 *
 *   1. ask the vision lane where the edit landed on the EDITED image (a bbox);
 *   2. no usable box → a pixel-difference mask (the strongest, blurred change);
 *   3. nothing usable → no mask (the caller keeps the whole repaint and says so).
 *
 * The vision call goes through ai/network/vision like the lock gate: the image
 * derives from a real person, so it is judged inside the wall (pod by default).
 * Mask helpers are pure sharp work and unit-tested; only `locateEdit` talks to
 * a model, and it never throws.
 */

import sharp from 'sharp';
import { describeImage, resolveVisionProvider, type VisionProvider } from '@/ai/network/vision';

/** Normalized 0..1 box, x left→right, y top→bottom. */
export interface EditBox { x0: number; y0: number; x1: number; y1: number }

export type Localized = 'bbox' | 'diff' | 'none';

export const LOCATE_TIMEOUT_MS = 90_000;
const LOCATE_IMAGE_DIM = 768;
/** Box padding: a fraction of the box's own size plus a fraction of the frame, so a tiny mark gets some skin around it. */
export const BOX_PAD_SELF = 0.35;
export const BOX_PAD_FRAME = 0.015;
/**
 * The SEARCH window round a vision box. VL boxes on a small mark are a few
 * percent off (Violet's navel ring: right column, ~5 % high), so the real
 * change is looked for by pixel difference inside a generous window.
 */
export const WINDOW_PAD_SELF = 1.2;
export const WINDOW_PAD_FRAME = 0.05;
/** Seam softening passed to prepareEditMask (px at the base image's size). */
export const LOCALIZE_FEATHER = 28;

export function locatePrompt(instruction: string): string {
  const inst = instruction.replace(/\s*change nothing else\.?\s*$/i, '').trim();
  return `This picture was just edited with the instruction: "${inst}". Find the area that instruction changed or added (for example a new piercing, scar, tattoo, birthmark, makeup, a changed hairstyle, or a changed garment). Reply with ONLY this JSON and no other text: {"found": true, "bbox": [x1, y1, x2, y2]} where the four numbers are the box's left, top, right and bottom as integers from 0 to 1000 (fractions of the image width and height), drawn tightly around the changed area. If you cannot see any such area, reply {"found": false}.`;
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

/** Fraction of mask pixels that are "on" (for tests and the diff fallback's sanity bounds). */
export async function maskCoverage(maskPng: Buffer): Promise<number> {
  const { data, info } = await sharp(maskPng).grayscale().threshold(128).raw().toBuffer({ resolveWithObject: true });
  let on = 0;
  for (let i = 0; i < data.length; i += info.channels) if (data[i] > 0) on++;
  return on / (info.width * info.height);
}

/** Diff-fallback bounds: a mask this small is noise, this large is the whole repaint. */
export const DIFF_MIN_COVER = 0.001;
export const DIFF_MAX_COVER = 0.35;
const DIFF_WORK = 256;

/**
 * Where the edited image differs strongly from the base: both to grayscale at a
 * small working size, absolute difference (minus the median, so a global
 * drift does not count), blur, threshold at `level`, back up to W×H as a PNG
 * mask. `within` limits the search to a window (coverage is then judged
 * against the window's area). Null when the result is noise or near the whole area.
 */
export async function diffMaskPng(
  base: Buffer, edited: Buffer, width: number, height: number, level = 48, within?: EditBox,
): Promise<Buffer | null> {
  const scale = DIFF_WORK / Math.max(width, height);
  const w = Math.max(8, Math.round(width * scale));
  const h = Math.max(8, Math.round(height * scale));
  const gray = (b: Buffer) => sharp(b).resize(w, h, { fit: 'fill' }).grayscale().blur(1.5).raw().toBuffer();
  const [a, b] = await Promise.all([gray(base), gray(edited)]);
  const diff = Buffer.alloc(w * h);
  const win = within ?? { x0: 0, y0: 0, x1: 1, y1: 1 };
  const wx0 = Math.floor(win.x0 * w); const wx1 = Math.ceil(win.x1 * w);
  const wy0 = Math.floor(win.y0 * h); const wy1 = Math.ceil(win.y1 * h);
  const inside: number[] = [];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (x < wx0 || x >= wx1 || y < wy0 || y >= wy1) { diff[i] = 0; continue; }
      diff[i] = Math.abs(a[i] - b[i]);
      inside.push(diff[i]);
    }
  }
  if (inside.length === 0) return null;
  inside.sort((x, y) => x - y);
  const median = inside[Math.floor(inside.length / 2)];
  for (let i = 0; i < diff.length; i++) diff[i] = Math.max(0, diff[i] - median);
  const mask = await sharp(diff, { raw: { width: w, height: h, channels: 1 } })
    .blur(2)
    .threshold(level)
    .resize(width, height, { fit: 'fill' })
    .png()
    .toBuffer();
  const winArea = Math.max(1e-6, (win.x1 - win.x0) * (win.y1 - win.y0));
  const cover = (await maskCoverage(mask)) / winArea;
  if (cover < DIFF_MIN_COVER || cover > DIFF_MAX_COVER) return null;
  return mask;
}

/** Union of two masks (PNG, same size): lighter-of. */
export async function unionMasks(a: Buffer, b: Buffer): Promise<Buffer> {
  return sharp(a).composite([{ input: b, blend: 'lighten' }]).png().toBuffer();
}

/**
 * Ask the vision lane where the edit landed on the edited image. Never
 * throws: any failure → null (the caller falls back to the diff mask).
 */
export async function locateEdit(
  edited: Buffer,
  instruction: string,
  opts?: { timeoutMs?: number; provider?: VisionProvider; model?: string },
): Promise<EditBox | null> {
  const provider = resolveVisionProvider(opts?.provider);
  const timeoutMs = Math.min(opts?.timeoutMs ?? LOCATE_TIMEOUT_MS, 120_000);
  try {
    const jpeg = await sharp(edited)
      .resize(LOCATE_IMAGE_DIM, LOCATE_IMAGE_DIM, { fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: 85 })
      .toBuffer();
    const res = await describeImage({
      caller: 'edit-localize',
      contentClass: 'real',
      prompt: locatePrompt(instruction),
      image: jpeg,
      mediaType: 'image/jpeg',
      json: true,
      temperature: 0,
      maxTokens: 80,
      timeoutMs,
      provider,
      model: opts?.model,
    });
    const box = parseEditBox(res.text);
    if (!box) console.warn(`[EditLocalize] no usable box — raw: ${res.text.slice(0, 160)}`);
    else console.log(`[EditLocalize] box ${[box.x0, box.y0, box.x1, box.y1].map(v => v.toFixed(3)).join(',')}`);
    return box;
  } catch (e) {
    console.warn(`[EditLocalize] locate failed: ${e instanceof Error ? e.message : String(e)}`);
    return null;
  }
}

/**
 * The mask for a localized edit. With a vision box: the pixel difference
 * inside a generous window round it (where the change really is) unioned
 * with the tight padded box (a floor, in case the diff is faint); no diff
 * there → the window itself. No box → the frame-wide diff. Nothing → null.
 */
export async function localizeMask(
  base: Buffer,
  edited: Buffer,
  instruction: string,
  opts?: { timeoutMs?: number; provider?: VisionProvider; model?: string },
): Promise<{ mask: Buffer; how: 'bbox' | 'diff' } | { mask: null; how: 'none' }> {
  const meta = await sharp(base).metadata();
  const W = meta.width ?? 1024;
  const H = meta.height ?? 1024;
  const box = await locateEdit(edited, instruction, opts);
  if (box) {
    const window = padEditBox(box, WINDOW_PAD_SELF, WINDOW_PAD_FRAME);
    const tight = await boxMaskPng(padEditBox(box), W, H);
    const diffIn = await diffMaskPng(base, edited, W, H, 40, window);
    if (diffIn) return { mask: await unionMasks(diffIn, tight), how: 'bbox' };
    return { mask: await boxMaskPng(window, W, H), how: 'bbox' };
  }
  const diff = await diffMaskPng(base, edited, W, H);
  if (diff) return { mask: diff, how: 'diff' };
  return { mask: null, how: 'none' };
}
