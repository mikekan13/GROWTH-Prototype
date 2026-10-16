/**
 * Apply the 2026-10-16 material-life regrade (Mike approved the draft in
 * REGRADE-ROOTS-BRANCHES-2026-10-16.md):
 *
 *   npx tsx scripts/regrade-apply.ts            # stock: UPDATE the 27 published Root/Branch rows
 *   npx tsx scripts/regrade-apply.ts --violet   # + patch Violet's three campaign blocks and her sheet
 *
 * The seeder only CREATES missing rows (upsertGlobalItem returns 'existed'),
 * so a regrade of published stock has to update in place — this does, with
 * the same payload shape and the 8 KRMA/yr break-even.
 */
import './_server-only-shim';
import { prisma } from '../src/lib/db';
import { validateForgeData } from '../src/services/forge-schemas';
import { breakevenForYears } from '../src/services/forge-pricing';
import { MODERN_ROOTS } from './content/modern-earth/roots';
import { MODERN_BRANCHES } from './content/modern-earth/branches';
import { MODERN_NECTARS } from './content/modern-earth/nectars';
import { ALL_THORNS } from './content/modern-earth/thorns';
import { WAVE2_TRAITS } from './content/modern-earth/traits-wave2';

const TRAIT_KV = new Map([...MODERN_NECTARS, ...ALL_THORNS, ...WAVE2_TRAITS].map(t => [t.name, t.kv]));
const sum = (o: Record<string, number>) => Object.values(o).reduce((a, v) => a + Math.max(0, v), 0);
const traitsKv = (names: string[]) => names.reduce((a, n) => a + (TRAIT_KV.get(n) ?? 0), 0);
const matKv = (m: { possessions?: Array<{ kv: number }>; accumulatedWealth?: number }) =>
  (m.possessions ?? []).reduce((a, p) => a + Math.max(0, p.kv), 0) + Math.max(0, m.accumulatedWealth ?? 0);

async function applyStock() {
  let updated = 0;
  for (const r of MODERN_ROOTS) {
    const kv = sum(r.attributes) + r.skills.reduce((a, s) => a + s.level, 0) + traitsKv([...r.nectars, ...r.thorns]) + matKv(r);
    const data = {
      description: r.description, frequency: kv - breakevenForYears(r.age), ageAdded: r.age, attributes: r.attributes,
      skills: r.skills.map(s => ({ name: s.name, level: s.level })), nectars: r.nectars, thorns: r.thorns, seedRequirement: '',
      ...(r.possessions?.length ? { possessions: r.possessions } : {}), accumulatedWealth: r.accumulatedWealth ?? 0,
    };
    validateForgeData('root', data);
    const row = await prisma.forgeItem.findFirst({ where: { campaignId: null, type: 'root', name: r.name }, select: { id: true } });
    if (!row) { console.warn(`  ⚠ no stock root "${r.name}" — run the seeder first`); continue; }
    await prisma.forgeItem.update({ where: { id: row.id }, data: { data: JSON.stringify(data), karmicValue: BigInt(kv) } });
    updated++;
  }
  for (const b of MODERN_BRANCHES) {
    const kv = sum(b.attributes) + b.skills.reduce((a, s) => a + s.level, 0) + traitsKv([...b.nectars, ...b.thorns]) + matKv(b);
    const data = {
      description: b.description, frequency: kv - breakevenForYears(b.ageAdded), ageAdded: b.ageAdded, attributes: b.attributes,
      skills: b.skills.map(s => ({ name: s.name, level: s.level })), nectars: b.nectars, thorns: b.thorns, requirements: b.requirements,
      ...(b.possessions?.length ? { possessions: b.possessions } : {}), accumulatedWealth: b.accumulatedWealth ?? 0,
    };
    validateForgeData('branch', data);
    const row = await prisma.forgeItem.findFirst({ where: { campaignId: null, type: 'branch', name: b.name }, select: { id: true } });
    if (!row) { console.warn(`  ⚠ no stock branch "${b.name}" — run the seeder first`); continue; }
    await prisma.forgeItem.update({ where: { id: row.id }, data: { data: JSON.stringify(data), karmicValue: BigInt(kv) } });
    updated++;
  }
  console.log(`stock: ${updated} root/branch rows updated`);
}

