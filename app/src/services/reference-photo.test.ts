import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import sharp from 'sharp';

// The preparer's vision call is stubbed; the crop and the file layout are real (in a temp cwd).
const prepare = vi.fn();
vi.mock('@/ai/portraits/photo-prep', async () => {
  const actual = await vi.importActual<typeof import('@/ai/portraits/photo-prep')>('@/ai/portraits/photo-prep');
  return { ...actual, preparePhoto: (...a: unknown[]) => prepare(...a) };
});

import { deleteReferencePhoto, prepareStoredReference, storeReferencePhoto } from './reference-photo';

let tmp: string;
let cwd: string;
beforeEach(async () => {
  tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'growth-refphoto-'));
  cwd = process.cwd();
  process.chdir(tmp);
  prepare.mockReset();
  delete process.env.QWEN21_PHOTO_PREP;
});
afterEach(async () => {
  process.chdir(cwd);
  await fs.rm(tmp, { recursive: true, force: true });
});

const png = () => sharp({ create: { width: 3000, height: 2000, channels: 3, background: { r: 90, g: 90, b: 90 } } }).png().toBuffer();
const crop = () => sharp({ create: { width: 832, height: 1040, channels: 3, background: { r: 10, g: 10, b: 10 } } }).jpeg().toBuffer();

describe('storeReferencePhoto', () => {
  it('normalises to ≤2048 JPEG, stores under the user, writes the prep sibling + check, returns the ORIGINAL path', async () => {
    prepare.mockResolvedValue({ cropped: true, image: await crop(), check: { ok: true, faces: 1, faceBox: [300, 250, 700, 550], warnings: [] }, rect: { left: 1, top: 2, width: 3, height: 4 } });
    const r = await storeReferencePhoto('user1', await png());
    expect(r.path).toMatch(/^\/uploads\/references\/user1\/[0-9a-f-]+\.jpg$/);
    expect(r.type).toBe('image/jpeg');
    expect(r.prep.cropped).toBe(true);
    expect(r.prep.path).toBe(r.path.replace(/\.jpg$/, '.prep.jpg'));
    expect(r.prep.check.warnings).toEqual([]);
    const abs = path.join(tmp, 'public', r.path.slice(1));
    const m = await sharp(await fs.readFile(abs)).metadata();
    expect(m.format).toBe('jpeg');
    expect(Math.max(m.width!, m.height!)).toBe(2048);
    const prepMeta = await sharp(await fs.readFile(abs.replace(/\.jpg$/, '.prep.jpg'))).metadata();
    expect([prepMeta.width, prepMeta.height]).toEqual([832, 1040]);
    const check = JSON.parse(await fs.readFile(abs.replace(/\.jpg$/, '.prep.json'), 'utf8'));
    expect(check.cropped).toBe(true);
    expect(check.rect).toEqual({ left: 1, top: 2, width: 3, height: 4 });
    expect(prepare).toHaveBeenCalledTimes(1);
  });

  it('no face → stored unprepared with the warning, no .prep.jpg; QWEN21_PHOTO_PREP=off → no vision call at all', async () => {
    prepare.mockResolvedValue({ cropped: false, check: { ok: false, faces: 0, warnings: ['no face found — the photo is used as uploaded'] } });
    const r = await storeReferencePhoto('user1', await png());
    expect(r.prep.cropped).toBe(false);
    expect(r.prep.path).toBeUndefined();
    expect(r.prep.check.warnings[0]).toMatch(/no face/);
    await expect(fs.access(path.join(tmp, 'public', r.prep.path ?? r.path.replace(/\.jpg$/, '.prep.jpg').slice(1)))).rejects.toThrow();

    process.env.QWEN21_PHOTO_PREP = 'off';
    prepare.mockClear();
    const r2 = await storeReferencePhoto('user1', await png());
    expect(r2.prep.cropped).toBe(false);
    expect(r2.prep.check.unavailable).toBe('QWEN21_PHOTO_PREP=off');
    expect(prepare).not.toHaveBeenCalled();
  });

  it('prepareStoredReference re-prepares an existing upload; deleteReferencePhoto removes all three files', async () => {
    prepare.mockResolvedValue({ cropped: true, image: await crop(), check: { ok: true, faces: 1, faceBox: [300, 250, 700, 550], warnings: [] } });
    const r = await storeReferencePhoto('user1', await png());
    const abs = path.join(tmp, 'public', r.path.slice(1));
    await fs.unlink(abs.replace(/\.jpg$/, '.prep.jpg'));
    const again = await prepareStoredReference(r.path);
    expect(again.cropped).toBe(true);
    await fs.access(abs.replace(/\.jpg$/, '.prep.jpg'));
    await deleteReferencePhoto(r.path);
    for (const f of [abs, abs.replace(/\.jpg$/, '.prep.jpg'), abs.replace(/\.jpg$/, '.prep.json')]) await expect(fs.access(f)).rejects.toThrow();
    await deleteReferencePhoto(r.path); // silent second time
  });
});
