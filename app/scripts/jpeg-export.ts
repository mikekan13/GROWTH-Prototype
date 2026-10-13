/**
 * Export PNGs as high-quality JPEGs (full resolution) + a manifest of sizes, for the full-res comparison viewer. Free.
 *   npx tsx scripts/jpeg-export.ts --quality 92 --out DIR --in "name=path" "name=path" ...
 * Writes <out>/<name>.jpg and <out>/manifest.json [{name,width,height,file}].
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
  const quality = Number(arg('quality', '92'));
  const out = path.resolve(arg('out') ?? '.');
  await fs.mkdir(out, { recursive: true });
  const manifest: { name: string; width: number; height: number; file: string; bytes: number }[] = [];
  // --list FILE: one "name=path" per line (the Windows command line caps out around 8k chars)
  const listFile = arg('list');
  const specs = [...argList('in'), ...(listFile ? (await fs.readFile(listFile, 'utf8')).split(/\r?\n/).map(s => s.trim()).filter(Boolean) : [])];
  for (const spec of specs) {
    const [name, ...rest] = spec.split('=');
    const src = path.resolve(rest.join('='));
    const file = `${name}.jpg`;
    const info = await sharp(src).jpeg({ quality, mozjpeg: true }).toFile(path.join(out, file));
    manifest.push({ name, width: info.width, height: info.height, file, bytes: info.size });
    console.log(`  ${name}: ${info.width}x${info.height} ${Math.round(info.size / 1024)} KB`);
  }
  await fs.writeFile(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2));
}
main().catch(e => { console.error(e); process.exitCode = 1; });
