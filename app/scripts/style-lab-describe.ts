/**
 * Style lab — DESCRIBE mode: text-only bases (no photos) in the fixed base composition,
 * for building a diverse style-LoRA training set. BILLABLE (one serverless job per image).
 *
 *   cd app
 *   npx tsx scripts/style-lab-describe.ts --subjects "an elderly dwarf smith|a young Et'herling scout" --seeds 1 [--mood growth] [--out DIR]
 *
 * Writes <out>/<slug>-seed-N.png (finished), <out>/raw/<slug>-seed-N.png (raw), sheet.jpg, lab.json, prompts.txt.
 */
import './_server-only-shim';
import { config } from 'dotenv';
import fs from 'fs/promises';
import path from 'path';

config({ path: '.env.local' });
config({ path: '.env' });

function arg(name: string, def?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? process.argv[i + 1] : def;
}

const DEFAULT_SUBJECTS = [
  'a weathered elderly dwarf smith with a braided grey beard',
  'a young woman scout with close-cropped black hair and dark brown skin',
];

async function main() {
  if (!process.env.RUNPOD_QWEN_ENDPOINT_ID || !process.env.RUNPOD_API_KEY) {
    console.error('Set RUNPOD_QWEN_ENDPOINT_ID and RUNPOD_API_KEY.');
    process.exitCode = 1;
    return;
  }
  const subjects = (arg('subjects') ?? DEFAULT_SUBJECTS.join('|')).split('|').map(s => s.trim()).filter(Boolean);
  const seeds = Number(arg('seeds', '1'));
  const seed0 = Number(arg('seed', '7'));
  const mood = arg('mood', 'growth');
  const training = process.argv.includes('--training'); // look-first, free pose, clothing + setting from the description
  // Mike (13 Oct): every sheet carries the gold standard as its first tile for side-by-side comparison.
  const ANCHOR = path.resolve(process.cwd(), '..', 'style-refs', 'STYLE-ANCHOR-2026-10-13-sheet6-seed8.png');
  const refFile = arg('style-ref-file'); // a specific reference image (e.g. a desaturated / headless anchor variant)
  const styleRef = refFile ? path.resolve(refFile) : process.argv.includes('--style-ref') ? ANCHOR : undefined; // hand it to the model as <image1>
  const bothVariants = process.argv.includes('--both'); // each subject twice: without and with the style ref
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outDir = path.resolve(arg('out') ?? path.join(process.cwd(), '..', 'style-refs', 'lab', `${stamp}-describe${training ? '-training' : ''}-${mood}`));
  await fs.mkdir(path.join(outDir, 'raw'), { recursive: true });

  const { Qwen21Provider } = await import('../src/ai/portraits/providers/qwen21');
  const { buildContactSheet } = await import('../src/ai/portraits/contact-sheet');
  const provider = new Qwen21Provider();

  console.log(`describe lab: ${subjects.length} subject(s) × ${seeds} seed(s) from ${seed0}, mood=${mood} → ${outDir}`);
  const anchorBuf = await fs.readFile(ANCHOR).catch(() => null);
  const rows: { image: Buffer; label: string }[][] = [[], []];
  if (anchorBuf) {
    rows[0].push({ image: anchorBuf, label: 'GOLD STANDARD · sheet 6 seed 8' });
    rows[1].push({ image: anchorBuf, label: 'GOLD STANDARD · sheet 6 seed 8' });
  }
  const prompts: string[] = [];
  const manifest: Record<string, unknown>[] = [];
  const variants: (string | undefined)[] = bothVariants ? [undefined, ANCHOR] : [styleRef];
  for (const subject of subjects) {
    const slug = subject.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
    for (let i = 0; i < seeds; i++) {
      const seed = seed0 + i;
      for (const ref of variants) {
        const tag = ref ? 'styleref' : 'noref';
        const t0 = Date.now();
        const r = await provider.describeBase('style-lab-describe', subject, seed, mood, { training, styleRefPath: ref });
        const secs = ((Date.now() - t0) / 1000).toFixed(1);
        const base = `${slug}-${tag}-seed-${seed}`;
        await fs.writeFile(path.join(outDir, `${base}.png`), r.imageData);
        await fs.writeFile(path.join(outDir, 'raw', `${base}.png`), r.rawData);
        rows[0].push({ image: r.rawData, label: `${slug.slice(0, 24)} · ${tag} · s${seed} · raw` });
        rows[1].push({ image: r.imageData, label: `${slug.slice(0, 24)} · ${tag} · s${seed} · finished` });
        prompts.push(`--- ${base}\n${r.prompt}\n`);
        manifest.push({ subject, slug, seed, mood, styleRef: !!ref, imagePath: r.imagePath, rawPath: r.rawPath, ms: Date.now() - t0 });
        console.log(`  ${slug}  ${tag}  seed ${seed}  ${secs}s`);
      }
    }
  }
  const sheet = await buildContactSheet(rows, { tile: 384 });
  await fs.writeFile(path.join(outDir, 'sheet.jpg'), sheet);
  await fs.writeFile(path.join(outDir, 'prompts.txt'), prompts.join('\n'));
  await fs.writeFile(path.join(outDir, 'lab.json'), JSON.stringify({ mode: training ? 'describe-training' : 'describe', mood, seeds, seed0, subjects, items: manifest }, null, 2));
  console.log(`sheet → ${path.join(outDir, 'sheet.jpg')}`);
}

main().catch(e => { console.error(e); process.exitCode = 1; });
