import { prisma } from '@/lib/db';

async function main() {
  const names = ['Violet', 'Kristopher'];
  for (const name of names) {
    const ch = await prisma.character.findFirst({ where: { name }, select: { id: true, campaignId: true } });
    if (!ch) { console.log(name, 'not found'); continue; }
    const ent = await prisma.dayaEntity.findUnique({ where: { characterId: ch.id }, select: { id: true, status: true } });
    if (!ent) { console.log(name, 'no entity'); continue; }
    const mems = await prisma.dayaMemoryEntry.findMany({ where: { entityId: ent.id }, orderBy: { narrativeCycle: 'asc' } });
    const ints = await prisma.dayaIntention.findMany({ where: { entityId: ent.id }, orderBy: { createdAt: 'asc' } });
    console.log(`\n==== ${name} (${ent.status}) memories=${mems.length} intentions=${ints.length}`);
    const re = /pizza|door|knock|deliver|driver|tip|pay|cash|change|lock|deadbolt|order|napoli|routine|every day|each day|daily/i;
    for (const m of mems) {
      const hit = re.test(m.content);
      if (!hit) continue;
      console.log(`-- [${m.source}] cyc=${m.narrativeCycle.toFixed(4)} v=${m.valence.toFixed(2)} a=${m.arousal.toFixed(2)} s=${m.salience.toFixed(2)} dom=${m.domain ?? '-'} noticed=${m.noticed}`);
      console.log('   ' + m.content.replace(/\s+/g, ' ').slice(0, 600));
    }
    console.log(`\n-- intentions:`);
    for (const i of ints) {
      console.log(`   [${i.status}] cad=${i.cadence ?? '-'} trig=${i.trigger ?? '-'} due=${i.dueCycle ?? '-'}..${i.dueUntil ?? '-'} :: ${i.description}`);
    }
    const sources: Record<string, number> = {};
    for (const m of mems) sources[m.source] = (sources[m.source] ?? 0) + 1;
    console.log('-- memory sources:', JSON.stringify(sources));
  }
  const camp = await prisma.campaign.findFirst({ where: { name: { contains: 'Incubator' } }, select: { id: true, name: true, currentCycle: true } });
  console.log('\ncampaign', camp);
  const sessions = await prisma.gameSession.count({ where: { campaignId: camp?.id } });
  console.log('gameSessions', sessions);
}
main().finally(() => prisma.$disconnect());
