/**
 * Keep an instruction edit local by alpha-compositing the edited image over
 * the base through a painted mask. Used by the Qwen-Image-2.1 provider:
 * TextEncodeQwenImage21 has no mask input, so the model edits the whole frame
 * and this step throws away everything outside the mask (same idea as the
 * FLUX.2 post-composite in LocalProvider.editImage).
 *
 * Mask: any painted (non-black after flattening on black) pixel counts as
 * "edit here". `feather` px dilates the stroke, then a small blur softens the seam.
 */

import sharp from 'sharp';

export async function prepareEditMask(maskPng: Buffer, width: number, height: number, feather = 20): Promise<Buffer> {
  let pipe = sharp(maskPng)
    .resize(width, height, { fit: 'fill' })
    .flatten({ background: { r: 0, g: 0, b: 0 } })
    .grayscale()
    .threshold(1);
  if (feather > 0) pipe = sharp(await pipe.png().toBuffer()).blur(Math.max(feather / 2, 0.3)).threshold(16).blur(4);
  return pipe.extractChannel(0).raw().toBuffer();
}

/** result = edited·mask + base·(1−mask), at the base image's size. Returns PNG. */
export async function compositeEditWithMask(
  base: Buffer,
  edited: Buffer,
  maskPng: Buffer,
  feather = 20,
): Promise<Buffer> {
  const meta = await sharp(base).metadata();
  const W = meta.width ?? 1024;
  const H = meta.height ?? 1024;
  const alpha = await prepareEditMask(maskPng, W, H, feather);
  // Resize first in its own pass: sharp runs joinChannel before resize in one pipeline.
  const editedRgb = await sharp(edited).resize(W, H, { fit: 'fill' }).removeAlpha().raw().toBuffer();
  const editedRgba = await sharp(editedRgb, { raw: { width: W, height: H, channels: 3 } })
    .joinChannel(alpha, { raw: { width: W, height: H, channels: 1 } })
    .png()
    .toBuffer();
  return sharp(base).removeAlpha().composite([{ input: editedRgba }]).png().toBuffer();
}
