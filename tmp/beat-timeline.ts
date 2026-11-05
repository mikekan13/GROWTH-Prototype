import { prisma } from '../app/src/lib/db';
const from = new Date(process.argv[2]), to = new Date(process.argv[3]);
(async () => {
  const p = prisma as any;
  const rows: any[] = await p.dayaModelCall.findMany({ where: { createdAt: { gte: from, lte: to } }, orderBy: { createdAt: 'asc' }, select: { createdAt: true, subsystem: true, tier: true, model: true, tokensIn: true, tokensOut: true, entityId: true, ms: true, ttftMs: true } });
  const names: Record<string, string> = { cmvccodq2001tyc486jp89cwk: 'Kris', cmv57ezn2000lds4859pxeux4: 'Violet' };
  const t0 = rows[0] ? new Date(rows[0].createdAt).getTime() : 0;
  for (const r of rows) console.log(`+${((new Date(r.createdAt).getTime() - t0) / 1000).toFixed(1).padStart(5)}s  ${(names[r.entityId] ?? '—').padEnd(6)} ${r.subsystem.padEnd(14)} ${r.tier.padEnd(4)} ${r.model.padEnd(18)} in ${String(r.tokensIn).padStart(5)} out ${String(r.tokensOut).padStart(4)}  ${r.ms != null ? (r.ms / 1000).toFixed(1) + ' s' : ''}${r.ttftMs != null ? ' (first token ' + (r.ttftMs / 1000).toFixed(1) + ' s)' : ''}`);
  const ev = await prisma.campaignEvent.findMany({ where: { campaignId: 'cms5z4j6z0000zg48z5vzl2jn', createdAt: { gte: from, lte: to } }, orderBy: { createdAt: 'asc' }, select: { createdAt: true, type: true, characterName: true } });
  for (const e of ev) console.log(`EVENT +${((e.createdAt.getTime() - t0) / 1000).toFixed(1)}s ${e.type} ${e.characterName ?? ''}`);
  process.exit(0);
})();
