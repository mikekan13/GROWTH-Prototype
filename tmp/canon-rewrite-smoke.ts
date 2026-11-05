/** Smoke test of canon rewrite mode on the dev DB: switch it on for Violet's campaign, then rewrite + undo each kind on Kristopher and check the DB is back. */
import { prisma } from '../app/src/lib/db';
import { setCanonRewriteMode, canonRewriteActive, readCanon, rewriteTrait, rewriteMemory, undoCanonRewrite } from '../app/src/services/canon-rewrite';
const C = 'cms5z4j6z0000zg48z5vzl2jn', K = 'cmvcbw49u0001h448qanzbhs3';
(async () => {
  const camp = await prisma.campaign.findUniqueOrThrow({ where: { id: C }, select: { gmUserId: true } });
  const gm = await prisma.user.findUniqueOrThrow({ where: { id: camp.gmUserId! }, select: { id: true, role: true, username: true } });
  console.log('gm', gm.username, gm.role);
  await setCanonRewriteMode(C, gm.id, gm.role, true);
  console.log('active as gm:', await canonRewriteActive(C, gm.id, gm.role), '| as GODHEAD:', await canonRewriteActive(C, gm.id, 'GODHEAD'));
  const canon = await readCanon(C, gm.id, gm.role, { characterId: K, query: 'military' });
  console.log('traits', canon.traits.map(t => `${t.type}:${t.name}`).join(' | '));
  console.log('memories found', canon.memories.length);
  const t = canon.traits[0];
  const beforeLink = await prisma.characterBlockLink.findUniqueOrThrow({ where: { id: t.linkId } });
  const r1 = await rewriteTrait(C, gm.id, gm.role, { characterId: K, trait: t.linkId, scope: 'instance', story: 'SMOKE TEST story', reason: 'smoke test' });
  await undoCanonRewrite(C, gm.id, gm.role, { rewriteId: r1.rewriteId });
  const afterLink = await prisma.characterBlockLink.findUniqueOrThrow({ where: { id: t.linkId } });
  console.log('trait instance restored:', afterLink.story === beforeLink.story && afterLink.history === beforeLink.history);
  const item = await prisma.forgeItem.findUniqueOrThrow({ where: { id: beforeLink.forgeItemId } });
  const r2 = await rewriteTrait(C, gm.id, gm.role, { characterId: K, trait: t.linkId, scope: 'blueprint', mechanicalEffect: 'SMOKE TEST effect', reason: 'smoke test' });
  await undoCanonRewrite(C, gm.id, gm.role, { rewriteId: r2.rewriteId });
  const item2 = await prisma.forgeItem.findUniqueOrThrow({ where: { id: item.id } });
  console.log('blueprint restored:', item2.data === item.data && item2.name === item.name);
  const m = canon.memories[0];
  const mBefore = await prisma.dayaMemoryEntry.findUniqueOrThrow({ where: { id: m.id } });
  const r3 = await rewriteMemory(C, gm.id, gm.role, { characterId: K, op: 'rewrite', memoryId: m.id, content: 'SMOKE TEST memory', reason: 'smoke' });
  await undoCanonRewrite(C, gm.id, gm.role, { rewriteId: r3.rewriteId });
  const r4 = await rewriteMemory(C, gm.id, gm.role, { characterId: K, op: 'retire', memoryId: m.id, reason: 'smoke' });
  await undoCanonRewrite(C, gm.id, gm.role, {});
  const mAfter = await prisma.dayaMemoryEntry.findUniqueOrThrow({ where: { id: m.id } });
  console.log('memory restored:', mAfter.content === mBefore.content && mAfter.classification === mBefore.classification && mAfter.narrativeCycle === mBefore.narrativeCycle, r4.op);
  const r5 = await rewriteMemory(C, gm.id, gm.role, { characterId: K, op: 'add', content: 'SMOKE TEST added', atAge: 30, reason: 'smoke' });
  await undoCanonRewrite(C, gm.id, gm.role, {});
  console.log('added memory removed:', !(await prisma.dayaMemoryEntry.findUnique({ where: { id: r5.memoryId } })));
  // The smoke rows stay as undone history; mark them so they read as tests.
  await prisma.changeLog.updateMany({ where: { category: 'canon_rewrite', description: { contains: 'smoke' } }, data: { source: 'canon_rewrite_smoke_test' } });
  process.exit(0);
})().catch(e => { console.error('FAIL', e.message); process.exit(1); });
