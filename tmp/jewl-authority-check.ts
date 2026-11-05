import { prisma } from '../app/src/lib/db';
(async () => { const r = await (prisma as any).$queryRaw`PRAGMA table_info("DayaIntention")`; console.log((r as any[]).map((c: any) => c.name).join(',')); process.exit(0); })().catch(e => { console.error(e.message); process.exit(1); });
