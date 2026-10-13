/**
 * Corpus RESTYLE — the gold recipe at scale: each plain content image (style-refs/corpus/content/<id>.png)
 * goes into <image1> as the subject reference; the look-first training medium repaints it on OUR Qwen 2.1
 * lane (no transfer model, no pod). BILLABLE (one serverless job per image, ~25 s).
 *
 *   cd app
 *   npx tsx scripts/corpus-restyle.ts [--ids a b c] [--limit N] [--resume] [--mood growth] [--seed 7]
 *
 * Output: style-refs/corpus/restyled/<id>.png (finished), raw/<id>.png, sheet-<group>.jpg, manifest.json.
 */
import './_server-only-shim';
import { config } from 'dotenv';
import fs from 'fs/promises';
import path from 'path';

config({ path: '.env.local' });
config({ path: '.env' });

function arg(name: string, def?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && !process.argv[i + 1]?.startsWith('--') ? process.argv[i + 1] : def;
}
function argList(name: string): string[] {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return [];
  const out: string[] = [];
  for (let k = i + 1; k < process.argv.length && !process.argv[k].startsWith('--'); k++) out.push(process.argv[k]);
  return out;
}

async function main() {
  if (!process.env.RUNPOD_QWEN_ENDPOINT_ID || !process.env.RUNPOD_API_KEY) {
    console.error('Set RUNPOD_QWEN_ENDPOINT_ID and RUNPOD_API_KEY.'); process.exitCode = 1; return;
  }
  const root = path.resolve(process.cwd(), '..', 'style-refs', 'corpus');
  const contentDir = path.join(root, 'content');
  const outDir = path.resolve(arg('out') ?? path.join(root, 'restyled'));
  await fs.mkdir(path.join(outDir, 'raw'), { recursive: true });
  const mood = arg('mood', 'growth');
  const seed = Number(arg('seed', '7'));
  const limit = Number(arg('limit', '0'));
  const resume = process.argv.includes('--resume');

  type Item = { id: string; group: string; prompt: string };
  const manifest = JSON.parse(await fs.readFile(path.join(contentDir, 'manifest.json'), 'utf8')) as { items?: Item[] } | Item[];
  let items: Item[] = Array.isArray(manifest) ? manifest : (manifest.items ?? []);
  const only = argList('ids');
  if (only.length) items = items.filter(i => only.includes(i.id));
  if (resume) {
    const done = new Set((await fs.readdir(outDir)).filter(f => f.endsWith('.png')).map(f => f.replace(/\.png$/, '')));
    items = items.filter(i => !done.has(i.id));
  }
  if (limit > 0) items = items.slice(0, limit);

  const { Qwen21Provider } = await import('../src/ai/portraits/providers/qwen21');
  const { buildContactSheet } = await import('../src/ai/portraits/contact-sheet');
  const provider = new Qwen21Provider();
  console.log(`corpus restyle: ${items.length} image(s), mood=${mood}, seed=${seed} → ${outDir}`);

  const results: Record<string, unknown>[] = [];
  const byGroup = new Map<string, { image: Buffer; label: string }[][]>();
  const t0 = Date.now();
  for (let n = 0; n < items.length; n++) {
    const it = items[n];
    const contentPath = path.join(contentDir, `${it.id}.png`);
    try { await fs.access(contentPath); } catch { console.log(`  skip ${it.id}: no content png`); continue; }
    const t = Date.now();
    try {
      const r = await provider.describeBase('corpus-restyle', '', seed, mood, { training: true, contentRefPath: contentPath });
      await fs.writeFile(path.join(outDir, `${it.id}.png`), r.imageData);
      await fs.writeFile(path.join(outDir, 'raw', `${it.id}.png`), r.rawData);
      const rows = byGroup.get(it.group) ?? [[], []];
      rows[0].push({ image: await fs.readFile(contentPath), label: `${it.id} · content` });
      rows[1].push({ image: r.imageData, label: `${it.id} · restyled` });
      byGroup.set(it.group, rows);
      results.push({ id: it.id, group: it.group, seed, mood, imagePath: r.imagePath, rawPath: r.rawPath, ms: Date.now() - t });
      const avg = (Date.now() - t0) / (n + 1);
      console.log(`  [${n + 1}/${items.length}] ${it.id}  ${((Date.now() - t) / 1000).toFixed(1)}s  · ETA ${Math.round(avg * (items.length - n - 1) / 60000)} min`);
    } catch (e) {
      console.log(`  [${n + 1}/${items.length}] ${it.id}  FAILED: ${e instanceof Error ? e.message.slice(0, 160) : String(e)}`);
      results.push({ id: it.id, group: it.group, error: String(e).slice(0, 300) });
    }
  }
  for (const [group, rows] of byGroup) {
    const sheet = await buildContactSheet(rows, { tile: 320 });
    await fs.writeFile(path.join(outDir, `sheet-${group}.jpg`), sheet);
    console.log(`sheet → ${path.join(outDir, `sheet-${group}.jpg`)} (${rows[1].length})`);
  }
  await fs.writeFile(path.join(outDir, 'manifest.json'), JSON.stringify({ mood, seed, items: results }, null, 2));
  console.log(`done: ${results.filter(r => !('error' in r)).length} restyled, ${results.filter(r => 'error' in r).length} failed, ${((Date.now() - t0) / 60000).toFixed(1)} min`);
}

main().catch(e => { console.error(e); process.exitCode = 1; });
