/**
 * Approve an image for the GROWTH style set: copies its RAW version (the
 * unfinished model output — the future LoRA training set) into
 * <repo>/style-refs/approved/ with a sidecar JSON (source, raw, seed, mood, date).
 * Note: the Qwen refs/prose style modes read style-refs/approved/*.png as style refs.
 *
 *   cd C:\Projects\GRO.WTH\app
 *   npx tsx scripts/approve-image.ts <png> [--note "why"]
 *
 * <png> may be a finished image (its raw is found at <dir>/raw/<name>.png), the
 * raw itself, or a savePortrait .thumbs/<id>.webp path. Seed + mood come from the
 * portrait's .thumbs/<id>.meta.json, or the style lab's lab.json + seed-<s> name.
 */
import fs from 'fs/promises';
import path from 'path';
import { rawSiblingPath } from '../src/ai/portraits/finish';

async function exists(p: string): Promise<boolean> {
  try { await fs.access(p); return true; } catch { return false; }
}

async function readJson(p: string): Promise<Record<string, unknown> | null> {
  try { return JSON.parse(await fs.readFile(p, 'utf-8')); } catch { return null; }
}

async function main() {
  const src = process.argv[2];
  if (!src || src.startsWith('--')) {
    console.error('usage: npx tsx scripts/approve-image.ts <png> [--note "why"]');
    process.exitCode = 1;
    return;
  }
  const noteIdx = process.argv.indexOf('--note');
  const note = noteIdx > 0 ? process.argv[noteIdx + 1] : undefined;

  const abs = path.resolve(src);
  if (!(await exists(abs))) throw new Error(`not found: ${abs}`);
  const isRaw = path.basename(path.dirname(abs)) === 'raw';
  const raw = isRaw ? abs : path.resolve(rawSiblingPath(abs));
  if (!(await exists(raw))) {
    throw new Error(`no RAW copy at ${raw} — only images saved since the FINISH layer (or by the style lab) have one`);
  }

  const name = path.basename(raw, path.extname(raw));
  const dir = path.dirname(path.dirname(raw)); // <dir>/raw/<name>.png → <dir>
  const meta = (await readJson(path.join(dir, '.thumbs', `${name}.meta.json`))) ?? {};
  const lab = (await readJson(path.join(dir, 'lab.json'))) ?? {};
  const seedFromName = name.match(/seed-(\d+)/)?.[1];
  const seed = (meta.seed as number | undefined) ?? (seedFromName ? Number(seedFromName) : null);
  const mood = (meta.mood as string | undefined) ?? (lab.mood as string | undefined) ?? null;

  const date = new Date().toISOString();
  const approvedDir = path.resolve(process.cwd(), '..', 'style-refs', 'approved');
  await fs.mkdir(approvedDir, { recursive: true });
  // Include the lab run id (its folder name) so the same seed from two sheets never overwrites.
  const labId = Object.keys(lab).length > 0 ? path.basename(dir).replace(/[^A-Za-z0-9-]/g, '') : '';
  const destName = `${date.slice(0, 10)}-${mood ? `${mood.replace(/\s+/g, '-')}-` : ''}${labId ? `${labId}-` : ''}${name}`;
  const dest = path.join(approvedDir, `${destName}.png`);
  await fs.copyFile(raw, dest);
  await fs.writeFile(
    path.join(approvedDir, `${destName}.json`),
    JSON.stringify({ source: abs, raw, seed, mood, date, ...(note ? { note } : {}), ...(lab.mediumFile ? { mediumFile: lab.mediumFile } : {}) }, null, 2),
  );
  console.log(`approved (raw) → ${dest}`);
}

main().catch(e => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; });
