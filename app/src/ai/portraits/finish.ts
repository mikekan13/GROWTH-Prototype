/**
 * GROWTH image style — layer 3: FINISH (Mike ruled 13 Oct 2026, "Lets do it").
 *
 * A deterministic post-process applied in-app to every saved Qwen-Image-2.1
 * output, so the look that a prompt can't hold steady (grade, grain, vignette)
 * is identical across campaigns, seeds and characters:
 *   (a) colour grade — slight desaturation, lifted blacks, cool teal shadow tint, warm-neutral mids
 *   (b) monochrome grain — seeded noise (same input + seed → byte-identical output)
 *   (c) soft vignette
 *   (a') ink — deterministic pen lines along contours (Sobel on blurred luminance,
 *        coarse-scale gated so skin texture never inks), faint teal on the lit side
 *   (d) finishToken() — circular mask + Terminal-teal ring on a transparent RGBA canvas
 *
 * Order: grade → ink → vignette → grain (grain sits on top of the lines).
 * All parameters live in FINISH (iterate there). GROWTH_FINISH=off bypasses
 * finishing; GROWTH_FINISH_INK=off (or ink.amount 0) bypasses only the ink. The RAW model output is always saved alongside (<dir>/raw/<name>.png)
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
  /**
   * Ink pass (Mike 13 Oct: "slightly exaggerated pen lines. subtle but noticible").
   * Resolution-independent: lengths are in px at 832 wide and scale with the image.
   */
  ink: {
    /** Max darkening toward the ink colour along a full-strength line, 0..1. 0 = off. */
    amount: number;
    /** Line width in px at 832 wide (≥2 dilates the mask by ~1 px). */
    width: number;
    /** Edge contrast (luminance step, 0..1) where a line starts; full ink at ~2.2×. */
    threshold: number;
    /** Faint cool edge on the lit side of a line (shadowTint hue), 0..1. 0 = none. */
    teal: number;
    /** Pen colour as hex (e.g. '582a72' Spirit purple); omitted = near-black. */
    color?: string;
    /** A second, LIGHT pen (hex, e.g. 'ffcc78' GROWTH gold): used when `auto` says the scene is bright, or always when `color` is unset and `auto` is off. */
    lightColor?: string;
    /** Pick the light pen when the image's mean luminance ≥ autoThreshold (default 0.45). */
    auto?: boolean;
    autoThreshold?: number;
  };
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
  ink: { amount: 0.55, width: 1.5, threshold: 0.06, teal: 0.2 },
  token: { ring: '#22ab94', ringWidth: 2 }, // Terminal teal
};

/** False when GROWTH_FINISH=off. */
export function finishEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return (env.GROWTH_FINISH ?? '').trim().toLowerCase() !== 'off';
}

/** False when GROWTH_FINISH_INK=off. */
export function inkEnabled(env: Record<string, string | undefined> = process.env): boolean {
  return (env.GROWTH_FINISH_INK ?? '').trim().toLowerCase() !== 'off';
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

/** Separable Gaussian blur of a single-channel float field (edges clamped). */
function gaussianBlur(src: Float32Array, w: number, h: number, sigma: number): Float32Array {
  if (sigma < 0.3) return Float32Array.from(src);
  const rad = Math.max(1, Math.ceil(sigma * 3));
  const k = new Float32Array(rad * 2 + 1);
  let sum = 0;
  for (let i = -rad; i <= rad; i++) sum += (k[i + rad] = Math.exp(-(i * i) / (2 * sigma * sigma)));
  for (let i = 0; i < k.length; i++) k[i] /= sum;
  const tmp = new Float32Array(w * h);
  const out = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let j = -rad; j <= rad; j++) {
        const xx = x + j < 0 ? 0 : x + j >= w ? w - 1 : x + j;
        acc += src[row + xx] * k[j + rad];
      }
      tmp[row + x] = acc;
    }
  }
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let j = -rad; j <= rad; j++) {
        const yy = y + j < 0 ? 0 : y + j >= h ? h - 1 : y + j;
        acc += tmp[yy * w + x] * k[j + rad];
      }
      out[y * w + x] = acc;
    }
  }
  return out;
}

/**
 * Sobel on a blurred field → edge strength in luminance-step units (a hard step of
 * height c blurred by `sigma` reads ≈ c whatever the resolution), plus the gradient.
 */
function edgeStrength(b: Float32Array, w: number, h: number, sigma: number) {
  const e = new Float32Array(w * h);
  const gx = new Float32Array(w * h);
  const gy = new Float32Array(w * h);
  const norm = (Math.max(sigma, 0.4) * Math.sqrt(2 * Math.PI)) / 8;
  const at = (x: number, y: number) => b[(y < 0 ? 0 : y >= h ? h - 1 : y) * w + (x < 0 ? 0 : x >= w ? w - 1 : x)];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const tl = at(x - 1, y - 1), t = at(x, y - 1), tr = at(x + 1, y - 1);
      const l = at(x - 1, y), r = at(x + 1, y);
      const bl = at(x - 1, y + 1), bo = at(x, y + 1), br = at(x + 1, y + 1);
      const sx = (tr + 2 * r + br - tl - 2 * l - bl) * norm;
      const sy = (bl + 2 * bo + br - tl - 2 * t - tr) * norm;
      const i = y * w + x;
      gx[i] = sx;
      gy[i] = sy;
      e[i] = Math.hypot(sx, sy);
    }
  }
  return { e, gx, gy };
}

