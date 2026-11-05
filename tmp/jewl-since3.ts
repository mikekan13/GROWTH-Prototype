import { prisma } from '../app/src/lib/db';
(async () => {
  const rows = await (prisma as any).copilotMessage.findMany({ where: { createdAt: { gt: new Date('2026-10-17T12:46:00Z') } }, orderBy: { createdAt: 'asc' } });
  for (const m of rows) console.log('#', m.createdAt.toISOString(), m.role, String(m.content).slice(0, 400).replace(/\n/g, ' / '));
  const s = await prisma.dayaWorkSession.findUniqueOrThrow({ where: { id: 'cmvccda300001yc48xnp1f8vx' } });
  console.log('PROGRESS:', JSON.parse(s.progress).slice(-4).join('\n  '));
  const goals = await (prisma as any).goal.findMany({ where: { characterId: 'cmvcbw49u0001h448qanzbhs3' } });
  console.log('goals', goals.length, goals.map((g: any) => `${g.status}:${String(g.title ?? g.goal ?? '').slice(0, 50)}`).join(' | '));
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
