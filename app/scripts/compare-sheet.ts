/**
 * Compare sheet — one row per subject: gold anchor | content | restyle (no LoRA) | restyle (LoRA blend) …
 * Free (no GPU). Columns are directories; each row id resolves to <dir>/<id>.png.
 *
 *   cd app
 *   npx tsx scripts/compare-sheet.ts --ids people-01-head people-02-full --cols "content=../style-refs/corpus/content" "no-lora=../style-refs/corpus/restyled-gold" --out ../style-refs/corpus/compare-x.jpg [--no-anchor] [--tile 360]
 *
 * A column may also be a single file ("gold=path/to/file.png") used for every row.
 */
import fs from 'fs/promises';
import path from 'path';

function argList(name: string): string[] {
  const i = process.argv.indexOf(`--${name}`);
  if (i < 0) return [];
  const out: string[] = [];
  for (let k = i + 1; k < process.argv.length && !process.argv[k].startsWith('--'); k++) out.push(process.argv[k]);
  return out;
}
function arg(name: string, def?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && !process.argv[i + 1]?.startsWith('--') ? process.argv[i + 1] : def;
}

async function main() {
  const ids = argList('ids');
  const cols = argList('cols').map(c => { const [label, ...rest] = c.split('='); return { label, src: path.resolve(rest.join('=')) }; });
  const out = path.resolve(arg('out') ?? path.join(process.cwd(), '..', 'style-refs', 'corpus', 'compare.jpg'));
  const tile = Number(arg('tile', '360'));
  const anchor = path.resolve(process.cwd(), '..', 'style-refs', 'STYLE-ANCHOR-2026-10-13-sheet6-seed8.png');
  const withAnchor = !process.argv.includes('--no-anchor');
  const { buildContactSheet } = await import('../src/ai/portraits/contact-sheet');

  const rows: { image: Buffer; label: string }[][] = [];
  for (const id of ids) {
    const row: { image: Buffer; label: string }[] = [];
    if (withAnchor) row.push({ image: await fs.readFile(anchor), label: 'GOLD STANDARD' });
    for (const c of cols) {
      const isFile = /\.(png|jpe?g|webp)$/i.test(c.src);
      const p = isFile ? c.src : path.join(c.src, `${id}.png`);
      try { row.push({ image: await fs.readFile(p), label: `${id} · ${c.label}` }); }
      catch { console.log(`  missing: ${p}`); }
    }
    rows.push(row);
  }
  await fs.mkdir(path.dirname(out), { recursive: true });
  await fs.writeFile(out, await buildContactSheet(rows, { tile }));
  console.log(`sheet → ${out} (${rows.length} rows)`);
}

main().catch(e => { console.error(e); process.exitCode = 1; });
