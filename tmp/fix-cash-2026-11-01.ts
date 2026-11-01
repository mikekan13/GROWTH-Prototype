/**
 * FIX THE CASH (Michael 2026-11-01): "The cash in her wallet" was minted as one consumable and handed over whole at the
 * door. The truth of HW12, as Michael ruled it tonight: Violet paid with a twenty and a five ($25 for $22.97, "keep the
 * change" = $2.03 tip), and separately handed him the five with her number. One twenty stays in her wallet.
 *
 * Data, not a model change: parts on the rows (lib/parts), the receipt PAID, her routine's end a payment.
 * Run: cd app && npx tsx ../tmp/fix-cash-2026-11-01.ts [--dry]
 */
import { writeFileSync } from 'node:fs';
import { prisma } from '../app/src/lib/db';

const DRY = process.argv.includes('--dry');
const C = 'cms5z4j6z0000zg48z5vzl2jn';
const VIOLET = 'cms60ndtn0000kw48ioq10i68';
const KRIS = 'cmvcbw49u0001h448qanzbhs3';
const CASH = 'cmvalc1df00a0m048hqiwi5ar';
const BROWN_WALLET = 'cmvalaguy0045m04870pbeyka';
const WOOL_WALLET = 'cmvcg22bo000dyg48vrahpfu0';
const RECEIPT = 'cmvon40q80000h048j79v0wp2';
const FIVE_WITH_NUMBER = 'cmvcbwaz20001p848t1ak7th1';
const ROPE = 'cmvcg22b20008yg484tbcaqk1';
const VIOLET_ROUTINE = 'cmvuq6qyy0003iw48qbugumeu';
const USD = { currencyId: 'cmvaejra50002bc48m3ujjufr', code: 'USD' };
const HANDOVER_CYCLE = 0.0022456621004566207; // "The cash passes to Kristopher." (HW12, 2026-10-31T04:25:26Z)
const AT = '2026-10-31T04:25:26.227Z';

const bill = (face: number, count: number) => ({
  name: `${{ 1: 'one', 5: 'five', 10: 'ten', 20: 'twenty', 50: 'fifty', 100: 'hundred' }[face]}-dollar bill`, count,
  each: { tender: { ...USD, faceValue: face }, weightLbs: 0.002, primaryMaterial: 'Paper' },
});

/** placement.placeItem without the server-only import: the located_at edge, the enclosing room, and the holder of a carried container. */
async function placeItem(campaignId: string, o: { item: string; into: string }) {
  const into = await prisma.campaignItem.findUniqueOrThrow({ where: { id: o.into }, select: { id: true, holderId: true, locationId: true } });
  await prisma.$transaction([
    prisma.entityRelationship.deleteMany({ where: { sourceId: o.item, relationshipType: 'located_at' } }),
    prisma.entityRelationship.create({ data: { campaignId, sourceId: o.item, sourceType: 'CAMPAIGN_ITEM', targetId: into.id, targetType: 'CAMPAIGN_ITEM', relationshipType: 'located_at', strength: 5 } }),
    prisma.campaignItem.update({ where: { id: o.item }, data: { locationId: into.locationId, holderId: into.holderId } }),
  ]);
}

