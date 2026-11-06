/**
 * Remove what the engine wrote for The Incubator AFTER a rollback cut (ticks still in flight when a session ends
 * keep writing for a few seconds). Usage: node --env-file=.env --env-file=.env.local --import tsx ../tmp/scrub-after.ts <fromISO>
 */
import '../app/scripts/_server-only-shim';
import { prisma } from '../app/src/lib/db';

const C = 'cms5z4j6z0000zg48z5vzl2jn';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const p = prisma as any;

async function main() {
  const from = new Date(process.argv[2] ?? '2026-11-06T10:05:00.000Z');
  const chars = await prisma.character.findMany({ where: { campaignId: C }, select: { id: true } });
  const entityIds = (await p.dayaEntity.findMany({ where: { characterId: { in: chars.map((c) => c.id) } }, select: { id: true } })).map((e: { id: string }) => e.id);
  const win = { gte: from };
  const out: Record<string, number> = {};
  out.memories = (await p.dayaMemoryEntry.deleteMany({ where: { entityId: { in: entityIds }, realTime: win } })).count;
  out.intentions = (await p.dayaIntention.deleteMany({ where: { entityId: { in: entityIds }, createdAt: win } }).catch(() => ({ count: 0 }))).count;
  out.events = (await prisma.campaignEvent.deleteMany({ where: { campaignId: C, createdAt: win } })).count;
  out.history = (await p.historyEntry.deleteMany({ where: { campaignId: C, realTime: win } }).catch(() => ({ count: 0 }))).count;
  out.lastKnown = (await p.lastKnown.deleteMany({ where: { updatedAt: win } }).catch(() => ({ count: 0 }))).count;
  out.copilot = (await p.copilotMessage.deleteMany({ where: { campaignId: C, createdAt: win } }).catch(() => ({ count: 0 }))).count;
  out.reconciliations = (await p.reconciliation.deleteMany({ where: { campaignId: C, createdAt: win } }).catch(() => ({ count: 0 }))).count;
  const left = {
    memories: await p.dayaMemoryEntry.count({ where: { entityId: { in: entityIds }, realTime: win } }),
    events: await prisma.campaignEvent.count({ where: { campaignId: C, createdAt: win } }),
    openSessions: await prisma.gameSession.count({ where: { campaignId: C, endedAt: null } }),
  };
  console.log('removed', JSON.stringify(out), 'left', JSON.stringify(left));
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
