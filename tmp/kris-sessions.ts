import { prisma } from '../app/src/lib/db';
(async () => {
  const p = prisma as any;
  const ss = await p.dayaWorkSession.findMany({ where: { goal: { contains: 'cmvcbw49u0001h448qanzbhs3' } }, orderBy: { startedAt: 'asc' } });
  for (const s of ss) {
    console.log(s.id, s.status, s.startedAt.toISOString(), 'AGE:', (s.plan.match(/^AGE:.*$/gm) ?? []).join('|'), 'plan', s.plan.length);
    if (process.env.FIX && /^AGE:\s*25\b/m.test(s.plan)) { await p.dayaWorkSession.update({ where: { id: s.id }, data: { plan: s.plan.replace(/^AGE:\s*25\b/m, 'AGE: 40') } }); console.log('  -> AGE: 40'); }
  }
  process.exit(0);
})();
