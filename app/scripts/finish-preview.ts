/**
 * FINISH PREVIEW — compare the FINISH layer (incl. the ink pass) on a saved RAW
 * image WITHOUT a generation. Offline, free, deterministic.
 *
 *   cd C:\Projects\GRO.WTH\app
 *   npx tsx scripts/finish-preview.ts ../style-refs/lab/<run>/raw/seed-8.png
 *   npx tsx scripts/finish-preview.ts <raw.png> --ink 0.6 --out ../style-refs/lab/ink-preview
 *
 * Flags:
 *   --ink A      ink amount for <name>-finished.png and the "default" column (default FINISH.ink.amount)
 *   --out DIR    output dir (default: next to the input)
 *   --seed S     grain seed (default: the number in the file name, else 1)
 *
 * Writes <name>-finished.png and <name>-compare.jpg
 * (raw | finished ink 0 | finished ink A | finished ink A×1.5, labelled).
 */
import fs from 'fs/promises';
import path from 'path';
import { FINISH, finishImage, type FinishParams } from '../src/ai/portraits/finish';
import { buildContactSheet } from '../src/ai/portraits/contact-sheet';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const input = process.argv[2];
  if (!input || input.startsWith('--')) {
    console.error('usage: npx tsx scripts/finish-preview.ts <raw.png> [--ink 0..1] [--out dir] [--seed S]');
    process.exitCode = 1;
    return;
  }
  const raw = await fs.readFile(path.resolve(input));
  const name = path.basename(input).replace(/\.[^.]+$/, '');
  const outDir = path.resolve(arg('out') ?? path.dirname(input));
  await fs.mkdir(outDir, { recursive: true });
  const amount = arg('ink') !== undefined ? Number(arg('ink')) : FINISH.ink.amount;
  if (!Number.isFinite(amount) || amount < 0) throw new Error(`--ink must be a number ≥ 0, got ${arg('ink')}`);
  const seed = Number(arg('seed') ?? name.match(/\d+/)?.[0] ?? 1);

  const at = (a: number): FinishParams => ({ ...FINISH, ink: { ...FINISH.ink, amount: a } });
  const env = {}; // ignore GROWTH_FINISH_INK here — the preview always shows the ink
  const [f0, fA, fB] = await Promise.all([
    finishImage(raw, seed, at(0), env),
    finishImage(raw, seed, at(amount), env),
    finishImage(raw, seed, at(Math.min(1, amount * 1.5)), env),
  ]);
  const finishedPath = path.join(outDir, `${name}-finished.png`);
  await fs.writeFile(finishedPath, fA);

  const { width, threshold, teal } = FINISH.ink;
  const sheet = await buildContactSheet(
    [[
      { image: raw, label: 'raw' },
      { image: f0, label: 'finish · ink 0' },
      { image: fA, label: `ink ${amount.toFixed(2)} w${width} t${threshold} teal${teal}` },
      { image: fB, label: `ink ${Math.min(1, amount * 1.5).toFixed(2)} (×1.5)` },
    ]],
    { tile: 600, label: 28, gap: 8, quality: 92 },
  );
  const comparePath = path.join(outDir, `${name}-compare.jpg`);
  await fs.writeFile(comparePath, sheet);
  console.log(`wrote ${finishedPath}\nwrote ${comparePath}`);
}

main().catch(err => {
  console.error(err);
  process.exitCode = 1;
});
