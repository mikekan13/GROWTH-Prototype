import { prisma } from '../app/src/lib/db';
(async () => { const r = await prisma.campaignEvent.findFirst({ where: { campaignId: 'cms5z4j6z0000zg48z5vzl2jn', characterName: 'Violet' }, orderBy: { createdAt: 'desc' } }); const p = JSON.parse(r!.payload); console.log(r!.createdAt.toISOString(), 'len', p.message.length, '\n', p.message, '\nRAW:', String(p.raw).slice(0, 400)); process.exit(0); })();
