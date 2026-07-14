/**
 * JEWL mistake-bounty loop test (T19 — transfer-on-acceptance + Et'herling).
 *
 * Proves the money-flow ruling (Mike 2026-07-14): the flag pays NOTHING; the
 * bounty moves only when JEWL owns it or Et'herling upholds a dispute.
 *
 *   1. flag        → row 'flagged', no KRMA moved (both wallets unchanged).
 *   2. accept      → JEWL−N, GM+N, status 'acknowledged', txn recorded.
 *   3. overturned  → Et'herling rule_jewl_mistake('overturned'): no transfer,
 *                    status 'resolved', invocation stamped.
 *   4. upheld      → rule_jewl_mistake('upheld'): JEWL−N, GM+N, resolved.
 *   5. guard       → the tool refuses a row that is not 'disputed'.
 *
 * Steps 3-4 drive the godhead tool directly (deterministic) instead of a live
 * Et'herling LLM invocation — the full agent path is exercised by disputeMistake
 * in production and needs a real-API smoke (like T32's golden path).
 *
 * Deltas are asserted relative to captured balances, so the test is idempotent
 * across runs. JEWL_DISABLE_DISPATCH suppresses the live GM_MISTAKE_FLAG prompt.
 *
 * Run: npx tsx scripts/test-jewl-mistake.ts   (exits non-zero on failure)
 */
import './_server-only-shim';
process.env.JEWL_DISABLE_DISPATCH = 'true';

import { prisma } from '../src/lib/db';
import {
  flagJewlMistake,
  acceptMistake,
} from '../src/services/jewl-mistake';
import { getMistakeBountyConfig } from '../src/services/economy-config';
import { getJewlGodHead } from '../src/ai/copilot/jewl-identity';
import { getWalletByOwner } from '../src/services/krma/wallet';
import { executeTool } from '../src/godhead/tools/registry';
import '../src/godhead/tools/rule-jewl-mistake';

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}
async function balance(walletId: string): Promise<bigint> {
  const w = await prisma.wallet.findUnique({ where: { id: walletId } });
  return w?.balance ?? BigInt(0);
}
async function ownerBalance(userId: string): Promise<bigint> {
  try {
    const w = await getWalletByOwner(userId);
    return w.balance;
  } catch {
    return BigInt(0);
  }
}

const createdMessageIds: string[] = [];
const createdMistakeIds: string[] = [];
const createdInvocationIds: string[] = [];

async function makeFlag(campaignId: string, gmUserId: string) {
  const msg = await prisma.copilotMessage.create({
    data: { campaignId, role: 'assistant', content: 'Test JEWL utterance under scrutiny.' },
  });
  createdMessageIds.push(msg.id);
  const rec = await flagJewlMistake({
    campaignId,
    gmUserId,
    copilotMessageId: msg.id,
    severity: 'minor',
    note: 'test flag',
  });
  createdMistakeIds.push(rec.id);
  return rec;
}

