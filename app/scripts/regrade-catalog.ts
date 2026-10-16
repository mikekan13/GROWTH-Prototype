/**
 * regrade-catalog.ts — KV IS THE PRICE (Mike ruling 2026-10-16).
 *
 * The stock content files (scripts/content/modern-earth/*) now carry
 * price-graded fractional KV (anchor: three-seat couch ~$300 = 2 KV), plus
 * volumeCuFt and, for holders, capacityCuFt / capacityLbs. seed-modern-earth.ts
 * only CREATES missing rows, so this script updates the already-published
 * global item rows IN PLACE, by name:
 *   data.value (+ volumeCuFt / capacityCuFt / capacityLbs, also on nested
 *   `contains` entries matched by name), and karmicValue = round(kv) mirror.
 * Superseded rows are skipped. Campaign copies are NOT touched. Idempotent.
 *
 * Run: npx tsx scripts/regrade-catalog.ts
 */

import './_server-only-shim';
import { config } from 'dotenv';
config();

import { prisma } from '../src/lib/db';
import type { ItemTemplate } from './content/modern-earth/types';
import { EVERYDAY_ITEMS } from './content/modern-earth/items-everyday';
import { TECH_ITEMS, MEDICAL_ITEMS, WEAPON_ITEMS } from './content/modern-earth/items-tech-medical-weapons';
import { VEHICLES } from './content/modern-earth/vehicles';
import { HOUSEHOLD_ITEMS_2 } from './content/modern-earth/items-household-2';
import { CONSUMABLE_HOBBY_ITEMS } from './content/modern-earth/items-consumables-hobby';
import { BUILDINGS } from './content/modern-earth/buildings';
import { MATERIALS } from './content/modern-earth/materials';
import { WAVE3_TOOLS_YARD } from './content/modern-earth/items-wave3-tools-yard';
import { WAVE3_MEDICAL_SECURITY } from './content/modern-earth/items-wave3-medical-security';

const ALL: ItemTemplate[] = [
  ...EVERYDAY_ITEMS, ...TECH_ITEMS, ...MEDICAL_ITEMS, ...WEAPON_ITEMS, ...VEHICLES,
  ...HOUSEHOLD_ITEMS_2, ...CONSUMABLE_HOBBY_ITEMS, ...BUILDINGS,
  ...MATERIALS, ...WAVE3_TOOLS_YARD, ...WAVE3_MEDICAL_SECURITY,
];
const BY_NAME = new Map(ALL.map(t => [t.name, t]));

type Data = Record<string, unknown> & { contains?: Data[]; name?: string };

/** Write the template's price/bulk fields onto a payload node (and its
 *  nested `contains`, matched by name then position). Returns a new object. */
function apply(node: Data, t: ItemTemplate): Data {
  const out: Data = { ...node, value: t.kv };
  for (const k of ['volumeCuFt', 'capacityCuFt', 'capacityLbs'] as const) {
    if (t[k] != null) out[k] = t[k]; else delete out[k];
  }
  if (Array.isArray(node.contains) && t.contains?.length) {
    const pool = [...t.contains];
    out.contains = node.contains.map((child, i) => {
      // payload children carry no `name` field in seeded data — match by index,
      // but prefer a name match when present.
      const byName = typeof child.name === 'string' ? pool.find(c => c.name === child.name) : undefined;
      const ct = byName ?? t.contains![i];
      return ct ? apply(child, ct) : child;
    });
  }
  return out;
}

const stats = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const med = s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : NaN;
  return `count ${s.length}, min ${s[0]}, median ${med}, max ${s[s.length - 1]}`;
};

async function main() {
  const rows = await prisma.forgeItem.findMany({
    where: { campaignId: null, type: 'item', isGlobal: true },
    select: { id: true, name: true, status: true, data: true, karmicValue: true },
    orderBy: { name: 'asc' },
  });

  const before: number[] = [], after: number[] = [];
  const updated: string[] = [], unchanged: string[] = [], skipped: string[] = [], unknown: string[] = [];
  const samples: Array<{ name: string; old: number; kv: number; vol?: number; cap?: string }> = [];

  for (const r of rows) {
    if (r.status === 'superseded') { skipped.push(r.name); continue; }
    const t = BY_NAME.get(r.name);
    if (!t) { unknown.push(`${r.name} [${r.status}]`); continue; }
    const data = JSON.parse(r.data) as Data;
    const oldKv = typeof data.value === 'number' ? data.value : Number(r.karmicValue);
    const next = apply(data, t);
    const mirror = BigInt(Math.round(t.kv));
    before.push(oldKv); after.push(t.kv);
    samples.push({
      name: r.name, old: oldKv, kv: t.kv, vol: t.volumeCuFt,
      cap: t.capacityCuFt != null ? `${t.capacityCuFt} cuft / ${t.capacityLbs} lbs` : undefined,
    });
    const nextJson = JSON.stringify(next);
    if (nextJson === r.data && r.karmicValue === mirror) { unchanged.push(r.name); continue; }
    await prisma.forgeItem.update({ where: { id: r.id }, data: { data: nextJson, karmicValue: mirror } });
    updated.push(r.name);
  }

  console.log(`Global item rows: ${rows.length}`);
  console.log(`UPDATED ${updated.length} · UNCHANGED ${unchanged.length} · SUPERSEDED (skipped) ${skipped.length} · NOT IN STOCK FILES ${unknown.length}`);
  console.log(`BEFORE KV: ${stats(before)}`);
  console.log(`AFTER  KV: ${stats(after)}`);
  if (unknown.length) console.log(`Not in stock files (left alone): ${unknown.join(', ')}`);
  const step = Math.max(1, Math.floor(samples.length / 20));
  console.log('\nSample rows (name | old KV → new KV | ≈USD @ $150/KV | volume | capacity):');
  for (let i = 0, n = 0; i < samples.length && n < 20; i += step, n++) {
    const s = samples[i];
    console.log(`  ${s.name} | ${s.old} → ${s.kv} | $${Math.round(s.kv * 150)} | ${s.vol ?? '-'} cuft | ${s.cap ?? '-'}`);
  }
}

main()
  .then(async () => { await prisma.$disconnect(); process.exit(0); })
  .catch(async (err) => { console.error(err); await prisma.$disconnect(); process.exit(1); });
