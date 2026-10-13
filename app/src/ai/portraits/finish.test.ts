import { describe, it, expect, beforeAll } from 'vitest';
import sharp from 'sharp';
import { FINISH, finishEnabled, finishImage, finishToken, inkEnabled, rawSiblingPath } from './finish';
import { buildContactSheet } from './contact-sheet';

let img: Buffer;
beforeAll(async () => {
  // 24x16 horizontal gradient, RGB.
  const w = 24, h = 16;
  const raw = Buffer.alloc(w * h * 3);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 3;
    raw[i] = Math.round((x / (w - 1)) * 255);
    raw[i + 1] = 120;
    raw[i + 2] = Math.round((y / (h - 1)) * 255);
  }
  img = await sharp(raw, { raw: { width: w, height: h, channels: 3 } }).png().toBuffer();
});

describe('finishImage', () => {
  it('preserves dimensions and changes the pixels', async () => {
    const out = await finishImage(img, 7);
    const m = await sharp(out).metadata();
    expect(m.format).toBe('png');
    expect([m.width, m.height]).toEqual([24, 16]);
    expect(out.equals(img)).toBe(false);
  });

  it('is deterministic: same input + seed → identical bytes; different seed → different grain', async () => {
    const a = await finishImage(img, 42);
    const b = await finishImage(img, 42);
    const c = await finishImage(img, 43);
    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
  });

  it('lifts blacks and darkens corners (vignette)', async () => {
    const black = await sharp({ create: { width: 8, height: 8, channels: 3, background: { r: 0, g: 0, b: 0 } } }).png().toBuffer();
    const noGrain = { ...FINISH, grain: { amount: 0 }, vignette: { strength: 0, inner: 1 } };
    const { data } = await sharp(await finishImage(black, 1, noGrain)).raw().toBuffer({ resolveWithObject: true });
    expect(Math.min(data[0], data[1], data[2])).toBeGreaterThan(0); // blacks lifted, teal-tinted
    expect(data[2]).toBeGreaterThan(data[0]); // cool shadow tint

    const grey = await sharp({ create: { width: 21, height: 21, channels: 3, background: { r: 160, g: 160, b: 160 } } }).png().toBuffer();
    const vigOnly = { ...FINISH, grain: { amount: 0 } };
    const r = await sharp(await finishImage(grey, 1, vigOnly)).raw().toBuffer({ resolveWithObject: true });
    const at = (x: number, y: number) => r.data[(y * 21 + x) * r.info.channels + 1];
    expect(at(0, 0)).toBeLessThan(at(10, 10));
  });

  it('keeps alpha when the input has it', async () => {
    const rgba = await sharp({ create: { width: 6, height: 6, channels: 4, background: { r: 10, g: 200, b: 30, alpha: 0.5 } } }).png().toBuffer();
    const m = await sharp(await finishImage(rgba, 3)).metadata();
    expect(m.channels).toBe(4);
  });
});

