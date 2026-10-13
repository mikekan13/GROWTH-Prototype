import { describe, it, expect } from 'vitest';
import sharp from 'sharp';
import { compositeEditWithMask } from './mask-composite';

const solid = (w: number, h: number, v: number) =>
  sharp({ create: { width: w, height: h, channels: 3, background: { r: v, g: v, b: v } } }).png().toBuffer();

describe('compositeEditWithMask', () => {
  it('keeps the base outside the painted area and the edit inside it, at base size', async () => {
    const base = await solid(64, 64, 0);
    const edited = await solid(32, 48, 255); // model output can differ in size/aspect
    // Painted left half (red stroke on transparent), right half untouched.
    const mask = await sharp({ create: { width: 64, height: 64, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
      .composite([{ input: await sharp({ create: { width: 32, height: 64, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 1 } } }).png().toBuffer(), left: 0, top: 0 }])
      .png()
      .toBuffer();

    const out = await compositeEditWithMask(base, edited, mask, 0);
    const { data, info } = await sharp(out).raw().toBuffer({ resolveWithObject: true });
    expect(info.width).toBe(64);
    expect(info.height).toBe(64);
    const px = (x: number, y: number) => data[(y * info.width + x) * info.channels];
    expect(px(4, 32)).toBeGreaterThan(200); // inside mask → edited (white)
    expect(px(60, 32)).toBeLessThan(50);    // outside → base (black)
  });
});
