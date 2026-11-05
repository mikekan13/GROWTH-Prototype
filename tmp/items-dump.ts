import { prisma } from '@/lib/db';
async function main() {
  const camp = await prisma.campaign.findFirst({ where: { name: { contains: 'Incubator' } }, select: { id: true } });
  const chars = await prisma.character.findMany({ where: { campaignId: camp!.id, name: { in: ['Violet', 'Kristopher'] } }, select: { id: true, name: true } });
  for (const c of chars) {
    const held = await prisma.campaignItem.findMany({ where: { holderId: c.id, status: 'ACTIVE' }, select: { id: true, name: true, type: true, data: true } });
    console.log(`\n== ${c.name} holds ${held.length}`);
    for (const h of held) {
      const d = h.data ? JSON.parse(h.data) : {};
      const keys = Object.keys(d).filter((k) => !['description'].includes(k)).slice(0, 12);
      console.log(`- ${h.name} [${h.type}] :: ${keys.map((k) => `${k}=${JSON.stringify(d[k]).slice(0, 40)}`).join(' ')}`);
    }
  }
  const ent = await prisma.campaignItem.findMany({ where: { campaignId: camp!.id, status: 'ACTIVE', OR: [{ name: { contains: 'bill' } }, { name: { contains: 'cash' } }, { name: { contains: 'pizza' } }, { name: { contains: 'receipt' } }, { name: { contains: 'five' } }, { name: { contains: 'wallet' } }] }, select: { id: true, name: true, holderId: true, locationId: true, data: true } });
  console.log('\n== money/pizza things');
  for (const e of ent) console.log(`- ${e.name} holder=${e.holderId} loc=${e.locationId} :: ${(e.data ?? '').slice(0, 300).replace(/\s+/g, ' ')}`);
  // facts about paying
  const facts = await prisma.worldFact.findMany({ where: { campaignId: camp!.id, OR: [{ statement: { contains: 'paid' } }, { statement: { contains: 'pay' } }, { statement: { contains: 'owes' } }, { statement: { contains: 'door' } }] }, select: { subjectKey: true, statement: true } }).catch(() => []);
  console.log('\n== facts');
  for (const f of facts) console.log(`- ${f.subjectKey}: ${f.statement.slice(0, 160)}`);
}
main().finally(() => prisma.$disconnect());
