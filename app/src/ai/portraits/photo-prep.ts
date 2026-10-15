/**
 * REFERENCE PHOTO PREPARER (Mike, 14 Oct 2026: "we should be preparing the uploaded reference pictures and
 * checking them" → "design and implement the photo preparer that crops to the face").
 *
 * Why: Qwen-Image-2.1 copies a reference's framing. A user's identity photo is whatever they uploaded — Violet's is a
 * tilted half-length selfie in a blouse — and every base lock inherited its crop, lean and costume. The pose skeleton
 * (lock-pose-grey.png) now holds the output frame; this module makes the INPUT match it, so the model is never asked
 * to re-compose: each photo is cropped to the same face-tight 4:5 passport frame the lock renders in.
 *
 * Two parts, both inside the privacy wall (contentClass `real` → the pod vision lane; Claude is refused):
 *   1. CHECK — one vision call returns the main HEAD's box (top of the hair to the chin, normalised 0–1000 — VL models
 *      return the whole head far more consistently than a brow-to-chin face box) and a few quality flags (face count,
 *      frontal, eyes visible, obstructed, blurry). Flags become human-readable warnings for the uploader.
 *   2. CROP — pure image math (sharp): a 4:5 window whose height is the head-box height / HEAD_FRACTION, the head box
 *      centred horizontally with its centre at HEAD_CENTRE_Y of the window (hair top ≈ 22%, chin ≈ 78%, as the skeleton
 *      frames it). If that window would leave the photo (head near an edge or very large) the window SHRINKS to fit —
 *      real pixels beat padding (a mirrored pad put an upside-down ghost head above Violet, 14 Oct test); only a
 *      last-resort sliver is edge-replicated. Output = QWEN21_LOCK_SIZE (832×1040) JPEG.
 *
 * Never throws for the caller's sake: no face / no lane / junk reply → `cropped: false`, the original is used as-is,
 * and `check.unavailable` says why. Preparing is done ONCE at upload (services/reference-photo.ts) and stored as a
 * `<stem>.prep.jpg` sibling; the Qwen provider prefers that sibling and prepares on the fly only for older uploads.
 */
import sharp from 'sharp';
import { describeImage, resolveVisionProvider, type VisionProvider } from '@/ai/network/vision';
import { QWEN21_LOCK_SIZE } from './qwen21-workflow';

/** Head-box height (top of the hair to the chin) as a fraction of the output frame height. */
export const HEAD_FRACTION = 0.55;
/** Where the head box's vertical centre sits in the output frame (0 = top). hair top ≈ 0.225, chin ≈ 0.775. */
export const HEAD_CENTRE_Y = 0.50;
/** Output frame = the lock canvas (4:5). */
export const PHOTO_PREP_SIZE = QWEN21_LOCK_SIZE;
export const PHOTO_PREP_TIMEOUT_MS = 120_000;
/** Longest side sent to the vision model (the box comes back normalised, so this only bounds payload size). */
const CHECK_IMAGE_DIM = 1024;

/** Normalised HEAD box (hair top → chin, ear → ear), 0–1000 on each axis of the image as sent. */
export type FaceBox = [x1: number, y1: number, x2: number, y2: number];

export interface PhotoCheck {
  /** A usable main face was found (box present, at least one face). */
  ok: boolean;
  faces: number;
  /** The main head's box (see FaceBox). */
  faceBox?: FaceBox;
  frontal?: boolean;
  eyesVisible?: boolean;
  obstructed?: boolean;
  blurry?: boolean;
  /** Human-readable notes for the uploader (empty = clean). */
  warnings: string[];
  /** Set when the checker could not run or replied with junk — the photo is used unprepared. */
  unavailable?: string;
}

export interface PhotoPrepResult {
  /** The prepared (cropped) image, present only when `cropped`. */
  image?: Buffer;
  cropped: boolean;
  check: PhotoCheck;
  /** The crop window actually used, in source pixels (may extend past the source — then mirrored). */
  rect?: CropRect;
}

export interface CropRect { left: number; top: number; width: number; height: number }

export const PHOTO_PREP_PROMPT = `You are checking a photo that will be used as a face reference for a portrait. Look only at the image. Reply with ONLY this JSON, no other text:
{"faces": <number of human faces visible>, "face": [x1, y1, x2, y2], "frontal": true|false, "eyes_visible": true|false, "obstructed": true|false, "blurry": true|false}
- face: the bounding box of the MAIN (largest, most central) person's HEAD — from the top of the hair to the bottom of the chin, and from the left edge of the head to the right edge (ears or hair) — as integers 0-1000 where x is the fraction of the image width ×1000 and y the fraction of the image height ×1000; [0,0,0,0] if there is no face.
- frontal: true if that face looks roughly toward the camera (not profile, not turned far away).
- eyes_visible: true if both eyes are open and visible (not hidden by sunglasses, hair, a hand or a mask).
- obstructed: true if anything covers part of the face (sunglasses, mask, hand, phone, hair across the face, heavy shadow).
- blurry: true if the face is out of focus, motion-blurred or too small/low-resolution to show detail.`;

