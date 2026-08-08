/** Scratch: inspect Incubator items — where they live, what their data holds. */
import './_server-only-shim';
import { prisma } from '../src/lib/db';

const CAMPAIGN = 'cms5z4j6z0000zg48z5vzl2jn';

(async () => {
  const items = await prisma.campaignItem.findMany({
    where: { campaignId: CAMPAIGN },
    select: { id: true, name: true, type: true, locationId: true, data: true },
  });
  const locNames = new Map(
    (await prisma.location.findMany({ where: { campaignId: CAMPAIGN }, select: { id: true, name: true } })).map(l => [l.id, l.name]),
  );
  console.log('items:', items.length);
  for (const i of items) {
    const d = JSON.parse(i.data) as Record<string, unknown>;
    const desc = typeof d.description === 'string' ? d.description : '';
    console.log(`- "${i.name}" (${i.type}) in ${i.locationId ? locNames.get(i.locationId) : 'NOWHERE'} | data keys: ${Object.keys(d).join(',')} | desc ${desc.length} chars: ${desc.slice(0, 100)}`);
  }
  const edges = await prisma.entityRelationship.count({
    where: { campaignId: CAMPAIGN, relationshipType: 'located_at', sourceType: 'CAMPAIGN_ITEM' },
  });
  console.log('item located_at edges:', edges);
  const facts = await prisma.worldFact.count({ where: { campaignId: CAMPAIGN, supersededById: null } });
  console.log('live world facts:', facts);
  await prisma.$disconnect();
})();
