import { drawPlaceMap } from '../app/src/services/place-map';
import { prisma } from '../app/src/lib/db';
const CAMP = 'cms5z4j6z0000zg48z5vzl2jn';
(async () => {
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' }, select: { id: true } });
  const r = await drawPlaceMap(CAMP, { userId: admin!.id, role: 'ADMIN' }, { home: "Violet's Apartment — Fourth-Floor Walkup Studio", tokens: [{ thing: 'The green couch', atFt: { x: 4, y: 11 }, sizeFt: { w: 7, d: 3 }, rotation: 90 }] });
  console.log('report', JSON.stringify(r));
  const facts = await (prisma as any).worldFact.findMany({ where: { campaignId: CAMP, supersededById: null }, select: { subjectKey: true, fact: true } });
  for (const f of facts.filter((f: any) => /couch/i.test(f.fact) || /couch/.test(f.subjectKey))) console.log('FACT', f.subjectKey, '|', f.fact.replace(/\s+/g, ' ').slice(0, 220));
  process.exit(0);
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
