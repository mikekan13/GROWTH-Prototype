import { prisma } from '../app/src/lib/db';
const CAMP = 'cms5z4j6z0000zg48z5vzl2jn';
(async () => {
  const p = prisma as any;
  const locs = await prisma.location.findMany({ where: { campaignId: CAMP }, select: { name: true, data: true } });
  for (const l of locs) { const d = JSON.parse(l.data ?? '{}'); console.log('LOC', l.name, 'keys:', Object.keys(d).join(','), d.contents ? `contents×${(d.contents as any[]).length}` : '', d.layout ? 'layout' : '', d.furnishings ? `furnishings×${(d.furnishings as any[]).length}` : ''); }
  const facts = await p.worldFact.findMany({ where: { campaignId: CAMP, supersededById: null }, select: { fact: true, subjectKey: true } });
  const placey = facts.filter((f: any) => /couch|desk|shelf|lamp|basket|dresser|mattress|board|window|corner|wall/i.test(f.fact));
  console.log(`-- world facts: ${facts.length} total, ${placey.length} about placement:`);
  for (const f of placey.slice(0, 14)) console.log('   ', (f.subjectKey ?? '') + ':', f.fact.replace(/\s+/g, ' ').slice(0, 150));
  const items = await prisma.campaignItem.findMany({ where: { campaignId: CAMP, name: { in: ['The green couch', 'The desk under the window', 'The reading corner shelf', 'The tall dresser', 'The mattress'] } }, select: { name: true, story: true, data: true } });
  console.log('-- the things themselves:');
  for (const it of items) { const d = JSON.parse(it.data ?? '{}'); console.log('   ', it.name, '| story:', (it.story ?? '').replace(/\s+/g, ' ').slice(0, 120), '| data.placement:', JSON.stringify(d.placement ?? d.position ?? d.mapPosition ?? null), '| data keys:', Object.keys(d).join(',')); }
  process.exit(0);
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
