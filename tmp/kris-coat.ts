import { prisma } from '../app/src/lib/db';
import { grantPossession } from '../app/src/services/genesis-possessions';
const C = 'cms5z4j6z0000zg48z5vzl2jn', K = 'cmvcbw49u0001h448qanzbhs3';
(async () => {
  const camp = await prisma.campaign.findUniqueOrThrow({ where: { id: C }, select: { gmUserId: true } });
  const gm = await prisma.user.findUniqueOrThrow({ where: { id: camp.gmUserId! }, select: { id: true, role: true } });
  console.log(JSON.stringify(await grantPossession(C, gm, { characterId: K, item: 'Winter Coat', tier: 'owned', location: '2017 Ford Fusion Energi', localName: 'Puffy black coat', story: 'A puffy black winter coat. It rides in the Fusion and goes on when the nights turn cold.' })).slice(0, 220));
  // The cross: worn hidden, under the shirt (Mike 17 Oct: "he doesn't wear the cross on his neck out in the open").
  const id = 'cmvcg22af0003yg48e3w0q67l';
  const it = await prisma.campaignItem.findUniqueOrThrow({ where: { id } });
  const d = JSON.parse(it.data);
  d.description = 'A small carved wooden Orthodox cross on a cord. He wears it under his shirt, against his chest — never out in the open.';
  d.concealed = true;
  await prisma.campaignItem.update({ where: { id }, data: { data: JSON.stringify(d) } });
  console.log('cross updated');
  process.exit(0);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
