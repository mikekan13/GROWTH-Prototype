/**
 * STYLE LAB — iterate the GROWTH look with Mike (three layers: MEDIUM + MOOD in the
 * prompt, FINISH after). Runs the single-pass painted lock N times (different seeds)
 * on the same photos, saves raw + finished, and builds a labelled contact sheet.
 * BILLABLE: N serverless jobs (~35 s warm each, ~80 s cold start).
 *
 *   cd C:\Projects\GRO.WTH\app
 *   npx tsx scripts/style-lab.ts --seeds 4 --mood horror
 *   npx tsx scripts/style-lab.ts --seeds 4 --mood growth --medium-file ../style-refs/medium-try.txt
 *
 * Flags:
 *   --seeds N            how many seeds (default 4)
 *   --seed-start S       first seed (default 7, the 13 Oct live seed); seeds S, S+1, ...
 *   --mood KEY|GENRE     mood key or free-text genre (default growth)
 *   --photos DIR         identity photos (jpg/png/webp, first 16); default = Violet's two
 *   --out DIR            default <repo>/style-refs/lab/<timestamp>-<mood>/
 *   --medium-file PATH   replace the MEDIUM prose with this file's text (no code edit)
 *   --no-finish          skip the FINISH layer (raw only)
 *   --loras SPEC         LoRA blend, file:strength[:trigger],... (overrides QWEN21_LORAS; "" = none). Default
 *                        (env unset) = the GROWTH style LoRA grwthpaint_v1 at 0.7 (every gen), which also strips
 *                        the MEDIUM paragraph from the prompt (Mike, 14 Oct)
 *   --gate               run the BASE-LOCK GATE (lock-gate.ts; vision = VISION_PROVIDER, pod
 *                        default — never localhost) on each raw seed; PASS/FAIL + reasons
 *                        printed under each tile (default off)
 *
 * Output: seed-<s>.png (finished), raw/seed-<s>.png, sheet.jpg (row 1 raw, row 2
 * finished), prompts.txt, lab.json (seed list + mood, read by approve-image.ts).
 * Needs RUNPOD_QWEN_ENDPOINT_ID + RUNPOD_API_KEY (.env.local).
 */
import './_server-only-shim';
import { config } from 'dotenv';
import fs from 'fs/promises';
import path from 'path';

config({ path: '.env.local' });
config({ path: '.env' });

