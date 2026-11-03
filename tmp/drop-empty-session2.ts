/** Michael 2026-11-02: "Session 2 has nothing in it. The call should be session 2." Remove the empty session's row and its start/end events (archived); keep the world changes made while it was open. */
import { writeFileSync } from 'node:fs';
import { prisma } from '../app/src/lib/db';
const C = 'cms5z4j6z0000zg48z5vzl2jn', S2 = 'cmvx9yqju005kvg48b219rr2h';
(async () => {
  const p = prisma as any;
  const ev = await prisma.campaignEvent.findMany({ where: { campaignId: C, OR: [{ sessionId: S2 }, { payload: { contains: '"Session 2 ' } }] } });
  const gs = await p.gameSession.findUnique({ where: { id: S2 } });
  writeFileSync(`data/archive/drop-empty-session2-${Date.now()}.json`, JSON.stringify({ ev, gs }, null, 1));
  await prisma.campaignEvent.deleteMany({ where: { id: { in: ev.map((e) => e.id) } } });
  if (gs) await p.gameSession.delete({ where: { id: S2 } });
  const left = await p.gameSession.findMany({ where: { campaignId: C }, select: { id: true, createdAt: true } });
  console.log(`removed ${ev.length} events + session row; sessions left: ${left.length}`);
  process.exit(0);
})();
