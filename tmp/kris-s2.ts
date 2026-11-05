import { prisma } from '../app/src/lib/db';
(async () => { const s = await (prisma as any).dayaWorkSession.findUnique({ where: { id: 'cmvccda300001yc48xnp1f8vx' } }); console.log(s.blockedReason, '| stage', s.stage, '| cycles', s.cycleCount, '| last', s.lastCycleAt?.toISOString(), '| mode', s.mode); console.log(s.plan); process.exit(0); })();
