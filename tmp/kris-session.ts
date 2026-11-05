import { prisma } from '../app/src/lib/db';
(async () => {
  const p = prisma as any;
  const s = await p.dayaWorkSession.findUnique({ where: { id: 'cmvccda300001yc48xnp1f8vx' } });
  if (!s) { console.log('no session'); process.exit(0); }
  const { plan, ...rest } = s;
  console.log(JSON.stringify(rest).slice(0, 600));
  console.log('AGE lines:', (plan.match(/^AGE:.*$/gm) ?? []).join(' | '));
  if (process.env.FIX) {
    await p.dayaWorkSession.update({ where: { id: s.id }, data: { plan: plan.replace(/^AGE:\s*25\b/m, 'AGE: 40') } });
    const s2 = await p.dayaWorkSession.findUnique({ where: { id: s.id } });
    console.log('now:', (s2.plan.match(/^AGE:.*$/gm) ?? []).join(' | '));
  }
  const last = await p.copilotMessage.findMany({ where: { createdAt: { gt: new Date('2026-10-17T12:18:00Z') } }, orderBy: { createdAt: 'asc' } });
  for (const m of last) console.log('#', m.createdAt.toISOString(), m.role, String(m.content).slice(0, 300));
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
