/** Put a campaign item in a character's hand (the Watcher's correction). node ... ../tmp/hold-item.ts <itemId> <characterId> */
import '../app/scripts/_server-only-shim';
import { prisma } from '../app/src/lib/db';
async function main() {
  const [itemId, characterId] = process.argv.slice(2);
  if (!itemId || !characterId) throw new Error('usage: hold-item.ts <itemId> <characterId>');
  const before = await prisma.campaignItem.findUniqueOrThrow({ where: { id: itemId }, select: { name: true, holderId: true, locationId: true } });
  await prisma.campaignItem.update({ where: { id: itemId }, data: { holderId: characterId, locationId: null } });
  const who = await prisma.character.findUniqueOrThrow({ where: { id: characterId }, select: { name: true } });
  console.log(`${before.name}: holder ${before.holderId ?? 'none'} / location ${before.locationId ?? 'none'} -> held by ${who.name}`);
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
