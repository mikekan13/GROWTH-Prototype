/**
 * Measure the JEWL dispatch prompt by section and by dispatch KIND — READ-ONLY.
 *
 * Assembles the dispatch prompt the way ai/copilot/runtime.ts does and prints
 * chars + estimated tokens per section, then per-kind totals (TABLE_CHAT /
 * WORK_CYCLE / GENESIS) against the local budget, next to the pre-2026-10-12
 * shape (v3 persona, all tools, last 20 rows). No model call, no writes (the
 * rolling summary is computed in memory, never stored). Born from the
 * 2026-10-12 incident (24.5k-token chat reply overflowed the 32k window).
 *
 *   npx tsx --conditions=react-server scripts/measure-local-prompt.ts [campaignId] [isoCutoff]
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { prisma } from '@/lib/db';
import { assembleContext } from '@/ai/copilot/context-assembler';
import { loadJewlMemoryForCampaign, formatJewlMemoryBlock } from '@/ai/copilot/tools/memory';
import { loadTimeAwareness, formatTimeAwarenessBlock } from '@/ai/copilot/time-awareness';
import { historyForLane } from '@/ai/copilot/cloud-history';
import { buildJewlSystemPrompt, DEFAULT_REGISTER, type PersonaKind } from '@/ai/copilot/prompts/system';
import { buildToolSpecs } from '@/ai/copilot/runtime';
import { tableChatHistory, rollSummary, rowsToFold, formatSummaryBlock, TABLE_HISTORY_FETCH, type ChatRow } from '@/ai/copilot/table-history';
import { laneBudget, measureCtx, formatCtxLine, trimHistoryToBudget } from '@/ai/copilot/dispatch-budget';
import type { DispatchKind } from '@/ai/copilot/tool-profiles';
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

function toolsJson(tools: ReturnType<typeof buildToolSpecs>): string {
  return JSON.stringify(tools.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.inputSchema } })));
}

function withVersion<T>(v: string, fn: () => T): T {
  const saved = process.env.JEWL_PROMPT_VERSION;
  process.env.JEWL_PROMPT_VERSION = v;
  try { return fn(); } finally {
    if (saved === undefined) delete process.env.JEWL_PROMPT_VERSION; else process.env.JEWL_PROMPT_VERSION = saved;
  }
}

async function main() {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { name: true } });
  let stored: { jewlChatSummary: string | null; jewlChatSummaryThrough: Date | null } | null = null;
  try {
    stored = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { jewlChatSummary: true, jewlChatSummaryThrough: true } });
  } catch { /* column not migrated in this DB yet — summary computed fresh */ }
  const history = await prisma.copilotMessage.findMany({
    where: { campaignId, ...(before ? { createdAt: { lte: before } } : {}) }, orderBy: { createdAt: 'desc' }, take: TABLE_HISTORY_FETCH + 1,
    select: { role: true, content: true, username: true, createdAt: true, contentClass: true, icText: true, actions: true, metadata: true },
  });
  const rows: ChatRow[] = withoutWithheld(history.reverse());
  const newest = rows.at(-1);
  const past = rows.slice(0, -1);
  const promptText = newest?.content ?? 'hello';

  const [context, mems, time] = await Promise.all([
    assembleContext(campaignId, promptText),
    loadJewlMemoryForCampaign(campaignId),
    loadTimeAwareness(campaignId),
  ]);
  const pre = campaign?.name === '__PRIME__' ? preamble('PRIME_BUILD_STATE_PREAMBLE')
    : campaignId === 'cms5z4j6z0000zg48z5vzl2jn' ? preamble('PROVING_GROUND_PREAMBLE') : '';
  const ctxBase = [
    formatTimeAwarenessBlock(time), context.campaignSummary ?? '', context.tableState ?? '',
    context.retrievedData ?? '', context.rulesContext ?? '', formatJewlMemoryBlock(mems),
  ].filter(Boolean).join('\n');

  // ── BEFORE (pre-2026-10-12 shape): v3 persona, all 51 tools, last 20 rows.
  const legacyRows = past.slice(-20);
  const legacyLane = await historyForLane(legacyRows as never, false);
  const legacyTools = buildToolSpecs(undefined, false);
  const legacySystem = withVersion('v3', () => buildJewlSystemPrompt(DEFAULT_REGISTER));
  const sections: Array<[string, string]> = [
    ['system: JEWL persona (v3, before)', legacySystem],
    ['system: campaign preamble', pre],
    ['context blocks', ctxBase],
    [`history (${legacyLane.lines.length} msgs, before)`, legacyLane.lines.map(l => l.text).join('\n')],
    [`tool specs (${legacyTools.length} tools, before)`, toolsJson(legacyTools)],
    ['newest user message', promptText],
  ];
  console.log(`campaign ${campaignId} (${campaign?.name})`);
  let total = 0;
  for (const [label, text] of sections) {
    const t = estimateTokens(text);
    total += t;
    console.log(`${label.padEnd(38)} ${String(text.length).padStart(8)} chars  ≈${String(t).padStart(6)} tok`);
  }
  console.log(`${'BEFORE TOTAL (est.)'.padEnd(38)} ${''.padStart(8)}        ≈${String(total).padStart(6)} tok`);

  // ── AFTER: per dispatch kind, as the runtime now assembles it.
  const budget = laneBudget('openai-compat');
  console.log('\nper-kind, against the LOCAL budget (work cycles default to the cloud judgment lane — shown for reference):');
  for (const kind of ['TABLE_CHAT', 'WORK_CYCLE', 'GENESIS'] as DispatchKind[]) {
    let lineRows: ChatRow[];
    let ctx = ctxBase;
    if (kind === 'TABLE_CHAT') {
      const split = tableChatHistory(past);
      lineRows = split.kept;
      const summary = rollSummary(stored?.jewlChatSummary ?? null, rowsToFold(split.older, stored?.jewlChatSummaryThrough ?? null));
      ctx = [ctxBase, formatSummaryBlock(summary)].filter(Boolean).join('\n');
    } else {
      lineRows = past.slice(-6);
    }
    const lane = await historyForLane(lineRows as never, false);
    const tools = kind === 'TABLE_CHAT'
      ? buildToolSpecs(undefined, false, undefined, undefined, { kind })
      : buildToolSpecs(undefined, true, undefined, kind === 'GENESIS' ? ['raise_prod'] : undefined, { kind });
    const system = [buildJewlSystemPrompt(DEFAULT_REGISTER, kind as PersonaKind), pre].filter(Boolean).join('\n\n');
    const parts = { system, tools: toolsJson(tools), history: lane.lines.map(l => l.text), ctx, prompt: promptText };
    const fitted = trimHistoryToBudget(parts, budget);
    console.log(`${formatCtxLine(kind, measureCtx(parts), budget)}  (${tools.length} tools, ${lane.lines.length} msgs)`);
    if (fitted.drop) console.log(`  → over budget: drop ${fitted.drop} oldest history lines → total ${(fitted.measure.total / 1000).toFixed(1)}k${fitted.fits ? '' : ' (STILL OVER)'}`);
  }
  // The biggest tools, for the follow-up unit.
  const big = legacyTools.map(t => [t.name, JSON.stringify(t).length] as const).sort((a, b) => b[1] - a[1]).slice(0, 8);
  console.log('largest tool specs:', big.map(([n, c]) => `${n}=${c}`).join(', '));
  await prisma.$disconnect();
  process.exit(0); // imported modules keep timers alive
}

main().catch(e => { console.error(e); process.exit(1); });
