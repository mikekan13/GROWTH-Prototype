/**
 * The Chess Pizza receipt (HW8 2026-10-25, Mike: "Receipt should be not paid and have everything a normal receipt on
 * it. We need to check this too. As it is a good item awareness test.") — the seed had Kristopher check a receipt the
 * world did not have; the builder and the being invented one ("Paid"). This puts a real one in his hands: a thermal
 * delivery slip taped to the pizza box lid, UNPAID, cash on delivery. Idempotent: one receipt per campaign.
 *
 * PLACEHOLDERS Mike has not ruled on: the prices, the order number and the order time. The world has no street
 * address and no phone numbers, so the receipt carries none (the customer's number is on the five-dollar bill).
 */
import { prisma } from '@/lib/db';

const CAMP = 'cms5z4j6z0000zg48z5vzl2jn';
const KRIS = 'cmvcbw49u0001h448qanzbhs3';
const NAME = 'Chess Pizza receipt';

const TEXT = [
  'CHESS PIZZA',
  'DELIVERY',
  'ORDER #4471',
  'FRI 17 OCT 2026  6:52 PM',
  '--------------------------------',
  '1  LG HAWAIIAN              16.99',
  '   + BLACK OLIVES            1.50',
  '--------------------------------',
  'SUBTOTAL                    18.49',
  'TAX                          1.48',
  'DELIVERY FEE                 3.00',
  'TOTAL DUE                   22.97',
  '',
  'PAYMENT: CASH ON DELIVERY',
  '*** NOT PAID — COLLECT 22.97 ***',
  '',
  'CUSTOMER: VIOLET',
  '4TH FLOOR — THE ONLY DOOR',
  'DRIVER: KRISTOPHER',
  'NOTE: STANDING ORDER, EVERY EVENING',
  '',
  'THANK YOU FOR ORDERING FROM CHESS PIZZA',
].join('\n');

async function main() {
  const existing = await prisma.campaignItem.findFirst({ where: { campaignId: CAMP, name: NAME, status: 'ACTIVE' } });
  const data = {
    description: 'A thermal-paper delivery receipt from Chess Pizza, folded once and taped to the lid of the pizza box. The total is still due: cash on delivery, not paid.',
    text: TEXT,
    tags: ['mundane', 'paper'],
    condition: 3,
    rarity: 1,
    value: 0,
    itemType: 'misc',
    primaryMaterial: 'Paper',
    materialClass: 'Soft',
    weightLbs: 0.01,
    volumeCuFt: 0.001,
  };
  if (existing) {
    await prisma.campaignItem.update({ where: { id: existing.id }, data: { data: JSON.stringify(data), holderId: KRIS, locationId: null } });
    console.log(`receipt updated: ${existing.id} (held by Kristopher)`);
    return;
  }
  const gm = await prisma.campaign.findUnique({ where: { id: CAMP }, select: { gmUserId: true } });
  const row = await prisma.campaignItem.create({
    data: {
      campaignId: CAMP, name: NAME, type: 'misc', data: JSON.stringify(data), holderId: KRIS, locationId: null, createdBy: gm?.gmUserId ?? 'admin',
      history: JSON.stringify([{ kind: 'origin', at: new Date().toISOString(), text: 'Printed at Chess Pizza with the order and taped to the box lid by the driver.' }]),
    },
  });
  console.log(`receipt created: ${row.id} (held by Kristopher, NOT PAID)`);
}

main().then(() => prisma.$disconnect()).catch((e) => { console.error(e); process.exit(1); });
