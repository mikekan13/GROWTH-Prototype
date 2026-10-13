/**
 * Crop the same fractional region out of several images (e.g. the face) so a compare sheet can show
 * line quality at 1:1. Free.
 *   npx tsx scripts/crop-faces.ts --region 0.2,0.0,0.6,0.5 --out DIR --in "label=path" "label=path" ...
 * Writes <out>/<label>.png (region = x,y,w,h as fractions of the source).
 */
import fs from 'fs/promises';
import path from 'path';

function argList(name: string): string[] {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return [];
  const out: string[] = [];
  for (let k = i + 1; k < process.argv.length && !process.argv[k].startsWith('--'); k++) out.push(process.argv[k]);
  return out;
}
function arg(name: string, def?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && !process.argv[i + 1]?.startsWith('--') ? process.argv[i + 1] : def;
}

async function main() {
  const sharp = (await import('sharp')).default;
  const [fx, fy, fw, fh] = (arg('region', '0.2,0,0.6,0.5') as string).split(',').map(Number);
  const out = path.resolve(arg('out') ?? '.');
  await fs.mkdir(out, { recursive: true });
  for (const spec of argList('in')) {
    const [label, ...rest] = spec.split('=');
    const src = path.resolve(rest.join('='));
    const meta = await sharp(src).metadata();
    const W = meta.width ?? 0, H = meta.height ?? 0;
    const left = Math.round(fx * W), top = Math.round(fy * H), width = Math.round(fw * W), height = Math.round(fh * H);
    await sharp(src).extract({ left, top, width, height }).png().toFile(path.join(out, `${label}.png`));
    console.log(`  ${label}: ${width}x${height} from ${path.basename(src)}`);
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
