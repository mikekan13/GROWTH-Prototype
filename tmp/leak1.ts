import { prisma } from '../app/src/lib/db';
const C = 'cms5z4j6z0000zg48z5vzl2jn';
async function main() {
  const locs = await prisma.location.findMany({ where: { campaignId: C, status: { not: 'DESTROYED' } }, select: { id: true, name: true, data: true } });
  for (const l of locs) { let fp: any = null; try { fp = JSON.parse(l.data ?? '{}').footprint; } catch {} console.log('LOC', l.name, fp ? fp.level : '-'); }
  const facts = await prisma.worldFact.findMany({ where: { campaignId: C, supersededById: null }, select: { subjectKey: true, fact: true } });
  const heads = new Map<string, number>();
  for (const f of facts) { const h = f.subjectKey.split(/[.:]/)[0]!.toLowerCase(); heads.set(h, (heads.get(h) ?? 0) + 1); }
  console.log([...heads.entries()].map(([h, n]) => `${h}:${n}`).join(' '));
  for (const f of facts) if (/hotel|parking|car\b/i.test(f.subjectKey)) console.log('F', f.subjectKey, '|', f.fact.slice(0, 80));
}
main().then(() => process.exit(0));
