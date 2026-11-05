import { prisma } from '../app/src/lib/db';
(async () => {
  const m = await (prisma as any).copilotMessage.findMany({ where: { campaignId: 'cms5z4j6z0000zg48z5vzl2jn' }, orderBy: { createdAt: 'desc' }, take: 4, select: { createdAt: true, role: true, content: true, actions: true } });
  for (const x of m.reverse()) { console.log(`--- ${x.createdAt.toISOString()} ${x.role}`); console.log(String(x.content).slice(0, 1500)); if (x.actions) console.log('tools:', String(x.actions).slice(0, 300)); }
  const ev = await prisma.campaignEvent.findMany({ where: { campaignId: 'cms5z4j6z0000zg48z5vzl2jn', actor: 'ai_copilot' }, orderBy: { createdAt: 'desc' }, take: 3, select: { createdAt: true, type: true, payload: true } });
  for (const e of ev) console.log('EVENT', e.createdAt.toISOString(), e.type, e.payload.slice(0, 600));
  process.exit(0);
})();
