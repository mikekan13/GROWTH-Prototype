import { prisma } from '../app/src/lib/db';
(async () => {
  const rows = await (prisma as any).copilotMessage.findMany({ where: { createdAt: { gt: new Date('2026-10-17T12:18:30Z') } }, orderBy: { createdAt: 'asc' } });
  for (const m of rows) console.log('#', m.createdAt.toISOString(), m.role, String(m.content).slice(0, 700).replace(/\n/g, ' / '));
  const s = await prisma.dayaWorkSession.findUniqueOrThrow({ where: { id: 'cmvccda300001yc48xnp1f8vx' } });
  console.log('PROGRESS tail:', JSON.parse(s.progress).slice(-5).join('\n  '));
  const k = await prisma.character.findUniqueOrThrow({ where: { id: 'cmvcbw49u0001h448qanzbhs3' } });
  console.log('identity.age', JSON.parse(k.data).identity?.age);
  const links = await prisma.characterBlockLink.findMany({ where: { characterId: k.id }, include: { block: true } as any });
  for (const l of links as any[]) if (['root','branch'].includes(l.block.type)) console.log(' ', l.block.type, l.block.name, 'ageAdded', l.ageAdded, 'arch', JSON.parse(l.block.data).ageAdded);
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
