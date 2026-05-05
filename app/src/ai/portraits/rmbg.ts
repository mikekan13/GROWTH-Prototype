// Remove backgrounds from identity reference photos before ComfyUI upload.
// Cached per-file: the cleaned version is saved next to the original with a
// `.clean.png` suffix so repeat gens skip the RMBG pass.
//
// Rationale: Klein Ultimate Inpaint workflow (2026-04-23 analysis) pipes each
// identity ref through RMBG → crop → VAEEncode → ReferenceLatent. Stripping
// the background before the ref enters the ReferenceLatent chain reduces
// identity bleed from background elements (rooms, props, other people).
import fs from 'fs/promises';
import path from 'path';
import { pipeline, RawImage, env } from '@huggingface/transformers';
import { PNG } from 'pngjs';

env.allowLocalModels = false;

let rmbgPipeline: Awaited<ReturnType<typeof pipeline>> | null = null;

async function getPipeline() {
  if (!rmbgPipeline) {
    // RMBG-1.4 is small (~80MB), fast enough to run on CPU, and was the
    // subject of the Klein workflow's RMBG node.
    rmbgPipeline = await pipeline('image-segmentation', 'briaai/RMBG-1.4');
  }
  return rmbgPipeline;
}

/**
 * Strip background from an identity ref, compositing the subject onto neutral
 * mid-grey (VAEs don't love transparent PNGs; solid neutral bg reads as "nothing
 * to pull from" to the model without producing alpha artefacts).
 *
 * @param absolutePath absolute path to the source image
 * @returns absolute path to a cached cleaned version
 */
export async function stripBackground(absolutePath: string): Promise<string> {
  const dir = path.dirname(absolutePath);
  const base = path.basename(absolutePath, path.extname(absolutePath));
  const cleanPath = path.join(dir, `${base}.clean.png`);

  // Cache hit — return existing cleaned copy
  try {
    const [srcStat, cleanStat] = await Promise.all([fs.stat(absolutePath), fs.stat(cleanPath)]);
    if (cleanStat.mtimeMs >= srcStat.mtimeMs) return cleanPath;
  } catch { /* miss — proceed to generate */ }

  const pipe = await getPipeline();
  const img = await RawImage.read(absolutePath);
  // image-segmentation pipeline returns [{ mask: RawImage, score, label }]
  // The mask is a single-channel foreground probability image (255 = foreground).
  const res = await pipe(img) as Array<{ mask: { data: Uint8Array; width: number; height: number }; score?: number; label?: string }>;
  const mask = res[0]?.mask;
  if (!mask) throw new Error('RMBG returned no mask');

  const w = img.width, h = img.height;
  if (mask.width !== w || mask.height !== h) {
    throw new Error(`mask size ${mask.width}x${mask.height} != image ${w}x${h}`);
  }

  // Composite RGBA → RGB onto mid-grey (#888888) using the mask alpha.
  const imgData = img.data; // RGB or RGBA
  const channels = imgData.length / (w * h);
  const out = new PNG({ width: w, height: h });
  const bg = 0x88;
  for (let i = 0; i < w * h; i++) {
    const a = mask.data[i] / 255;
    const srcR = imgData[i * channels];
    const srcG = imgData[i * channels + 1];
    const srcB = imgData[i * channels + 2];
    out.data[i * 4]     = Math.round(srcR * a + bg * (1 - a));
    out.data[i * 4 + 1] = Math.round(srcG * a + bg * (1 - a));
    out.data[i * 4 + 2] = Math.round(srcB * a + bg * (1 - a));
    out.data[i * 4 + 3] = 255;
  }

  const buffers: Buffer[] = [];
  await new Promise<void>((resolve, reject) => {
    out.pack()
      .on('data', (c: Buffer) => buffers.push(c))
      .on('end', () => resolve())
      .on('error', reject);
  });
  await fs.writeFile(cleanPath, Buffer.concat(buffers));
  return cleanPath;
}
