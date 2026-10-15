/**
 * LIGHT PEN TEST (Mike, 14 Oct: "switch the lines to actually be bright … GRO.WTH Gold… or close to white with a slight
 * tint"): two bright subjects, same seeds as the v1 set, the v1 recipe, with the mid-generation ink drawn by
 * (a) the dark pen (as shipped), (b) GROWTH gold ffcc78 on the lit side, (c) warm off-white f2e9d8 on the lit side.
 *
 *   cd app && npx tsx scripts/style-light-ink.ts
 * Output: style-refs/lab/2026-10-14-light-ink/<subject>-<pen>.png (+ inked midpoints) + sheet.jpg. 2 jobs per image.
 */
import './_server-only-shim';
import { config } from 'dotenv';
import fs from 'fs/promises';
import path from 'path';
config({ path: '.env.local', quiet: true });
config({ path: '.env', quiet: true });

const LANDSCAPE = { width: 1248, height: 832 } as const;
const SUBJECTS = [
  { id: 'market', seed: 1070472458, size: LANDSCAPE,
    text: 'An open-air market in a wide stone square at noon, striped awnings in red, saffron and teal, stalls of fruit, bolts of cloth and brass lamps, people haggling and children weaving between the stalls, lit by hard high sunlight with bright bounce from the pale flagstones.' },
  { id: 'fox', seed: 185628284, size: LANDSCAPE,
    text: 'A white fox-like animal with six legs and a long plumed tail standing alert on a snowfield, its fur glittering, under a cloudless deep-blue sky with distant white mountains, lit by hard bright sunlight from the right casting a crisp blue shadow.' },
];
const PENS: { id: string; ink: Record<string, unknown> }[] = [
  { id: 'dark', ink: {} },
  { id: 'gold', ink: { lightColor: 'ffcc78' } },
  { id: 'offwhite', ink: { lightColor: 'f2e9d8' } },
];

function brightMood(mood: string): string {
  return mood.replace(/,?\s*low-key lighting with one side falling into deep, somber shadow,?\s*a dark moody ground behind,?\s*and a cold teal undertone in the shadows,?/i, ',')
    .replace(/\s+,/g, ',').replace(/,\s*,/g, ',').replace(/:\s*,/g, ':').replace(/\s{2,}/g, ' ');
}

async function main() {
  const { Qwen21Provider } = await import('../src/ai/portraits/providers/qwen21');
  const { getCampaignMood } = await import('../src/ai/portraits/style-config');
  const { buildContactSheet } = await import('../src/ai/portraits/contact-sheet');
  const { FINISH, inkImage } = await import('../src/ai/portraits/finish');
  const { qwen21LockInkAtFromEnv } = await import('../src/ai/portraits/qwen21-workflow');

  const outDir = path.resolve(path.join('..', 'style-refs', 'lab', '2026-10-14-light-ink'));
  await fs.mkdir(path.join(outDir, 'stages'), { recursive: true });
  const provider = new Qwen21Provider();
  const mood = brightMood(getCampaignMood('growth'));
  const inkAt = qwen21LockInkAtFromEnv();

  const rows: { image: Buffer; label: string }[][] = [];
  for (const s of SUBJECTS) {
    const prompt = `${s.text} ${mood}`;
    // One stop job per subject; the three pens share the same clean midpoint, then three resume jobs.
    const softFile = path.join(outDir, 'stages', `${s.id}.soft.png`);
    let soft: Buffer;
    try { soft = await fs.readFile(softFile); } catch {
      soft = (await (provider as unknown as { runStyledStage: (p: string, seed: number, size: { width: number; height: number }, st: { stopAt: number }) => Promise<Buffer> }).runStyledStage(prompt, s.seed, s.size, { stopAt: inkAt }));
      await fs.writeFile(softFile, soft);
    }
    const row: { image: Buffer; label: string }[] = [];
    for (const pen of PENS) {
      const file = path.join(outDir, `${s.id}-${pen.id}.png`);
      let image: Buffer;
      try { image = await fs.readFile(file); console.log(`  ${s.id} ${pen.id}: exists`); }
      catch {
        const t0 = Date.now();
        const inked = await inkImage(soft, { ...FINISH.ink, ...pen.ink } as typeof FINISH.ink);
        await fs.writeFile(path.join(outDir, 'stages', `${s.id}-${pen.id}.inked.png`), inked);
        image = await (provider as unknown as { runStyledStage: (p: string, seed: number, size: { width: number; height: number }, st: { resumeFrom: { image: Buffer; at: number } }) => Promise<Buffer> }).runStyledStage(prompt, s.seed, s.size, { resumeFrom: { image: inked, at: inkAt } });
        await fs.writeFile(file, image);
        console.log(`  ${s.id} ${pen.id}  ${((Date.now() - t0) / 1000).toFixed(1)}s`);
      }
      row.push({ image, label: `${s.id} · pen ${pen.id}` });
    }
    rows.push(row);
  }
  await fs.writeFile(path.join(outDir, 'sheet.jpg'), await buildContactSheet(rows, { tile: 420 }));
  console.log(`sheet → ${path.join(outDir, 'sheet.jpg')}`);
}

main().catch(e => { console.error(e); process.exitCode = 1; });
