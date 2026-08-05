/**
 * Seed the Modern-Earth starter library into the global Forge catalog.
 *
 * Mike directive 2026-08-04: generic content for the modern-Earth test
 * setting — traits (incl. mental-health/physical thorns per his ruling),
 * roots, branches, skills, items, multi-component vehicle possessions.
 * Published (not draft) per his call: "published, spot-check after."
 *
 * KV discipline (memory: content-generation-balance-reference-2026-08-04):
 * - Root KV = attribute levels + skill levels + net trait KV (r-2026-04-22-10);
 *   frequency = KV − 100 (age-18 break-even; signed, negative = refund per
 *   KV_GUIDANCE).
 * - Branch frequency = KV − ageAdded×5 (the ~5 KV/year sanity weight applied
 *   incrementally; Kai norm gauge 3-15 KV/yr).
 * - Trait karmicValue is SIGNED: thorns/negative blossoms carry negative KV
 *   (lien semantics — collected at death, never a creation refund).
 * - Item KV graded per r-2026-04-22-15 (material floor + damage at natural
 *   targeting + 2×resist + abilities), stated on each template.
 *
 * Every payload passes validateForgeData before writing — the same gate the
 * Forge UI uses, so nothing in the library can be stripped by a later edit.
 *
 * Idempotent by (type, name) in the global catalog. Run:
 *   npx tsx scripts/seed-modern-earth.ts
 */

import { config } from 'dotenv';
config();

import { prisma } from '../src/lib/db';
import { validateForgeData } from '../src/services/forge-schemas';
import type { ItemTemplate, TraitTemplate } from './content/modern-earth/types';
import { ALL_THORNS } from './content/modern-earth/thorns';
import { MODERN_NECTARS } from './content/modern-earth/nectars';
import { ALL_BLOSSOMS } from './content/modern-earth/blossoms';
import { MODERN_ROOTS } from './content/modern-earth/roots';
import { MODERN_BRANCHES } from './content/modern-earth/branches';
import { MODERN_SKILLS } from './content/modern-earth/skills';
import { EVERYDAY_ITEMS } from './content/modern-earth/items-everyday';
import { TECH_ITEMS, MEDICAL_ITEMS, WEAPON_ITEMS } from './content/modern-earth/items-tech-medical-weapons';
import { VEHICLES } from './content/modern-earth/vehicles';
import { WAVE2_TRAITS } from './content/modern-earth/traits-wave2';
import { HOUSEHOLD_ITEMS_2 } from './content/modern-earth/items-household-2';
import { CONSUMABLE_HOBBY_ITEMS } from './content/modern-earth/items-consumables-hobby';
import { BUILDINGS } from './content/modern-earth/buildings';
import { MATERIALS, MATERIAL_ALIASES } from './content/modern-earth/materials';
import { WAVE3_TOOLS_YARD } from './content/modern-earth/items-wave3-tools-yard';
import { WAVE3_MEDICAL_SECURITY } from './content/modern-earth/items-wave3-medical-security';

const ALL_TRAITS: TraitTemplate[] = [...ALL_THORNS, ...MODERN_NECTARS, ...ALL_BLOSSOMS, ...WAVE2_TRAITS];
const TRAIT_KV = new Map(ALL_TRAITS.map(t => [t.name, t.kv]));

function netTraitKV(nectars: string[], thorns: string[]): number {
  let net = 0;
  for (const n of nectars) {
    const kv = TRAIT_KV.get(n);
    if (kv == null) throw new Error(`Unknown nectar referenced: ${n}`);
    net += kv;
  }
  for (const t of thorns) {
    const kv = TRAIT_KV.get(t);
    if (kv == null) throw new Error(`Unknown thorn referenced: ${t}`);
    net += kv; // thorn kv is already negative
  }
  return net;
}

const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);

