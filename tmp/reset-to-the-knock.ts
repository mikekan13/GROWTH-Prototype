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
  // Memories dated BEFORE play (seeded history, narrativeCycle < 0) are part of the world, not of the run.
  const memories = await p.dayaMemoryEntry.findMany({ where: { entityId: { in: entityIds }, realTime: since, narrativeCycle: { gte: 0 } } });
  const history = await p.historyEntry.findMany({ where: { campaignId: CAMP, realTime: since } });
  const facts = (await p.worldFact.findMany({ where: { campaignId: CAMP, establishedAtCycle: { gte: CLOCK_AT_THE_KNOCK } } })).filter((f: any) => !KEEP_FACTS.has(f.id));
  // Seeded familiarity (lastSource 'seed' — the shared history between Kristopher and Violet) stays.
  const familiarity = await p.familiarity.findMany({ where: { campaignId: CAMP, lastSource: { not: 'seed' } } });
  const famChanges = await p.familiarityChange.findMany({ where: { campaignId: CAMP, source: { not: 'seed' } } });
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
  const label = (process.argv.find((a) => a.startsWith('--label=')) ?? '--label=').slice(8) || 'reset';
  const file = `data/archive/reset-to-the-knock-${new Date().toISOString().replace(/[:.]/g, '-')}-${label}.json`; // never overwrite an earlier archive
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
  await p.familiarityChange.deleteMany({ where: { campaignId: CAMP, source: { not: 'seed' } } });
  await p.familiarity.deleteMany({ where: { campaignId: CAMP, lastSource: { not: 'seed' } } });
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
  // Fog of war (2026-10-28): what each being last knew is wiped with the world, then each one looks around
  // from where it stands so the first map a Trailblazer loads is what their character can see at the knock.
  // (Needs the server-only shim: run with `npx tsx --tsconfig ../tmp/tsconfig.recall.json`.)
  const wiped = await p.lastKnown.deleteMany({ where: { campaignId: CAMP } });
  // Ordinary competence (2026-10-30): every routine back to READY at its first end — the pizza has not come yet.
  const routinesReset = await p.dayaRoutine.updateMany({ where: { entity: { character: { campaignId: CAMP } } }, data: { status: 'READY', cursor: 0, steps: 0, startedCycle: null } }).catch(() => ({ count: 0 }));
  console.log(`routines re-armed: ${routinesReset.count}`);
  let looked = 0;
  try {
    const { loadWorldLevel, beingStanding } = await import('../app/src/services/spatial-world');
    const { lookAround } = await import('../app/src/services/spatial-perception');
    const { map } = await loadWorldLevel(CAMP);
    const beings = await p.character.findMany({ where: { campaignId: CAMP, status: { notIn: ['DEAD', 'RETIRED'] } }, select: { id: true } });
    for (const b of beings) { const s = await beingStanding(map, b.id); if (s) { await lookAround(CAMP, b.id, map, s.point); looked++; } }
  } catch (e) { console.warn('look-around skipped (run with --tsconfig ../tmp/tsconfig.recall.json):', (e as Error).message); }
  // Facts follow the map (2026-10-29): the placement facts of every drawn thing and Kristopher's position fact were
  // written at the knock's own cycle, so the wipe above takes them with the run. The map is the truth — rebuild them from it.
  let refacted = 0;
  try {
    const { thingPlaced, beingPlaced, cornersOf, roomContext } = await import('../app/src/services/thing-facts');
    const { parseFootprint, footprintBounds, fractionToWorld, parseMapShape } = await import('../app/src/lib/canvas-geometry');
    const { loadWorldLevel, beingStanding } = await import('../app/src/services/spatial-world');
    const parse = (raw: string | null): any => { try { const d = raw ? JSON.parse(raw) : {}; return d && typeof d === 'object' ? d : {}; } catch { return {}; } };
    const edges = await p.entityRelationship.findMany({ where: { campaignId: CAMP, relationshipType: 'located_at', sourceType: 'CAMPAIGN_ITEM', targetType: 'LOCATION' } });
    for (const e of edges) {
      const pos = parse(e.data).position;
      if (!pos || typeof pos.x !== 'number') continue;
      const room = await p.location.findUnique({ where: { id: e.targetId }, select: { data: true } });
      const fp = room ? parseFootprint(parse(room.data).footprint) : null;
      const ctx = fp ? await roomContext(CAMP, e.targetId) : null;
      const item = await p.campaignItem.findUnique({ where: { id: e.sourceId }, select: { id: true, name: true, data: true, status: true } });
      if (!fp || !ctx || !item || item.status !== 'ACTIVE') continue;
      const world = fractionToWorld(pos, footprintBounds(fp.points));
      await thingPlaced(CAMP, { id: item.id, name: item.name }, ctx.room, ctx.portals, { at: world, corners: cornersOf(world, parseMapShape(parse(item.data).mapShape)) }, ctx.others);
      refacted++;
    }
    const { map } = await loadWorldLevel(CAMP);
    const ks = await beingStanding(map, KRIS);
    if (ks?.room) { await beingPlaced(CAMP, { id: KRIS, name: 'Kristopher' }, ks.room.id, ks.point); refacted++; }
    // Violet's token goes back to the middle of the Main Room, where her seed fact has her ("on the worn path between the
    // couch and the desk") — HW10 left her at the entry door. The walk broadcasts to every open canvas.
    const { moveBeing } = await import('../app/src/services/being-movement');
    const main = map.rooms.find((r) => r.id === MAIN_ROOM);
    if (main) {
      const cx = main.points.reduce((a, q) => a + q.x, 0) / main.points.length;
      const cy = main.points.reduce((a, q) => a + q.y, 0) / main.points.length;
      const walk = await moveBeing(CAMP, VIOLET, { kind: 'point', point: { x: cx, y: cy } }, { cause: 'gm' });
      console.log(walk.ok ? `Violet → the middle of the Main Room (${walk.feet} ft)` : `Violet stays: ${walk.reason}`);
    }
    // Kristopher starts at the top of the stairs, the far end of the landing from her door (Mike 2026-10-29: "at the
    // entryway to the fourth floor landing… not at her door"): the square against the door-side wall, 15 ft down.
    const KRIS_START = { x: -50, y: 950 };
    const kw = await moveBeing(CAMP, KRIS, { kind: 'point', point: KRIS_START }, { cause: 'gm' });
    console.log(kw.ok ? `Kristopher → the top of the stairs (${kw.feet} ft)` : `Kristopher stays: ${kw.reason}`);
    const ks2 = await beingStanding(map, KRIS);
    if (ks2?.room) await beingPlaced(CAMP, { id: KRIS, name: 'Kristopher' }, ks2.room.id, ks2.point);
  } catch (e) { console.warn('facts-from-the-map skipped:', (e as Error).message); }
  console.log(`reset to the knock: archive ${file}; clock → ${CLOCK_AT_THE_KNOCK}; Violet → Main Room; pizza → Kristopher; entry door locked; last-known wiped (${wiped.count}) and ${looked} beings looked around; ${refacted} placement facts rebuilt from the map`);
  process.exit(0);
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
