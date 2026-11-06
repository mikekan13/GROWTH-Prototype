/** Put a character at a location (the Watcher's correction). node ... ../tmp/set-location.ts <characterId> <locationId|exact location name> */
import '../app/scripts/_server-only-shim';
import { prisma } from '../app/src/lib/db';
const C = 'cms5z4j6z0000zg48z5vzl2jn';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const p = prisma as any;
async function main() {
  const [characterId, where] = process.argv.slice(2);
  if (!characterId || !where) throw new Error('usage: set-location.ts <characterId> <locationId|name>');
  const loc = (await prisma.location.findFirst({ where: { campaignId: C, OR: [{ id: where }, { name: where }] }, select: { id: true, name: true } }));
  if (!loc) throw new Error(`no location "${where}"`);
  const who = await prisma.character.findUniqueOrThrow({ where: { id: characterId }, select: { name: true } });
  const before = await p.entityRelationship.findMany({ where: { campaignId: C, sourceId: characterId, sourceType: 'CHARACTER', relationshipType: 'located_at' }, select: { id: true, targetId: true } });
  await p.entityRelationship.deleteMany({ where: { campaignId: C, sourceId: characterId, sourceType: 'CHARACTER', relationshipType: { in: ['located_at', 'inside'] } } });
  await p.entityRelationship.create({ data: { campaignId: C, sourceId: characterId, sourceType: 'CHARACTER', targetId: loc.id, targetType: 'LOCATION', relationshipType: 'located_at' } });
  console.log(`${who.name}: located_at ${before.map((b: { targetId: string }) => b.targetId).join(',') || 'none'} -> ${loc.name} (${loc.id})`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
