/**
 * Plain lanczos upscale with a light sharpen (no AI, instant). Free.
 *   npx tsx scripts/upscale-lanczos.ts --in IMG --out OUT.png [--scale 4]
 */
import fs from 'fs/promises';
import path from 'path';

function arg(name: string, def?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && !process.argv[i + 1]?.startsWith('--') ? process.argv[i + 1] : def;
}

async function main() {
  const sharp = (await import('sharp')).default;
  const src = path.resolve(arg('in') as string);
  const out = path.resolve(arg('out') as string);
  const scale = Number(arg('scale', '4'));
  await fs.mkdir(path.dirname(out), { recursive: true });
  const meta = await sharp(src).metadata();
  const w = Math.round((meta.width ?? 0) * scale), h = Math.round((meta.height ?? 0) * scale);
  await sharp(src).resize(w, h, { kernel: 'lanczos3' }).sharpen({ sigma: 1.2, m1: 0.6, m2: 0.4 }).png({ compressionLevel: 9 }).toFile(out);
  console.log(`lanczos ${scale}x → ${w}x${h} → ${out}`);
}
main().catch(e => { console.error(e); process.exitCode = 1; });
