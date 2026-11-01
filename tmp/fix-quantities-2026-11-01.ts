import { writeFileSync } from 'node:fs';
import { prisma } from '../app/src/lib/db';
const C = 'cms5z4j6z0000zg48z5vzl2jn';
const FIVE = 'cmvcbwaz20001p848t1ak7th1';
const USD = { currencyId: 'cmvaejra50002bc48m3ujjufr', code: 'USD' };
const singular = (name: string) => name.replace(/^the\s+/i, '').replace(/ies$/i, 'y').replace(/(ch|sh|x|s)es$/i, '$1').replace(/s$/i, '');
async function main() {
  const rows = await prisma.campaignItem.findMany({ where: { campaignId: C, status: 'ACTIVE' } });
  const todo = rows.filter((r) => { const d = JSON.parse(r.data || '{}'); return typeof d.quantity === 'number' && d.quantity > 1 && !d.parts; });
  const five = rows.find((r) => r.id === FIVE)!;
  writeFileSync(`data/archive/fix-quantities-${new Date().toISOString().replace(/[:.]/g, '-')}.json`, JSON.stringify({ reason: 'legacy quantity → parts; the numbered five gets its face', rows: [...todo, five] }, null, 2));
  for (const r of todo) {
    const d = JSON.parse(r.data || '{}');
    const n = d.quantity as number;
    const each: Record<string, unknown> = {};
    if (typeof d.weightLbs === 'number') each.weightLbs = Math.round((d.weightLbs / n) * 10000) / 10000;
    if (typeof d.value === 'number') each.value = Math.round((d.value / n) * 10000) / 10000;
    if (d.primaryMaterial) each.primaryMaterial = d.primaryMaterial;
    const { quantity: _q, ...rest } = d; void _q;
    const data = { ...rest, parts: [{ name: singular(r.name).toLowerCase(), count: n, each }] };
    await prisma.campaignItem.update({ where: { id: r.id }, data: { data: JSON.stringify(data) } });
    console.log(`${r.name}: quantity ${n} → parts [${data.parts[0].name} × ${n}]`);
  }
  const fd = JSON.parse(five.data || '{}');
  await prisma.campaignItem.update({ where: { id: FIVE }, data: { data: JSON.stringify({ ...fd, tender: { ...USD, faceValue: 5 }, primaryMaterial: fd.primaryMaterial ?? 'Paper' }) } });
  console.log('Five-dollar bill with her number: tender $5');
}
main().finally(() => prisma.$disconnect());
