import { prisma } from '@/lib/db';
import { randomBytes } from 'crypto';
async function main() {
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true, username: true } });
  if (!admin) throw new Error('no admin');
  const token = 'probe-' + randomBytes(24).toString('hex');
  await prisma.session.create({ data: { userId: admin.id, token, expiresAt: new Date(Date.now() + 2 * 3600 * 1000) } });
  console.log('TOKEN', token, 'user', admin.username);
}
main().finally(() => prisma.$disconnect());