function asBool(v: unknown): boolean | undefined {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (typeof v === 'string') {
    const s = v.trim().toLowerCase();
    if (['true', 'yes', 'y', '1'].includes(s)) return true;
    if (['false', 'no', 'n', '0'].includes(s)) return false;
  }
  return undefined;
}

function unavailable(why: string): PhotoCheck {
  return { ok: false, faces: 0, warnings: [], unavailable: why };
}

/** Parse the checker's reply. Tolerates fences/prose around the JSON, string booleans and a missing/empty box. */
export function parsePhotoCheck(text: string): PhotoCheck {
  const m = typeof text === 'string' ? text.match(/\{[\s\S]*\}/) : null;
  if (!m) return unavailable('no JSON in reply');
  let obj: Record<string, unknown>;
  try {
    const parsed = JSON.parse(m[0]);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return unavailable('reply is not an object');
    obj = parsed as Record<string, unknown>;
  } catch {
    return unavailable('unparseable JSON');
  }
  const facesRaw = Number(obj.faces);
  const faces = Number.isFinite(facesRaw) && facesRaw >= 0 ? Math.round(facesRaw) : 0;
  let faceBox: FaceBox | undefined;
  if (Array.isArray(obj.face) && obj.face.length === 4 && obj.face.every(n => Number.isFinite(Number(n)))) {
    const [a, b, c, d] = obj.face.map(n => Math.max(0, Math.min(1000, Math.round(Number(n)))));
    const box: FaceBox = [Math.min(a, c), Math.min(b, d), Math.max(a, c), Math.max(b, d)];
    if (box[2] - box[0] >= 20 && box[3] - box[1] >= 20) faceBox = box;
  }
  const frontal = asBool(obj.frontal);
  const eyesVisible = asBool(obj.eyes_visible);
  const obstructed = asBool(obj.obstructed);
  const blurry = asBool(obj.blurry);
  const warnings: string[] = [];
  if (faces === 0 || !faceBox) warnings.push('no face found — the photo is used as uploaded');
  if (faces > 1) warnings.push(`${faces} faces in the photo — the largest one is used; a solo photo locks better`);
  if (frontal === false) warnings.push('face turned away from the camera — a straight-on photo locks better');
  if (eyesVisible === false) warnings.push('eyes not clearly visible (closed, sunglasses or hair)');
  if (obstructed === true) warnings.push('something covers part of the face');
  if (blurry === true) warnings.push('face is blurry or too small — a sharper, closer photo locks better');
  if (faceBox) {
    const h = (faceBox[3] - faceBox[1]) / 1000;
    if (h < 0.12) warnings.push('face is very small in the frame — the crop will be soft');
  }
  return { ok: faces > 0 && !!faceBox, faces, faceBox, frontal, eyesVisible, obstructed, blurry, warnings };
}

/**
 * The 4:5 crop window (source pixels): ideally the head box at HEAD_FRACTION of the height with its centre at
 * HEAD_CENTRE_Y down the frame, centred on the head. SHRINK-TO-FIT: if that window would leave the photo, the window
 * is scaled down (keeping 4:5 and the head's position in it) until it fits — but never below the head box itself
 * (× HEAD_MIN_MARGIN), so an edge-hugging face still gets a complete, if tighter, frame. The remainder (rare) is
 * clamped to the bounds; passportCrop edge-replicates any last sliver.
 */
export function passportCropRect(srcW: number, srcH: number, box: FaceBox): CropRect {
  const fx1 = (box[0] / 1000) * srcW, fx2 = (box[2] / 1000) * srcW;
  const fy1 = (box[1] / 1000) * srcH, fy2 = (box[3] / 1000) * srcH;
  const headH = Math.max(1, fy2 - fy1), headW = Math.max(1, fx2 - fx1);
  const cx = (fx1 + fx2) / 2, cy = (fy1 + fy2) / 2;
  const ratio = PHOTO_PREP_SIZE.width / PHOTO_PREP_SIZE.height;
  const ideal = headH / HEAD_FRACTION;
  // Largest window (height) whose top/bottom/sides stay inside the photo with the head centre at HEAD_CENTRE_Y / middle.
  const fitAbove = cy / HEAD_CENTRE_Y;
  const fitBelow = (srcH - cy) / (1 - HEAD_CENTRE_Y);
  const fitWide = (2 * Math.min(cx, srcW - cx)) / ratio;
  const floor = Math.max(headH, headW / ratio) * HEAD_MIN_MARGIN;
  const height = Math.round(Math.max(floor, Math.min(ideal, fitAbove, fitBelow, fitWide)));
  const width = Math.round(height * ratio);
  const top = Math.round(cy - HEAD_CENTRE_Y * height);
  const left = Math.round(cx - width / 2);
  return { left, top, width, height };
}
/** The window never shrinks below the head box times this (keeps a little air even on an edge-hugging face). */
export const HEAD_MIN_MARGIN = 1.15;

