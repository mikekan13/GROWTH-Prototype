/**
 * RESTORE THE WORLD to a table-test snapshot, by hand (2026-11-04, between live sessions).
 *   cd app && node --env-file=.env --env-file=.env.local --import tsx ../tmp/restore-world.ts ../tmp/table-test/snapshot-<ts>.json 2026-11-04T08:20:00Z
 * Same rollback as table-test/run.ts restore(): every row since `from`, every non-session thought, places/points/holders/clock
 * from the snapshot, plus any GameSession started since `from`. Read the snapshot path and the time off the command line.
 */
import '../app/scripts/_server-only-shim';
import { readFileSync } from 'node:fs';
import { prisma } from '../app/src/lib/db';

const C = 'cms5z4j6z0000zg48z5vzl2jn';
const p = prisma as any;

async function main() {
  const [snapPath, fromIso] = process.argv.slice(2);
  if (!snapPath || !fromIso) throw new Error('usage: restore-world.ts <snapshot.json> <fromISO>');
  const s = JSON.parse(readFileSync(snapPath, 'utf8'));
  const from = new Date(fromIso);
  if (Number.isNaN(from.getTime())) throw new Error('bad from');
  const win = { gte: from };
  const entityIds = (await p.dayaEntity.findMany({ where: { characterId: { in: s.chars.map((c: any) => c.id) } }, select: { id: true } })).map((e: any) => e.id);
  const before = await prisma.campaignEvent.count({ where: { campaignId: C, createdAt: win } });
  const canon = await p.canonEvent.findMany({ where: { campaignId: C, createdAt: win }, select: { id: true } }).catch(() => []);
  if (canon.length) { await p.canonRevision.deleteMany({ where: { canonEventId: { in: canon.map((c: any) => c.id) } } }).catch(() => undefined); await p.canonEvent.deleteMany({ where: { id: { in: canon.map((c: any) => c.id) } } }); }
  await prisma.campaignEvent.deleteMany({ where: { campaignId: C, createdAt: win } });
  await prisma.campaignEvent.deleteMany({ where: { campaignId: C, type: 'being_thought', sessionId: null } });
  const mem = await p.dayaMemoryEntry.deleteMany({ where: { entityId: { in: entityIds }, realTime: win } });
  await p.dayaIntention.deleteMany({ where: { entityId: { in: entityIds }, createdAt: win } }).catch(() => undefined);
  await p.historyEntry.deleteMany({ where: { campaignId: C, realTime: win } }).catch(() => undefined);
  const keep = new Set(s.factIds.map((f: any) => f.id));
  const now = await p.worldFact.findMany({ where: { campaignId: C }, select: { id: true } });
  const added = now.filter((f: any) => !keep.has(f.id)).map((f: any) => f.id);
  for (const f of s.factIds) await p.worldFact.update({ where: { id: f.id }, data: { supersededById: f.supersededById } }).catch(() => undefined);
  if (added.length) await p.worldFact.deleteMany({ where: { id: { in: added } } });
  await p.familiarityChange.deleteMany({ where: { createdAt: win } }).catch(() => undefined);
  await p.reconciliation.deleteMany({ where: { campaignId: C, createdAt: win } }).catch(() => undefined);
  await p.lastKnown.deleteMany({ where: { updatedAt: win } }).catch(() => undefined);
  await p.copilotMessage.deleteMany({ where: { campaignId: C, createdAt: win } }).catch(() => undefined);
  for (const c of s.chars) await prisma.character.update({ where: { id: c.id }, data: { data: c.data } });
  await p.entityRelationship.deleteMany({ where: { campaignId: C, relationshipType: 'located_at', sourceType: { in: ['CHARACTER', 'CAMPAIGN_ITEM'] } } });
  for (const e of s.edges) { const { id, ...rest } = e; await p.entityRelationship.create({ data: { id, ...rest } }).catch(() => undefined); }
  const have = new Set(s.items.map((i: any) => i.id));
  const madeIds = (await prisma.campaignItem.findMany({ where: { campaignId: C }, select: { id: true } })).filter((i) => !have.has(i.id)).map((i) => i.id);
  if (madeIds.length) await prisma.campaignItem.deleteMany({ where: { id: { in: madeIds } } });
  for (const it of s.items) await prisma.campaignItem.update({ where: { id: it.id }, data: { holderId: it.holderId, locationId: it.locationId, status: it.status, data: it.data, history: it.history } }).catch(() => undefined);
  await prisma.campaign.update({ where: { id: C }, data: { currentCycle: s.cycle } });
  const sess = await p.gameSession.deleteMany({ where: { campaignId: C, startedAt: win } }).catch(() => ({ count: 0 }));
  console.log(`[restore-world] rolled back to ${snapPath} from ${from.toISOString()}: ${before} campaign events, ${mem.count} memories, ${added.length} facts, ${madeIds.length} made items, ${sess.count} session(s); clock ${s.cycle}`);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
