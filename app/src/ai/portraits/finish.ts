/**
 * GROWTH image style — layer 3: FINISH (Mike ruled 13 Oct 2026, "Lets do it").
 *
 * A deterministic post-process applied in-app to every saved Qwen-Image-2.1
 * output, so the look that a prompt can't hold steady (grade, grain, vignette)
 * is identical across campaigns, seeds and characters:
 *   (a) colour grade — slight desaturation, lifted blacks, cool teal shadow tint, warm-neutral mids
 *   (b) monochrome grain — seeded noise (same input + seed → byte-identical output)
 *   (c) soft vignette
 *   (d) finishToken() — circular mask + Terminal-teal ring on a transparent RGBA canvas
 *
 * All parameters live in FINISH (iterate there). GROWTH_FINISH=off bypasses
 * finishing. The RAW model output is always saved alongside (<dir>/raw/<name>.png)
 * — the raw copies are the future LoRA training set. Pure: no file I/O here.
 */

import sharp from 'sharp';

export interface FinishParams {
  grade: {
    /** Saturation multiplier (0.88 = -12%). */
    saturation: number;
    /** Output black point, 0..1 (blacks lifted to this). */
    liftBlacks: number;
    /** Cool shadow tint, blended in proportion to darkness² × opacity. */
    shadowTint: { r: number; g: number; b: number; opacity: number };
    /** Warm-neutral mids: +R / -B, 0..1, peaking at mid-grey. */
    midWarmth: number;
  };
  /** Monochrome grain amplitude (≈ std-dev as a fraction of full scale). 0 = none. */
  grain: { amount: number };
  /** Radial darkening: `strength` at the corners, starting at `inner` (0 = centre, 1 = corner). */
  vignette: { strength: number; inner: number };
  token: { ring: string; ringWidth: number };
}

/** THE finish. Edit these numbers to iterate (style lab: --no-finish to compare). */
export const FINISH: FinishParams = {
  grade: {
    saturation: 1.12, // rev 2: Mike "too dull" — the finish now boosts, never mutes
    liftBlacks: 0.03, // rev 2: keep more contrast (seed 10's punch)
    shadowTint: { r: 15, g: 42, b: 58, opacity: 0.2 }, // #0f2a3a — the universe's cold undertone
    midWarmth: 0, // rev 2: the warm shift read as a sepia wash
  },
  grain: { amount: 0.008 }, // rev 2: a third of the original — it read as dust
  vignette: { strength: 0.22, inner: 0.45 },
  token: { ring: '#22ab94', ringWidth: 2 }, // Terminal teal
};

/** False when GROWTH_FINISH=off. */
export function finishEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return (env.GROWTH_FINISH ?? '').trim().toLowerCase() !== 'off';
}

/** mulberry32 — tiny deterministic PRNG. */
function prng(seed: number): () => number {
  let a = (seed >>> 0) || 0x9e3779b9;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (e0: number, e1: number, x: number) => {
  const t = clamp01((x - e0) / Math.max(1e-6, e1 - e0));
  return t * t * (3 - 2 * t);
};

/**
 * Grade + grain + vignette. Dimensions and alpha (if any) are preserved; output is PNG.
 * Deterministic: identical input + seed + params → identical bytes.
 */
export async function finishImage(input: Buffer, seed: number, params: FinishParams = FINISH): Promise<Buffer> {
  const meta = await sharp(input).metadata();
  const base = sharp(input).toColourspace('srgb');
  const { data, info } = await (meta.hasAlpha ? base.ensureAlpha() : base.removeAlpha())
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const out = Buffer.from(data);
  const { saturation, liftBlacks, shadowTint, midWarmth } = params.grade;
  const tint = [shadowTint.r / 255, shadowTint.g / 255, shadowTint.b / 255];
  const rand = prng(seed);
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  const maxD = Math.hypot(cx, cy) || 1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * channels;
      let r = data[i] / 255;
      let g = data[i + 1] / 255;
      let b = data[i + 2] / 255;

      // (a) grade
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      r = lum + (r - lum) * saturation;
      g = lum + (g - lum) * saturation;
      b = lum + (b - lum) * saturation;
      const w = (1 - lum) * (1 - lum) * shadowTint.opacity;
      r = r * (1 - w) + tint[0] * w;
      g = g * (1 - w) + tint[1] * w;
      b = b * (1 - w) + tint[2] * w;
      const mid = 4 * lum * (1 - lum);
      r += midWarmth * mid;
      b -= midWarmth * mid;
      r = liftBlacks + r * (1 - liftBlacks);
      g = liftBlacks + g * (1 - liftBlacks);
      b = liftBlacks + b * (1 - liftBlacks);

      // (c) vignette
      const d = Math.hypot(x - cx, y - cy) / maxD;
      const v = 1 - params.vignette.strength * smoothstep(params.vignette.inner, 1, d);

      // (b) monochrome grain (one value for all three channels)
      const n = params.grain.amount > 0 ? (rand() + rand() + rand() - 1.5) * 2 * params.grain.amount : 0;

      out[i] = Math.round(clamp01(r * v + n) * 255);
      out[i + 1] = Math.round(clamp01(g * v + n) * 255);
      out[i + 2] = Math.round(clamp01(b * v + n) * 255);
    }
  }
  return sharp(out, { raw: { width, height, channels } }).png().toBuffer();
}

/**
 * Token: square cover-crop → circular mask → `ringWidth`-px Terminal-teal ring, on a
 * transparent RGBA canvas. Pass an already-finished image. Output PNG, size × size.
 */
export async function finishToken(
  input: Buffer,
  opts: { size?: number; ring?: string; ringWidth?: number; position?: string } = {},
): Promise<Buffer> {
  const meta = await sharp(input).metadata();
  const size = Math.max(4, Math.round(opts.size ?? Math.min(meta.width ?? 256, meta.height ?? 256)));
  const ring = opts.ring ?? FINISH.token.ring;
  const rw = opts.ringWidth ?? FINISH.token.ringWidth;
  const c = size / 2;
  const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${c}" cy="${c}" r="${c}" fill="#fff"/></svg>`);
  const ringSvg = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><circle cx="${c}" cy="${c}" r="${c - rw / 2}" fill="none" stroke="${ring}" stroke-width="${rw}"/></svg>`,
  );
  const square = await sharp(input)
    .resize(size, size, { fit: 'cover', position: opts.position ?? 'centre' })
    .ensureAlpha()
    .composite([{ input: mask, blend: 'dest-in' }])
    .png()
    .toBuffer();
  return sharp(square).composite([{ input: ringSvg, blend: 'over' }]).ensureAlpha().png().toBuffer();
}

/**
 * Where the RAW copy of a saved portrait lives: `<dir>/raw/<name>.png`.
 * Accepts the PNG path or savePortrait's `.thumbs/<name>.webp` / `_thumb.webp` path.
 */
export function rawSiblingPath(webPath: string): string {
  const norm = webPath.replace(/\\/g, '/');
  const m = norm.match(/^(.*?)\/?(?:\.thumbs\/)?([^/]+?)(?:_thumb)?\.(png|webp|jpe?g)$/i);
  if (!m) throw new Error(`rawSiblingPath: not an image path: ${webPath}`);
  const dir = m[1];
  if (/(^|\/)raw$/.test(dir)) return `${dir}/${m[2]}.png`;
  return `${dir ? `${dir}/` : ''}raw/${m[2]}.png`;
}
