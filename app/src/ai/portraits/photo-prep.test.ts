import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import sharp from 'sharp';
import {
  HEAD_CENTRE_Y,
  HEAD_FRACTION,
  HEAD_MIN_MARGIN,
  PHOTO_PREP_SIZE,
  checkPhoto,
  parsePhotoCheck,
  passportCrop,
  passportCropRect,
  preparePhoto,
  prepSiblingPath,
  photoPrepEnabled,
} from './photo-prep';

const POD_URL = 'https://api.runpod.ai/v2/lane/openai/v1';
const openAiReply = (content: string) => new Response(JSON.stringify({ model: 'growth-local', choices: [{ message: { content } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }), { status: 200, headers: { 'content-type': 'application/json' } });

/** 400×600 photo: dark grey with a light "face" block at x 120–280, y 150–330 (box ≈ [300,250,700,550]). */
async function photo(): Promise<Buffer> {
  return sharp({ create: { width: 400, height: 600, channels: 3, background: { r: 40, g: 40, b: 40 } } })
    .composite([{ input: await sharp({ create: { width: 160, height: 180, channels: 3, background: { r: 220, g: 200, b: 180 } } }).png().toBuffer(), left: 120, top: 150 }])
    .png().toBuffer();
}

describe('parsePhotoCheck', () => {
  it('reads the box and flags; clean photo = no warnings', () => {
    const c = parsePhotoCheck('{"faces": 1, "face": [300, 250, 700, 550], "frontal": true, "eyes_visible": true, "obstructed": false, "blurry": false}');
    expect(c.ok).toBe(true);
    expect(c.faceBox).toEqual([300, 250, 700, 550]);
    expect(c.warnings).toEqual([]);
  });

  it('tolerates fences/prose, string booleans and a swapped box; normalises', () => {
    const c = parsePhotoCheck('Sure!\n```json\n{"faces": "2", "face": [700, 550, 300, 250], "frontal": "no", "eyes_visible": "yes", "obstructed": 1, "blurry": "false"}\n```');
    expect(c.ok).toBe(true);
    expect(c.faces).toBe(2);
    expect(c.faceBox).toEqual([300, 250, 700, 550]);
    expect(c.warnings).toEqual([
      '2 faces in the photo — the largest one is used; a solo photo locks better',
      'face turned away from the camera — a straight-on photo locks better',
      'something covers part of the face',
    ]);
  });

  it('no face → not ok, warned; tiny face → soft-crop warning; junk → unavailable', () => {
    expect(parsePhotoCheck('{"faces": 0, "face": [0,0,0,0]}').ok).toBe(false);
    expect(parsePhotoCheck('{"faces": 0, "face": [0,0,0,0]}').warnings[0]).toMatch(/no face found/);
    expect(parsePhotoCheck('{"faces": 1, "face": [480, 480, 520, 560], "frontal": true}').warnings).toEqual(['face is very small in the frame — the crop will be soft']);
    expect(parsePhotoCheck('nope').unavailable).toBe('no JSON in reply');
    expect(parsePhotoCheck('[1,2]').unavailable).toBe('no JSON in reply');
    expect(parsePhotoCheck('{"faces": 1, "face": [1, 2}').unavailable).toBe('unparseable JSON');
  });
});

describe('passportCropRect', () => {
  it('is 4:5, head box at HEAD_FRACTION of the height, centred on the head, HEAD_CENTRE_Y down (fits → ideal)', () => {
    const r = passportCropRect(400, 600, [300, 250, 700, 550]);
    // head: x 120–280 (cx 200), y 150–330 (h 180, cy 240) → ideal height 327 fits (164 above ≤ 240, 164 below ≤ 360, width 262 ≤ 400)
    expect(r.height).toBe(Math.round(180 / HEAD_FRACTION));
    expect(r.width).toBe(Math.round(r.height * PHOTO_PREP_SIZE.width / PHOTO_PREP_SIZE.height));
    expect(r.left).toBe(Math.round(200 - r.width / 2));
    expect(r.top).toBe(Math.round(240 - HEAD_CENTRE_Y * r.height));
    expect(r.top).toBeGreaterThanOrEqual(0);
  });

  it('shrinks to fit instead of padding: head near the top edge → smaller window, top at 0, same 4:5', () => {
    // head y 0–180 (cy 90): fitAbove = 90 / 0.5 = 180 → floored at max(headH 180, headW 160 / 0.8 = 200) × 1.15 = 230
    const r = passportCropRect(400, 600, [300, 0, 700, 300]);
    expect(r.height).toBe(Math.round(Math.max(180, 160 / 0.8) * HEAD_MIN_MARGIN));
    expect(r.width).toBe(Math.round(r.height * 0.8));
    expect(r.top).toBe(Math.round(90 - HEAD_CENTRE_Y * r.height)); // -25: the floor wins → that sliver is edge-replicated
    expect(r.top).toBeGreaterThan(-40);
    // head hugging the left edge (x 0–80, cx 40) → width-limited to 100 → the floor (230) wins; the overhang is edge-replicated
    const l = passportCropRect(400, 600, [0, 250, 200, 550]);
    expect(l.height).toBe(Math.round(Math.max(180, 80 / 0.8) * HEAD_MIN_MARGIN));
    expect(l.width).toBe(Math.round(l.height * 0.8));
    expect(l.left).toBe(Math.round(40 - l.width / 2));
    expect(l.height).toBeLessThan(Math.round(180 / HEAD_FRACTION));
  });
});

describe('passportCrop', () => {
  it('outputs the lock size and lands the head where the skeleton frames it (hair top ≈ 22%, chin ≈ 78%)', async () => {
    const { image, rect } = await passportCrop(await photo(), [300, 250, 700, 550]);
    const m = await sharp(image).metadata();
    expect([m.width, m.height]).toEqual([PHOTO_PREP_SIZE.width, PHOTO_PREP_SIZE.height]);
    expect(rect.top).toBeGreaterThanOrEqual(0); // fits — no padding needed
    // Sample the output: the light head block must be at the predicted rows, dark above and below it.
    const { data, info } = await sharp(image).raw().toBuffer({ resolveWithObject: true });
    const lum = (x: number, y: number) => data[(y * info.width + x) * info.channels];
    const cx = Math.round(info.width / 2);
    const topY = Math.round((HEAD_CENTRE_Y - HEAD_FRACTION / 2) * info.height);
    const chinY = Math.round((HEAD_CENTRE_Y + HEAD_FRACTION / 2) * info.height);
    expect(lum(cx, topY + 12)).toBeGreaterThan(150);
    expect(lum(cx, chinY - 12)).toBeGreaterThan(150);
    expect(lum(cx, topY - 20)).toBeLessThan(80);
    expect(lum(cx, chinY + 20)).toBeLessThan(80);
  });

  it('a head hugging the top edge still yields a complete 832×1040 frame (edge-replicated sliver, no ghost)', async () => {
    const src = await sharp({ create: { width: 400, height: 600, channels: 3, background: { r: 40, g: 40, b: 40 } } })
      .composite([{ input: await sharp({ create: { width: 160, height: 180, channels: 3, background: { r: 220, g: 200, b: 180 } } }).png().toBuffer(), left: 120, top: 0 }])
      .png().toBuffer();
    const { image } = await passportCrop(src, [300, 0, 700, 300]);
    const m = await sharp(image).metadata();
    expect([m.width, m.height]).toEqual([832, 1040]);
  });
});

describe('checkPhoto / preparePhoto (vision stubbed on the pod lane)', () => {
  beforeEach(() => { process.env.AI_LOCAL_BASE_URL = POD_URL; process.env.AI_LOCAL_MODEL = 'growth-local'; delete process.env.VISION_PROVIDER; });
  afterEach(() => { vi.unstubAllGlobals(); delete process.env.AI_LOCAL_BASE_URL; delete process.env.AI_LOCAL_MODEL; });

  it('sends the photo to the pod lane as a `real` image and crops on a good reply', async () => {
    const fetchMock = vi.fn(async () => openAiReply('{"faces": 1, "face": [300, 250, 700, 550], "frontal": true, "eyes_visible": true, "obstructed": false, "blurry": false}'));
    vi.stubGlobal('fetch', fetchMock);
    const r = await preparePhoto(await photo(), { meter: false });
    expect(r.cropped).toBe(true);
    expect(r.check.ok).toBe(true);
    const m = await sharp(r.image!).metadata();
    expect([m.width, m.height]).toEqual([832, 1040]);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${POD_URL}/chat/completions`);
    const body = JSON.parse(String(init.body));
    const parts = body.messages[0].content as Array<{ type: string; text?: string }>;
    expect(parts.map(p => p.type)).toEqual(['image_url', 'text']);
    expect(parts[1].text).toContain('top of the hair to the bottom of the chin');
  });

  it('no face → not cropped, original kept, warning; lane down → unavailable, never throws', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => openAiReply('{"faces": 0, "face": [0,0,0,0]}')));
    const r = await preparePhoto(await photo());
    expect(r.cropped).toBe(false);
    expect(r.image).toBeUndefined();
    expect(r.check.warnings[0]).toMatch(/no face found/);

    vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('ECONNREFUSED'); }));
    const c = await checkPhoto(await photo());
    expect(c.ok).toBe(false);
    expect(c.unavailable).toBe('ECONNREFUSED');
  });

  it('refuses to send a real photo to Claude (the wall) → unavailable', async () => {
    process.env.VISION_PROVIDER = 'claude';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const c = await checkPhoto(await photo());
    expect(c.unavailable).toMatch(/refused/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('helpers', () => {
  it('prepSiblingPath and the env switch', () => {
    expect(prepSiblingPath('/uploads/references/u/abc.jpg')).toBe('/uploads/references/u/abc.prep.jpg');
    expect(prepSiblingPath('/uploads/references/u/abc.PNG')).toBe('/uploads/references/u/abc.prep.jpg');
    expect(prepSiblingPath('/uploads/references/u/noext')).toBe('/uploads/references/u/noext.prep.jpg');
    delete process.env.QWEN21_PHOTO_PREP;
    expect(photoPrepEnabled()).toBe(true);
    process.env.QWEN21_PHOTO_PREP = 'off';
    expect(photoPrepEnabled()).toBe(false);
    delete process.env.QWEN21_PHOTO_PREP;
  });
});
