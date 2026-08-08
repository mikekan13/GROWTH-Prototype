/** Scratch: inspect Incubator locations — status, canvas coords, nesting. */
import './_server-only-shim';
import { prisma } from '../src/lib/db';

const CAMPAIGN = 'cms5z4j6z0000zg48z5vzl2jn';

(async () => {
  const locs = await prisma.location.findMany({
    where: { campaignId: CAMPAIGN },
    select: { id: true, name: true, status: true, data: true },
  });
  for (const l of locs) {
    const d = JSON.parse(l.data) as Record<string, unknown>;
    console.log(`${l.name} | status=${l.status} | canvasX=${d.canvasX} canvasY=${d.canvasY}`);
  }
  const edges = await prisma.entityRelationship.findMany({
    where: { campaignId: CAMPAIGN, relationshipType: 'located_at', sourceType: 'LOCATION' },
    select: { sourceId: true, targetId: true },
  });
  console.log('LOCATION located_at edges:', edges.length);
  const items = await prisma.campaignItem.findMany({
    where: { campaignId: CAMPAIGN },
    select: { name: true, locationId: true },
  });
  console.log('campaign items:', items.length, items.map(i => i.name).join(' | ').slice(0, 300));
  await prisma.$disconnect();
})();
