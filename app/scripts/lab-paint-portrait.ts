/**
 * LAB: the base portrait for a character (PORTRAIT stage, 2026-10-16).
 *   cd app && npx tsx scripts/lab-paint-portrait.ts [characterId] [--jewl] [--run] [--seed N] [--figure]
 * DRY RUN by default: prints the gathered inputs, the brief (deterministic draft;
 * --jewl lets JEWL write it — one text call) and the final paint prompt. Nothing is
 * spent. --run paints it on the Qwen-2.1 endpoint (BILLABLE: one generation).
 */
import './_server-only-shim';
import { config } from 'dotenv';
config({ path: '.env.local', quiet: true });
config({ path: '.env', quiet: true });

async function main() {
  const args = process.argv.slice(2);
  const seedIdx = args.indexOf('--seed');
  const id = args.find((a, i) => !a.startsWith('--') && i !== seedIdx + 1) ?? 'cms60ndtn0000kw48ioq10i68';
  const run = args.includes('--run');
  const jewl = args.includes('--jewl');
  const seedArg = args.indexOf('--seed');
  const seed = seedArg >= 0 ? Number(args[seedArg + 1]) : undefined;

  const frame = args.includes('--figure') ? 'figure' as const : 'bust' as const;
  const { buildPortraitBrief, readPortraitRefs, briefForFrame } = await import('../src/services/portrait-brief');
  const { buildQwen21PortraitPrompt } = await import('../src/ai/portraits/providers/qwen21');
  const r = await buildPortraitBrief(id, { jewl, force: jewl });
  const brief = { ...r.brief, ...briefForFrame(r.brief, r.inputs, frame) };
  console.log('== INPUTS ==');
  console.log(JSON.stringify(r.inputs, null, 2).slice(0, 4000));
  console.log('\n== BRIEF ==', frame.toUpperCase(), r.reused ? '(stored, inputs unchanged)' : r.modelCalled ? '(JEWL)' : '(draft)');
  console.log(JSON.stringify(brief, null, 2));
  console.log('\n== PAINT PROMPT ==');
  console.log(buildQwen21PortraitPrompt(brief.prompt, undefined, frame));
  const refs = await readPortraitRefs(id);
  console.log('\n== REFS ==', refs);
  if (!run) { console.log('\n(dry run — add --run to paint; billable)'); return; }

  const { Qwen21Provider } = await import('../src/ai/portraits/providers/qwen21');
  const provider = new Qwen21Provider();
  const out = await provider.renderPortrait(id, brief, { face: refs.face, body: refs.body, seed, frame });
  console.log('\n== RESULT ==', JSON.stringify(out, null, 2).slice(0, 1500));
}
main().catch(e => { console.error(e); process.exit(1); }).finally(() => process.exit(0));
