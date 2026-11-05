/** Mike 17 Oct: "just get them all in please" — the five things the catalog lacked, as published Forge blueprints, then granted; plus his VA income. */
import { prisma } from '../app/src/lib/db';
import { createForgeItem, publishForgeItem } from '../app/src/services/forge';
import { grantPossession } from '../app/src/services/genesis-possessions';
import { listCurrencies, } from '../app/src/services/currency';
import { setIncome } from '../app/src/services/wealth';
const C = 'cms5z4j6z0000zg48z5vzl2jn', K = 'cmvcbw49u0001h448qanzbhs3';
const blueprints = [
  { name: 'Wooden Cross Necklace', data: { description: 'A small carved wooden cross on a cord, worn at the throat.', itemType: 'accessory', primaryMaterial: 'Wood', materialClass: 'Soft', weightLbs: 0.05, volumeCuFt: 0.01, rarity: 1, condition: 3, value: 0.1, tags: ['jewelry', 'religious'] },
    grant: { tier: 'equipped', slot: 'Body/Neck', localName: 'Orthodox wooden cross', story: 'A wooden Orthodox cross on a cord around his neck. He does not take it off.' } },
  { name: 'Prayer Rope', data: { description: 'A knotted wool prayer rope (chotki / komboskini), each knot a prayer.', itemType: 'accessory', primaryMaterial: 'Wool', materialClass: 'Soft', weightLbs: 0.05, volumeCuFt: 0.01, rarity: 1, condition: 3, value: 0.1, tags: ['religious'] },
    grant: { tier: 'equipped', slot: 'Body/Left Upper Arm/Left Lower Arm', localName: 'Orthodox prayer rope', story: 'His Orthodox prayer rope, wrapped five times around his left wrist.' } },
  { name: 'Wool Wallet', data: { description: 'A small hand-made felted wool wallet.', itemType: 'misc', primaryMaterial: 'Wool', materialClass: 'Soft', weightLbs: 0.15, volumeCuFt: 0.04, rarity: 1, condition: 3, value: 0.2, tags: ['mundane', 'handmade'] },
    grant: { tier: 'carried', localName: 'Purple wool wallet', story: 'A purple hand-made wool wallet stitched with Celtic symbols.' } },
  { name: 'Electric Countertop Range', data: { description: 'A plug-in electric burner range that sits on a counter.', itemType: 'tool', primaryMaterial: 'Steel', materialClass: 'Hard', weightLbs: 6, volumeCuFt: 0.6, rarity: 1, condition: 3, value: 0.3, tags: ['kitchen', 'modern'] },
    grant: { tier: 'owned', localName: 'Electric counter range', story: 'A plug-in electric counter range. With the skillet it is his whole kitchen, set up on hotel desks.' } },
  { name: 'Ceramic Pot', data: { description: 'A ceramic cooking pot with a lid.', itemType: 'misc', primaryMaterial: 'Ceramic', materialClass: 'Hard', weightLbs: 3, volumeCuFt: 0.3, rarity: 1, condition: 3, value: 0.2, tags: ['kitchen', 'mundane'] },
    grant: { tier: 'owned', localName: 'Ceramic pot', story: 'One ceramic pot — the other half of his kitchen.' } },
];
(async () => {
  const camp = await prisma.campaign.findUniqueOrThrow({ where: { id: C }, select: { gmUserId: true } });
  const gm = await prisma.user.findUniqueOrThrow({ where: { id: camp.gmUserId! }, select: { id: true, role: true } });
  for (const b of blueprints) {
    let fi = await prisma.forgeItem.findFirst({ where: { campaignId: C, name: b.name, type: 'item' } });
    if (!fi) { const made = await createForgeItem(C, gm.id, gm.role, { type: 'item', name: b.name, data: b.data }); fi = await prisma.forgeItem.findUniqueOrThrow({ where: { id: made.id } }); }
    if (fi.status === 'draft') await publishForgeItem(fi.id, gm.id, gm.role);
    const where = b.grant.tier === 'owned' ? { location: '2017 Ford Fusion Energi' } : {};
    console.log(b.name, '→', JSON.stringify(await grantPossession(C, gm, { characterId: K, item: fi.id, ...b.grant, ...where })).slice(0, 200));
  }
  const cur = await listCurrencies(C);
  console.log('currencies', JSON.stringify(cur).slice(0, 300));
  process.exit(0);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
