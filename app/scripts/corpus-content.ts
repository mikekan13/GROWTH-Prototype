/**
 * Style-LoRA corpus — CONTENT half. Plain (un-styled) content images from the Qwen-Image-2.1
 * serverless lane; a separate style-transfer step (QwenStyle on a pod) re-renders them in the
 * GROWTH look later. BILLABLE (one serverless job per image) unless --dry-run.
 *
 *   cd app
 *   npx tsx scripts/corpus-content.ts --dry-run                       # print prompts + sizes, generate nothing
 *   npx tsx scripts/corpus-content.ts --groups people,items --limit 8  # smoke
 *   npx tsx scripts/corpus-content.ts --resume                        # full set, skip ids already on disk
 *
 * Flags: --groups a,b (default all: people,beings,creatures,items,scenes,groups) · --limit N ·
 *        --out DIR (default style-refs/corpus/content; relative paths resolve from the repo root) ·
 *        --resume (skip ids whose <id>.png exists) · --dry-run.
 * Writes <out>/<id>.png (RAW, no finish), <out>/manifest.json, <out>/sheet-<group>.jpg.
 * Sequential — the endpoint runs a single worker.
 */
import './_server-only-shim';
import { config } from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
import { CORPUS_GROUPS, buildCorpusPrompts, buildCorpusContentPrompt, type CorpusGroup, type CorpusPrompt } from '../src/ai/portraits/corpus-prompts';

config({ path: '.env.local' });
config({ path: '.env' });

const EST_SECONDS_PER_IMAGE = 25;
const SHEET_COLS = 8;
const MAX_CONSECUTIVE_FAILURES = 3;

function arg(name: string, def?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : def;
}
const flag = (name: string) => process.argv.includes(`--${name}`);

interface ManifestItem {
  id: string;
  group: CorpusGroup;
  genre: string;
  prompt: string;
  size: { width: number; height: number };
  seed: number;
  imagePath: string;
  ms: number;
}

const fmtMin = (sec: number) => (sec < 90 ? `${Math.round(sec)} s` : `${(sec / 60).toFixed(1)} min`);

async function exists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}

