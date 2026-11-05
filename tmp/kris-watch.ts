import { prisma } from '../app/src/lib/db';
const K = 'cmvcbw49u0001h448qanzbhs3';
(async () => {
  const rows = await (prisma as any).copilotMessage.findMany({ where: { createdAt: { gt: new Date(Date.now() - 6 * 60_000) } }, orderBy: { createdAt: 'asc' } });
  for (const m of rows) console.log('#', m.createdAt.toISOString().slice(11, 19), m.role, String(m.content).slice(0, 500).replace(/\n/g, ' / '), m.actions ? '| ' + String(m.actions).slice(0, 200) : '');
  const held = await prisma.campaignItem.findMany({ where: { holderId: K }, select: { name: true } });
  const owns = await prisma.entityRelationship.findMany({ where: { sourceId: K, relationshipType: { in: ['owns', 'wears', 'worn_by', 'carries'] } }, select: { targetId: true, relationshipType: true } });
  const ownedNames = await prisma.campaignItem.findMany({ where: { id: { in: owns.map(o => o.targetId) } }, select: { name: true } });
  console.log('HELD', held.map(h => h.name).join(', '), '| OWNS', ownedNames.map(o => o.name).join(', '));
  process.exit(0);
})();
