import { hashPassword, verifyPassword } from '../app/src/lib/auth';
import { prisma } from '../app/src/lib/db';
const [username, password] = process.argv.slice(2);
(async () => {
  const hash = await hashPassword(password);
  const u = await prisma.user.update({ where: { username }, data: { passwordHash: hash }, select: { username: true, role: true } });
  console.log('updated', u, 'verify:', await verifyPassword(password, hash));
  await prisma.$disconnect();
})();
