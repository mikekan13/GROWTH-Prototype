import { prisma } from '../app/src/lib/db';
(async () => { const r = await prisma.session.deleteMany({ where: { token: { startsWith: 'probe-' } } }); console.log('probe sessions deleted', r.count); process.exit(0); })();
