/**
 * Session 0 setup (Mike 2026-10-17): the fourth-floor landing outside Violet's
 * door, Kristopher (NPC, voiced by the Watcher) with the pizza, and the
 * five-dollar bill with her number. Idempotent by name. Run from app/:
 *   npx tsx ../tmp/session0-setup.ts
 */
import { prisma } from '../app/src/lib/db';
import { createDefaultCharacter } from '../app/src/lib/defaults';
import { DEFAULT_SCALE_FT_PER_UNIT as S, footprintBounds, makeMapShape, worldToFraction } from '../app/src/lib/canvas-geometry';

const CAMPAIGN = 'cms5z4j6z0000zg48z5vzl2jn';
const GM = 'cmrep1oh300002g48ue1bn5rg';
const APARTMENT = 'cmv5x69xp004y1448l1sqlkjc';
const MAIN_ROOM = 'cmvahhpg00001ss48yarg3fbg';
const VIOLET = 'cms60ndtn0000kw48ioq10i68';
const now = Date.now();
const u = (ft: number) => ft / S; // feet → map units

async function edge(sourceId: string, sourceType: string, targetId: string, targetType: string, relationshipType: string, data?: object) {
  const found = await prisma.entityRelationship.findFirst({ where: { sourceId, targetId, relationshipType } });
  if (found) return found;
  return prisma.entityRelationship.create({ data: { campaignId: CAMPAIGN, sourceId, sourceType, targetId, targetType, relationshipType, strength: 5, ...(data ? { data: JSON.stringify(data) } : {}) } });
}

async function main() {
  // ── The landing: 10 ft wide, 20 ft long, against the apartment's left wall (x = 0).
  const landingPts = [{ x: -u(10), y: 600 }, { x: 0, y: 600 }, { x: 0, y: 600 + u(20) }, { x: -u(10), y: 600 + u(20) }];
  let landing = await prisma.location.findFirst({ where: { campaignId: CAMPAIGN, name: 'Fourth-floor landing' } });
  const landingData = {
    description: 'The fourth-floor landing of the walkup: a narrow hall of scuffed hexagonal tile under one caged ceiling bulb. Violet\'s door at the near end; the stair down at the far end, its second and fourth steps from the top creaking.',
    environment: 'Indoor, pre-war walkup stairwell',
    tags: ['landing', 'stairwell', 'hall'],
    footprint: { points: landingPts, scale: S, level: 0, height: 9.5 },
    footprintAt: now,
    openings: [
      { id: 'op-1', kind: 'opening', a: { x: -u(10), y: 600 + u(15) }, b: { x: -u(10), y: 600 + u(20) }, between: ['Fourth-floor landing', 'stairs down'], name: 'Stair down' },
    ],
  };
  if (!landing) {
    landing = await prisma.location.create({ data: { campaignId: CAMPAIGN, name: 'Fourth-floor landing', type: 'building', status: 'PLANNING', createdBy: GM, data: JSON.stringify(landingData) } });
  } else {
    await prisma.location.update({ where: { id: landing.id }, data: { data: JSON.stringify({ ...JSON.parse(landing.data), ...landingData }) } });
  }

  // The entry door now opens onto the landing (it read "stairwell").
  const apt = await prisma.location.findUniqueOrThrow({ where: { id: APARTMENT } });
  const aptData = JSON.parse(apt.data);
  aptData.openings = (aptData.openings ?? []).map((o: { id: string; between: string[] }) => o.id === 'op-1' ? { ...o, between: ['Main Room', 'Fourth-floor landing'] } : o);
  await prisma.location.update({ where: { id: APARTMENT }, data: { data: JSON.stringify(aptData) } });

  // ── Kristopher: the delivery driver, on the landing at her door, voiced by the Watcher.
  let kris = await prisma.character.findFirst({ where: { campaignId: CAMPAIGN, name: 'Kristopher' } });
  const at = { x: -u(2.5), y: 600 + u(2.5) }; // the square right outside her door
  if (!kris) {
    const sheet = createDefaultCharacter('Kristopher') as unknown as Record<string, unknown>;
    kris = await prisma.character.create({
      data: {
        name: 'Kristopher', entityType: 'NPC', userId: GM, campaignId: CAMPAIGN, status: 'ACTIVE',
        data: JSON.stringify({
          ...sheet,
          identity: { ...(sheet.identity as object), name: 'Kristopher', description: 'Pizza delivery driver, mid-twenties. Always stays a few seconds longer than the delivery needs.' },
          canvasX: at.x, canvasY: at.y, canvasPlacedAt: now,
        }),
      },
    });
  }
  await edge(kris.id, 'CHARACTER', landing.id, 'LOCATION', 'located_at');

  // ── The pizza, in his hands.
  let pizza = await prisma.campaignItem.findFirst({ where: { campaignId: CAMPAIGN, name: 'Pizza (Hawaiian + black olives)' } });
  if (!pizza) {
    pizza = await prisma.campaignItem.create({
      data: {
        campaignId: CAMPAIGN, createdBy: GM, name: 'Pizza (Hawaiian + black olives)', type: 'consumable', holderId: kris.id, status: 'ACTIVE',
        data: JSON.stringify({ description: 'A large Hawaiian with black olives in a warm cardboard box — her standing order.', primaryMaterial: 'Cardboard', weightLbs: 3, value: 0.1, mapShape: makeMapShape({ sizeFt: { w: 1.5, d: 1.5 } }) }),
      },
    });
  }

  // ── The five-dollar bill with her number, folded by the door (inside, Main Room).
  let bill = await prisma.campaignItem.findFirst({ where: { campaignId: CAMPAIGN, name: 'Five-dollar bill with her number' } });
  if (!bill) {
    bill = await prisma.campaignItem.create({
      data: {
        campaignId: CAMPAIGN, createdBy: GM, name: 'Five-dollar bill with her number', type: 'misc', status: 'ACTIVE',
        data: JSON.stringify({ description: 'A five-dollar bill, folded once. Her phone number in blue ink along the white border.', primaryMaterial: 'Paper', weightLbs: 0.002, value: 0 }),
      },
    });
  }
  await edge(VIOLET, 'CHARACTER', bill.id, 'CAMPAIGN_ITEM', 'owns');
  const room = await prisma.location.findUniqueOrThrow({ where: { id: MAIN_ROOM } });
  const roomFp = JSON.parse(room.data).footprint;
  const spot = { x: u(1.25), y: 600 + u(6.25) }; // just inside, beside the door
  const pos = worldToFraction(spot, footprintBounds(roomFp.points));
  const loc = await prisma.entityRelationship.findFirst({ where: { sourceId: bill.id, relationshipType: 'located_at' } });
  if (loc) await prisma.entityRelationship.update({ where: { id: loc.id }, data: { targetId: MAIN_ROOM, data: JSON.stringify({ position: pos, positionAt: now }) } });
  else await edge(bill.id, 'CAMPAIGN_ITEM', MAIN_ROOM, 'LOCATION', 'located_at', { position: pos, positionAt: now });

  console.log(JSON.stringify({ landing: landing.id, kristopher: kris.id, pizza: pizza.id, bill: bill.id }));
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
