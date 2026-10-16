/**
 * Regrade report (2026-10-16): prices every stock Root/Branch template with
 * the material lines, compares to what is published, and prints a markdown
 * table for Mike's review. Read-only; the seeder applies on his word.
 *
 *   npx tsx scripts/regrade-report.ts > ../REGRADE-ROOTS-BRANCHES-2026-10-16.md
 */
import './_server-only-shim';
import { prisma } from '../src/lib/db';
import { validateForgeData } from '../src/services/forge-schemas';
import { KRMA_PER_YEAR, breakevenForYears } from '../src/services/forge-pricing';
import { MODERN_ROOTS } from './content/modern-earth/roots';
import { MODERN_BRANCHES } from './content/modern-earth/branches';
import { MODERN_NECTARS } from './content/modern-earth/nectars';
import { ALL_THORNS } from './content/modern-earth/thorns';
import { WAVE2_TRAITS } from './content/modern-earth/traits-wave2';

const TRAIT_KV = new Map([...MODERN_NECTARS, ...ALL_THORNS, ...WAVE2_TRAITS].map(t => [t.name, t.kv]));
const sum = (o: Record<string, number>) => Object.values(o).reduce((a, v) => a + Math.max(0, v), 0);
const mat = (m: { possessions?: Array<{ kv: number; name: string }>; accumulatedWealth?: number }) => ({
  grants: (m.possessions ?? []).reduce((a, p) => a + Math.max(0, p.kv), 0),
  wealth: Math.max(0, m.accumulatedWealth ?? 0),
});

async function main() {
  const published = await prisma.forgeItem.findMany({
    where: { isGlobal: true, type: { in: ['root', 'branch'] } },
    select: { name: true, type: true, karmicValue: true },
  });
  const old = new Map(published.map(p => [`${p.type}::${p.name}`, Number(p.karmicValue)]));

  const lines: string[] = [];
  lines.push('# Stock Roots + Branches — material-life regrade (16 Oct 2026, DRAFT for Mike)');
  lines.push('');
  lines.push('Mike (16 Oct): "increase the TKV of Roots and Branches probably by around 50… all need to be rebalanced… some of that 50 won\'t all be in the accumulated wealth but into attributes, possessions gained, items gained, skills, etc." Branches are tied to time, so they lift ~+2.8/yr (50/18). Named grants are stock item archetypes genesis pulls free and paints; accumulated wealth is the unnamed life\'s budget.');
  lines.push('');
  lines.push(`**Break-even:** RULED (Mike): break-even = ${KRMA_PER_YEAR} KRMA × years for roots and branches alike — an 18-year root breaks even at ${breakevenForYears(18)}, a 17-year one at ${breakevenForYears(17)}.`);
  lines.push('');
  lines.push('Nothing below is seeded yet. On approval: `npx tsx scripts/seed-modern-earth.ts` (idempotent upsert) re-publishes these; Violet\'s three campaign blocks are patched separately (§3).');
  lines.push('');
  lines.push('## 1. Roots (18 years)');
  lines.push('');
  lines.push('| Root | old KV | attrs | skills | grants | wealth | **new KV** | Δ | freq | named grants |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|');
  for (const r of MODERN_ROOTS) {
    const attrs = sum(r.attributes);
    const skills = r.skills.reduce((a, s) => a + s.level, 0);
    const traits = [...r.nectars, ...r.thorns].reduce((a, n) => a + (TRAIT_KV.get(n) ?? 0), 0);
    const { grants, wealth } = mat(r);
    const kv = attrs + skills + traits + grants + wealth;
    const freq = kv - breakevenForYears(r.age);
    const o = old.get(`root::${r.name}`);
    validateForgeData('root', { description: r.description, frequency: freq, ageAdded: r.age, attributes: r.attributes, skills: r.skills, nectars: r.nectars, thorns: r.thorns, seedRequirement: '', possessions: r.possessions, accumulatedWealth: r.accumulatedWealth ?? 0 });
    lines.push(`| ${r.name} | ${o ?? '—'} | ${attrs} | ${skills} | ${grants} | ${wealth} | **${kv}** | ${o != null ? (kv - o >= 0 ? '+' : '') + (kv - o) : '—'} | ${freq} | ${(r.possessions ?? []).map(p => `${p.name} (${p.kv})`).join(', ') || '—'} |`);
  }
  lines.push('');
  lines.push('## 2. Branches (per year)');
  lines.push('');
  lines.push('| Branch | yrs | old KV | attrs | skills | traits | grants | wealth | **new KV** | Δ | KV/yr | freq | named grants |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const b of MODERN_BRANCHES) {
    const attrs = sum(b.attributes);
    const skills = b.skills.reduce((a, s) => a + s.level, 0);
    const traits = [...b.nectars, ...b.thorns].reduce((a, n) => a + (TRAIT_KV.get(n) ?? 0), 0);
    const { grants, wealth } = mat(b);
    const kv = attrs + skills + traits + grants + wealth;
    const freq = kv - breakevenForYears(b.ageAdded);
    const perYear = kv / Math.max(1, b.ageAdded);
    const o = old.get(`branch::${b.name}`);
    validateForgeData('branch', { description: b.description, frequency: freq, ageAdded: b.ageAdded, attributes: b.attributes, skills: b.skills, nectars: b.nectars, thorns: b.thorns, requirements: b.requirements, possessions: b.possessions, accumulatedWealth: b.accumulatedWealth ?? 0 });
    const band = perYear < 3 || perYear > 15 ? ' ⚠' : '';
    lines.push(`| ${b.name} | ${b.ageAdded} | ${o ?? '—'} | ${attrs} | ${skills} | ${traits} | ${grants} | ${wealth} | **${kv}** | ${o != null ? (kv - o >= 0 ? '+' : '') + (kv - o) : '—'} | ${perYear.toFixed(1)}${band} | ${freq} | ${(b.possessions ?? []).map(p => `${p.name} (${p.kv})`).join(', ') || '—'} |`);
  }
  console.log(lines.join('\n'));
}
main().finally(() => prisma.$disconnect());
