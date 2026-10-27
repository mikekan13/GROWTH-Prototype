/**
 * Idempotent repair: for every opening that is a door on every Location of the Incubator campaign,
 * rewrite the current door WorldFact from the map state (the map is the truth).
 * From app/: npx tsx --tsconfig ../tmp/tsconfig.recall.json ../tmp/sync-door-facts.ts
 */
import { prisma } from '@/lib/db';
import { parseOpenings } from '@/lib/canvas-geometry';
import { syncDoorFact } from '@/services/door-facts';

async function main() {
  const camp = await prisma.campaign.findFirst({ where: { name: { contains: 'Incubator' } }, select: { id: true, name: true, currentCycle: true } });
  if (!camp) throw new Error('No Incubator campaign found');
  const locs = await prisma.location.findMany({ where: { campaignId: camp.id }, select: { name: true, data: true } });
  let written = 0, unchanged = 0;
  for (const l of locs) {
    let data: Record<string, unknown> = {};
    try { data = l.data ? JSON.parse(l.data) : {}; } catch { continue; }
    for (const o of parseOpenings(data.openings)) {
      if (o.kind !== 'door') continue;
      const name = o.name ?? 'Door';
      const r = await syncDoorFact(camp.id, { name: l.name }, { name, state: o.state ?? 'closed' }, camp.currentCycle);
      console.log(`${r === 'written' ? 'SYNC ' : 'ok   '} ${l.name} / ${name}: ${o.state ?? 'closed'}`);
      if (r === 'written') written++; else unchanged++;
    }
  }
  console.log(`done: ${written} rewritten, ${unchanged} already true`);
}
main().finally(() => prisma.$disconnect());
