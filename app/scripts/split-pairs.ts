/**
 * split-pairs.ts — "Boots, gloves etc. do not come in pairs" (Mike, 16 Oct 2026;
 * research/PAIRS-SPLIT-EXAMPLES-2026-10-16.md, approved; KV rounds UP).
 *
 * For each old paired/combo global stock item:
 *   1. create the new singular global archetype(s) from the stock content
 *      files (same payload + validateForgeData gate as seed-modern-earth.ts),
 *   2. mark the old global row status 'superseded' (never deleted — campaign
 *      ForgeItem copies and CampaignItems still point at it via
 *      sourceGlobalId / sourceForgeItemId).
 * Campaign ForgeItems and CampaignItems are NOT touched. Idempotent.
 *
 * Run: npx tsx scripts/split-pairs.ts
 */

import './_server-only-shim';
import { config } from 'dotenv';
config();

import { prisma } from '../src/lib/db';
import { validateForgeData } from '../src/services/forge-schemas';
import type { ItemTemplate } from './content/modern-earth/types';
import { EVERYDAY_ITEMS } from './content/modern-earth/items-everyday';
import { TECH_ITEMS, MEDICAL_ITEMS, WEAPON_ITEMS } from './content/modern-earth/items-tech-medical-weapons';
import { HOUSEHOLD_ITEMS_2 } from './content/modern-earth/items-household-2';
import { CONSUMABLE_HOBBY_ITEMS } from './content/modern-earth/items-consumables-hobby';
import { WAVE3_MEDICAL_SECURITY } from './content/modern-earth/items-wave3-medical-security';
import { MATERIALS, MATERIAL_ALIASES } from './content/modern-earth/materials';

/** Old global archetype → its singular replacement(s). */
const SPLITS: Array<{ old: string; becomes: string[] }> = [
  { old: 'Work Boots (Steel Toe)', becomes: ['Work Boot (Steel Toe)'] },
  { old: 'Hiking Boots', becomes: ['Hiking Boot'] },
  { old: 'Dress Shoes', becomes: ['Dress Shoe'] },
  { old: 'Forearm Crutches', becomes: ['Forearm Crutch'] },
  { old: 'Hearing Aids', becomes: ['Hearing Aid'] },
  { old: 'Adjustable Dumbbells', becomes: ['Adjustable Dumbbell'] },
  { old: 'Winter Gloves & Hat', becomes: ['Winter Glove', 'Winter Hat'] },
  { old: 'Boxing Gloves & Heavy Bag', becomes: ['Boxing Glove', 'Heavy Bag'] },
  { old: 'Wireless Earbuds', becomes: ['Earbud Case'] },
];

