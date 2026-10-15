/**
 * LAB: the APPROVE clean re-render (polish) on a stored image, at one or more resume points.
 *   cd app && npx tsx scripts/lab-polish.ts <public web path, e.g. /portraits/<id>/bodies/x.png> [--at 0.7,0.55] [--seed N] [--out DIR]
 * Billable: one Qwen generation per `at`. Writes polish-<at>.png beside a copy of the source.
 */
import './_server-only-shim';
import { config } from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
config({ path: '.env.local', quiet: true });
config({ path: '.env', quiet: true });

function arg(name: string, def: string): string {
  const i = process.argv.indexOf(name);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : def;
}

async function main() {
  const webPath = process.argv[2];
  if (!webPath || !webPath.startsWith('/portraits/')) throw new Error('usage: <web path under /portraits/...> [--at 0.7,0.55] [--seed N] [--out DIR]');
  const ats = arg('--at', '0.7').split(',').map(Number).filter(n => n > 0 && n < 1);
  const seed = Number(arg('--seed', String(Math.floor(Math.random() * 2147483647))));
  const outDir = arg('--out', path.resolve('..', 'style-refs', 'lab', 'polish'));
  await fs.mkdir(outDir, { recursive: true });
  const { Qwen21Provider } = await import('../src/ai/portraits/providers/qwen21');
  const provider = new Qwen21Provider();
  await fs.copyFile(path.join('public', webPath.replace(/^\//, '')), path.join(outDir, 'source' + path.extname(webPath)));
  for (const at of ats) {
    const t0 = Date.now();
    const r = await provider.polish('lab-polish', webPath, seed, webPath.includes('/bodies/') ? 'bodies' : 'faces', undefined, at);
    const out = path.join(outDir, `polish-${at}.png`);
    await fs.writeFile(out, r.imageData);
    console.log(`at=${at} seed=${seed} ${Date.now() - t0} ms → ${out} (saved by the provider at ${r.imagePath})`);
  }
}
main().catch(e => { console.error(e); process.exit(1); });
