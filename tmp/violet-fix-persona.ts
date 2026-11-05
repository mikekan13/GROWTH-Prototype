import { prisma } from '../app/src/lib/db';
import { rewriteMemory } from '../app/src/services/canon-rewrite';
const C = 'cms5z4j6z0000zg48z5vzl2jn', V = 'cms60ndtn0000kw48ioq10i68', E = 'cmv57ezn2000lds4859pxeux4';
(async () => {
  const p = prisma as any;
  const camp = await prisma.campaign.findUniqueOrThrow({ where: { id: C }, select: { gmUserId: true } });
  const gm = await prisma.user.findUniqueOrThrow({ where: { id: camp.gmUserId! }, select: { id: true, role: true } });
  // 1. Persona affect baseline: tonight is BEFORE the handoff (session 0), not the week after.
  const e = await p.dayaEntity.findUniqueOrThrow({ where: { id: E } });
  const pp = JSON.parse(e.personaProfile);
  const before = pp.voiceNotes;
  pp.voiceNotes = String(pp.voiceNotes).replace('(eleven minutes at the door, the phone hasn\'t rung)', '(the bet is made — the bill is folded by the door, he has not knocked yet tonight)');
  console.log('voiceNotes changed:', before !== pp.voiceNotes);
  await p.changeLog.create({ data: { campaignId: C, characterId: V, characterName: 'Violet', actor: 'gm', actorUserId: gm.id, category: 'canon_rewrite', description: 'Persona affect baseline moved to session 0 (before the handoff) — it still read "eleven minutes at the door"', source: 'canon_rewrite_mode', changes: JSON.stringify({ voiceNotes: pp.voiceNotes }), revertible: false, snapshotBefore: JSON.stringify({ kind: 'persona_voiceNotes', entityId: E, voiceNotes: before }) } });
  await p.dayaEntity.update({ where: { id: E }, data: { personaProfile: JSON.stringify(pp) } });
  // 2. Retire the hallucinated "it already happened" memory.
  const r = await rewriteMemory(C, gm.id, gm.role, { characterId: V, op: 'retire', memoryId: 'cmvcidogp008ksk489gl1yxe9', reason: 'hello world: she narrated the handoff as already done (stale persona baseline), it never happened' });
  console.log('retired', r.memoryId);
  process.exit(0);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
