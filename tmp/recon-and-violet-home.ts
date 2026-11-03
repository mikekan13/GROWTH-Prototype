/** Put Violet back home (a session-3 move filed her in The Hotel and no rewind restored it); clear the stale reconciliation
 *  ticket and any ringing state; report every character's place. */
import { writeFileSync } from 'node:fs';
import { prisma } from '../app/src/lib/db';
const C = 'cms5z4j6z0000zg48z5vzl2jn', VIOLET = 'cms60ndtn0000kw48ioq10i68', MAIN_ROOM = 'cmvahhpg00001ss48yarg3fbg';
(async () => {
  const p = prisma as any;
  const before = await p.entityRelationship.findMany({ where: { sourceId: VIOLET, relationshipType: 'located_at' } });
  const recon = await p.reconciliation.findMany({ where: { campaignId: C, createdAt: { gte: new Date('2026-11-03T01:25:00Z') } } });
  writeFileSync(`data/archive/violet-home-${Date.now()}.json`, JSON.stringify({ before, recon }, (_k, v) => (typeof v === 'bigint' ? v.toString() : v), 1));
  await p.entityRelationship.deleteMany({ where: { sourceId: VIOLET, relationshipType: 'located_at' } });
  await p.entityRelationship.create({ data: { campaignId: C, sourceId: VIOLET, sourceType: 'CHARACTER', targetId: MAIN_ROOM, targetType: 'LOCATION', relationshipType: 'located_at', strength: 5 } });
  if (recon.length) await p.reconciliation.deleteMany({ where: { id: { in: recon.map((r: any) => r.id) } } });
  const sig = await prisma.campaignItem.findMany({ where: { campaignId: C, data: { contains: '"signal"' } }, select: { id: true, data: true } });
  for (const r of sig) { const d = JSON.parse(r.data); delete d.signal; await prisma.campaignItem.update({ where: { id: r.id }, data: { data: JSON.stringify(d) } }); }
  console.log(`Violet → Main Room; ${recon.length} reconciliation ticket(s) cleared; ${sig.length} signal(s) cleared`);
  process.exit(0);
})();