async function main() {
  const rows = await prisma.campaignItem.findMany({ where: { id: { in: [CASH, RECEIPT, FIVE_WITH_NUMBER, ROPE, WOOL_WALLET, BROWN_WALLET] } } });
  const routine = await prisma.dayaRoutine.findUnique({ where: { id: VIOLET_ROUTINE } });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  writeFileSync(`data/archive/fix-cash-${stamp}${DRY ? '-dry' : ''}.json`, JSON.stringify({ reason: 'cash → parts (object permanence), receipt paid, routine end = paid 22.97', rows, routine }, null, 2));
  const by = (id: string) => rows.find((r) => r.id === id)!;
  const data = (id: string) => JSON.parse(by(id).data) as Record<string, unknown>;
  const hist = (id: string) => { try { return JSON.parse(by(id).history) as unknown[]; } catch { return []; } };

  // 1. Her fold: one twenty left, folded in the bill slot of the brown wallet (carried → in her hand).
  const fold = data(CASH);
  delete fold.quantity; delete fold.state;
  const foldData = { ...fold, description: 'Folded paper bills in the bill slot of her wallet.', parts: [bill(20, 1)], weightLbs: 0.002 };
  const foldHist = [...hist(CASH), {
    kind: 'paid', at: AT, cycle: HANDOVER_CYCLE, from: VIOLET, to: KRIS, amount: 22.97, handed: 25, ...USD,
    text: 'a twenty and a five handed to Kristopher at the door for the pizza (order #4471, $22.97) — "Keep the change" ($2.03 his)',
  }];
  console.log('fold →', JSON.stringify(foldData.parts), 'history +1');

  // 2. His: a twenty and a five from her order, in the wool wallet (carried). $22.97 Chess Pizza's, $2.03 his tip.
  const hisData = {
    description: 'A twenty and a five from Violet\'s order #4471: $22.97 of it is Chess Pizza\'s, to turn in at the end of his shift; $2.03 is his tip.',
    itemType: 'misc', primaryMaterial: 'Paper', materialClass: 'Soft', rarity: 1, condition: 3, value: 0, tags: ['mundane'],
    parts: [bill(20, 1), bill(5, 1)], weightLbs: 0.004, volumeCuFt: 0.01,
  };
  const hisHist = [{
    kind: 'paid', at: AT, cycle: HANDOVER_CYCLE, from: VIOLET, to: KRIS, amount: 22.97, handed: 25, ...USD, fromItemIds: [CASH],
    text: 'a twenty and a five from Violet at her door, for the pizza (order #4471, $22.97): "Keep the change" — $2.03 over, his tip',
  }];

  // 3. The receipt: PAID.
  const rd = data(RECEIPT);
  const text = String(rd.text ?? '')
    .replace('PAYMENT: CASH ON DELIVERY', 'PAYMENT: CASH ON DELIVERY — PAID 25.00')
    .replace('*** NOT PAID — COLLECT 22.97 ***', '*** PAID — CASH 25.00 · CHANGE 2.03 KEPT AS TIP ***');
  const receiptData = { ...rd, text, description: 'A thermal-paper delivery receipt from Chess Pizza, folded once, taped to the lid of the pizza box. Paid in cash at the door: $25 for $22.97, change kept as the tip.' };
  const receiptHist = [...hist(RECEIPT), { kind: 'paid', at: AT, cycle: HANDOVER_CYCLE, text: 'paid at the door: $25 cash for $22.97; "Keep the change."' }];

  // 4. The prayer rope: what it is made of (Michael's example).
  const rope = data(ROPE);
  const ropeData = { ...rope, parts: [
    { name: 'black wool cord, knotted into 100 prayer knots', count: 1, bound: true, each: { primaryMaterial: 'Wool' } },
    { name: 'blue plastic bead', count: 3, bound: true, each: { primaryMaterial: 'Polymer' } },
  ] };

  // 5. Her routine: receive the pizza, PAY the driver, lock up. The numbered five was one night's end — done, and out.
  const ends = [
    { kind: 'hold', item: 'Pizza (Hawaiian + black olives)' },
    { kind: 'paid', to: 'Kristopher', amount: 22.97, currency: 'USD' },
    { kind: 'door', door: 'Entry door', state: 'locked' },
  ];

  if (DRY) { console.log('DRY — nothing written'); return; }

  await prisma.campaignItem.update({ where: { id: CASH }, data: { name: 'The cash in her wallet', holderId: VIOLET, locationId: null, data: JSON.stringify(foldData), history: JSON.stringify(foldHist) } });
  await placeItem(C, { item: CASH, into: BROWN_WALLET });
  const his = await prisma.campaignItem.create({ data: { campaignId: C, name: 'A twenty and a five', type: 'misc', status: 'ACTIVE', createdBy: by(RECEIPT).createdBy, data: JSON.stringify(hisData), holderId: KRIS, locationId: null, history: JSON.stringify(hisHist) } });
  await placeItem(C, { item: his.id, into: WOOL_WALLET });
  await prisma.campaignItem.update({ where: { id: RECEIPT }, data: { data: JSON.stringify(receiptData), history: JSON.stringify(receiptHist) } });
  await prisma.campaignItem.update({ where: { id: ROPE }, data: { data: JSON.stringify(ropeData) } });
  await prisma.dayaRoutine.update({ where: { id: VIOLET_ROUTINE }, data: { ends: JSON.stringify(ends), status: 'READY', cursor: 0, steps: 0 } });
  const check = await prisma.campaignItem.findMany({ where: { id: { in: [CASH, his.id] } }, select: { id: true, name: true, holderId: true, locationId: true } });
  console.log('written:', JSON.stringify(check));
}
main().finally(() => prisma.$disconnect());
