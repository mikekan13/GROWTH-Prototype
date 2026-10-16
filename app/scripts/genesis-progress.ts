/**
 * Watch a character's genesis walk from the terminal (2026-10-16):
 *   npx tsx scripts/genesis-progress.ts [characterId]
 * Prints the live session (status, stage, blocked reason, last notes) and
 * the evidence the stages read (items, deeds, places, seeds, facts, goals,
 * genesis memories). Read-only.
 */
import './_server-only-shim';
import { prisma } from '../src/lib/db';

const id = process.argv[2] ?? 'cms60ndtn0000kw48ioq10i68';

async function main() {
  const c = await prisma.character.findUnique({ where: { id }, select: { name: true, campaignId: true, data: true } });
  if (!c?.campaignId) throw new Error('no such character in a campaign');
  const s = await prisma.dayaWorkSession.findFirst({ where: { goal: { contains: `[${id}]` } }, orderBy: { startedAt: 'desc' } });
  const notes = s ? (JSON.parse(s.progress || '[]') as string[]) : [];
  console.log(`${c.name} — session ${s?.id ?? '—'} ${s?.status ?? ''} stage=${s?.stage ?? ''} cycles=${s?.cycleCount ?? 0} last=${s?.lastCycleAt?.toISOString().slice(11, 19) ?? '—'}${s?.blockedReason ? ` blocked: ${s.blockedReason}` : ''}`);
  for (const n of notes.slice(-6)) console.log('  ·', n.replace(/\s+/g, ' ').slice(0, 220));
  const deeds = await prisma.entityRelationship.findMany({ where: { sourceId: id, relationshipType: 'owns' }, select: { targetId: true } });
  const [held, places, seeds, goals, locs] = await Promise.all([
    prisma.campaignItem.findMany({ where: { campaignId: c.campaignId, status: 'ACTIVE', OR: [{ holderId: id }, { id: { in: deeds.map(d => d.targetId) } }] }, select: { name: true, locationId: true } }),
    prisma.entityRelationship.findMany({ where: { sourceId: id, targetType: 'LOCATION' }, select: { relationshipType: true, targetId: true } }),
    prisma.character.count({ where: { seededFromId: id } }),
    prisma.goal.count({ where: { characterId: id, status: { in: ['ACTIVE', 'DORMANT'] } } }),
    prisma.location.findMany({ where: { campaignId: c.campaignId }, select: { id: true, name: true }, orderBy: { createdAt: 'desc' }, take: 12 }),
  ]);
  const entity = await prisma.dayaEntity.findUnique({ where: { characterId: id }, select: { id: true } });
  const mem = entity ? await prisma.dayaMemoryEntry.count({ where: { entityId: entity.id, source: { contains: 'genesis:' } } }) : 0;
  const facts = await prisma.worldFact.count({ where: { campaignId: c.campaignId, subjectKey: { startsWith: c.name.split(' ')[0].toLowerCase() }, supersededById: null } });
  const sheet = JSON.parse(c.data) as { wealth?: unknown; _genesisStages?: unknown };
  const locName = new Map(locs.map(l => [l.id, l.name]));
  console.log(`  things ${held.length}: ${held.map(h => `${h.name}${h.locationId ? `@${locName.get(h.locationId) ?? '?'}` : ''}`).join(', ').slice(0, 400)}`);
  console.log(`  places ${places.length}: ${places.map(p => `${locName.get(p.targetId) ?? p.targetId} (${p.relationshipType})`).join(', ')}`);
  console.log(`  seeds ${seeds} · facts ${facts} · goals ${goals} · genesis memories ${mem} · wealth ${JSON.stringify(sheet.wealth ?? null)} · stamps ${JSON.stringify(sheet._genesisStages ?? {})}`);
}
main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
