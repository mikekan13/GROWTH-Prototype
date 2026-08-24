/**
 * ai-costs — per-lane cost report from the unified AiCall ledger.
 *
 *   npx tsx scripts/ai-costs.ts [days]
 *
 * Prints per-lane totals (tokens, cache hit ratio, est. USD) for the last N
 * days (default 30) plus a per-day breakdown for the last 7. This is the
 * observability surface AI-ECONOMICS-2026-08-23.md §5 requires — per-GM
 * attribution comes from the campaignId column when needed.
 */

import { prisma } from '../src/lib/db';

async function main() {
  const days = Number(process.argv[2] ?? 30);
  const since = new Date(Date.now() - days * 24 * 3600 * 1000);
  const calls = await prisma.aiCall.findMany({
    where: { createdAt: { gte: since } },
    select: {
      lane: true, model: true, caller: true, createdAt: true,
      tokensIn: true, tokensOut: true, cacheReadTokens: true, cacheWriteTokens: true, estUsd: true,
    },
  });
  if (calls.length === 0) {
    console.log(`No AiCall rows in the last ${days} days.`);
    return;
  }

  type Agg = { n: number; tIn: number; tOut: number; cRead: number; cWrite: number; usd: number };
  const zero = (): Agg => ({ n: 0, tIn: 0, tOut: 0, cRead: 0, cWrite: 0, usd: 0 });
  const add = (a: Agg, c: (typeof calls)[number]) => {
    a.n++; a.tIn += c.tokensIn; a.tOut += c.tokensOut;
    a.cRead += c.cacheReadTokens; a.cWrite += c.cacheWriteTokens; a.usd += c.estUsd;
  };

  const byLane = new Map<string, Agg>();
  const byDay = new Map<string, Agg>();
  for (const c of calls) {
    const laneKey = `${c.lane} (${c.model})`;
    if (!byLane.has(laneKey)) byLane.set(laneKey, zero());
    add(byLane.get(laneKey)!, c);
    const day = c.createdAt.toISOString().slice(0, 10);
    if (!byDay.has(day)) byDay.set(day, zero());
    add(byDay.get(day)!, c);
  }

  const fmt = (a: Agg) => {
    const totalPrefix = a.tIn + a.cRead + a.cWrite;
    const hitPct = totalPrefix > 0 ? Math.round((a.cRead / totalPrefix) * 100) : 0;
    return `calls=${a.n} in=${a.tIn.toLocaleString()} out=${a.tOut.toLocaleString()} cacheRead=${a.cRead.toLocaleString()} (${hitPct}% hit) cacheWrite=${a.cWrite.toLocaleString()} estUsd=$${a.usd.toFixed(3)}`;
  };

  console.log(`=== AI cost report — last ${days} days (${calls.length} calls) ===\n`);
  console.log('-- by lane --');
  for (const [k, a] of [...byLane].sort((x, y) => y[1].usd - x[1].usd)) console.log(`${k}: ${fmt(a)}`);
  console.log('\n-- by day (last 7) --');
  for (const [k, a] of [...byDay].sort().slice(-7)) console.log(`${k}: ${fmt(a)}`);
  const total = [...byLane.values()].reduce((s, a) => s + a.usd, 0);
  console.log(`\nTOTAL est. cloud spend: $${total.toFixed(2)}`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
