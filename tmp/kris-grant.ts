/** Mike's list for Kristopher (17 Oct chat), granted through genesis grantPossession (stock archetypes, narrative paint). */
import { prisma } from '../app/src/lib/db';
import { grantPossession } from '../app/src/services/genesis-possessions';
const C = 'cms5z4j6z0000zg48z5vzl2jn', K = 'cmvcbw49u0001h448qanzbhs3';
const grants: Array<Record<string, unknown>> = [
  { item: 'Denim Jeans', tier: 'equipped', slot: 'Body', localName: 'Black cargo pants', story: 'Black cargo pants, the uniform bottoms — side pockets for change, the phone, the car key.' },
  { item: 'Cotton Underwear', tier: 'equipped', slot: 'Body', localName: 'Boxer briefs', story: 'Plain grey boxer briefs.' },
  { item: 'Smartphone', tier: 'carried', localName: 'Work phone', story: 'One of his two phones — the one the delivery app runs on.', allowDuplicate: true },
  { item: 'Smartphone', tier: 'carried', localName: 'Personal phone', story: 'His own phone — the one his kids and his lawyer have the number to.', allowDuplicate: true },
  { item: 'Compact Sedan', tier: 'owned', localName: '2017 Ford Fusion Energi', story: 'A 2017 Ford Fusion Energi hybrid, about 90,000 miles. Runs well, but the body is badly dented and the passenger window is cracked. Most of what he owns rides in it.' },
];
const inCar = [
  { item: 'Duffel Bag (Large)', tier: 'owned', localName: 'Duffel of books and clothes', story: 'A big duffel stuffed with his books and the rest of his clothes — the closest thing he has to a dresser.' },
  { item: 'Cast-Iron Skillet', tier: 'owned', localName: 'Cast-iron skillet', story: 'His cast-iron skillet. He cooks in the hotel rooms when he can.' },
  { item: 'Desktop PC & Monitor', tier: 'owned', localName: 'Gaming/dev rig + widescreen', story: 'A decent gaming and development computer and a widescreen monitor — where GRO.WTH gets built.' },
];
(async () => {
  const camp = await prisma.campaign.findUniqueOrThrow({ where: { id: C }, select: { gmUserId: true } });
  const gm = await prisma.user.findUniqueOrThrow({ where: { id: camp.gmUserId! }, select: { id: true, role: true } });
  for (const g of grants) console.log(g.localName, '→', JSON.stringify(await grantPossession(C, gm, { characterId: K, ...g })).slice(0, 220));
  for (const g of inCar) console.log(g.localName, '→', JSON.stringify(await grantPossession(C, gm, { characterId: K, ...g, location: '2017 Ford Fusion Energi' })).slice(0, 220));
  process.exit(0);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
