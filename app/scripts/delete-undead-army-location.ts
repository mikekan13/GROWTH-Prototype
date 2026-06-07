/**
 * Cleanup: Undead Army was seeded as a Location (type=force) earlier, but
 * the design calls for a Group/Tag primitive that doesn't exist yet. Delete
 * the Location row and any edges referencing it so the canvas doesn't keep
 * representing it as a place. When the Group primitive lands, Undead Army
 * will be re-created properly as a tag on its constituent characters.
 *
 * Tara's `possesses` edge to Undead Army was a deed-link; once Undead Army
 * is a Group, ownership can be re-expressed as "Tara controls the Undead
 * Army group" — different semantics, separate from this row.
 */
import { prisma } from '../src/lib/db';

const main = async () => {
  const loc = await prisma.location.findFirst({ where: { name: 'Undead Army' } });
  if (!loc) {
    console.log('[skip] no Location named "Undead Army"');
    return;
  }
  // Delete any edges that reference this Location (in either direction).
  const edgesDeleted = await prisma.entityRelationship.deleteMany({
    where: {
      OR: [
        { sourceId: loc.id },
        { targetId: loc.id },
      ],
    },
  });
  console.log(`[edges] deleted ${edgesDeleted.count} relationships referencing Undead Army`);
  await prisma.location.delete({ where: { id: loc.id } });
  console.log(`[location] deleted Undead Army (${loc.id})`);
};

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