describe('finishImage — ink pass', () => {
  const W = 64, H = 32, EDGE = 32; // x < EDGE dark grey, x >= EDGE light grey
  const plain = { ...FINISH, grain: { amount: 0 }, vignette: { strength: 0, inner: 1 } };
  const noInk = { ...plain, ink: { ...FINISH.ink, amount: 0 } };
  let edgeImg: Buffer;
  beforeAll(async () => {
    const raw = Buffer.alloc(W * H * 3);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) raw.fill(x < EDGE ? 70 : 200, (y * W + x) * 3, (y * W + x) * 3 + 3);
    edgeImg = await sharp(raw, { raw: { width: W, height: H, channels: 3 } }).png().toBuffer();
  });
  const pixels = async (b: Buffer) => (await sharp(b).raw().toBuffer({ resolveWithObject: true }));
  const lumAt = (p: { data: Buffer; info: sharp.OutputInfo }, x: number, y: number) => {
    const i = (y * p.info.width + x) * p.info.channels;
    return 0.2126 * p.data[i] + 0.7152 * p.data[i + 1] + 0.0722 * p.data[i + 2];
  };

  it('is deterministic with the ink on (same input → identical bytes)', async () => {
    const a = await finishImage(edgeImg, 5, FINISH, {});
    const b = await finishImage(edgeImg, 5, FINISH, {});
    expect(a.equals(b)).toBe(true);
  });

  it('a hard vertical edge gets darker along its column and nowhere else', async () => {
    const on = await pixels(await finishImage(edgeImg, 1, plain, {}));
    const off = await pixels(await finishImage(edgeImg, 1, noInk, {}));
    const y = H / 2;
    // Some column at the edge is clearly darker with the ink.
    const drop = Math.max(...[EDGE - 2, EDGE - 1, EDGE, EDGE + 1].map(x => lumAt(off, x, y) - lumAt(on, x, y)));
    expect(drop).toBeGreaterThan(10);
    // Away from the edge, every pixel is untouched.
    for (let yy = 0; yy < H; yy++) for (let x = 0; x < W; x++) {
      if (Math.abs(x - EDGE) <= 6) continue;
      const i = (yy * W + x) * 3;
      expect([on.data[i], on.data[i + 1], on.data[i + 2]]).toEqual([off.data[i], off.data[i + 1], off.data[i + 2]]);
    }
  });

  it('a flat grey image is unchanged by the ink (no lines from nothing)', async () => {
    const grey = await sharp({ create: { width: 40, height: 30, channels: 3, background: { r: 128, g: 128, b: 128 } } }).png().toBuffer();
    const on = await finishImage(grey, 9, FINISH, {});
    const off = await finishImage(grey, 9, { ...FINISH, ink: { ...FINISH.ink, amount: 0 } }, {});
    expect(on.equals(off)).toBe(true);
  });

  it('GROWTH_FINISH_INK=off and amount 0 both bypass; dimensions preserved', async () => {
    expect(inkEnabled({})).toBe(true);
    expect(inkEnabled({ GROWTH_FINISH_INK: ' OFF' })).toBe(false);
    const envOff = await finishImage(edgeImg, 3, FINISH, { GROWTH_FINISH_INK: 'off' });
    const zero = await finishImage(edgeImg, 3, { ...FINISH, ink: { ...FINISH.ink, amount: 0 } }, {});
    const on = await finishImage(edgeImg, 3, FINISH, {});
    expect(envOff.equals(zero)).toBe(true);
    expect(on.equals(zero)).toBe(false);
    const m = await sharp(on).metadata();
    expect([m.width, m.height]).toEqual([W, H]);
  });

  it('token from an inked image is still RGBA', async () => {
    const tok = await finishToken(await finishImage(edgeImg, 2, FINISH, {}), { size: 24 });
    const m = await sharp(tok).metadata();
    expect([m.width, m.height, m.channels]).toEqual([24, 24, 4]);
  });
});

describe('finishToken', () => {
  it('square RGBA with transparent corners and a teal ring', async () => {
    const out = await finishToken(img, { size: 32 });
    const { data, info } = await sharp(out).raw().toBuffer({ resolveWithObject: true });
    expect([info.width, info.height, info.channels]).toEqual([32, 32, 4]);
    expect(data[3]).toBe(0); // corner (0,0) transparent
    const mid = (16 * 32 + 16) * 4;
    expect(data[mid + 3]).toBe(255); // centre opaque
    const edge = (16 * 32 + 0) * 4; // left edge on the ring
    expect(data[edge + 3]).toBeGreaterThan(0);
    expect(data[edge + 1]).toBeGreaterThan(data[edge]); // teal: green > red
  });
});

describe('buildContactSheet', () => {
  it('lays out rows x cols of labelled tiles as a JPEG', async () => {
    const t = { image: img, label: 'seed 7 · horror · raw' };
    const out = await buildContactSheet([[t, t, t], [t, t]], { tile: 48, label: 12, gap: 4 });
    const m = await sharp(out).metadata();
    expect(m.format).toBe('jpeg');
    expect(m.width).toBe(4 + 3 * (48 + 4));
    expect(m.height).toBe(4 + 2 * (32 + 12 + 4)); // 24x16 → 48x32 tiles
  });
});

describe('rawSiblingPath / finishEnabled', () => {
  it('maps the saved image paths to <dir>/raw/<name>.png', () => {
    expect(rawSiblingPath('/portraits/c/faces/.thumbs/abc.webp')).toBe('/portraits/c/faces/raw/abc.png');
    expect(rawSiblingPath('/portraits/c/faces/.thumbs/abc_thumb.webp')).toBe('/portraits/c/faces/raw/abc.png');
    expect(rawSiblingPath('/portraits/c/faces/abc.png')).toBe('/portraits/c/faces/raw/abc.png');
    expect(rawSiblingPath('portraits\\c\\faces\\abc.png')).toBe('portraits/c/faces/raw/abc.png');
    expect(rawSiblingPath('/portraits/c/faces/raw/abc.png')).toBe('/portraits/c/faces/raw/abc.png');
  });

  it('GROWTH_FINISH=off bypasses', () => {
    expect(finishEnabled({})).toBe(true);
    expect(finishEnabled({ GROWTH_FINISH: 'off' })).toBe(false);
    expect(finishEnabled({ GROWTH_FINISH: 'OFF ' })).toBe(false);
    expect(finishEnabled({ GROWTH_FINISH: 'on' })).toBe(true);
  });
});