async function main() {
  const repoRoot = path.resolve(process.cwd(), '..');
  const groupsArg = arg('groups');
  const groups = (groupsArg ? groupsArg.split(',').map(s => s.trim()).filter(Boolean) : [...CORPUS_GROUPS]) as CorpusGroup[];
  const bad = groups.filter(g => !(CORPUS_GROUPS as readonly string[]).includes(g));
  if (bad.length) {
    console.error(`Unknown group(s): ${bad.join(', ')} — valid: ${CORPUS_GROUPS.join(', ')}`);
    process.exitCode = 1;
    return;
  }
  const limitArg = arg('limit');
  const limit = limitArg ? Number(limitArg) : Infinity;
  const outArg = arg('out', path.join('style-refs', 'corpus', 'content'))!;
  const outDir = path.isAbsolute(outArg) ? outArg : path.resolve(repoRoot, outArg);
  const dryRun = flag('dry-run');
  const resume = flag('resume');

  let list: CorpusPrompt[] = buildCorpusPrompts().filter(p => groups.includes(p.group));
  if (Number.isFinite(limit)) list = list.slice(0, limit);

  if (dryRun) {
    for (const p of list) {
      console.log(`${p.id}  [${p.group}/${p.genre}]  ${p.width}x${p.height}  seed=${p.seed}\n    ${buildCorpusContentPrompt(p.prompt)}`);
    }
    const per = groups.map(g => `${g}=${list.filter(p => p.group === g).length}`).join(' ');
    console.log(`\n${list.length} prompt(s): ${per}`);
    console.log(`estimate ≈ ${fmtMin(list.length * EST_SECONDS_PER_IMAGE)} at ~${EST_SECONDS_PER_IMAGE} s/image → ${outDir} (dry run: nothing generated)`);
    return;
  }

  if (!process.env.RUNPOD_QWEN_ENDPOINT_ID || !process.env.RUNPOD_API_KEY) {
    console.error('Set RUNPOD_QWEN_ENDPOINT_ID and RUNPOD_API_KEY.');
    process.exitCode = 1;
    return;
  }

  await fs.mkdir(outDir, { recursive: true });
  const manifestPath = path.join(outDir, 'manifest.json');
  const manifest = new Map<string, ManifestItem>();
  try {
    const prev = JSON.parse(await fs.readFile(manifestPath, 'utf8')) as { items?: ManifestItem[] };
    for (const it of prev.items ?? []) manifest.set(it.id, it);
  } catch { /* fresh run */ }
  const writeManifest = () =>
    fs.writeFile(manifestPath, JSON.stringify({ updatedAt: new Date().toISOString(), items: [...manifest.values()] }, null, 2));

  const todo: CorpusPrompt[] = [];
  for (const p of list) {
    if (resume && (await exists(path.join(outDir, `${p.id}.png`)))) continue;
    todo.push(p);
  }
  console.log(`corpus content: ${todo.length} to generate (${list.length - todo.length} skipped) → ${outDir}`);
  console.log(`first estimate ≈ ${fmtMin(todo.length * EST_SECONDS_PER_IMAGE)}`);

  const { Qwen21Provider } = await import('../src/ai/portraits/providers/qwen21');
  const provider = new Qwen21Provider();

  const tStart = Date.now();
  let done = 0;
  let failures = 0;
  let streak = 0;
  for (const p of todo) {
    const t0 = Date.now();
    try {
      const r = await provider.generateContent('corpus-content', p.prompt, p.seed, { width: p.width, height: p.height });
      const file = path.join(outDir, `${p.id}.png`);
      await fs.writeFile(file, r.rawData);
      const ms = Date.now() - t0;
      manifest.set(p.id, {
        id: p.id, group: p.group, genre: p.genre, prompt: r.prompt,
        size: { width: p.width, height: p.height }, seed: p.seed, imagePath: file, ms,
      });
      await writeManifest();
      done++;
      streak = 0;
      const avg = (Date.now() - tStart) / done / 1000;
      const left = todo.length - done - failures;
      console.log(`  [${done + failures}/${todo.length}] ${p.id}  ${(ms / 1000).toFixed(1)}s  · ETA ${fmtMin(left * avg)}`);
    } catch (e) {
      failures++;
      streak++;
      console.error(`  [${done + failures}/${todo.length}] ${p.id}  FAILED: ${e instanceof Error ? e.message : String(e)}`);
      if (streak >= MAX_CONSECUTIVE_FAILURES) {
        console.error(`${MAX_CONSECUTIVE_FAILURES} failures in a row — stopping. Rerun with --resume.`);
        break;
      }
    }
  }

  // One contact sheet per group, from every image of that group now on disk (resumed ones included).
  const { buildContactSheet } = await import('../src/ai/portraits/contact-sheet');
  for (const g of groups) {
    const tiles: { image: Buffer; label: string }[] = [];
    for (const p of buildCorpusPrompts().filter(x => x.group === g)) {
      const file = path.join(outDir, `${p.id}.png`);
      if (await exists(file)) tiles.push({ image: await fs.readFile(file), label: p.id.replace(`${g}-`, '').slice(0, 40) });
    }
    if (tiles.length === 0) continue;
    const rows: (typeof tiles)[] = [];
    for (let i = 0; i < tiles.length; i += SHEET_COLS) rows.push(tiles.slice(i, i + SHEET_COLS));
    const sheet = path.join(outDir, `sheet-${g}.jpg`);
    await fs.writeFile(sheet, await buildContactSheet(rows, { tile: 320 }));
    console.log(`sheet → ${sheet} (${tiles.length})`);
  }
  console.log(`done: ${done} generated, ${failures} failed, ${fmtMin((Date.now() - tStart) / 1000)}`);
  if (failures) process.exitCode = 1;
}

main().catch(e => { console.error(e); process.exitCode = 1; });
