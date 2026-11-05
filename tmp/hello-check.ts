import { prisma } from '../app/src/lib/db';
import { spentTodayUsd, dailyBudgetUsd } from '../app/src/services/gpu-budget';
const C = 'cms5z4j6z0000zg48z5vzl2jn', K = 'cmvcbw49u0001h448qanzbhs3', V = 'cms60ndtn0000kw48ioq10i68';
(async () => {
  const camp = await prisma.campaign.findUniqueOrThrow({ where: { id: C }, select: { currentCycle: true, name: true } });
  const live = await prisma.gameSession.findFirst({ where: { campaignId: C, endedAt: null } });
  const s = await prisma.dayaWorkSession.findMany({ where: { campaignId: C, status: { in: ['active', 'blocked'] } }, select: { goal: true, status: true, stage: true, blockedReason: true } });
  const k = JSON.parse((await prisma.character.findUniqueOrThrow({ where: { id: K } })).data);
  const v = JSON.parse((await prisma.character.findUniqueOrThrow({ where: { id: V } })).data);
  const vLoc = await prisma.entityRelationship.findFirst({ where: { sourceId: V, relationshipType: 'located_at' }, select: { targetId: true, data: true } });
  const apt = JSON.parse((await prisma.location.findUniqueOrThrow({ where: { id: 'cmv5x69xp004y1448l1sqlkjc' } })).data);
  console.log('campaign', camp.name, 'cycle', camp.currentCycle, '| live session', !!live);
  console.log('work sessions', JSON.stringify(s.map(x => [x.goal.slice(0, 40), x.status, x.stage, (x.blockedReason ?? '').slice(0, 80)])));
  console.log('kris portrait', k.identity?.designer?.approvedPortraitPath ?? k.portrait ?? null, '| at', k.canvasX, k.canvasY, '| status', k.status);
  console.log('violet at', vLoc?.targetId, vLoc?.data?.slice(0, 80));
  console.log('door', JSON.stringify(apt.openings?.find((o: any) => o.id === 'op-1')));
  console.log('gpu today $', await spentTodayUsd(), 'cap', dailyBudgetUsd());
  process.exit(0);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
