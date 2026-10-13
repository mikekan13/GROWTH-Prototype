import { describe, it, expect, beforeAll } from 'vitest';
import sharp from 'sharp';
import { FINISH, finishEnabled, finishImage, finishToken, rawSiblingPath } from './finish';
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
