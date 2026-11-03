import { prisma } from '../app/src/lib/db';
(async () => { const s = await (prisma as any).gameSession.findMany({ where: { campaignId: 'cms5z4j6z0000zg48z5vzl2jn' }, select: { id: true, number: true, startedAt: true, endedAt: true } }); console.log(JSON.stringify(s)); process.exit(0); })();
