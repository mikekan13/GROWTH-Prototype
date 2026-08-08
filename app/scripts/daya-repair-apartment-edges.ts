/** Scratch: repair the corrupted located_at graph in The Incubator
 * (bug-scout 2026-08-02): Main Room + Bathroom were re-parented to the
 * Galley Kitchen by accidental drag-reparents, and a reverse edge made
 * Apartment ↔ Kitchen a 2-node cycle. Restore: all three rooms
 * located_at the Apartment; delete the reverse edge. Idempotent. */
import './_server-only-shim';
import { prisma } from '../src/lib/db';

const CAMPAIGN = 'cms5z4j6z0000zg48z5vzl2jn';

(async () => {
  const locs = await prisma.location.findMany({
    where: { campaignId: CAMPAIGN },
    select: { id: true, name: true },
  });
  const byName = new Map(locs.map(l => [l.name, l.id]));
  const apartment = byName.get("Violet's Apartment — Fourth Floor Walkup");
  const rooms = ['Main Room', 'Galley Kitchen Alcove', 'Bathroom']
    .map(n => ({ name: n, id: byName.get(n) }))
    .filter((r): r is { name: string; id: string } => !!r.id);
  if (!apartment) {
    console.error('Apartment location not found — aborting');
    process.exitCode = 1;
    return;
  }

  // 1. Delete the reverse/cyclic edge: Apartment located_at anything.
  const del = await prisma.entityRelationship.deleteMany({
    where: { campaignId: CAMPAIGN, sourceId: apartment, sourceType: 'LOCATION', relationshipType: 'located_at' },
  });
  console.log(`- Removed ${del.count} edge(s) where the Apartment was located_at something`);

  // 2. Each room: exactly one located_at edge, targeting the Apartment.
  for (const room of rooms) {
    await prisma.entityRelationship.deleteMany({
      where: { campaignId: CAMPAIGN, sourceId: room.id, sourceType: 'LOCATION', relationshipType: 'located_at' },
    });
    await prisma.entityRelationship.create({
      data: {
        campaignId: CAMPAIGN,
        sourceId: room.id,
        sourceType: 'LOCATION',
        targetId: apartment,
        targetType: 'LOCATION',
        relationshipType: 'located_at',
        strength: 5,
      },
    });
    console.log(`+ ${room.name} located_at Apartment`);
  }

  // 3. Verify: print the full LOCATION located_at graph.
  const edges = await prisma.entityRelationship.findMany({
    where: { campaignId: CAMPAIGN, sourceType: 'LOCATION', relationshipType: 'located_at' },
    select: { sourceId: true, targetId: true },
  });
  const nameOf = new Map(locs.map(l => [l.id, l.name]));
  for (const e of edges) console.log(`  ${nameOf.get(e.sourceId)} -> ${nameOf.get(e.targetId)}`);
  await prisma.$disconnect();
})();
