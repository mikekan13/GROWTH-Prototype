/** Session 0: Mike voices Kristopher, so his being must not act on its own. DORMANT = the being loop skips him (memories kept). */
import { prisma } from '../app/src/lib/db';
(async () => { await (prisma as any).dayaEntity.update({ where: { id: 'cmvccodq2001tyc486jp89cwk' }, data: { status: 'DORMANT' } }); console.log('Kristopher being DORMANT'); process.exit(0); })();
