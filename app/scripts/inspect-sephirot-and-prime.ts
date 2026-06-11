import { prisma } from '../src/lib/db';

const PRIME = 'cmpll9z3p0000j048aqbgx3vi';
const DUPE = 'cmpdpkcgf0000as486a9zr872';

async function main() {
  const locs = await prisma.location.findMany({
    where: { campaignId: PRIME },
    select: { id: true, name: true, data: true },
  });
  console.log(`__PRIME__ LOCATIONS (${locs.length}):`);
  for (const l of locs) {
    const d = l.data as Record<string, unknown> | null;
    console.log(`  ${l.id} | ${l.name} | status=${d?.status} xy=(${d?.canvasX},${d?.canvasY})`);
  }

  const rels = await prisma.entityRelationship.findMany({ where: { campaignId: PRIME } });
  console.log(`\n__PRIME__ RELATIONSHIPS (${rels.length}):`);
  for (const r of rels) {
    console.log(`  ${r.id} | ${r.fromType}:${r.fromId} -[${r.relationshipType}]-> ${r.toType}:${r.toId}`);
  }

  const dupeChars = await prisma.character.findMany({
    where: { campaignId: DUPE },
    select: { id: true, name: true, status: true },
  });
  console.log(`\nDUPE "The Prime Campaign" CHARACTERS (${dupeChars.length}):`);
  for (const c of dupeChars) console.log(`  ${c.id} | ${c.name} | ${c.status}`);
}

main().finally(() => prisma.$disconnect());