/** Same payload shape as seed-modern-earth.ts itemPayload. */
function itemPayload(t: ItemTemplate): Record<string, unknown> {
  const damage = t.damage ? {
    piercing: t.damage.piercing ?? 0, slashing: t.damage.slashing ?? 0,
    heat: t.damage.heat ?? 0, decay: t.damage.decay ?? 0,
    cold: t.damage.cold ?? 0, bashing: t.damage.bashing ?? 0,
    energy: t.damage.energy ?? 0,
  } : undefined;
  return {
    description: t.description,
    itemType: t.itemType,
    primaryMaterial: t.primaryMaterial,
    ...(t.subordinateMaterials ? { subordinateMaterials: t.subordinateMaterials } : {}),
    materialClass: t.materialClass,
    weightLbs: t.weightLbs,
    rarity: t.rarity,
    condition: 3,
    value: t.kv,
    ...(t.volumeCuFt != null ? { volumeCuFt: t.volumeCuFt } : {}),
    ...(t.capacityCuFt != null ? { capacityCuFt: t.capacityCuFt } : {}),
    ...(t.capacityLbs != null ? { capacityLbs: t.capacityLbs } : {}),
    ...(t.baseResist != null ? { baseResist: t.baseResist } : {}),
    ...(t.properties ? { properties: t.properties } : {}),
    ...(t.itemAbilities ? { itemAbilities: t.itemAbilities } : {}),
    ...(damage ? { damage } : {}),
    ...(t.range ? { range: t.range } : {}),
    ...(t.targetAttribute ? { targetAttribute: t.targetAttribute } : {}),
    ...(t.shots != null ? { shots: t.shots } : {}),
    ...(t.reload ? { reload: t.reload } : {}),
    ...(t.armorCategory ? { armorCategory: t.armorCategory } : {}),
    ...(t.tags ? { tags: t.tags } : {}),
    ...(t.contains ? { contains: t.contains.map(itemPayload) } : {}),
  };
}

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  if (!admin) throw new Error('No ADMIN user. Run seed-admin.ts first.');

  const catalog = new Map<string, ItemTemplate>();
  for (const it of [
    ...EVERYDAY_ITEMS, ...TECH_ITEMS, ...MEDICAL_ITEMS, ...WEAPON_ITEMS,
    ...HOUSEHOLD_ITEMS_2, ...CONSUMABLE_HOBBY_ITEMS, ...WAVE3_MEDICAL_SECURITY,
  ]) catalog.set(it.name, it);

  // Material coverage gate (same rule as the seeder) for the new templates.
  const known = new Set(MATERIALS.map(m => m.primaryMaterial));
  const resolves = (m: string) => known.has(m) || known.has(MATERIAL_ALIASES[m] ?? '');
  const walk = (it: ItemTemplate) => {
    if (!resolves(it.primaryMaterial)) throw new Error(`${it.name}: material ${it.primaryMaterial} has no stock`);
    for (const s of it.subordinateMaterials ?? []) if (!resolves(s)) throw new Error(`${it.name}: material ${s} has no stock`);
    for (const c of it.contains ?? []) walk(c);
  };

  const created: string[] = [], existed: string[] = [], superseded: string[] = [], already: string[] = [], missing: string[] = [];

  for (const split of SPLITS) {
    for (const name of split.becomes) {
      const t = catalog.get(name);
      if (!t) throw new Error(`No stock template "${name}" in content files`);
      walk(t);
      const data = itemPayload(t);
      validateForgeData('item', data);
      const row = await prisma.forgeItem.findFirst({ where: { campaignId: null, type: 'item', name }, select: { id: true } });
      if (row) { existed.push(name); continue; }
      await prisma.forgeItem.create({
        data: {
          type: 'item', name, data: JSON.stringify(data),
          status: 'published', campaignId: null, isGlobal: true,
          createdBy: admin.id, authorUserId: admin.id,
          karmicValue: BigInt(Math.round(t.kv)),
          royaltyRate: 0,
        },
      });
      created.push(`${name} (${t.kv} KV, ${t.weightLbs} lb)`);
    }

    const olds = await prisma.forgeItem.findMany({
      where: { campaignId: null, isGlobal: true, type: 'item', name: split.old },
      select: { id: true, status: true },
    });
    if (!olds.length) { missing.push(split.old); continue; }
    for (const o of olds) {
      if (o.status === 'superseded') { already.push(split.old); continue; }
      await prisma.forgeItem.update({ where: { id: o.id }, data: { status: 'superseded' } });
      superseded.push(`${split.old} (${o.id}, was ${o.status})`);
    }
  }

  console.log(`CREATED (${created.length}):`); created.forEach(s => console.log(`  + ${s}`));
  console.log(`ALREADY PRESENT (${existed.length}): ${existed.join(', ') || '-'}`);
  console.log(`SUPERSEDED (${superseded.length}):`); superseded.forEach(s => console.log(`  ~ ${s}`));
  console.log(`ALREADY SUPERSEDED (${already.length}): ${already.join(', ') || '-'}`);
  if (missing.length) console.log(`OLD GLOBAL NOT FOUND: ${missing.join(', ')}`);
}

main()
  .then(async () => { await prisma.$disconnect(); process.exit(0); })
  .catch(async (err) => { console.error(err); await prisma.$disconnect(); process.exit(1); });
