/** Michael 2026-11-02: "Reset us back to session 2. Clear this and fix everything."
 *  Everything session 3 wrote (from its start, 2026-11-03T01:25:31Z DB time, to now) goes to the archive and out of the
 *  record; GameSession 3's row is removed too so the next start is session 3 again; the clock returns to the end of the
 *  stretch (Monday 19 Oct, 10 pm). Run: cd app && npx tsx ../tmp/rewind-session3-2026-11-02.ts [--dry] */
import { prisma } from '../app/src/lib/db';
import { writeFileSync, mkdirSync } from 'fs';
const CAMP = 'cms5z4j6z0000zg48z5vzl2jn';
const FROM = new Date('2026-11-03T02:27:00Z');
const SESSION3 = 'cmw02hkop0000yo48jdrizlny';
const CLOCK_BEFORE = 0.007730377980720446;
const DRY = process.argv.includes('--dry');
(async () => {
  const p = prisma as any;
  const win = { gte: FROM };
  const entityIds = (await p.dayaEntity.findMany({ where: { character: { campaignId: CAMP } }, select: { id: true } })).map((e: any) => e.id);
  const events = await prisma.campaignEvent.findMany({ where: { campaignId: CAMP, createdAt: win } });
  const canon = await p.canonEvent.findMany({ where: { campaignId: CAMP, createdAt: win } });
  const canonIds = canon.map((c: any) => c.id);
  const revisions = canonIds.length ? await p.canonRevision.findMany({ where: { canonEventId: { in: canonIds } } }) : [];
  const memories = await p.dayaMemoryEntry.findMany({ where: { entityId: { in: entityIds }, realTime: win } });
  const intentions = await p.dayaIntention.findMany({ where: { entityId: { in: entityIds }, createdAt: win } });
  const history = await p.historyEntry.findMany({ where: { campaignId: CAMP, realTime: win } }).catch(() => []);
  const facts = await p.worldFact.findMany({ where: { campaignId: CAMP, establishedAtCycle: { gt: CLOCK_BEFORE } } });
  const famChanges = await p.familiarityChange.findMany({ where: { createdAt: win } }).catch(() => []);
  const lastKnown = await p.lastKnown.findMany({ where: { updatedAt: win } }).catch(() => []);
  const copilot = await p.copilotMessage.findMany({ where: { campaignId: CAMP, createdAt: win } });
  const gameSession = await p.gameSession.findUnique({ where: { id: SESSION3 } }).catch(() => null);
  const counts = { events: events.length, canon: canon.length, revisions: revisions.length, memories: memories.length, intentions: intentions.length, history: history.length, facts: facts.length, famChanges: famChanges.length, lastKnown: lastKnown.length, copilot: copilot.length, gameSession: !!gameSession };
  console.log(JSON.stringify(counts));
  if (DRY) { process.exit(0); }
  mkdirSync('data/archive', { recursive: true });
  const file = `data/archive/session2c-rewind-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  writeFileSync(file, JSON.stringify({ events, canon, revisions, memories, intentions, history, facts, famChanges, lastKnown, copilot, gameSession, clockBefore: CLOCK_BEFORE }, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 1));
  for (const f of facts) await p.worldFact.updateMany({ where: { supersededById: f.id }, data: { supersededById: null } });
  await p.worldFact.deleteMany({ where: { id: { in: facts.map((f: any) => f.id) } } });
  await p.dayaMemoryEntry.deleteMany({ where: { id: { in: memories.map((m: any) => m.id) } } });
  await p.dayaIntention.deleteMany({ where: { id: { in: intentions.map((m: any) => m.id) } } });
  if (canonIds.length) await p.canonRevision.deleteMany({ where: { canonEventId: { in: canonIds } } });
  await p.canonEvent.deleteMany({ where: { id: { in: canonIds } } });
  await prisma.campaignEvent.deleteMany({ where: { id: { in: events.map((e) => e.id) } } });
  if (history.length) await p.historyEntry.deleteMany({ where: { id: { in: history.map((h: any) => h.id) } } });
  if (famChanges.length) await p.familiarityChange.deleteMany({ where: { id: { in: famChanges.map((f: any) => f.id) } } });
  if (lastKnown.length) await p.lastKnown.deleteMany({ where: { id: { in: lastKnown.map((f: any) => f.id) } } });
  if (copilot.length) await p.copilotMessage.deleteMany({ where: { id: { in: copilot.map((f: any) => f.id) } } });
  if (gameSession) await p.gameSession.delete({ where: { id: SESSION3 } });
  await prisma.campaign.update({ where: { id: CAMP }, data: { currentCycle: CLOCK_BEFORE } });
  console.log(`rewound session 2 (third try) → clock ${CLOCK_BEFORE}; archive ${file}`);
  process.exit(0);
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