/** #141413 — near-black ink, never pure black. */
/** Default pen colour: near-black. `ink.color` overrides (e.g. Spirit purple #582a72 — Mike, 14 Oct). */
const INK_RGB = [20 / 255, 20 / 255, 19 / 255];
/** '#582a72' / '582a72' → [r, g, b] in 0..1; undefined/invalid → the default pen. */
export function inkColorRgb(hex?: string): number[] {
  const m = hex?.trim().match(/^#?([0-9a-f]{6})$/i);
  if (!m) return INK_RGB;
  const n = parseInt(m[1], 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

/**
 * The ink pass, in place on graded float RGB planes. A line = a fine-scale edge that
 * is ALSO an edge at a coarser scale (contours of features, hair, silhouette), so
 * pores/freckles/flat skin stay clean; smooth mid-tones need a stronger coarse edge.
 * Darken toward INK_RGB by amount × mask; faint shadowTint-hued chroma on the lit side.
 */
function applyInk(
  r: Float32Array, g: Float32Array, b: Float32Array, w: number, h: number,
  ink: FinishParams['ink'], tint: number[],
): void {
  const n = w * h;
  const scale = w / 832;
  const lum = new Float32Array(n);
  let meanLum = 0;
  for (let i = 0; i < n; i++) { lum[i] = 0.2126 * r[i] + 0.7152 * g[i] + 0.0722 * b[i]; meanLum += lum[i]; }
  meanLum /= n;
  // PEN CHOICE (Mike, 14 Oct: "switch the lines to actually be bright" in bright scenes): `ink.lightColor` is a second,
  // light pen; `ink.auto` picks it when the image's mean luminance passes `ink.autoThreshold` (default 0.45). A pen
  // lighter than mid-grey is drawn on the LIT side of edges (see the mask below), a dark pen on the dark side.
  const useLight = !!ink.lightColor && (ink.auto ? meanLum >= (ink.autoThreshold ?? 0.45) : !ink.color);
  const pen = useLight ? inkColorRgb(ink.lightColor) : inkColorRgb(ink.color);
  const lightPen = 0.2126 * pen[0] + 0.7152 * pen[1] + 0.0722 * pen[2] > 0.5;
  const s1 = Math.max(0.5, 0.7 * ink.width * scale);
  const s2 = Math.max(1.2, 2.5 * scale);
  const b1 = gaussianBlur(lum, w, h, s1);
  const fine = edgeStrength(b1, w, h, s1);
  const b2 = gaussianBlur(lum, w, h, s2);
  const coarse = edgeStrength(b2, w, h, s2);
  const t = ink.threshold;

  let mask = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const ce = coarse.e[i];
    let m = smoothstep(t, t * 2.2, fine.e[i]) * smoothstep(t * 0.5, t * 1.5, ce);
    // Smooth mid-tones (skin) need a stronger coarse edge before they ink.
    const midBand = smoothstep(0.3, 0.45, b2[i]) * (1 - smoothstep(0.75, 0.9, b2[i]));
    m *= 1 - midBand * (1 - smoothstep(t, t * 3, ce));
    if (lightPen) {
      // LIGHT PEN (bright scenes): the line sits on the LIT side of the edge, like a bright gouache line over a
      // bright ground; already-bright marks (specular, sky) are not pushed further.
      m *= smoothstep(0, t * 0.2, b1[i] - b2[i]);
      m *= 1 - smoothstep(0.78, 0.95, b1[i]);
    } else {
      // The pen sits on the DARK side of the edge: a thin line, not a halo band.
      m *= smoothstep(0, t * 0.2, b2[i] - b1[i]);
      // Already-dark marks (lashes, brows, deep hair) are lines already — don't thicken them.
      m *= smoothstep(0.08, 0.3, b1[i]);
    }
    mask[i] = m;
  }
  const rd = ink.width >= 2 ? Math.max(1, Math.round((ink.width - 1) * scale * 0.5)) : 0;
  if (rd > 0) {
    const d = new Float32Array(n);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let mx = 0;
      for (let dy = -rd; dy <= rd; dy++) {
        const yy = y + dy;
        if (yy < 0 || yy >= h) continue;
        for (let dx = -rd; dx <= rd; dx++) {
          const xx = x + dx;
          if (xx < 0 || xx >= w) continue;
          const v = mask[yy * w + xx];
          if (v > mx) mx = v;
        }
      }
      d[y * w + x] = mx;
    }
    mask = d;
  }

  // Teal chroma direction (luminance-free), normalised to unit max.
  const tl = 0.2126 * tint[0] + 0.7152 * tint[1] + 0.0722 * tint[2];
  const c = [tint[0] - tl, tint[1] - tl, tint[2] - tl];
  const cm = Math.max(Math.abs(c[0]), Math.abs(c[1]), Math.abs(c[2])) || 1;
  const chroma = c.map(v => (v / cm) * 0.3);
  const reach = 1.5 * s1 + rd;
  const a = ink.amount;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      const m = mask[i];
      let tm = 0;
      if (ink.teal > 0) {
        const gx = coarse.gx[i], gy = coarse.gy[i];
        const gl = Math.hypot(gx, gy);
        if (gl > 1e-4) {
          // Step toward the darker side; a line there makes this pixel its lit edge.
          const sx = Math.round(x - (gx / gl) * reach);
          const sy = Math.round(y - (gy / gl) * reach);
          // Strong (silhouette-grade) edges only — on soft facial creases it reads as a pale halo.
          if (sx >= 0 && sx < w && sy >= 0 && sy < h) {
            tm = mask[sy * w + sx] * (1 - m) * smoothstep(t * 2.5, t * 5, coarse.e[i]) * ink.teal;
          }
        }
      }
      const k = a * m;
      r[i] = r[i] * (1 - k) + pen[0] * k + chroma[0] * tm;
      g[i] = g[i] * (1 - k) + pen[1] * k + chroma[1] * tm;
      b[i] = b[i] * (1 - k) + pen[2] * k + chroma[2] * tm;
    }
  }
}

