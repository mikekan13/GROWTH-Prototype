/**
 * Reference photo storage + preparation (Mike, 14 Oct 2026).
 *
 * An upload is normalised (≤2048 px JPEG) and written as `<uuid>.jpg`; then the PHOTO PREPARER (ai/portraits/photo-prep)
 * checks it on the inside-the-wall vision lane and crops it to the face-tight passport frame the base lock renders in,
 * stored beside it as `<uuid>.prep.jpg` + `<uuid>.prep.json` (the check). The returned `path` is still the ORIGINAL
 * (what the user sees); the Qwen provider prefers the `.prep.jpg` sibling when it exists. Preparation never blocks an
 * upload: an unavailable checker or no face → stored unprepared with a warning.
 */
import 'server-only';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import sharp from 'sharp';
import { photoPrepEnabled, preparePhoto, prepSiblingPath, type PhotoCheck, type PhotoPrepResult } from '@/ai/portraits/photo-prep';

export const REFERENCE_UPLOAD_DIR = 'uploads/references';
const MAX_STORED_DIMENSION = 2048;

export interface StoredReferencePhoto {
  /** Web path of the stored original, e.g. /uploads/references/<userId>/<uuid>.jpg */
  path: string;
  filename: string;
  size: number;
  type: 'image/jpeg';
  prep: ReferencePhotoPrep;
}

export interface ReferencePhotoPrep {
  /** The prepared crop was written beside the original. */
  cropped: boolean;
  /** Web path of the prepared crop when `cropped`. */
  path?: string;
  check: PhotoCheck;
}

/** Absolute disk path of a `/uploads/...` web path. */
export function referenceAbsPath(webPath: string): string {
  return path.join(process.cwd(), 'public', webPath.replace(/^\//, ''));
}

/** Prepare one stored reference (by web path) and write its `.prep.jpg` + `.prep.json` siblings. Idempotent. */
export async function prepareStoredReference(webPath: string, opts: { meter?: boolean } = {}): Promise<ReferencePhotoPrep> {
  const abs = referenceAbsPath(webPath);
  const original = await fs.readFile(abs);
  const result: PhotoPrepResult = await preparePhoto(original, { meter: opts.meter });
  const prepWeb = prepSiblingPath(webPath);
  const prepAbs = referenceAbsPath(prepWeb);
  if (result.cropped && result.image) {
    await fs.writeFile(prepAbs, result.image);
  } else {
    await fs.unlink(prepAbs).catch(() => {});
  }
  const prep: ReferencePhotoPrep = { cropped: result.cropped, ...(result.cropped ? { path: prepWeb } : {}), check: result.check };
  await fs.writeFile(prepAbs.replace(/\.jpg$/, '.json'), JSON.stringify({ ...prep, rect: result.rect ?? null, preparedAt: new Date().toISOString() }, null, 2));
  return prep;
}

/** Normalise + store an upload under the user's folder, then prepare it (unless QWEN21_PHOTO_PREP=off). */
export async function storeReferencePhoto(userId: string, raw: Buffer): Promise<StoredReferencePhoto> {
  const userDir = path.join('public', REFERENCE_UPLOAD_DIR, userId);
  await fs.mkdir(userDir, { recursive: true });
  const buffer = Buffer.from(await sharp(raw)
    .rotate()
    .resize(MAX_STORED_DIMENSION, MAX_STORED_DIMENSION, { fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality: 90 })
    .toBuffer());
  const filename = `${crypto.randomUUID()}.jpg`;
  await fs.writeFile(path.join(userDir, filename), buffer);
  const webPath = `/${REFERENCE_UPLOAD_DIR}/${userId}/${filename}`;

  let prep: ReferencePhotoPrep;
  if (photoPrepEnabled()) {
    prep = await prepareStoredReference(webPath);
  } else {
    prep = { cropped: false, check: { ok: false, faces: 0, warnings: [], unavailable: 'QWEN21_PHOTO_PREP=off' } };
  }
  return { path: webPath, filename, size: buffer.length, type: 'image/jpeg', prep };
}

/** Delete a stored reference and its prepared siblings. Silent if already gone. */
export async function deleteReferencePhoto(webPath: string): Promise<void> {
  const abs = referenceAbsPath(webPath);
  const prepAbs = referenceAbsPath(prepSiblingPath(webPath));
  await Promise.all([abs, prepAbs, prepAbs.replace(/\.jpg$/, '.json')].map(p => fs.unlink(p).catch(() => {})));
}
