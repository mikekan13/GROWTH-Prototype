/** Mike 24 Oct (before HW4): "Lets roll back the time jump and instead I will do it this hw. Time jumps
 *  require simulation for all characters remember." The 07:24:53 UTC line ("He leaves… 3 days go by…")
 *  and everything it wrote go to the archive; the clock returns to the 07:20 line's cycle. Session 3's
 *  row and its end marker stay. */
import { prisma } from '../app/src/lib/db';
import { writeFileSync, mkdirSync } from 'fs';
const CAMP = 'cms5z4j6z0000zg48z5vzl2jn';
const FROM = new Date('2026-10-24T07:24:50Z');
const TO = new Date('2026-10-24T08:00:00Z');
const CLOCK_BEFORE = 0.00221430111618468;
(async () => {
  const p = prisma as any;
  const win = { gte: FROM, lt: TO };
  const entities = await p.dayaEntity.findMany({ where: { character: { campaignId: CAMP } }, select: { id: true } });
  const entityIds = entities.map((e: any) => e.id);
  const events = await prisma.campaignEvent.findMany({ where: { campaignId: CAMP, createdAt: win } });
  const canon = await p.canonEvent.findMany({ where: { campaignId: CAMP, createdAt: win } });
  const canonIds = canon.map((c: any) => c.id);
  const revisions = canonIds.length ? await p.canonRevision.findMany({ where: { canonEventId: { in: canonIds } } }) : [];
  const memories = await p.dayaMemoryEntry.findMany({ where: { entityId: { in: entityIds }, realTime: win } });
  const history = await p.historyEntry.findMany({ where: { campaignId: CAMP, realTime: win } });
  const facts = await p.worldFact.findMany({ where: { campaignId: CAMP, establishedAtCycle: { gt: CLOCK_BEFORE } } });
  const famChanges = await p.familiarityChange.findMany({ where: { createdAt: win } }).catch(() => []);
  mkdirSync('data/archive', { recursive: true });
  const file = `data/archive/hw3-jump-rewind-2026-10-24-07-24-50.json`;
  writeFileSync(file, JSON.stringify({ events, canon, revisions, memories, history, facts, famChanges, clockBefore: CLOCK_BEFORE }, null, 1));
  for (const f of facts) await p.worldFact.updateMany({ where: { supersededById: f.id }, data: { supersededById: null } });
  await p.worldFact.deleteMany({ where: { id: { in: facts.map((f: any) => f.id) } } });
  await p.dayaMemoryEntry.deleteMany({ where: { id: { in: memories.map((m: any) => m.id) } } });
  if (canonIds.length) await p.canonRevision.deleteMany({ where: { canonEventId: { in: canonIds } } });
  await p.canonEvent.deleteMany({ where: { id: { in: canonIds } } });
  await prisma.campaignEvent.deleteMany({ where: { id: { in: events.map((e) => e.id) } } });
  await p.historyEntry.deleteMany({ where: { id: { in: history.map((h: any) => h.id) } } });
  if (famChanges.length) await p.familiarityChange.deleteMany({ where: { id: { in: famChanges.map((f: any) => f.id) } } });
  await prisma.campaign.update({ where: { id: CAMP }, data: { currentCycle: CLOCK_BEFORE } });
  console.log(`rewound the jump: ${events.length} events, ${canon.length} canon (+${revisions.length} revisions), ${memories.length} memories, ${history.length} history, ${facts.length} facts, ${famChanges.length} familiarity changes; clock → ${CLOCK_BEFORE}; archive ${file}`);
  process.exit(0);
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
