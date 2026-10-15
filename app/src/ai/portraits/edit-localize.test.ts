import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import {
  boxMaskPng, locatePrompt, mapBoxFromCrop, maskCoverage, matchColorInRegion, padEditBox, parseEditBox, refinePrompt, zoomWindow,
} from './edit-localize';
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
  it('the prompts carry the instruction without the suffix', () => {
    expect(locatePrompt('Add a piercing to her torso: a navel ring. Change nothing else.')).toContain('"Add a piercing to her torso: a navel ring."');
    expect(refinePrompt('Add a scar. Change nothing else.')).toContain('"Add a scar."');
    expect(refinePrompt('x')).toContain('THIS crop');
  });
});

describe('box maths', () => {
  it('padEditBox grows the box and clamps to the frame', () => {
    const p = padEditBox({ x0: 0.4, y0: 0.5, x1: 0.48, y1: 0.56 }, 0.5, 0.01);
    expect(p.x0).toBeCloseTo(0.35, 5);
    expect(p.x1).toBeCloseTo(0.53, 5);
    expect(padEditBox({ x0: 0, y0: 0, x1: 0.1, y1: 0.1 }).x0).toBe(0);
    expect(padEditBox({ x0: 0.95, y0: 0.95, x1: 1, y1: 1 }).x1).toBe(1);
  });

  it('zoomWindow: a tiny box grows to the minimum crop, centred, kept inside the frame', () => {
    const w = zoomWindow({ x0: 0.49, y0: 0.37, x1: 0.51, y1: 0.395 }, 832 / 1216, 0.22);
    // long side = height: min height 0.22, min width 0.22 / (832/1216) ≈ 0.3215
    expect(w.x1 - w.x0).toBeCloseTo(0.3215, 3);
    expect(w.y1 - w.y0).toBeCloseTo(0.22, 3);
    expect((w.x0 + w.x1) / 2).toBeCloseTo(0.5, 3);
    const edge = zoomWindow({ x0: 0.97, y0: 0.01, x1: 0.99, y1: 0.03 }, 1, 0.3);
    expect(edge.x1).toBe(1); expect(edge.y0).toBe(0);
    expect(edge.x1 - edge.x0).toBeCloseTo(0.3, 3);
    // a big box is just padded
    const big = zoomWindow({ x0: 0.2, y0: 0.2, x1: 0.8, y1: 0.8 }, 1, 0.22);
    expect(big.x0).toBe(0); expect(big.x1).toBe(1);
  });

  it('mapBoxFromCrop puts a crop-relative box back into the frame', () => {
    const crop = { x0: 0.4, y0: 0.3, x1: 0.6, y1: 0.5 };
    expect(mapBoxFromCrop({ x0: 0.5, y0: 0.5, x1: 0.75, y1: 1 }, crop)).toEqual({ x0: 0.5, y0: 0.4, x1: 0.55, y1: 0.5 });
  });
});

describe('masks', () => {
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

  it('matchColorInRegion shifts the edit to the base\'s mean in the region (edit at another canvas size too)', async () => {
    const W = 200; const H = 300;
    const base = await sharp({ create: { width: W, height: H, channels: 3, background: { r: 120, g: 100, b: 80 } } }).png().toBuffer();
    const edited = await sharp({ create: { width: W, height: H + 32, channels: 3, background: { r: 100, g: 100, b: 100 } } }).png().toBuffer();
    const out = await matchColorInRegion(base, edited, { x0: 0.4, y0: 0.4, x1: 0.6, y1: 0.6 }, W, H);
    const { data, info } = await sharp(out).raw().toBuffer({ resolveWithObject: true });
    expect([info.width, info.height]).toEqual([W, H]);
    expect(Array.from(data.subarray(0, 3))).toEqual([120, 100, 80]);
    expect(await matchColorInRegion(base, base, { x0: 0, y0: 0, x1: 1, y1: 1 }, W, H)).toBe(base); // no shift needed → untouched
  });
});
