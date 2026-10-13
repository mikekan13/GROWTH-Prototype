/**
 * Qwen-Image-2.1 two-step smoke — lockIdentity on Violet's two photos, then
 * applyStyle on the lock. BILLABLE (2 serverless jobs, ~16 s GPU each + cold start).
 *
 *   cd C:\Projects\GRO.WTH\app
 *   RUNPOD_QWEN_ENDPOINT_ID=... RUNPOD_API_KEY=... npx tsx scripts/qwen21-smoke.ts [--seed N]
 *
 * Run from the LIVE app/ (photos live in app/public/uploads, gitignored).
 * Outputs: app/public/portraits/qwen21-smoke/faces/ (via savePortrait) and copies
 * in style-refs/ab-qwen-2026-10-13/smoke/{lock,styled}.png + prompts.txt.
 */
import './_server-only-shim';
import { config } from 'dotenv';
import fs from 'fs/promises';
import path from 'path';

config({ path: '.env.local' });
config({ path: '.env' });

const VIOLET_PHOTOS = [
  '/uploads/references/cmrep1oh300002g48ue1bn5rg/1e93fa73-c90a-41a7-aa58-6fcd47a484a8.jpg',
  '/uploads/references/cmrep1oh300002g48ue1bn5rg/de416bbd-8784-4d01-aaf0-8e8af8bf4809.jpg',
];

async function main() {
  if (!process.env.RUNPOD_QWEN_ENDPOINT_ID || !process.env.RUNPOD_API_KEY) {
    console.error('Set RUNPOD_QWEN_ENDPOINT_ID and RUNPOD_API_KEY.');
    process.exitCode = 1;
    return;
  }
  const seedArg = process.argv.indexOf('--seed');
  const seed = seedArg > 0 ? Number(process.argv[seedArg + 1]) : 295863446; // A/B seed

  const { Qwen21Provider, resolveQwen21StyleRefs } = await import('../src/ai/portraits/providers/qwen21');
  const outDir = path.resolve(process.cwd(), '..', 'style-refs', 'ab-qwen-2026-10-13', 'smoke');
  await fs.mkdir(outDir, { recursive: true });

  const styleRefs = await resolveQwen21StyleRefs();
  console.log(`style refs (${styleRefs.length}):\n  ${styleRefs.join('\n  ')}`);

  const provider = new Qwen21Provider();
  const t0 = Date.now();
  const lock = await provider.lockIdentity('qwen21-smoke', VIOLET_PHOTOS, seed);
  const tLock = Date.now() - t0;
  await fs.writeFile(path.join(outDir, 'lock.png'), lock.imageData);
  console.log(`lock    ${(tLock / 1000).toFixed(1)}s  ${lock.width}x${lock.height}  ${lock.imagePath}`);

  const t1 = Date.now();
  const single = (process.env.QWEN21_STYLE_MODE || 'single') === 'single';
  if (single) console.log('single mode: the painted lock is the styled bust (no second pass)');
  const styled = single ? lock : await provider.applyStyle('qwen21-smoke', lock.rawData, seed, styleRefs);
  const tStyle = Date.now() - t1;
  await fs.writeFile(path.join(outDir, 'styled.png'), styled.imageData);
  console.log(`styled  ${(tStyle / 1000).toFixed(1)}s  ${styled.width}x${styled.height}  ${styled.imagePath}`);

  await fs.writeFile(
    path.join(outDir, 'prompts.txt'),
    `seed ${seed}\nlock ${tLock} ms\nstyled ${tStyle} ms\n\nLOCK:\n${lock.prompt}\n\nSTYLE:\n${styled.prompt}\n\nSTYLE REFS:\n${styleRefs.join('\n')}\n`,
  );
  console.log(`total   ${((Date.now() - t0) / 1000).toFixed(1)}s → ${outDir}`);
}

main().catch(e => { console.error(e); process.exitCode = 1; });
