/**
 * SEAT KRISTOPHER IN THE FUSION (2026-11-04, before the Day 6 live test).
 * The Monday-10-pm snapshot had his token at a stray card point (8845, 3325) right of the hotel block, and the car at a
 * fraction (0.2625, 0.7625) of the lot. Michael's drags at 21:03Z moved the car to the lot's edge. This puts the car back
 * at its snapshot point and seats his token ON the car, in the lot, with a token_moved broadcast so the open canvas follows.
 *   cd app && node --env-file=.env --env-file=.env.local --import tsx ../tmp/seat-kristopher-in-the-fusion.ts
 */
import '../app/scripts/_server-only-shim';
import { prisma } from '../app/src/lib/db';
import { stampBeingPoint, placeBeingInRoom } from '../app/src/services/spatial-world';

const C = 'cms5z4j6z0000zg48z5vzl2jn';
const KRISTOPHER = 'cmvcbw49u0001h448qanzbhs3';
const FUSION = 'cmvcfyn460009zc48xhwl6kb8';
const LOT = 'cmvx8qwny0052vg48nwda5s23'; // the lot behind the hotel (footprint 0..2000 x 1800..3800)
const FRACTION = { x: 0.2625, y: 0.7625 }; // the car's point in the snapshot
const WORLD = { x: 0 + FRACTION.x * 2000, y: 1800 + FRACTION.y * 2000 }; // (525, 3325)

async function main() {
  const edge = await prisma.entityRelationship.findFirst({ where: { campaignId: C, sourceId: FUSION, relationshipType: 'located_at' } });
  if (!edge) throw new Error('no located_at edge for the Fusion');
  await prisma.entityRelationship.update({ where: { id: edge.id }, data: { targetId: LOT, targetType: 'LOCATION', data: JSON.stringify({ position: FRACTION, positionAt: Date.now() }) } });
  await prisma.campaignItem.update({ where: { id: FUSION }, data: { locationId: LOT } });
  await stampBeingPoint(KRISTOPHER, WORLD);
  const ok = await placeBeingInRoom(C, KRISTOPHER, LOT, 'gm');
  const k = await prisma.character.findUnique({ where: { id: KRISTOPHER }, select: { data: true } });
  const d = JSON.parse(k!.data) as { canvasX?: number; canvasY?: number };
  console.log('fusion at', FRACTION, '→', WORLD, '| kristopher at', d.canvasX, d.canvasY, '| placed in lot:', ok);
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });
