import { prisma } from '../app/src/lib/db';
(async () => {
  const ps = await (prisma as any).genesisProd.findMany({ where: { sessionId: 'cmvccda300001yc48xnp1f8vx' }, orderBy: { createdAt: 'desc' }, take: 6 });
  for (const p of ps) console.log(p.id, p.stage, p.status, '|', String(p.question).slice(0, 120), '| answer:', String(p.answer ?? '').slice(0, 120));
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
