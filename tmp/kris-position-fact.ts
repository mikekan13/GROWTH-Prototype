import { prisma } from '../app/src/lib/db';
import { placementSentence, roomContext } from '../app/src/services/thing-facts';
import { currentFacts, establishFact, supersede } from '../app/src/daya/world-ledger';
import { loadWorldLevel, beingStanding } from '../app/src/services/spatial-world';
const CAMP = 'cms5z4j6z0000zg48z5vzl2jn';
const KRIS = 'cmvcbw49u0001h448qanzbhs3';
(async () => {
  const { map } = await loadWorldLevel(CAMP);
  const s = await beingStanding(map, KRIS);
  if (!s?.room) throw new Error('Kristopher stands nowhere');
  const ctx = await roomContext(CAMP, s.room.id);
  if (!ctx) throw new Error('landing not drawn');
  const sentence = placementSentence('Kristopher', ctx.room, ctx.portals, { at: s.point }, ctx.others).replace('stands in the', 'stands on the');
  const cycle = (await prisma.campaign.findUnique({ where: { id: CAMP }, select: { currentCycle: true } }))?.currentCycle ?? 0;
  const cur = (await currentFacts(CAMP)).filter((f) => f.subjectKey === 'kristopher_position');
  if (cur.length) await supersede(cur[0].id, { fact: sentence, cycle }); else await establishFact(CAMP, 'kristopher_position', sentence, cycle);
  console.log('FACT kristopher_position |', sentence);
  process.exit(0);
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
