/** No currency in the code (Michael 2026-11-01): the faces live on the Currency row; the cash archetype's recipe is "any denomination". */
import { writeFileSync } from 'node:fs';
import { prisma } from '../app/src/lib/db';
const C = 'cms5z4j6z0000zg48z5vzl2jn';
const USD_ID = 'cmvaejra50002bc48m3ujjufr';
async function main() {
  const usd = await prisma.currency.findUniqueOrThrow({ where: { id: USD_ID } });
  const arch = await prisma.forgeItem.findFirstOrThrow({ where: { campaignId: C, name: 'Folded Paper Bills' } });
  writeFileSync(`data/archive/fix-denominations-${new Date().toISOString().replace(/[:.]/g, '-')}.json`, JSON.stringify({ usd, arch }, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2));
  // The real notes and coins of the United States dollar — data on the currency row, not code.
  const bills = [1, 2, 5, 10, 20, 50, 100].map((f) => ({ name: `${{ 1: 'one', 2: 'two', 5: 'five', 10: 'ten', 20: 'twenty', 50: 'fifty', 100: 'hundred' }[f]}-dollar bill`, faceValue: f, form: 'bill', weightLbs: 0.0022, primaryMaterial: 'Paper' }));
  const coins = [{ name: 'penny', faceValue: 0.01, weightLbs: 0.0055, primaryMaterial: 'Zinc' }, { name: 'nickel', faceValue: 0.05, weightLbs: 0.011, primaryMaterial: 'Nickel' }, { name: 'dime', faceValue: 0.1, weightLbs: 0.005, primaryMaterial: 'Nickel' }, { name: 'quarter', faceValue: 0.25, weightLbs: 0.0125, primaryMaterial: 'Nickel' }].map((c) => ({ ...c, form: 'coin' }));
  await prisma.currency.update({ where: { id: USD_ID }, data: { denominations: JSON.stringify([...coins, ...bills]) } });
  const ad = JSON.parse(arch.data || '{}');
  ad.parts = [{ name: `tender of ${usd.name}`, count: 1, each: { tenderOf: USD_ID, value: 0 } }];
  await prisma.forgeItem.update({ where: { id: arch.id }, data: { data: JSON.stringify(ad) } });
  console.log(`USD: ${coins.length} coins + ${bills.length} bills on the currency row; "${arch.name}" recipe = any denomination of ${usd.name}`);
}
main().finally(() => prisma.$disconnect());
