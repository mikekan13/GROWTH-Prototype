/** Mike 25 Oct (after HW5): "clear all session history and memories. Reset everything including time back to the
 *  moment Kris first arrives with the pizza. We will try again with your fixes."
 *  Play began 2026-10-17T14:15:30Z (session 1). Everything written since goes to the archive and out of the record;
 *  the beings keep their seeded lives (memories before then); the world goes back to the knock: clock 0.0022,
 *  Violet in the Main Room, Kristopher on the landing with the pizza, the entry door locked.
 *  Usage: npx tsx ../tmp/reset-to-the-knock.ts [--dry] (from app/) */
import { prisma } from '../app/src/lib/db';
import { writeFileSync, mkdirSync } from 'fs';
const CAMP = 'cms5z4j6z0000zg48z5vzl2jn';
const VIOLET = 'cms60ndtn0000kw48ioq10i68';
const KRIS = 'cmvcbw49u0001h448qanzbhs3';
const MAIN_ROOM = 'cmvahhpg00001ss48yarg3fbg';
const PIZZA = 'cmvcbwayx0000p848640u05g2';
const SINCE = new Date('2026-10-17T14:15:00Z');
const CLOCK_AT_THE_KNOCK = 0.0022;
const KEEP_FACTS = new Set(['cmvfix179287604387kris40']); // the Kris-is-forty correction of a seed fact (cycle 0)
const dry = process.argv.includes('--dry');
(async () => {
  const p = prisma as any;
  const since = { gte: SINCE };
  const entities = await p.dayaEntity.findMany({ where: { character: { campaignId: CAMP } }, select: { id: true, characterId: true } });
  const entityIds = entities.map((e: any) => e.id);
  const events = await prisma.campaignEvent.findMany({ where: { campaignId: CAMP, createdAt: since } });
  const canon = await p.canonEvent.findMany({ where: { campaignId: CAMP, createdAt: since } });
  const canonIds = canon.map((c: any) => c.id);
  const revisions = canonIds.length ? await p.canonRevision.findMany({ where: { canonEventId: { in: canonIds } } }) : [];
  const memories = await p.dayaMemoryEntry.findMany({ where: { entityId: { in: entityIds }, realTime: since } });
  const history = await p.historyEntry.findMany({ where: { campaignId: CAMP, realTime: since } });
  const facts = (await p.worldFact.findMany({ where: { campaignId: CAMP, establishedAtCycle: { gte: CLOCK_AT_THE_KNOCK } } })).filter((f: any) => !KEEP_FACTS.has(f.id));
  const familiarity = await p.familiarity.findMany({ where: { campaignId: CAMP } });
  const famChanges = await p.familiarityChange.findMany({ where: { campaignId: CAMP } });
  const vines = await p.vineEntry.findMany({ where: { campaignId: CAMP } });
  const recon = await p.reconciliation.findMany({ where: { campaignId: CAMP } });
  const sessions = await p.gameSession.findMany({ where: { campaignId: CAMP } });
  const copilot = await p.copilotMessage.findMany({ where: { campaignId: CAMP, createdAt: since } });
  const affect = await p.dayaAffect.findMany({ where: { entityId: { in: entityIds } } });
  // Intentions (2026-10-25): the rows the run's own memories spawned go; the seeds' rows stay and any DONE during play is PENDING again.
  const intentions = await p.dayaIntention.findMany({ where: { entityId: { in: entityIds }, OR: [{ sourceMemoryId: { in: memories.map((m: any) => m.id) } }, { status: 'DONE' }] } });
  const located = await p.entityRelationship.findMany({ where: { campaignId: CAMP, relationshipType: 'located_at', sourceId: { in: [VIOLET, KRIS] } } });
  const pizza = await p.campaignItem.findUnique({ where: { id: PIZZA } });
  const campaign = await prisma.campaign.findUnique({ where: { id: CAMP }, select: { currentCycle: true } });
  const summary = {
    events: events.length, canon: canon.length, revisions: revisions.length, memories: memories.length, history: history.length,
    facts: facts.length, familiarity: familiarity.length, famChanges: famChanges.length, vines: vines.length, recon: recon.length,
    sessions: sessions.length, copilot: copilot.length, clockBefore: campaign?.currentCycle,
    intentions: intentions.length,
    violetWas: located.find((r: any) => r.sourceId === VIOLET)?.targetId, pizzaHolderWas: pizza?.holderId,
  };
  console.log((dry ? 'DRY RUN — would remove: ' : 'removing: ') + JSON.stringify(summary));
  if (dry) { process.exit(0); }
  mkdirSync('data/archive', { recursive: true });
  const file = 'data/archive/reset-to-the-knock-2026-10-25-after-hw8a.json';
  writeFileSync(file, JSON.stringify({ since: SINCE, intentions, events, canon, revisions, memories, history, facts, familiarity, famChanges, vines, recon, sessions, copilot, affect, located, pizza, clockBefore: campaign?.currentCycle }, null, 1));
  for (const f of facts) await p.worldFact.updateMany({ where: { supersededById: f.id }, data: { supersededById: null } });
  await p.worldFact.deleteMany({ where: { id: { in: facts.map((f: any) => f.id) } } });
  await p.dayaMemoryEntry.deleteMany({ where: { id: { in: memories.map((m: any) => m.id) } } });
  await p.dayaIntention.deleteMany({ where: { id: { in: intentions.filter((i: any) => memories.some((m: any) => m.id === i.sourceMemoryId)).map((i: any) => i.id) } } });
  await p.dayaIntention.updateMany({ where: { entityId: { in: entityIds }, status: 'DONE' }, data: { status: 'PENDING' } });
  if (canonIds.length) await p.canonRevision.deleteMany({ where: { canonEventId: { in: canonIds } } });
  await p.vineEntry.deleteMany({ where: { campaignId: CAMP } });
  await p.reconciliation.deleteMany({ where: { campaignId: CAMP } });
  await p.canonEvent.deleteMany({ where: { id: { in: canonIds } } });
  await prisma.campaignEvent.deleteMany({ where: { id: { in: events.map((e) => e.id) } } });
  await p.historyEntry.deleteMany({ where: { id: { in: history.map((h: any) => h.id) } } });
  await p.familiarityChange.deleteMany({ where: { campaignId: CAMP } });
  await p.familiarity.deleteMany({ where: { campaignId: CAMP } });
  await p.gameSession.deleteMany({ where: { campaignId: CAMP } });
  await p.copilotMessage.deleteMany({ where: { id: { in: copilot.map((c: any) => c.id) } } });
  await p.dayaEntity.updateMany({ where: { id: { in: entityIds } }, data: { dreamPressure: 0 } });
  // The world at the knock.
  await prisma.campaign.update({ where: { id: CAMP }, data: { currentCycle: CLOCK_AT_THE_KNOCK } });
  const violetAt = located.find((r: any) => r.sourceId === VIOLET);
  if (violetAt) await p.entityRelationship.update({ where: { id: violetAt.id }, data: { targetId: MAIN_ROOM } });
  await p.campaignItem.update({ where: { id: PIZZA }, data: { holderId: KRIS, locationId: null, history: '[]' } });
  const apt = await p.location.findUnique({ where: { id: 'cmv5x69xp004y1448l1sqlkjc' }, select: { data: true } });
  if (apt) {
    const data = JSON.parse(apt.data);
    for (const o of data.openings ?? []) { if (o.name === 'Entry door') o.state = 'locked'; if (o.name === 'Bathroom door') o.state = 'closed'; }
    await p.location.update({ where: { id: 'cmv5x69xp004y1448l1sqlkjc' }, data: { data: JSON.stringify(data) } });
  }
  console.log(`reset to the knock: archive ${file}; clock → ${CLOCK_AT_THE_KNOCK}; Violet → Main Room; pizza → Kristopher; entry door locked`);
  process.exit(0);
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