// ── Violet (cms60ndtn0000kw48ioq10i68) — REGRADE-ROOTS-BRANCHES §3, with
//    Mike's physical fix ("2 in Clt and 3 in Cel? Like no way.") ──────────
const VIOLET = 'cms60ndtn0000kw48ioq10i68';
const VIOLET_BLOCKS: Array<{ id: string; type: 'root' | 'branch'; years: number; patch: Record<string, unknown>; grants: string[] }> = [
  {
    id: 'cmv58iw4w00073048r4p8j3lc', type: 'root', years: 18,
    patch: {
      attributes: { clout: 8, celerity: 9, constitution: 9, flow: 6, focus: 11, willpower: 9, wisdom: 10, wit: 10 },
      skills: [
        { name: 'Ancient Stories', level: 6 }, { name: 'Close Reading', level: 4 }, { name: 'Observation', level: 5 },
        { name: 'Needlework & Repair', level: 5 }, { name: 'Cooking', level: 3 },
      ],
      possessions: [
        { name: 'Handmade Stuffed Animal', description: 'A lavender rabbit Rosemary sewed when the bearer was four.', kv: 1 },
        { name: 'Sewing Box', description: 'Rosemary\'s; one of the four things kept when the house was sold.', kv: 2 },
        { name: 'Handwritten Recipe Collection', description: 'Thirty years of Rosemary\'s cooking in three inks.', kv: 1 },
      ],
      accumulatedWealth: 18,
    },
    grants: ['Handmade Stuffed Animal', 'Sewing Box', 'Handwritten Recipe Collection'],
  },
  {
    id: 'cmv58hgmr00013048aum9m9r6', type: 'branch', years: 2,
    patch: {
      attributes: { willpower: 3, focus: 2, wisdom: 2, wit: 1 },
      skills: [{ name: 'Reading Intent', level: 4 }, { name: 'Concealment', level: 3 }],
      accumulatedWealth: 1,
    },
    grants: [],
  },
  {
    id: 'cmv58i6a400033048051tdy2y', type: 'branch', years: 6,
    patch: {
      attributes: { focus: 4, wisdom: 2, wit: 2, willpower: 4, flow: 4 },
      skills: [
        { name: 'Creative Writing', level: 6 }, { name: 'Folklore Studies', level: 3 }, { name: 'Self-Teaching', level: 4 },
        { name: 'Ritual & Routine', level: 2 }, { name: 'Web Markup', level: 3 },
      ],
      possessions: [{ name: 'Laptop', description: 'Her writing machine.', kv: 10 }],
      accumulatedWealth: 6,
    },
    grants: ['Personal Laptop'],
  },
];
const ATTRS = ['clout', 'celerity', 'constitution', 'flow', 'focus', 'willpower', 'wisdom', 'wit'] as const;

async function applyViolet() {
  const now = new Date().toISOString();
  const levels: Record<string, number> = Object.fromEntries(ATTRS.map(a => [a, 0]));
  const skillLevels = new Map<string, number>();
  for (const b of VIOLET_BLOCKS) {
    const row = await prisma.forgeItem.findUnique({ where: { id: b.id }, select: { data: true, name: true } });
    if (!row) throw new Error(`Violet block ${b.id} missing`);
    const data = { ...JSON.parse(row.data), ...b.patch } as Record<string, unknown>;
    const attrs = data.attributes as Record<string, number>;
    const skills = data.skills as Array<{ name: string; level: number }>;
    const kv = sum(attrs) + skills.reduce((a, s) => a + s.level, 0) + traitsKv([...(data.nectars as string[] ?? []), ...(data.thorns as string[] ?? [])]) + matKv(data as { possessions?: Array<{ kv: number }>; accumulatedWealth?: number });
    data.frequency = kv - breakevenForYears(b.years);
    validateForgeData(b.type, data);
    await prisma.forgeItem.update({ where: { id: b.id }, data: { data: JSON.stringify(data), karmicValue: BigInt(kv) } });
    for (const a of ATTRS) levels[a] += Math.max(0, attrs[a] ?? 0);
    for (const s of skills) skillLevels.set(s.name, (skillLevels.get(s.name) ?? 0) + s.level);
    const link = await prisma.characterBlockLink.findUnique({ where: { characterId_forgeItemId: { characterId: VIOLET, forgeItemId: b.id } } });
    if (link) {
      const history = JSON.parse(link.history || '[]') as unknown[];
      history.push({ kind: 'regrade', at: now, text: `material-life regrade 2026-10-16: KV → ${kv} (accumulated wealth ${data.accumulatedWealth})` });
      await prisma.characterBlockLink.update({ where: { id: link.id }, data: { history: JSON.stringify(history) } });
    }
    for (const g of b.grants) {
      const item = await prisma.campaignItem.findFirst({ where: { name: g, OR: [{ holderId: VIOLET }], status: 'ACTIVE' }, select: { id: true, history: true } })
        ?? await prisma.campaignItem.findFirst({ where: { name: g, status: 'ACTIVE', campaignId: 'cms5z4j6z0000zg48z5vzl2jn' }, select: { id: true, history: true } });
      if (!item) { console.warn(`  ⚠ grant item "${g}" not found`); continue; }
      const history = JSON.parse(item.history || '[]') as unknown[];
      history.push({ kind: 'origin', at: now, text: `block grant: ${row.name} (regrade 2026-10-16)` });
      await prisma.campaignItem.update({ where: { id: item.id }, data: { history: JSON.stringify(history) } });
    }
    console.log(`violet ${b.type} ${row.name}: KV ${kv}`);
  }
  // Sheet: attribute levels = Σ root + branches (seed augments ride separately); current moves by the delta.
  const c = await prisma.character.findUnique({ where: { id: VIOLET }, select: { data: true } });
  const sheet = JSON.parse(c!.data);
  for (const a of ATTRS) {
    const cur = sheet.attributes[a] ?? { level: 0, current: 0 };
    const delta = levels[a] - (cur.level ?? 0);
    sheet.attributes[a] = { ...cur, level: levels[a], current: Math.max(0, (cur.current ?? 0) + delta) };
  }
  const skills = (sheet.skills ?? []) as Array<{ name: string; level: number; [k: string]: unknown }>;
  for (const [name, level] of skillLevels) {
    const s = skills.find(x => x.name === name);
    if (s) s.level = level;
    else skills.push({ name, level, governors: [] });
  }
  sheet.skills = skills;
  await prisma.character.update({ where: { id: VIOLET }, data: { data: JSON.stringify(sheet) } });
  console.log('violet sheet: attribute levels', JSON.stringify(levels), 'skills', [...skillLevels].map(([n, l]) => `${n}:${l}`).join(', '));
}

async function main() {
  await applyStock();
  if (process.argv.includes('--violet')) await applyViolet();
}
main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
