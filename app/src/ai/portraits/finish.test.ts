import { describe, it, expect, beforeAll } from 'vitest';
import sharp from 'sharp';
import { FINISH, finishEnabled, finishImage, finishToken, inkColorRgb, inkEnabled, inkImage, rawSiblingPath } from './finish';
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

describe('inkImage — pen choice (Mike 14 Oct: gold on bright scenes, dark pen on dark ones)', () => {
  /** A 200×200 field with a sharp-edged square in the middle; `bg`/`fg` set the scene's brightness. */
  const scene = async (bg: number, fg: number) => sharp({ create: { width: 200, height: 200, channels: 3, background: { r: bg, g: bg, b: bg } } })
    .composite([{ input: await sharp({ create: { width: 80, height: 80, channels: 3, background: { r: fg, g: fg, b: fg } } }).png().toBuffer(), left: 60, top: 60 }])
    .png().toBuffer();
  const px = async (buf: Buffer, x: number, y: number) => {
    const { data, info } = await sharp(buf).raw().toBuffer({ resolveWithObject: true });
    const i = (y * info.width + x) * info.channels;
    return [data[i], data[i + 1], data[i + 2]];
  };

  it('hex parsing', () => {
    expect(inkColorRgb('ffcc78').map(v => Math.round(v * 255))).toEqual([255, 204, 120]);
    expect(inkColorRgb('#582A72').map(v => Math.round(v * 255))).toEqual([88, 42, 114]);
    expect(inkColorRgb('nope')).toEqual(inkColorRgb(undefined));
  });

  // The pen is ~1 px wide at this 200-px test size (line widths scale with image width), so sample 1 px off the edge.
  it('bright scene + auto → the GOLD pen on the lit side of the edge; dark scene → the dark pen on the dark side', async () => {
    // Bright: light field (180 — below the "already bright" cut-off) with a dark-grey square (90). Lit side = the field by the edge.
    const bright = await inkImage(await scene(180, 90), FINISH.ink);
    const litSide = await px(bright, 59, 100); // 1 px outside the square's left edge
    const darkSide = await px(bright, 61, 100); // 1 px inside
    expect(litSide[0]).toBeGreaterThan(litSide[2] + 20); // warm (gold) tint on the lit side: R well above B
    expect(darkSide[0] - darkSide[2]).toBeLessThan(12); // the dark side stays neutral
    // Dark: dark field (40) with a lighter square (120): the dark pen darkens the dark side (the field by the edge).
    const dark = await inkImage(await scene(40, 120), FINISH.ink);
    const edgeDark = await px(dark, 59, 100);
    expect(edgeDark[0]).toBeLessThanOrEqual(40);
    expect(Math.abs(edgeDark[0] - edgeDark[2])).toBeLessThan(8); // neutral, not gold
  });

  it('auto off → ink.color always: the dark pen even on a bright scene; a light hex as `color` → light pen on a dark scene', async () => {
    const forcedDark = await inkImage(await scene(180, 90), { ...FINISH.ink, auto: false });
    const a = await px(forcedDark, 59, 100);
    expect(a[0] - a[2]).toBeLessThan(12);
    const forcedLight = await inkImage(await scene(40, 120), { ...FINISH.ink, auto: false, color: 'ffcc78' });
    const b = await px(forcedLight, 60, 100); // lit side of a dark scene = the first pixel inside the lighter square
    expect(b[0]).toBeGreaterThan(b[2] + 20);
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
    // The DARK pen (auto would pick the gold pen on this bright test image and lighten the lit side instead).
    const on = await pixels(await finishImage(edgeImg, 1, { ...plain, ink: { ...plain.ink, auto: false } }, {}));
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
