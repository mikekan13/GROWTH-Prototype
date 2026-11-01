/** THE RECIPE IS THE ARCHETYPE'S (Michael 2026-11-01): composed instances whose mundane archetype has no recipe yet give it one. */
import { writeFileSync } from 'node:fs';
import { prisma } from '../app/src/lib/db';
const C = 'cms5z4j6z0000zg48z5vzl2jn';
const USD = { currencyId: 'cmvaejra50002bc48m3ujjufr', code: 'USD' };
const FACES = [1, 5, 10, 20, 50, 100];
const faceName = (f: number) => `${{ 1: 'one', 5: 'five', 10: 'ten', 20: 'twenty', 50: 'fifty', 100: 'hundred' }[f]}-dollar bill`;
async function main() {
  const rows = await prisma.campaignItem.findMany({ where: { campaignId: C, status: 'ACTIVE' } });
  const composed = rows.filter((r) => { const d = JSON.parse(r.data || '{}'); return Array.isArray(d.parts) || d.tender; });
  const archIds = [...new Set(composed.map((r) => r.sourceForgeItemId).filter((x): x is string => !!x))];
  const archs = await prisma.forgeItem.findMany({ where: { id: { in: archIds } } });
  writeFileSync(`data/archive/fix-recipes-${new Date().toISOString().replace(/[:.]/g, '-')}.json`, JSON.stringify({ composed, archs }, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 2));
  // The cash archetype ("Folded Paper Bills") names every US face, loose.
  const cashArch = archs.find((a) => /paper bills/i.test(a.name));
  const billRecipe = FACES.map((f) => ({ name: faceName(f), count: 1, each: { tender: { ...USD, faceValue: f }, weightLbs: 0.002, value: 0, primaryMaterial: 'Paper' } }));
  for (const a of archs) {
    const ad = JSON.parse(a.data || '{}');
    if (Array.isArray(ad.parts)) { console.log(`${a.name}: already has a recipe`); continue; }
    if ((ad.value ?? 0) >= 1) { console.log(`${a.name}: forged (${ad.value} KV) — recipe belongs to the Forge, skipped`); continue; }
    const inst = composed.find((r) => r.sourceForgeItemId === a.id)!;
    const d = JSON.parse(inst.data || '{}');
    const recipe = a.id === cashArch?.id ? billRecipe : d.tender ? [{ name: inst.name.replace(/^the\s+/i, ''), count: 1, each: { tender: d.tender } }] : (d.parts as Array<{ count: number; bound?: boolean }>).map((p) => ({ ...p, count: p.bound ? p.count : 1 }));
    await prisma.forgeItem.update({ where: { id: a.id }, data: { data: JSON.stringify({ ...ad, parts: recipe }) } });
    console.log(`${a.name}: recipe = ${recipe.map((p: { name: string; count: number }) => `${p.count}×${p.name}`).join(', ')}`);
  }
  // His "A twenty and a five" was made without an archetype: it is paper bills too.
  if (cashArch) {
    const his = rows.find((r) => r.name === 'A twenty and a five' && !r.sourceForgeItemId);
    if (his) { await prisma.campaignItem.update({ where: { id: his.id }, data: { sourceForgeItemId: cashArch.id } }); console.log('A twenty and a five → archetype', cashArch.name); }
  }
  const orphans = composed.filter((r) => !r.sourceForgeItemId && r.name !== 'A twenty and a five');
  if (orphans.length) console.log('composed with no archetype:', orphans.map((r) => r.name).join('; '));
}
main().finally(() => prisma.$disconnect());
