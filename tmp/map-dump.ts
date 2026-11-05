import { prisma } from '@/lib/db';

async function main() {
  const camp = await prisma.campaign.findFirst({ where: { name: { contains: 'Incubator' } }, select: { id: true, name: true, currentCycle: true } });
  if (!camp) throw new Error('No Incubator campaign');
  console.log('CAMPAIGN', camp.id, camp.name, 'cycle', camp.currentCycle);
  const locs = await prisma.location.findMany({ where: { campaignId: camp.id }, select: { id: true, name: true, type: true, status: true, data: true } });
  const byId = new Map(locs.map((l: any) => [l.id, l]));
  for (const l of locs as any[]) {
    let d: any = {};
    try { d = l.data ? JSON.parse(l.data) : {}; } catch {}
    const fp = d.footprint;
    const pts = Array.isArray(fp?.points) ? fp.points : null;
    let bbox = '';
    if (pts && pts.length) {
      const xs = pts.map((p: any) => p.x ?? p[0]); const ys = pts.map((p: any) => p.y ?? p[1]);
      bbox = `bbox x[${Math.min(...xs)}..${Math.max(...xs)}] y[${Math.min(...ys)}..${Math.max(...ys)}]`;
    }
    const parent = byId.get(d.parentLocationId ?? d.parentId)?.name ?? null;
    console.log(`\n# ${l.name} (${l.id}) type=${l.type} status=${l.status} parent=${parent ?? '-'} canvas=(${d.canvasX},${d.canvasY}) placedAt=${d.canvasPlacedAt ?? '-'} level=${d.level ?? '-'}`);
    console.log(`  footprint: ${pts ? pts.length + ' pts' : 'none'} ${bbox} scale=${JSON.stringify(fp?.scale ?? fp?.unitsPerFoot ?? null)} keys=${fp ? Object.keys(fp).join(',') : ''}`);
    const ops = Array.isArray(d.openings) ? d.openings : [];
    for (const o of ops) console.log(`  opening: ${JSON.stringify(o)}`);
    const otherKeys = Object.keys(d).filter(k => !['footprint','openings','description','aliases'].includes(k)).map(k => k + (typeof d[k] !== 'object' ? '=' + String(d[k]).slice(0,40) : ''));
    console.log(`  other data keys: ${otherKeys.join(', ')}`);
  }
  // where are the beings
  const chars = await prisma.character.findMany({ where: { campaignId: camp.id }, select: { id: true, name: true, data: true } });
  for (const c of chars as any[]) {
    const edges = await prisma.entityRelationship.findMany({ where: { sourceId: c.id, relationshipType: 'located_at' } });
    console.log(`\nCHAR ${c.name} (${c.id}) canvas=(${c.canvasX},${c.canvasY}) placedAt=${c.canvasPlacedAt?.toISOString?.() ?? c.canvasPlacedAt}`);
    for (const e of edges as any[]) console.log(`  located_at -> ${e.targetType} ${byId.get(e.targetId)?.name ?? e.targetId} data=${e.data ?? ''}`);
  }
  // relationship schema sample
  const sample = await prisma.entityRelationship.findFirst({ where: { relationshipType: 'located_at' } });
  console.log('\nEDGE SAMPLE', JSON.stringify(sample));
  const items = await prisma.campaignItem.groupBy({ by: ['locationId'], where: { campaignId: camp.id }, _count: true } as any);
  console.log('\nITEMS per locationId:', (items as any[]).map(i => `${byId.get(i.locationId)?.name ?? i.locationId}:${i._count}`).join(' | '));
  const facts = await prisma.worldFact.findMany({ where: { campaignId: camp.id, key: { contains: 'door' } } as any, select: { key: true, value: true, cycle: true } as any }).catch(() => []);
  console.log('\nDOOR FACTS', JSON.stringify(facts));
}
main().finally(() => prisma.$disconnect());
