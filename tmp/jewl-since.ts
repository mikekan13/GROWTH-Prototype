import { prisma } from '../app/src/lib/db';
(async () => {
  const rows = await (prisma as any).copilotMessage.findMany({ where: { createdAt: { gt: new Date('2026-10-17T12:18:00Z') } }, orderBy: { createdAt: 'asc' } });
  for (const m of rows) console.log('#', m.createdAt.toISOString(), m.role, String(m.content).slice(0, 500).replace(/\n/g, ' / '));
  const pg = await (prisma as any).portraitGeneration.findMany({ where: { characterId: 'cmvcbw49u0001h448qanzbhs3' }, orderBy: { createdAt: 'desc' }, take: 3 });
  for (const g of pg) console.log('PG', g.createdAt.toISOString(), g.status, String(g.error ?? '').slice(0, 200));
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