/**
 * INK ONLY — the pen lines with no grade, vignette or grain (Mike, 14 Oct: mid-generation ink — the lines are drawn
 * on the soft midpoint image and the model paints the rest of the way over them). Output PNG, same dimensions.
 */
export async function inkImage(input: Buffer, ink: FinishParams['ink'] = FINISH.ink, tintRgb = FINISH.grade.shadowTint): Promise<Buffer> {
  const { data, info } = await sharp(input).toColourspace('srgb').removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const n = width * height;
  const R = new Float32Array(n), G = new Float32Array(n), B = new Float32Array(n);
  for (let p = 0; p < n; p++) { R[p] = data[p * channels] / 255; G[p] = data[p * channels + 1] / 255; B[p] = data[p * channels + 2] / 255; }
  applyInk(R, G, B, width, height, ink, [tintRgb.r / 255, tintRgb.g / 255, tintRgb.b / 255]);
  const out = Buffer.alloc(n * 3);
  for (let p = 0; p < n; p++) { out[p * 3] = Math.round(clamp01(R[p]) * 255); out[p * 3 + 1] = Math.round(clamp01(G[p]) * 255); out[p * 3 + 2] = Math.round(clamp01(B[p]) * 255); }
  return sharp(out, { raw: { width, height, channels: 3 } }).png().toBuffer();
}

/**
 * Grade → ink → vignette → grain. Dimensions and alpha (if any) are preserved; output is PNG.
 * Deterministic: identical input + seed + params → identical bytes.
 * `env` is consulted for GROWTH_FINISH_INK=off (defaults to process.env).
 */
export async function finishImage(
  input: Buffer,
  seed: number,
  params: FinishParams = FINISH,
  env: Record<string, string | undefined> = process.env,
): Promise<Buffer> {
  const meta = await sharp(input).metadata();
  const base = sharp(input).toColourspace('srgb');
  const { data, info } = await (meta.hasAlpha ? base.ensureAlpha() : base.removeAlpha())
    .raw()
    .toBuffer({ resolveWithObject: true });
  const { width, height, channels } = info;
  const out = Buffer.from(data);
  const { saturation, liftBlacks, shadowTint, midWarmth } = params.grade;
  const tint = [shadowTint.r / 255, shadowTint.g / 255, shadowTint.b / 255];
  const n = width * height;
  const R = new Float32Array(n);
  const G = new Float32Array(n);
  const B = new Float32Array(n);

  // (a) grade
  for (let p = 0; p < n; p++) {
    const i = p * channels;
    let r = data[i] / 255;
    let g = data[i + 1] / 255;
    let b = data[i + 2] / 255;
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
    R[p] = liftBlacks + r * (1 - liftBlacks);
    G[p] = liftBlacks + g * (1 - liftBlacks);
    B[p] = liftBlacks + b * (1 - liftBlacks);
  }

  // (a') ink — after the grade, before vignette + grain (grain sits on the lines)
  if (params.ink && params.ink.amount > 0 && inkEnabled(env)) {
    applyInk(R, G, B, width, height, params.ink, tint);
  }

  const rand = prng(seed);
  const cx = (width - 1) / 2;
  const cy = (height - 1) / 2;
  const maxD = Math.hypot(cx, cy) || 1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      const i = p * channels;
      // (c) vignette
      const d = Math.hypot(x - cx, y - cy) / maxD;
      const v = 1 - params.vignette.strength * smoothstep(params.vignette.inner, 1, d);
      // (b) monochrome grain (one value for all three channels)
      const gr = params.grain.amount > 0 ? (rand() + rand() + rand() - 1.5) * 2 * params.grain.amount : 0;
      out[i] = Math.round(clamp01(R[p] * v + gr) * 255);
      out[i + 1] = Math.round(clamp01(G[p] * v + gr) * 255);
      out[i + 2] = Math.round(clamp01(B[p] * v + gr) * 255);
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
