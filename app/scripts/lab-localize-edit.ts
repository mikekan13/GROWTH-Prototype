/**
 * LAB: prove the edit localizer on an existing base + repaint pair (no generation).
 *   cd app && npx tsx scripts/lab-localize-edit.ts <base.png> <edited.png> "<instruction>" [outDir]
 * Writes mask.png, composite.png and a side-by-side strip, prints how the mask was found.
 */
import './_server-only-shim';
import { config } from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
config({ path: '.env.local', quiet: true });
config({ path: '.env', quiet: true });

async function main() {
  const [base, edited, instruction, outDir = path.resolve('..', 'style-refs', 'lab', 'localize-edit')] = process.argv.slice(2);
  if (!base || !edited || !instruction) throw new Error('usage: base edited "instruction" [outDir]');
  const { localizeMask, LOCALIZE_FEATHER } = await import('../src/ai/portraits/edit-localize');
  const { compositeEditWithMask } = await import('../src/ai/portraits/mask-composite');
  const baseBuf = await fs.readFile(base);
  const editBuf = await fs.readFile(edited);
  const t0 = Date.now();
  const found = await localizeMask(baseBuf, editBuf, instruction);
  console.log(`localized: ${found.how} in ${Date.now() - t0} ms`);
  await fs.mkdir(outDir, { recursive: true });
  if (!found.mask) return;
  await fs.writeFile(path.join(outDir, 'mask.png'), found.mask);
  const out = await compositeEditWithMask(baseBuf, editBuf, found.mask, LOCALIZE_FEATHER);
  await fs.writeFile(path.join(outDir, 'composite.png'), out);
  const meta = await sharp(baseBuf).metadata();
  const W = meta.width!; const H = meta.height!;
  const fit = (b: Buffer) => sharp(b).resize(W, H, { fit: 'fill' }).png().toBuffer();
  const strip = await sharp({ create: { width: W * 3, height: H, channels: 3, background: '#000' } })
    .composite([
      { input: await fit(baseBuf), left: 0, top: 0 },
      { input: await fit(editBuf), left: W, top: 0 },
      { input: out, left: W * 2, top: 0 },
    ]).png().toBuffer();
  await fs.writeFile(path.join(outDir, 'strip.png'), strip);
  console.log(`wrote ${outDir}/{mask,composite,strip}.png`);
}
main().catch(e => { console.error(e); process.exit(1); });
