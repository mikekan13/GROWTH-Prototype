import { prisma } from '../app/src/lib/db';
(async () => {
  const c = await prisma.campaign.findUnique({ where: { id: 'cms5z4j6z0000zg48z5vzl2jn' }, select: { gmUserId: true, name: true } });
  const u = await prisma.user.findUnique({ where: { id: c!.gmUserId }, select: { id: true, username: true, role: true } });
  const s = await prisma.session.findFirst({ where: { userId: u!.id, expiresAt: { gt: new Date() } }, orderBy: { expiresAt: 'desc' }, select: { id: true, expiresAt: true } }).catch(() => null);
  console.log(JSON.stringify({ campaign: c, user: u, liveSession: !!s, expires: s?.expiresAt }));
  process.exit(0);
})();
