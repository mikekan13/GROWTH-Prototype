import '../app/scripts/_server-only-shim';
import { prisma } from '../app/src/lib/db';
(async () => { const r = await prisma.location.update({ where: { id: 'cmw2pf7px00000048wnu8n97u' }, data: { status: 'ACTIVE' }, select: { name: true, status: true } }); console.log(r); process.exit(0); })();
