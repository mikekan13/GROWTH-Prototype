/** Mike 24 Oct (HW3): "we need to rewind this hw and fix this." Everything session 3 wrote
 *  (from 04:44:00 UTC) goes to the archive and out of the record; the clock returns to where
 *  session 2 left it (0.0022); GameSession 3 is removed so the next start is session 3 again. */
import { prisma } from '../app/src/lib/db';
import { writeFileSync, mkdirSync } from 'fs';
const CAMP = 'cms5z4j6z0000zg48z5vzl2jn';
const SINCE = '2026-10-24T04:44:00';
const SINCE_DATE = new Date(SINCE + 'Z');
const CLOCK_BEFORE = 0.0022;
(async () => {
  const p = prisma as any;
  const entities = await p.dayaEntity.findMany({ where: { character: { campaignId: CAMP } }, select: { id: true } });
  const entityIds = entities.map((e: any) => e.id);
  const events = await prisma.campaignEvent.findMany({ where: { campaignId: CAMP, createdAt: { gte: SINCE_DATE } } });
  const canon = await p.canonEvent.findMany({ where: { campaignId: CAMP, createdAt: { gte: SINCE_DATE } } });
  const canonIds = canon.map((c: any) => c.id);
  const revisions = canonIds.length ? await p.canonRevision.findMany({ where: { canonEventId: { in: canonIds } } }) : [];
  const memories = await p.dayaMemoryEntry.findMany({ where: { entityId: { in: entityIds }, realTime: { gte: SINCE_DATE } } });
  const history = await p.historyEntry.findMany({ where: { campaignId: CAMP, realTime: { gte: SINCE_DATE } } });
  const facts = await p.worldFact.findMany({ where: { campaignId: CAMP, establishedAtCycle: { gt: CLOCK_BEFORE } } });
  const famChanges = await p.familiarityChange.findMany({ where: { createdAt: { gte: SINCE_DATE } } }).catch(() => []);
  const sessions = await prisma.gameSession.findMany({ where: { campaignId: CAMP, number: 3 } });
  mkdirSync('data/archive', { recursive: true });
  const file = `data/archive/hw3-rewind-${SINCE.replace(/[:T]/g, '-')}.json`;
  writeFileSync(file, JSON.stringify({ events, canon, revisions, memories, history, facts, famChanges, sessions }, null, 1));
  // Facts superseded by a rewound fact come back live.
  for (const f of facts) await p.worldFact.updateMany({ where: { supersededById: f.id }, data: { supersededById: null } });
  await p.worldFact.deleteMany({ where: { id: { in: facts.map((f: any) => f.id) } } });
  await p.dayaMemoryEntry.deleteMany({ where: { id: { in: memories.map((m: any) => m.id) } } });
  if (canonIds.length) await p.canonRevision.deleteMany({ where: { canonEventId: { in: canonIds } } });
  await p.canonEvent.deleteMany({ where: { id: { in: canonIds } } });
  await prisma.campaignEvent.deleteMany({ where: { id: { in: events.map((e) => e.id) } } });
  await p.historyEntry.deleteMany({ where: { id: { in: history.map((h: any) => h.id) } } });
  if (famChanges.length) await p.familiarityChange.deleteMany({ where: { id: { in: famChanges.map((f: any) => f.id) } } });
  await prisma.gameSession.deleteMany({ where: { id: { in: sessions.map((s) => s.id) } } });
  await prisma.campaign.update({ where: { id: CAMP }, data: { currentCycle: CLOCK_BEFORE } });
  console.log(`rewound: ${events.length} events, ${canon.length} canon (+${revisions.length} revisions), ${memories.length} memories, ${history.length} history, ${facts.length} facts, ${famChanges.length} familiarity changes, ${sessions.length} session rows; clock → ${CLOCK_BEFORE}; archive ${file}`);
  process.exit(0);
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
