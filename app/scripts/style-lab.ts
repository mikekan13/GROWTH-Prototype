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
 *   --frame-ref PATH     pose skeleton fed as the last image (default: the shipped lock-pose-grey.png); --no-frame-ref = none
 *   --prep               run the photo preparer (vision check + face-tight passport crop) on the photos first, like the live lock
 *   --ink-mid 0.4,0.5    MID-GENERATION INK per seed: stop at each fraction, ink the soft midpoint (finish.ts inkImage,
 *                        lines only; --ink-amount / --ink-threshold / --ink-width / --ink-color HEX override FINISH.ink), resume to the end; extra sheet rows +
 *                        sheet-ink-stages.jpg (soft/inked); files under <out>/inkmid-<f>/. Two extra jobs per fraction.
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
  const { FINISH, finishImage, inkImage } = await import('../src/ai/portraits/finish');
  // --ink-mid 0.4,0.5,0.75: MID-GENERATION INK — stop each lock at that fraction, draw the ink on the soft midpoint
  // image (finish.ts inkImage, lines only), resume to the end; saves soft/inked/final under <out>/inkmid-<f>/.
  const inkMid = (arg('ink-mid') ?? '').split(',').map(s => Number(s.trim())).filter(f => Number.isFinite(f) && f > 0 && f < 1);
  const inkAmount = Number(arg('ink-amount') ?? FINISH.ink.amount);
  // The midpoint image is smoother than a finished one, so its edges are weaker: --ink-threshold lowers the edge gate
  // (FINISH default 0.06) and --ink-width thickens the pen so the lines survive the remaining denoise.
  const inkThreshold = Number(arg('ink-threshold') ?? FINISH.ink.threshold);
  const inkWidth = Number(arg('ink-width') ?? FINISH.ink.width);
  const inkColor = arg('ink-color'); // hex, e.g. 582a72 (Spirit purple); default = the near-black pen
  // --ink-lora-b S: LoRA strength for the RESUME stage only (the last steps that finish skin/eyes) — lower = more photo.
  const inkLoraB = arg('ink-lora-b') !== undefined ? Number(arg('ink-lora-b')) : undefined;
  const inkLight = arg('ink-light'); // hex for a LIGHT pen (lit side of edges), e.g. ffcc78 GROWTH gold; --ink-auto switches by scene brightness
  const inkAuto = process.argv.includes('--ink-auto');
  const inkParams = { ...FINISH.ink, amount: inkAmount, threshold: inkThreshold, width: inkWidth, ...(inkColor ? { color: inkColor } : {}), ...(inkLight ? { lightColor: inkLight, auto: inkAuto } : {}) };
  if (inkMid.length) console.log(`ink-mid: ${inkMid.join(', ')} — amount ${inkAmount}, threshold ${inkThreshold}, width ${inkWidth}, color ${inkColor ?? 'default'}`);
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
  let photos: Buffer[] = await Promise.all(photoPaths.map(p => fs.readFile(p)));
  // --prep: run the PHOTO PREPARER (photo-prep.ts: vision check + face-tight passport crop) on each photo first, the
  // way the live lock does for stored uploads; the crops and checks are saved under <out>/prep/ for inspection.
  const prep = process.argv.includes('--prep');
  // --frame-ref PATH: a pose skeleton (OpenPose keypoint map) fed as the LAST image; default = the shipped
  // src/ai/portraits/refs/lock-pose-grey.png (same as the live lock); --no-frame-ref = none.
  const frameRefPath = arg('frame-ref');
  const frameRef: Buffer | false | undefined = process.argv.includes('--no-frame-ref') ? false : frameRefPath ? await fs.readFile(path.resolve(frameRefPath)) : undefined;
  console.log(`pose ref: ${frameRef === false ? 'none' : frameRefPath ? path.resolve(frameRefPath) : 'default (src/ai/portraits/refs/lock-pose-grey.png)'}`);

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outDir = path.resolve(arg('out') ?? path.join('..', 'style-refs', 'lab', `${stamp}-${mood.replace(/\s+/g, '-')}`));
  await fs.mkdir(path.join(outDir, 'raw'), { recursive: true });
  if (prep) {
    const { preparePhoto } = await import('../src/ai/portraits/photo-prep');
    await fs.mkdir(path.join(outDir, 'prep'), { recursive: true });
    const prepared: Buffer[] = [];
    for (let i = 0; i < photos.length; i++) {
      const t0 = Date.now();
      const r = await preparePhoto(photos[i], { meter: false });
      const tag = `photo-${i + 1}`;
      await fs.writeFile(path.join(outDir, 'prep', `${tag}.json`), JSON.stringify({ source: photoPaths[i], cropped: r.cropped, rect: r.rect ?? null, check: r.check }, null, 2));
      if (r.cropped && r.image) await fs.writeFile(path.join(outDir, 'prep', `${tag}.prep.jpg`), r.image);
      console.log(`  prep ${tag}: ${r.cropped ? 'cropped' : 'UNCHANGED'} (${((Date.now() - t0) / 1000).toFixed(1)}s)${r.check.warnings.length ? ` — ${r.check.warnings.join('; ')}` : ''}${r.check.unavailable ? ` — ${r.check.unavailable}` : ''}`);
      prepared.push(r.cropped && r.image ? r.image : photos[i]);
    }
    photos = prepared;
  }
  if (moodArg.toLowerCase() !== mood) console.log(`mood "${moodArg}" → ${mood}`);
  console.log(`style lab: ${n} seed(s) from ${seedStart}, mood=${mood}, finish=${noFinish ? 'off' : 'on'}, loras=${loraSpec || 'none'}, ${photos.length} photo(s) → ${outDir}`);

  const provider = new Qwen21Provider();
  provider.setLoras(loras);
  const rawRow: { image: Buffer; label: string; note?: string; noteWarn?: boolean }[] = [];
  const finRow: { image: Buffer; label: string; note?: string; noteWarn?: boolean }[] = [];
  const gates: Record<number, { pass: boolean; reasons: string[]; score: number }> = {};
  const inkRows: Record<number, { image: Buffer; label: string; note?: string; noteWarn?: boolean }[]> = {};
  const inkStages: Record<number, { image: Buffer; label: string }[]> = {};
  const seeds: number[] = [];
  let prompt = '';
  for (let k = 0; k < n; k++) {
    const seed = seedStart + k;
    const t0 = Date.now();
    const r = await provider.renderLock(photos, seed, { painted: true, mood, medium, frameRef });
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

    // MID-GENERATION INK: stop at f → soft midpoint image → ink lines → resume from the inked image at f.
    for (const f of inkMid) {
      const dir = path.join(outDir, `inkmid-${f}`);
      await fs.mkdir(dir, { recursive: true });
      const t1 = Date.now();
      const soft = await provider.renderLock(photos, seed, { painted: true, mood, medium, frameRef, stage: { stopAt: f } });
      const inked = await inkImage(soft.raw, inkParams);
      const lorasB = inkLoraB !== undefined ? loras.map(l => ({ ...l, strength: inkLoraB })) : undefined;
      const done = await provider.renderLock(photos, seed, { painted: true, mood, medium, frameRef, loras: lorasB, stage: { resumeFrom: { image: inked, at: f } } });
      await fs.writeFile(path.join(dir, `soft-seed-${seed}.png`), soft.raw);
      await fs.writeFile(path.join(dir, `inked-seed-${seed}.png`), inked);
      await fs.writeFile(path.join(dir, `final-seed-${seed}.png`), done.raw);
      let fnote: string | undefined; let fwarn = false;
      if (gate) {
        const v = await checkBaseLock(done.raw);
        fnote = v.pass ? 'PASS' : `FAIL: ${v.reasons.join('; ')}`; fwarn = !v.pass;
      }
      (inkRows[f] ??= []).push({ image: done.raw, label: `seed ${seed} · ink@${Math.round(f * 100)}%${inkLoraB !== undefined ? ` · loraB ${inkLoraB}` : ''} · final`, note: fnote, noteWarn: fwarn });
      (inkStages[f] ??= []).push({ image: soft.raw, label: `seed ${seed} · soft@${Math.round(f * 100)}%` }, { image: inked, label: `seed ${seed} · inked@${Math.round(f * 100)}%` });
      console.log(`  ink@${f} seed ${seed}  ${((Date.now() - t1) / 1000).toFixed(1)}s${fnote ? `  gate: ${fnote}` : ''}`);
    }
  }

  const inkSheetRows = inkMid.map(f => inkRows[f] ?? []).filter(r => r.length);
  await fs.writeFile(path.join(outDir, 'sheet.jpg'), await buildContactSheet([...(noFinish ? [rawRow] : [rawRow, finRow]), ...inkSheetRows]));
  if (inkSheetRows.length) {
    await fs.writeFile(path.join(outDir, 'sheet-ink-stages.jpg'), await buildContactSheet(inkMid.map(f => inkStages[f] ?? []).filter(r => r.length)));
  }
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