const VIOLET_PHOTOS = [
  'public/uploads/references/cmrep1oh300002g48ue1bn5rg/1e93fa73-c90a-41a7-aa58-6fcd47a484a8.jpg',
  'public/uploads/references/cmrep1oh300002g48ue1bn5rg/de416bbd-8784-4d01-aaf0-8e8af8bf4809.jpg',
];
const IMAGE_EXT = /\.(png|jpe?g|webp)$/i;

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  if (!process.env.RUNPOD_QWEN_ENDPOINT_ID || !process.env.RUNPOD_API_KEY) {
    console.error('Set RUNPOD_QWEN_ENDPOINT_ID and RUNPOD_API_KEY.');
    process.exitCode = 1;
    return;
  }
  const { Qwen21Provider } = await import('../src/ai/portraits/providers/qwen21');
  const { FINISH, finishImage } = await import('../src/ai/portraits/finish');
  const { buildContactSheet } = await import('../src/ai/portraits/contact-sheet');
  const { checkBaseLock } = await import('../src/ai/portraits/lock-gate');
  const { GROWTH_MEDIUM, getCampaignMood, resolveMoodKey } = await import('../src/ai/portraits/style-config');
  const { parseQwen21Loras, qwen21LorasFromEnv, formatQwen21Loras, qwen21LoraLabel, hasGrowthStyleLora } = await import('../src/ai/portraits/qwen21-workflow');

  const n = Math.max(1, Number(arg('seeds') ?? 4));
  const seedStart = Number(arg('seed-start') ?? 7);
  const moodArg = arg('mood') ?? 'growth';
  const mood = resolveMoodKey(moodArg);
  const noFinish = process.argv.includes('--no-finish');
  const gate = process.argv.includes('--gate');
  if (gate) {
    const { resolveVisionProvider } = await import('../src/ai/network/vision');
    console.log(`gate vision provider: ${resolveVisionProvider()} (VISION_PROVIDER)`);
  }
  // --loras "" is dropped by PowerShell; a bare --loras (end of line or followed by another flag) also means none.
  const lorasIdx = process.argv.indexOf('--loras');
  const lorasNext = lorasIdx > 0 ? process.argv[lorasIdx + 1] : undefined;
  const lorasArg = lorasIdx < 0 ? undefined : (lorasNext === undefined || lorasNext.startsWith('--')) ? '' : lorasNext;
  const loras = lorasArg !== undefined ? parseQwen21Loras(lorasArg) : qwen21LorasFromEnv();
  const loraSpec = formatQwen21Loras(loras);
  const loraTag = loras.length ? ` · ${qwen21LoraLabel(loras)}` : '';
  // Mike (14 Oct): with the GROWTH style LoRA active the medium paragraph is stripped (same rule as the live lock).
  const mediumFile = arg('medium-file');
  const medium = mediumFile ? (await fs.readFile(path.resolve(mediumFile), 'utf-8')).trim() : hasGrowthStyleLora(loras) ? '' : GROWTH_MEDIUM;

  const photosDir = arg('photos');
  const photoPaths = photosDir
    ? (await fs.readdir(path.resolve(photosDir))).filter(f => IMAGE_EXT.test(f)).sort().slice(0, 16).map(f => path.join(path.resolve(photosDir), f))
    : VIOLET_PHOTOS.map(p => path.resolve(p));
  if (photoPaths.length === 0) throw new Error(`no photos in ${photosDir}`);
  const photos = await Promise.all(photoPaths.map(p => fs.readFile(p)));

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outDir = path.resolve(arg('out') ?? path.join('..', 'style-refs', 'lab', `${stamp}-${mood.replace(/\s+/g, '-')}`));
  await fs.mkdir(path.join(outDir, 'raw'), { recursive: true });
  if (moodArg.toLowerCase() !== mood) console.log(`mood "${moodArg}" → ${mood}`);
  console.log(`style lab: ${n} seed(s) from ${seedStart}, mood=${mood}, finish=${noFinish ? 'off' : 'on'}, loras=${loraSpec || 'none'}, ${photos.length} photo(s) → ${outDir}`);

  const provider = new Qwen21Provider();
  provider.setLoras(loras);
  const rawRow: { image: Buffer; label: string; note?: string; noteWarn?: boolean }[] = [];
  const finRow: { image: Buffer; label: string; note?: string; noteWarn?: boolean }[] = [];
  const gates: Record<number, { pass: boolean; reasons: string[]; score: number }> = {};
  const seeds: number[] = [];
  let prompt = '';
  for (let k = 0; k < n; k++) {
    const seed = seedStart + k;
    const t0 = Date.now();
    const r = await provider.renderLock(photos, seed, { painted: true, mood, medium });
    prompt = r.prompt;
    await fs.writeFile(path.join(outDir, 'raw', `seed-${seed}.png`), r.raw);
    // Gate the RAW (what lockIdentity judges) — local vision only (privacy wall).
    let note: string | undefined;
    let noteWarn = false;
    if (gate) {
      const v = await checkBaseLock(r.raw);
      gates[seed] = { pass: v.pass, reasons: v.reasons, score: v.score };
      note = v.pass ? `PASS${v.reasons.length ? ` (${v.reasons.join('; ')})` : ''}` : `FAIL: ${v.reasons.join('; ')}`;
      noteWarn = !v.pass;
      console.log(`    gate: ${note}`);
    }
    rawRow.push({ image: r.raw, label: `seed ${seed} · ${mood}${loraTag} · raw`, note, noteWarn });
    if (!noFinish) {
      const fin = await finishImage(r.raw, seed);
      await fs.writeFile(path.join(outDir, `seed-${seed}.png`), fin);
      finRow.push({ image: fin, label: `seed ${seed} · ${mood}${loraTag} · finished`, note, noteWarn });
    }
    seeds.push(seed);
    console.log(`  seed ${seed}  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }

  await fs.writeFile(path.join(outDir, 'sheet.jpg'), await buildContactSheet(noFinish ? [rawRow] : [rawRow, finRow]));
  await fs.writeFile(
    path.join(outDir, 'prompts.txt'),
    [
      `mood: ${mood}${moodArg.toLowerCase() !== mood ? ` (from "${moodArg}")` : ''}`,
      `seeds: ${seeds.join(', ')}`,
      `photos: ${photoPaths.join(' | ')}`,
      `medium: ${mediumFile ? `file ${path.resolve(mediumFile)}` : medium ? 'GROWTH_MEDIUM (style-config.ts)' : 'none (stripped — GROWTH style LoRA active)'}`,
      `finish: ${noFinish ? 'off' : JSON.stringify(FINISH)}`,
      `loras: ${loraSpec || 'none'}${loras.length ? ` (${qwen21LoraLabel(loras)}; triggers prepended to the prompt)` : ''}`,
      '',
      'MEDIUM:', medium, '',
      'MOOD:', getCampaignMood(mood), '',
      'LOCK PROMPT (same for every seed):', prompt, '',
    ].join('\n'),
  );
  await fs.writeFile(
    path.join(outDir, 'lab.json'),
    JSON.stringify({ mood, seeds, ...(gate ? { gate: gates } : {}), medium, mediumFile: mediumFile ?? null, loras: loraSpec || null, finish: noFinish ? null : FINISH, photos: photoPaths, date: new Date().toISOString() }, null, 2),
  );
  console.log(`sheet → ${path.join(outDir, 'sheet.jpg')}`);
  console.log(`approve one: npx tsx scripts/approve-image.ts "${path.join(outDir, `seed-${seeds[0]}.png`)}"`);
}

main().catch(e => { console.error(e); process.exitCode = 1; });
