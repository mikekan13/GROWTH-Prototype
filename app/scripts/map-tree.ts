/**
 * Print a character's home as the top-down map tree (2026-10-16):
 *   npx tsx scripts/map-tree.ts [characterId]
 */
import './_server-only-shim';
import { prisma } from '../src/lib/db';
import { contentsTree, renderTree } from '../src/services/placement';

const id = process.argv[2] ?? 'cms60ndtn0000kw48ioq10i68';

async function main() {
  const home = await prisma.entityRelationship.findFirst({ where: { sourceId: id, relationshipType: 'home', targetType: 'LOCATION' }, select: { targetId: true } });
  if (!home) { console.log('no home'); return; }
  const loc = await prisma.location.findUnique({ where: { id: home.targetId }, select: { name: true } });
  const tree = await contentsTree(home.targetId);
  console.log(`▣ ${loc?.name ?? home.targetId}`);
  console.log(renderTree(tree, 1).join('\n'));
  const loose = await prisma.campaignItem.count({ where: { holderId: null, locationId: home.targetId, status: 'ACTIVE', NOT: { id: { in: (await prisma.entityRelationship.findMany({ where: { relationshipType: 'located_at', sourceType: 'CAMPAIGN_ITEM' }, select: { sourceId: true } })).map(e => e.sourceId) } } } });
  console.log(`(unplaced things in the home: ${loose})`);
}
main().finally(() => prisma.$disconnect());
