/**
 * Corpus RESTYLE — the REFRAME RECIPE at scale (13 Oct): each plain content image (style-refs/corpus/content/<id>.png)
 * goes into <image1> as the subject reference; the lead asks for a tighter reframe (so the model paints instead of
 * copying) and the restyle gold medium repaints it on OUR Qwen 2.1 lane. BILLABLE (one serverless job per image, ~40 s).
 *
 *   cd app
 *   npx tsx scripts/corpus-restyle.ts [--ids a b c] [--limit N] [--resume] [--mood growth] [--seed 7]
 *
 * --loras "file:strength[:trigger],..." overrides QWEN21_LORAS for this run ("" = none).
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
  const seed = Number(arg('seed', '8')); // 8 = the gold standard's seed
  // --style-ref headless|gold|<file>: optional <image2> style reference (headless greyscale anchor proven safe)
  const styleArg = arg('style-ref');
  const styleRefPath = styleArg === 'headless'
    ? path.resolve(process.cwd(), '..', 'style-refs', 'anchor-variants', 'anchor-headless-desaturated.png')
    : styleArg === 'gold'
      ? path.resolve(process.cwd(), '..', 'style-refs', 'STYLE-ANCHOR-2026-10-13-sheet6-seed8.png')
      : styleArg ? path.resolve(styleArg) : undefined;
  // DEFAULT = the reframe recipe (13 Oct): RESTYLE_RECIPE_LEAD + GROWTH_MEDIUM_GOLD_RESTYLE + growth mood, seed 8, no LoRA.
  // Lab overrides: --medium gold|restyle|training|none | --medium-text "<paragraph>" ; --lead "<sentence>" | --lead default
  const { GROWTH_MEDIUM_GOLD, GROWTH_MEDIUM_GOLD_RESTYLE, GROWTH_MEDIUM_TRAINING, RESTYLE_RECIPE_LEAD } = await import('../src/ai/portraits/style-config');
  const mediumArg = arg('medium');
  const mediumText = arg('medium-text');
  const medium = mediumText ? mediumText
    : mediumArg === 'gold' ? GROWTH_MEDIUM_GOLD
    : mediumArg === 'training' ? GROWTH_MEDIUM_TRAINING
    : mediumArg === 'none' ? ' '
    : mediumArg === 'old-default' ? undefined
    : GROWTH_MEDIUM_GOLD_RESTYLE; // recipe default (also for --medium restyle)
  const leadArg = arg('lead');
  const lead = leadArg === 'old-default' ? undefined : (leadArg ?? RESTYLE_RECIPE_LEAD);
  // --ref-max N: hand the model a downscaled copy of the content image (longest side N px) so it must
  // repaint detail instead of copying it — the img2img-strength analogue on an edit model.
  const refMax = Number(arg('ref-max', '0'));
  // --size match (default) | portrait : output follows the content image's aspect (same ~1.04 MP area, multiples of 16),
  // or the fixed 832x1248 base-lock portrait. Mike (13 Oct): the portrait crop "really messed with" animals and objects.
  const sizeMode = arg('size', 'match');
  const AREA = 832 * 1248;
  function matchSize(w: number, h: number): { width: number; height: number } {
    const ar = w / h;
    const W = Math.round(Math.sqrt(AREA * ar) / 16) * 16;
    const H = Math.round(Math.sqrt(AREA / ar) / 16) * 16;
    return { width: Math.max(512, W), height: Math.max(512, H) };
  }
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
  const { parseQwen21Loras, qwen21LorasFromEnv, formatQwen21Loras, qwen21LoraLabel } = await import('../src/ai/portraits/qwen21-workflow');
  const lorasIdx = process.argv.indexOf('--loras');
  const lorasNext = lorasIdx > 0 ? process.argv[lorasIdx + 1] : undefined;
  const lorasArg = lorasIdx < 0 ? undefined : (lorasNext === undefined || lorasNext.startsWith('--')) ? '' : lorasNext; // bare --loras = none (PowerShell drops "")
  const loras = lorasArg !== undefined ? parseQwen21Loras(lorasArg) : qwen21LorasFromEnv();
  const loraSpec = formatQwen21Loras(loras);
  const loraTag = loras.length ? ` · ${qwen21LoraLabel(loras)}` : '';
  const provider = new Qwen21Provider();
  provider.setLoras(loras);
  console.log(`corpus restyle: ${items.length} image(s), mood=${mood}, seed=${seed}, size=${sizeMode}, medium=${mediumText ? 'custom' : (mediumArg ?? 'recipe (gold-restyle)')}, lead=${leadArg ?? 'recipe'}, loras=${loraSpec || 'none'} → ${outDir}`);

  const results: Record<string, unknown>[] = [];
  const byGroup = new Map<string, { image: Buffer; label: string }[][]>();
  const t0 = Date.now();
  for (let n = 0; n < items.length; n++) {
    const it = items[n];
    const contentPath = path.join(contentDir, `${it.id}.png`);
    try { await fs.access(contentPath); } catch { console.log(`  skip ${it.id}: no content png`); continue; }
    const t = Date.now();
    try {
      let refPath = contentPath;
      const sharp = (await import('sharp')).default;
      if (refMax > 0) {
        refPath = path.join(outDir, 'raw', `${it.id}.ref${refMax}.png`);
        await sharp(contentPath).resize({ width: refMax, height: refMax, fit: 'inside' }).png().toFile(refPath);
      }
      let size: { width: number; height: number } | undefined;
      if (sizeMode === 'match') {
        const m = await sharp(contentPath).metadata();
        if (m.width && m.height) size = matchSize(m.width, m.height);
      }
      const r = await provider.describeBase('corpus-restyle', '', seed, mood, { training: true, contentRefPath: refPath, styleRefPath, medium, lead, size });
      await fs.writeFile(path.join(outDir, `${it.id}.png`), r.imageData);
      await fs.writeFile(path.join(outDir, 'raw', `${it.id}.png`), r.rawData);
      const rows = byGroup.get(it.group) ?? [[], []];
      rows[0].push({ image: await fs.readFile(contentPath), label: `${it.id} · content` });
      rows[1].push({ image: r.imageData, label: `${it.id} · restyled${loraTag}` });
      byGroup.set(it.group, rows);
      results.push({ id: it.id, group: it.group, seed, mood, size: size ?? 'portrait', loras: loraSpec || null, imagePath: r.imagePath, rawPath: r.rawPath, ms: Date.now() - t });
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
  await fs.writeFile(path.join(outDir, 'manifest.json'), JSON.stringify({ mood, seed, refMax: refMax || null, medium: mediumText ?? mediumArg ?? 'recipe (gold-restyle)', mediumText: medium ?? null, lead: lead ?? null, loras: loraSpec || null, loraLabel: qwen21LoraLabel(loras) || null, items: results }, null, 2));
  if (results.length && 'imagePath' in results[0]) {
    // record the exact prompt of the first item for the sheet's provenance
    const firstPrompt = await fs.readFile(String(results[0].imagePath).replace(/\.png$/, '.json'), 'utf8').catch(() => '');
    if (firstPrompt) await fs.writeFile(path.join(outDir, 'first-prompt.json'), firstPrompt);
  }
  console.log(`done: ${results.filter(r => !('error' in r)).length} restyled, ${results.filter(r => 'error' in r).length} failed, ${((Date.now() - t0) / 60000).toFixed(1)} min`);
}

main().catch(e => { console.error(e); process.exitCode = 1; });