/** Crop `image` to the passport window around `box` (shrink-to-fit; any last sliver past the edge is edge-replicated); JPEG at PHOTO_PREP_SIZE. */
export async function passportCrop(image: Buffer, box: FaceBox): Promise<{ image: Buffer; rect: CropRect }> {
  const meta = await sharp(image).metadata();
  const srcW = meta.width ?? 0, srcH = meta.height ?? 0;
  if (!srcW || !srcH) throw new Error('passportCrop: unreadable image');
  const rect = passportCropRect(srcW, srcH, box);
  const padL = Math.max(0, -rect.left), padT = Math.max(0, -rect.top);
  const padR = Math.max(0, rect.left + rect.width - srcW), padB = Math.max(0, rect.top + rect.height - srcH);
  // sharp runs extract BEFORE extend inside one pipeline, so the padding must be its own pass.
  let canvas = await sharp(image).rotate().toBuffer(); // honour EXIF orientation first
  if (padL || padT || padR || padB) {
    canvas = await sharp(canvas).extend({ left: padL, top: padT, right: padR, bottom: padB, extendWith: 'copy' }).toBuffer();
  }
  const out = await sharp(canvas)
    .extract({ left: rect.left + padL, top: rect.top + padT, width: rect.width, height: rect.height })
    .resize(PHOTO_PREP_SIZE.width, PHOTO_PREP_SIZE.height, { fit: 'fill' })
    .jpeg({ quality: 92 })
    .toBuffer();
  return { image: out, rect };
}

export interface PreparePhotoOptions {
  timeoutMs?: number;
  provider?: VisionProvider;
  model?: string;
  /** false = no AiCall ledger row (lab scripts). */
  meter?: boolean;
  campaignId?: string;
}

/** CHECK only (one vision call). Never throws. */
export async function checkPhoto(image: Buffer, opts: PreparePhotoOptions = {}): Promise<PhotoCheck> {
  const provider = resolveVisionProvider(opts.provider);
  const timeoutMs = Math.min(opts.timeoutMs ?? PHOTO_PREP_TIMEOUT_MS, 120_000);
  try {
    // The box is normalised, so the checker may see a downscaled copy; rotate() bakes EXIF orientation in first so
    // the coordinates match what passportCrop (which also rotates) will crop.
    const jpeg = await sharp(image).rotate().resize(CHECK_IMAGE_DIM, CHECK_IMAGE_DIM, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
    const res = await describeImage({
      caller: 'photo-prep', contentClass: 'real', prompt: PHOTO_PREP_PROMPT, image: jpeg, mediaType: 'image/jpeg',
      json: true, temperature: 0, maxTokens: 120, timeoutMs, provider, model: opts.model, campaignId: opts.campaignId, meter: opts.meter,
    });
    const check = parsePhotoCheck(res.text);
    if (check.unavailable) console.warn(`[PhotoPrep] ${check.unavailable} — raw: ${res.text.slice(0, 200)}`);
    return check;
  } catch (e) {
    const why = e instanceof Error ? (e.name === 'TimeoutError' || e.name === 'AbortError' ? `timeout after ${timeoutMs}ms` : e.message) : String(e);
    console.warn(`[PhotoPrep] checker unavailable: ${why}`);
    return unavailable(why);
  }
}

/** CHECK + CROP. Never throws; `cropped: false` means use the original. */
export async function preparePhoto(image: Buffer, opts: PreparePhotoOptions = {}): Promise<PhotoPrepResult> {
  const check = await checkPhoto(image, opts);
  if (!check.ok || !check.faceBox) return { cropped: false, check };
  try {
    const { image: out, rect } = await passportCrop(image, check.faceBox);
    return { image: out, cropped: true, check, rect };
  } catch (e) {
    console.warn(`[PhotoPrep] crop failed: ${(e as Error).message}`);
    return { cropped: false, check: { ...check, unavailable: `crop failed: ${(e as Error).message}` } };
  }
}

/** `/uploads/references/u/abc.jpg` → `/uploads/references/u/abc.prep.jpg` (same for any extension). */
export function prepSiblingPath(webPath: string): string {
  return webPath.replace(/(\.[^./\\]+)?$/, '.prep.jpg');
}

export function photoPrepEnabled(): boolean {
  return (process.env.QWEN21_PHOTO_PREP ?? 'on').trim().toLowerCase() !== 'off';
}
