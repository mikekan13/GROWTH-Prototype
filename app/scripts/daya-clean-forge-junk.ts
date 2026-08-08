/** Scratch: delete the 5 mislabeled ForgeItem drafts JEWL filed for
 * "Violet's Apartment" (type=seed, should have been Locations). */
import './_server-only-shim';
import { prisma } from '../src/lib/db';

const CAMPAIGN = 'cms5z4j6z0000zg48z5vzl2jn';

(async () => {
  const junk = await prisma.forgeItem.findMany({
    where: {
      campaignId: CAMPAIGN,
      type: 'seed',
      status: 'draft',
      name: { startsWith: "Violet's Apartment" },
    },
    select: { id: true, name: true },
  });
  for (const j of junk) {
    await prisma.forgeItem.delete({ where: { id: j.id } });
    console.log(`- Deleted draft "${j.name}" (${j.id})`);
  }
  console.log(`${junk.length} junk drafts removed`);
  await prisma.$disconnect();
})();
