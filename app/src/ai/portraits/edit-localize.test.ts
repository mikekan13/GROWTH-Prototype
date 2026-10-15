import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { boxMaskPng, diffMaskPng, locatePrompt, maskCoverage, padEditBox, parseEditBox, unionMasks } from './edit-localize';
import { compositeEditWithMask } from './mask-composite';

describe('parseEditBox', () => {
  it('reads the prompt convention (thousandths), fractions, bbox_2d and x1..y2; normalizes order', () => {
    expect(parseEditBox('{"found": true, "bbox": [400, 500, 480, 560]}')).toEqual({ x0: 0.4, y0: 0.5, x1: 0.48, y1: 0.56 });
    expect(parseEditBox('```json\n{"bbox_2d": [0.1, 0.2, 0.3, 0.4]}\n```')).toEqual({ x0: 0.1, y0: 0.2, x1: 0.3, y1: 0.4 });
    expect(parseEditBox('{"x1": 480, "y1": 560, "x2": 400, "y2": 500}')).toEqual({ x0: 0.4, y0: 0.5, x1: 0.48, y1: 0.56 });
    expect(parseEditBox('{"bbox": ["100", "100", "200", "200"]}')).toEqual({ x0: 0.1, y0: 0.1, x1: 0.2, y1: 0.2 });
  });
  it('null for not found, junk, hairline boxes and the whole frame', () => {
    expect(parseEditBox('{"found": false}')).toBeNull();
    expect(parseEditBox('no box here')).toBeNull();
    expect(parseEditBox('{"bbox": [1, 2]}')).toBeNull();
    expect(parseEditBox('{"bbox": [100, 100, 105, 400]}')).toBeNull();
    expect(parseEditBox('{"bbox": [0, 0, 1000, 1000]}')).toBeNull();
  });
  it('the prompt carries the instruction without the suffix', () => {
    expect(locatePrompt('Add a piercing to her torso: a navel ring. Change nothing else.')).toContain('"Add a piercing to her torso: a navel ring."');
  });
});

describe('masks', () => {
  it('padEditBox grows the box and clamps to the frame', () => {
    const p = padEditBox({ x0: 0.4, y0: 0.5, x1: 0.48, y1: 0.56 }, 0.5, 0.01);
    expect(p.x0).toBeCloseTo(0.35, 5);
    expect(p.x1).toBeCloseTo(0.53, 5);
    expect(padEditBox({ x0: 0, y0: 0, x1: 0.1, y1: 0.1 }).x0).toBe(0);
    expect(padEditBox({ x0: 0.95, y0: 0.95, x1: 1, y1: 1 }).x1).toBe(1);
  });

  it('boxMaskPng covers the box only; the composite keeps the base outside it', async () => {
    const W = 200; const H = 300;
    const mask = await boxMaskPng({ x0: 0.25, y0: 0.5, x1: 0.75, y1: 0.75 }, W, H);
    expect(await maskCoverage(mask)).toBeCloseTo(0.125, 2);
    const base = await sharp({ create: { width: W, height: H, channels: 3, background: { r: 0, g: 0, b: 255 } } }).png().toBuffer();
    const edited = await sharp({ create: { width: W, height: H + 32, channels: 3, background: { r: 255, g: 0, b: 0 } } }).png().toBuffer();
    const out = await compositeEditWithMask(base, edited, mask, 0);
    const { data, info } = await sharp(out).raw().toBuffer({ resolveWithObject: true });
    const px = (x: number, y: number) => [data[(y * info.width + x) * info.channels], data[(y * info.width + x) * info.channels + 2]];
    expect(info.width).toBe(W); expect(info.height).toBe(H); // the base's canvas, not the edit's
    expect(px(100, 185)).toEqual([255, 0]); // inside the box: the edit
    expect(px(10, 10)).toEqual([0, 255]); // outside: the base
  });

  it('diffMaskPng finds a strong local change and ignores a global drift; noise and whole-frame → null', async () => {
    const W = 240; const H = 320;
    const base = await sharp({ create: { width: W, height: H, channels: 3, background: { r: 120, g: 120, b: 120 } } }).png().toBuffer();
    const spot = await sharp({ create: { width: 30, height: 30, channels: 3, background: { r: 250, g: 250, b: 250 } } }).png().toBuffer();
    // drift: the whole frame a shade lighter; change: one bright spot
    const edited = await sharp({ create: { width: W, height: H, channels: 3, background: { r: 132, g: 132, b: 132 } } })
      .composite([{ input: spot, left: 100, top: 150 }]).png().toBuffer();
    const mask = await diffMaskPng(base, edited, W, H);
    expect(mask).not.toBeNull();
    const cover = await maskCoverage(mask!);
    expect(cover).toBeGreaterThan(0.005);
    expect(cover).toBeLessThan(0.08);
    expect(await diffMaskPng(base, base, W, H)).toBeNull();
    // within a window: the spot is found inside it, nothing outside it counts
    const inWin = await diffMaskPng(base, edited, W, H, 40, { x0: 0.3, y0: 0.35, x1: 0.7, y1: 0.7 });
    expect(inWin).not.toBeNull();
    expect(await diffMaskPng(base, edited, W, H, 40, { x0: 0, y0: 0, x1: 0.3, y1: 0.3 })).toBeNull();
    const u = await unionMasks(inWin!, await boxMaskPng({ x0: 0, y0: 0, x1: 0.1, y1: 0.1 }, W, H));
    expect(await maskCoverage(u)).toBeGreaterThan(await maskCoverage(inWin!));
    const inverted = await sharp({ create: { width: W, height: H, channels: 3, background: { r: 250, g: 250, b: 250 } } }).png().toBuffer();
    expect(await diffMaskPng(base, inverted, W, H)).toBeNull();
  });
});
