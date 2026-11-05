import { prisma } from '../app/src/lib/db';
(async () => {
  const goals = await (prisma as any).goal.findMany({ where: { characterId: 'cmvcbw49u0001h448qanzbhs3' }, orderBy: { createdAt: 'asc' } });
  for (const g of goals) { const { id, createdAt, ...r } = g; console.log(id, JSON.stringify(r).slice(0, 500)); }
  const ps = await (prisma as any).genesisProd.findMany({ where: { sessionId: 'cmvccda300001yc48xnp1f8vx', stage: 'VINES' }, orderBy: { createdAt: 'desc' }, take: 2 });
  for (const p of ps) console.log('PROD', p.status, '|', p.question.slice(0, 300), '| A:', p.answer, '| fill:', p.jewlFill);
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
