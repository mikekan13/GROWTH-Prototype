import { prisma as p } from '../app/src/lib/db';
(async () => { const s = await p.gameSession.findFirst({ where: { campaignId: 'cms5z4j6z0000zg48z5vzl2jn' }, orderBy: { number: 'desc' }, select: { number: true, startedAt: true, endedAt: true } }); console.log(JSON.stringify(s)); await p.$disconnect(); })();
