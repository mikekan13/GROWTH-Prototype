/**
 * Description integrity check (Mike 2026-10-16: "ensure all description
 * integrity matches — this would be the truth, not Violet's or other
 * characters' descriptions of things"): for a character's home, print each
 * room's Location description, the live world facts keyed under the home,
 * and the map, so the three can be read side by side.
 *   npx tsx scripts/place-integrity.ts [characterId]
 */
import './_server-only-shim';
import { prisma } from '../src/lib/db';
import { contentsTree, renderTree } from '../src/services/placement';

const id = process.argv[2] ?? 'cms60ndtn0000kw48ioq10i68';

async function main() {
  const c = await prisma.character.findUnique({ where: { id }, select: { name: true, campaignId: true } });
  const home = await prisma.entityRelationship.findFirst({ where: { sourceId: id, relationshipType: 'home', targetType: 'LOCATION' }, select: { targetId: true } });
  if (!c?.campaignId || !home) { console.log('no home'); return; }
  const rooms = await prisma.entityRelationship.findMany({ where: { targetId: home.targetId, relationshipType: 'located_at', sourceType: 'LOCATION' }, select: { sourceId: true } });
  const locs = await prisma.location.findMany({ where: { id: { in: [home.targetId, ...rooms.map(r => r.sourceId)] } }, select: { id: true, name: true, data: true } });
  console.log('== MAP ==');
  const homeLoc = locs.find(l => l.id === home.targetId);
  console.log(`▣ ${homeLoc?.name}`); console.log(renderTree(await contentsTree(home.targetId), 1).join('\n'));
  console.log('\n== ROOM DESCRIPTIONS (Location.data.description) ==');
  for (const l of locs) {
    const d = (() => { try { return JSON.parse(l.data) as { description?: string }; } catch { return {}; } })();
    console.log(`\n▣ ${l.name}\n${(d.description ?? '(none)').replace(/\s+/g, ' ').slice(0, 600)}`);
  }
  console.log('\n== LIVE WORLD FACTS (prefix = her first name) ==');
  const facts = await prisma.worldFact.findMany({ where: { campaignId: c.campaignId, subjectKey: { startsWith: c.name.split(' ')[0].toLowerCase() }, supersededById: null }, orderBy: { subjectKey: 'asc' }, select: { subjectKey: true, fact: true } });
  for (const f of facts) console.log(`${f.subjectKey}: ${f.fact.replace(/\s+/g, ' ').slice(0, 160)}`);
  console.log(`\n${facts.length} live facts`);
}
main().finally(() => prisma.$disconnect());