async function upsertGlobalItem(opts: {
  type: string; name: string; data: Record<string, unknown>;
  karmicValue: bigint; adminId: string;
}): Promise<'created' | 'existed'> {
  const existing = await prisma.forgeItem.findFirst({
    where: { campaignId: null, type: opts.type, name: opts.name },
    select: { id: true },
  });
  if (existing) return 'existed';
  await prisma.forgeItem.create({
    data: {
      type: opts.type, name: opts.name, data: JSON.stringify(opts.data),
      status: 'published', campaignId: null, isGlobal: true,
      createdBy: opts.adminId, authorUserId: opts.adminId,
      karmicValue: opts.karmicValue,
    },
  });
  return 'created';
}

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

  let created = 0, existed = 0;
  const rows: Array<{ type: string; name: string; kv: number; freq?: number }> = [];
  const track = (s: 'created' | 'existed') => { s === 'created' ? created++ : existed++; };

  // ── Traits ──
  for (const t of ALL_TRAITS) {
    const data = {
      description: t.description,
      mechanicalEffect: t.mechanicalEffect,
      source: 'Modern-Earth starter library (2026-08)',
      pillar: t.pillar,
      category: t.category,
      ...(t.rollModifiers ? { rollModifiers: t.rollModifiers } : {}),
      ...(t.tags ? { tags: t.tags } : {}),
    };
    validateForgeData(t.type, data);
    track(await upsertGlobalItem({ type: t.type, name: t.name, data, karmicValue: BigInt(t.kv), adminId: admin.id }));
    rows.push({ type: t.type, name: t.name, kv: t.kv });
  }

  // ── Skills ──
  for (const s of MODERN_SKILLS) {
    const data = { governors: s.governors, description: s.description };
    validateForgeData('skill', data);
    track(await upsertGlobalItem({ type: 'skill', name: s.name, data, karmicValue: BigInt(0), adminId: admin.id }));
  }

  // ── Roots (KV = attrs + skills + net traits; freq = KV − 100 at age 18) ──
  for (const r of MODERN_ROOTS) {
    const kv = sum(r.attributes) + r.skills.reduce((a, s) => a + s.level, 0) + netTraitKV(r.nectars, r.thorns);
    const frequency = kv - 100;
    const data = {
      description: r.description,
      frequency,
      ageAdded: r.age,
      attributes: r.attributes,
      skills: r.skills.map(s => ({ name: s.name, level: s.level })),
      nectars: r.nectars,
      thorns: r.thorns,
      seedRequirement: '',
    };
    validateForgeData('root', data);
    track(await upsertGlobalItem({ type: 'root', name: r.name, data, karmicValue: BigInt(kv), adminId: admin.id }));
    rows.push({ type: 'root', name: r.name, kv, freq: frequency });
  }

  // ── Branches (freq = KV − ageAdded×5) ──
  for (const b of MODERN_BRANCHES) {
    const kv = sum(b.attributes) + b.skills.reduce((a, s) => a + s.level, 0) + netTraitKV(b.nectars, b.thorns);
    const frequency = kv - b.ageAdded * 5;
    const kvPerYear = kv / Math.max(1, b.ageAdded);
    if (kvPerYear < 3 || kvPerYear > 15) {
      console.warn(`  ⚠ Kai norm gauge: ${b.name} = ${kvPerYear.toFixed(1)} KV/yr (outside 3-15)`);
    }
    const data = {
      description: b.description,
      frequency,
      ageAdded: b.ageAdded,
      attributes: b.attributes,
      skills: b.skills.map(s => ({ name: s.name, level: s.level })),
      nectars: b.nectars,
      thorns: b.thorns,
      requirements: b.requirements,
    };
    validateForgeData('branch', data);
    track(await upsertGlobalItem({ type: 'branch', name: b.name, data, karmicValue: BigInt(kv), adminId: admin.id }));
    rows.push({ type: 'branch', name: b.name, kv, freq: frequency });
  }

  // ── Material coverage gate (Mike ruling 2026-08-05): every material an
  // item is made of must itself exist as generated stock in the catalog. ──
  {
    const known = new Set(MATERIALS.map(m => m.primaryMaterial));
    const resolves = (m: string) => known.has(m) || known.has(MATERIAL_ALIASES[m] ?? '');
    const unknowns = new Set<string>();
    const walk = (it: ItemTemplate) => {
      if (!resolves(it.primaryMaterial)) unknowns.add(it.primaryMaterial);
      for (const s of it.subordinateMaterials ?? []) if (!resolves(s)) unknowns.add(s);
      for (const c of it.contains ?? []) walk(c);
    };
    for (const it of [
      ...EVERYDAY_ITEMS, ...TECH_ITEMS, ...MEDICAL_ITEMS, ...WEAPON_ITEMS, ...VEHICLES,
      ...HOUSEHOLD_ITEMS_2, ...CONSUMABLE_HOBBY_ITEMS, ...BUILDINGS,
      ...MATERIALS, ...WAVE3_TOOLS_YARD, ...WAVE3_MEDICAL_SECURITY,
    ]) walk(it);
    if (unknowns.size) {
      throw new Error(`Items reference materials with no catalog stock: ${[...unknowns].join(', ')}`);
    }
    console.log(`Material coverage gate: PASS (${known.size} stock materials cover all item references)`);
  }

  // ── Items + vehicles ──
  const allItems = [
    ...EVERYDAY_ITEMS, ...TECH_ITEMS, ...MEDICAL_ITEMS, ...WEAPON_ITEMS, ...VEHICLES,
    ...HOUSEHOLD_ITEMS_2, ...CONSUMABLE_HOBBY_ITEMS, ...BUILDINGS,
    ...MATERIALS, ...WAVE3_TOOLS_YARD, ...WAVE3_MEDICAL_SECURITY,
  ];
  for (const it of allItems) {
    const data = itemPayload(it);
    validateForgeData('item', data);
    track(await upsertGlobalItem({ type: 'item', name: it.name, data, karmicValue: BigInt(it.kv), adminId: admin.id }));
    rows.push({ type: 'item', name: it.name, kv: it.kv });
  }

  // ── Report ──
  console.log(`\nModern-Earth library: ${created} created, ${existed} already present.`);
  const byType = new Map<string, { n: number; min: number; max: number }>();
  for (const r of rows) {
    const cur = byType.get(r.type) ?? { n: 0, min: Infinity, max: -Infinity };
    byType.set(r.type, { n: cur.n + 1, min: Math.min(cur.min, r.kv), max: Math.max(cur.max, r.kv) });
  }
  console.log(`skills: ${MODERN_SKILLS.length} definitions (KV 0 — priced at grant level)`);
  for (const [type, s] of byType) console.log(`${type}: ${s.n} entries, KV ${s.min}..${s.max}`);
  const roots = rows.filter(r => r.type === 'root');
  console.log(`root freq costs: ${roots.map(r => `${r.name}=${r.freq}`).join(', ')}`);
}

main()
  .catch((err) => { console.error(err); process.exit(1); })
  .finally(() => prisma.$disconnect());
