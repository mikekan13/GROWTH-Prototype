import { prisma } from '../app/src/lib/db';
const C = 'cms5z4j6z0000zg48z5vzl2jn';
const T = new Date('2026-11-01T00:55:27.290Z');
async function main() {
  const camp = await prisma.campaign.findUnique({ where: { id: C }, select: { currentCycle: true } });
  console.log('campaign', JSON.stringify(camp));
  const mem = await prisma.dayaMemoryEntry.findMany({ where: { realTime: { gt: T } }, orderBy: { realTime: 'asc' }, select: { id: true, entityId: true, source: true, narrativeCycle: true, realTime: true, content: true } });
  console.log('memories after T:', mem.length);
  for (const m of mem) console.log(' ', m.realTime.toISOString(), m.entityId.slice(-6), m.source, m.narrativeCycle, '|', m.content.replace(/\s+/g, ' ').slice(0, 140));
  const ev = await prisma.campaignEvent.findMany({ where: { campaignId: C, createdAt: { gt: T } }, orderBy: { createdAt: 'asc' }, select: { id: true, createdAt: true, type: true, actor: true, characterName: true, payload: true } });
  console.log('events after T:', ev.length);
  for (const e of ev) console.log(' ', e.createdAt.toISOString(), e.type, e.actor, e.characterName, '|', e.payload.replace(/\s+/g, ' ').slice(0, 160));
  const ints = await prisma.dayaIntention.findMany({ where: { createdAt: { gt: T } }, select: { id: true, entityId: true, authority: true, text: true, status: true, createdAt: true } }).catch((e) => { console.log('int err', e.message.split('\n')[0]); return [] as any[]; });
  console.log('intentions after T:', ints.length, JSON.stringify(ints).slice(0, 800));
  const lk = await prisma.lastKnown.findMany({ where: { updatedAt: { gt: T } } }).catch(() => []);
  console.log('lastKnown after T:', (lk as any[]).length);
  const canon = await prisma.canonEvent.findMany({ where: { createdAt: { gt: T } }, select: { id: true, createdAt: true } }).catch(() => []);
  console.log('canonEvents after T:', (canon as any[]).length);
  // first-stretch boundary: last memory before T
  const last = await prisma.dayaMemoryEntry.findFirst({ where: { realTime: { lt: T, gt: new Date('2026-11-01T00:46:00Z') } }, orderBy: { realTime: 'desc' }, select: { realTime: true, narrativeCycle: true } });
  console.log('last first-stretch memory:', JSON.stringify(last));
}
main().finally(() => prisma.$disconnect());
