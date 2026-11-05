import { prisma } from '../app/src/lib/db';
(async () => {
  const p = prisma as any;
  const chars = await p.character.findMany({ where: { campaignId: 'cms5z4j6z0000zg48z5vzl2jn' }, select: { id: true, name: true, entityType: true, status: true, genesisTier: true, userId: true, data: true, daya: { select: { status: true } } } });
  for (const c of chars) { let d: any = {}; try { d = JSON.parse(c.data); } catch {} console.log('CHAR', c.name, c.entityType, c.status, 'tier', c.genesisTier, 'user', c.userId?.slice(-4) ?? '-', 'daya', c.daya?.status ?? 'none', 'approval/stage', d.meta?.approval ?? d.approval ?? d.stage ?? d.meta?.stage ?? '-', 'crystal', d.meta?.crystallized ?? d.crystallized ?? '-', 'sex', d.identity?.sex); }
  process.exit(0);
})().catch(e => { console.error(e.message); process.exit(1); });
