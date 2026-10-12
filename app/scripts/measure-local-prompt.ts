/**
 * Measure the JEWL table-lane (local) prompt by section — READ-ONLY.
 *
 * Assembles the dispatch prompt the way ai/copilot/runtime.ts does for a
 * local (inside-the-wall) lane and prints chars + estimated tokens per
 * section. No model call, no writes. Born from the 2026-10-12 incident
 * (24.5k-token chat reply overflowed the 32k window with max_tokens 8192).
 *
 *   npx tsx --conditions=react-server scripts/measure-local-prompt.ts [campaignId]
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { prisma } from '@/lib/db';
import { assembleContext } from '@/ai/copilot/context-assembler';
import { loadJewlMemoryForCampaign, formatJewlMemoryBlock } from '@/ai/copilot/tools/memory';
import { loadTimeAwareness, formatTimeAwarenessBlock } from '@/ai/copilot/time-awareness';
import { historyForLane } from '@/ai/copilot/cloud-history';
import { buildJewlSystemPrompt, DEFAULT_REGISTER } from '@/ai/copilot/prompts/system';
import { buildToolSpecs } from '@/ai/copilot/runtime';
import { withoutWithheld } from '@/lib/withheld';
import { estimateTokens } from '@/ai/network/local-window';

const campaignId = process.argv[2] ?? 'cms5z4j6z0000zg48z5vzl2jn';
/** Optional ISO cutoff: measure history as it stood at that moment (e.g. an incident). */
const before = process.argv[3] ? new Date(process.argv[3]) : undefined;

function preamble(name: 'PRIME_BUILD_STATE_PREAMBLE' | 'PROVING_GROUND_PREAMBLE'): string {
  const src = readFileSync('src/ai/copilot/runtime.ts', 'utf8');
  const m = src.match(new RegExp(`const ${name} = \`([\\s\\S]*?)\`;`));
  return m?.[1] ?? '';
}

async function main() {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { name: true } });
  const history = await prisma.copilotMessage.findMany({
    where: { campaignId, ...(before ? { createdAt: { lte: before } } : {}) }, orderBy: { createdAt: 'desc' }, take: 21,
    select: { role: true, content: true, username: true, createdAt: true, contentClass: true, icText: true, actions: true },
  });
  const rows = withoutWithheld(history.reverse());
  const newest = rows.at(-1);
  const past = rows.slice(0, -1);
  const promptText = newest?.content ?? 'hello';

  const [context, mems, time] = await Promise.all([
    assembleContext(campaignId, promptText),
    loadJewlMemoryForCampaign(campaignId),
    loadTimeAwareness(campaignId),
  ]);
  const lane = await historyForLane(past as never, false);
  const tools = buildToolSpecs(undefined, false);
  const toolsJson = JSON.stringify(tools.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.inputSchema } })));

  const sections: Array<[string, string]> = [
    ['system: JEWL persona/rules', buildJewlSystemPrompt(DEFAULT_REGISTER)],
    ['system: campaign preamble', campaign?.name === '__PRIME__' ? preamble('PRIME_BUILD_STATE_PREAMBLE')
      : campaignId === 'cms5z4j6z0000zg48z5vzl2jn' ? preamble('PROVING_GROUND_PREAMBLE') : ''],
    ['context: time awareness', formatTimeAwarenessBlock(time)],
    ['context: campaign summary', context.campaignSummary ?? ''],
    ['context: TABLE STATE', context.tableState ?? ''],
    ['context: relevant details', context.retrievedData ?? ''],
    ['context: rules reference', context.rulesContext ?? ''],
    ['context: JEWL memories', formatJewlMemoryBlock(mems)],
    [`history (${lane.lines.length} msgs)`, lane.lines.map(l => l.text).join('\n')],
    [`tool specs (${tools.length} tools)`, toolsJson],
    ['newest user message', promptText],
  ];
  for (const r of rows) console.log(`  ${r.createdAt.toISOString()} ${r.role.padEnd(9)} ${String(r.content.length).padStart(7)} chars`);
  let total = 0;
  console.log(`campaign ${campaignId} (${campaign?.name})`);
  for (const [label, text] of sections) {
    const t = estimateTokens(text);
    total += t;
    console.log(`${label.padEnd(34)} ${String(text.length).padStart(8)} chars  ≈${String(t).padStart(6)} tok`);
  }
  console.log(`${'TOTAL (est., +10% margin)'.padEnd(34)} ${''.padStart(8)}        ≈${String(total).padStart(6)} tok`);
  // The biggest tools, for the follow-up unit.
  const big = tools.map(t => [t.name, JSON.stringify(t).length] as const).sort((a, b) => b[1] - a[1]).slice(0, 8);
  console.log('largest tool specs:', big.map(([n, c]) => `${n}=${c}`).join(', '));
  await prisma.$disconnect();
  process.exit(0); // imported modules keep timers alive
}

main().catch(e => { console.error(e); process.exit(1); });
