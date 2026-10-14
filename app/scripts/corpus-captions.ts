/**
 * CORPUS → APPROVED TRAINING SET. Copies every painted corpus image into style-refs/approved/<set>/ and writes the
 * same-basename .txt caption a LoRA trainer reads (ai-toolkit / kohya convention). Free, local, idempotent.
 *
 *   cd C:\Projects\GRO.WTH\app
 *   npx tsx scripts/corpus-captions.ts [--set corpus-2026-10-13] [--trigger grwthpaint] [--src ../style-refs/corpus/restyled]
 *
 * Caption rule (Mike, 13 Oct: "strictly style transfer"): the caption describes the CONTENT plainly so the trainer
 * explains the content away and absorbs only what is left — the paint. GROWTH race names are stripped (an Et'herling
 * is "a tall slender elf-like person", a cambion "a half-demon man"), the style is never described, and one invented
 * trigger word leads every caption so the look can be summoned by that word alone.
 */
import fs from 'fs/promises';
import path from 'path';

function arg(name: string, dflt?: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--') ? process.argv[i + 1] : dflt;
}

/** GROWTH-specific names → plain description. Add here, never in corpus-prompts.ts (the content prompts keep the names). */
const STRIP: Array<[RegExp, string]> = [
  [/an Et'herling, /gi, ''],
  [/a cambion, /gi, ''],
];

export function plainCaption(prompt: string): string {
  let s = prompt.trim();
  for (const [re, to] of STRIP) s = s.replace(re, to);
  // "Half-length view of a tall slender..." → lower-case the leading shot word so the trigger reads first.
  s = s.charAt(0).toLowerCase() + s.slice(1);
  return s.replace(/\.\s*$/, '');
}

async function main() {
  const { buildCorpusPrompts } = await import('../src/ai/portraits/corpus-prompts');
  const set = arg('set', 'corpus-2026-10-13')!;
  const trigger = arg('trigger', 'grwthpaint')!;
  const src = path.resolve(arg('src', path.join('..', 'style-refs', 'corpus', 'restyled'))!);
  const out = path.resolve('..', 'style-refs', 'approved', set);
  await fs.mkdir(out, { recursive: true });

  const prompts = buildCorpusPrompts();
  let copied = 0;
  const missing: string[] = [];
  const index: { id: string; group: string; file: string; caption: string }[] = [];
  for (const p of prompts) {
    const from = path.join(src, `${p.id}.png`);
    try { await fs.access(from); } catch { missing.push(p.id); continue; }
    const caption = `${trigger}, ${plainCaption(p.prompt)}`;
    await fs.copyFile(from, path.join(out, `${p.id}.png`));
    await fs.writeFile(path.join(out, `${p.id}.txt`), caption + '\n');
    index.push({ id: p.id, group: p.group, file: `${p.id}.png`, caption });
    copied++;
  }
  await fs.writeFile(path.join(out, 'captions.json'), JSON.stringify({ set, trigger, src, count: copied, date: new Date().toISOString(), items: index }, null, 2));
  const leaked = index.filter(i => /et'herling|cambion|growth|krma/i.test(i.caption));
  console.log(`${copied} images + captions → ${out}`);
  if (missing.length) console.log(`missing (not in ${src}): ${missing.join(' ')}`);
  console.log(leaked.length ? `WARNING GROWTH names leaked into ${leaked.length} caption(s): ${leaked.map(l => l.id).join(' ')}` : 'no GROWTH names in captions');
  console.log(`sample: ${index[0]?.caption}`);
}

main().catch(e => { console.error(e); process.exitCode = 1; });