async function main() {
  console.log('JEWL mistake-bounty loop (T19)\n' + '─'.repeat(50));

  const jewl = await getJewlGodHead();
  if (!jewl.walletId) {
    console.log('SKIP: JEWL has no wallet — run `npx tsx scripts/seed-godheads.ts`.');
    process.exit(0);
  }
  const etherling = await prisma.godHead.findUnique({ where: { name: "Eth'erling" } });
  if (!etherling) {
    console.log("SKIP: Eth'erling godhead not seeded — run `npx tsx scripts/seed-godheads.ts`.");
    process.exit(0);
  }
  const campaign = await prisma.campaign.findFirst({ select: { id: true, gmUserId: true } });
  if (!campaign) { console.log('SKIP: no campaign seeded.'); process.exit(0); }

  const { minor } = await getMistakeBountyConfig();
  const N = BigInt(minor);
  const gmUserId = campaign.gmUserId;
  console.log(`  (bounty minor = ${minor} KRMA; GM ${gmUserId})`);

  try {
    // ── 1. Flag: no KRMA moves ──
    const jewlBefore = await balance(jewl.walletId);
    const gmBefore = await ownerBalance(gmUserId);
    const flagged = await makeFlag(campaign.id, gmUserId);
    check('flag: status is flagged', flagged.status === 'flagged', flagged.status);
    check('flag: no transaction recorded', flagged.transactionId === null);
    check('flag: pending bounty = config amount', flagged.bountyAmount === N, `${flagged.bountyAmount}`);
    check('flag: JEWL wallet unchanged', (await balance(jewl.walletId)) === jewlBefore);
    check('flag: GM wallet unchanged', (await ownerBalance(gmUserId)) === gmBefore);

    // ── 2. Accept: bounty pays ──
    const accepted = await acceptMistake({
      mistakeId: flagged.id,
      response: 'You are right, I misjudged that.',
      campaignId: campaign.id,
    });
    check('accept: status acknowledged', accepted.status === 'acknowledged', accepted.status);
    check('accept: resolution accepted', accepted.resolution === 'accepted');
    check('accept: transaction recorded', !!accepted.transactionId);
    check('accept: JEWL wallet debited by N', (await balance(jewl.walletId)) === jewlBefore - N);
    check('accept: GM wallet credited by N', (await ownerBalance(gmUserId)) === gmBefore + N);

    // ── 3. Dispute → overturned (no transfer) ──
    const jewlPre3 = await balance(jewl.walletId);
    const gmPre3 = await ownerBalance(gmUserId);
    const d1 = await makeFlag(campaign.id, gmUserId);
    await prisma.jewlMistake.update({ where: { id: d1.id }, data: { status: 'disputed' } });
    const inv1 = await prisma.godHeadInvocation.create({
      data: { godHeadId: etherling.id, triggerType: 'jewl.mistake.dispute', triggerData: '{}', status: 'RUNNING', startedAt: new Date() },
    });
    createdInvocationIds.push(inv1.id);
    const overturn = await executeTool('rule_jewl_mistake', {
      mistakeId: d1.id, ruling: 'overturned', reasoning: 'JEWL had it right; the GM misread the rule.',
    }, { godHeadId: etherling.id, godHeadName: etherling.name, invocationId: inv1.id });
    check('overturn: tool succeeded', overturn.success, overturn.error ?? '');
    const d1row = await prisma.jewlMistake.findUnique({ where: { id: d1.id } });
    check('overturn: status resolved', d1row?.status === 'resolved', d1row?.status ?? '');
    check('overturn: resolution overturned', d1row?.resolution === 'overturned');
    check('overturn: no transaction', d1row?.transactionId === null);
    check('overturn: invocation stamped', d1row?.adjudicationInvocationId === inv1.id);
    check('overturn: JEWL wallet unchanged', (await balance(jewl.walletId)) === jewlPre3);
    check('overturn: GM wallet unchanged', (await ownerBalance(gmUserId)) === gmPre3);

    // ── 4. Dispute → upheld (bounty pays) ──
    const jewlPre4 = await balance(jewl.walletId);
    const gmPre4 = await ownerBalance(gmUserId);
    const d2 = await makeFlag(campaign.id, gmUserId);
    await prisma.jewlMistake.update({ where: { id: d2.id }, data: { status: 'disputed' } });
    const inv2 = await prisma.godHeadInvocation.create({
      data: { godHeadId: etherling.id, triggerType: 'jewl.mistake.dispute', triggerData: '{}', status: 'RUNNING', startedAt: new Date() },
    });
    createdInvocationIds.push(inv2.id);
    const uphold = await executeTool('rule_jewl_mistake', {
      mistakeId: d2.id, ruling: 'upheld', reasoning: 'The GM proved the error; bounty stands.',
    }, { godHeadId: etherling.id, godHeadName: etherling.name, invocationId: inv2.id });
    check('uphold: tool succeeded', uphold.success, uphold.error ?? '');
    const d2row = await prisma.jewlMistake.findUnique({ where: { id: d2.id } });
    check('uphold: status resolved', d2row?.status === 'resolved', d2row?.status ?? '');
    check('uphold: resolution upheld', d2row?.resolution === 'upheld');
    check('uphold: transaction recorded', !!d2row?.transactionId);
    check('uphold: JEWL wallet debited by N', (await balance(jewl.walletId)) === jewlPre4 - N);
    check('uphold: GM wallet credited by N', (await ownerBalance(gmUserId)) === gmPre4 + N);

    // ── 5. Guard: only 'disputed' rows can be ruled ──
    const d3 = await makeFlag(campaign.id, gmUserId); // stays 'flagged'
    const inv3 = await prisma.godHeadInvocation.create({
      data: { godHeadId: etherling.id, triggerType: 'jewl.mistake.dispute', triggerData: '{}', status: 'RUNNING', startedAt: new Date() },
    });
    createdInvocationIds.push(inv3.id);
    const guard = await executeTool('rule_jewl_mistake', {
      mistakeId: d3.id, ruling: 'upheld', reasoning: 'should be rejected',
    }, { godHeadId: etherling.id, godHeadName: etherling.name, invocationId: inv3.id });
    check('guard: tool refuses a non-disputed row', !guard.success && !!guard.error);
  } finally {
    await prisma.jewlMistake.deleteMany({ where: { id: { in: createdMistakeIds } } });
    await prisma.godHeadInvocation.deleteMany({ where: { id: { in: createdInvocationIds } } });
    await prisma.copilotMessage.deleteMany({ where: { id: { in: createdMessageIds } } });
    console.log('  (cleaned up test messages, mistakes, invocations)');
  }

  console.log('─'.repeat(50));
  console.log(failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`);
  await prisma.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
