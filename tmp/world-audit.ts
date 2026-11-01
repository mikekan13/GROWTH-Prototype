import { prisma } from '../app/src/lib/db';
const C = 'cms5z4j6z0000zg48z5vzl2jn';
async function main() {
  const items = await prisma.campaignItem.findMany({ where: { campaignId: C, status: 'ACTIVE' }, select: { id: true, name: true, type: true, holderId: true, locationId: true, data: true } });
  const chars = new Map((await prisma.character.findMany({ where: { campaignId: C }, select: { id: true, name: true } })).map((c) => [c.id, c.name]));
  const locs = new Map((await prisma.location.findMany({ where: { campaignId: C }, select: { id: true, name: true, data: true } })).map((l) => [l.id, l]));
  let qty = 0, parts = 0, money = 0; const qtyList: string[] = []; const moneyList: string[] = [];
  for (const it of items) {
    const d = JSON.parse(it.data || '{}');
    if (d.parts) parts++;
    if (typeof d.quantity === 'number' && d.quantity > 1) { qty++; qtyList.push(`${it.name} x${d.quantity} [${chars.get(it.holderId ?? '') ?? locs.get(it.locationId ?? '')?.name ?? '?'}]`); }
    const txt = `${it.name} ${d.description ?? ''} ${d.state ?? ''}`.toLowerCase();
    if (/\b(cash|bills?|dollar|coins?|money|wallet)\b/.test(txt) && !d.parts) { money++; moneyList.push(`${it.name} — ${(d.description ?? '').slice(0, 60)} [${chars.get(it.holderId ?? '') ?? '?'}]`); }
  }
  console.log(`items ${items.length}; with parts ${parts}; quantity>1 ${qty}; money-ish without parts ${money}`);
  console.log('quantity>1:\n ' + qtyList.join('\n '));
  console.log('money-ish:\n ' + moneyList.join('\n '));
  console.log('locations:'); for (const l of locs.values()) { const d = JSON.parse(l.data || '{}'); console.log(' ', l.name, d.footprint ? '(drawn)' : '(undrawn)'); }
  const byHolder = new Map<string, number>(); for (const it of items) if (it.holderId) byHolder.set(chars.get(it.holderId) ?? it.holderId, (byHolder.get(chars.get(it.holderId) ?? it.holderId) ?? 0) + 1);
  console.log('held:', JSON.stringify([...byHolder]));
}
main().finally(() => prisma.$disconnect());
