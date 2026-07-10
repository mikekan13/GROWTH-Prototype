/**
 * T13 acceptance test — contract evaluator + penalty pipeline + immutability.
 *
 * 1. A synthetic transfer pushes Tara's holdings past 20% of total system
 *    KRMA (excl. Terminal Reserve) → her contract flips VIOLATED and a
 *    PENDING_CONFIRMATION DISSOLUTION penalty action appears.
 * 2. Immutable contract: PATCH and revoke are rejected.
 * 3. Cleans up after itself (reverses the transfer, resets contract state).
 *
 * Run: npx tsx scripts/test-contracts.ts   (exits non-zero on failure)
 */
import { prisma } from '../src/lib/db';
import { executeTransaction } from '../src/services/krma/ledger';
import {
  evaluateContract,
  rejectPenaltyAction,
  updateContract,
  revokeContract,
  createContract,
} from '../src/services/contracts';
import { ForbiddenError } from '../src/lib/errors';

const TARA_CONTRACT_NAME = 'The Severity Cap — Tara Almswood';
let failures = 0;

function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  const contract = await prisma.contract.findFirst({ where: { name: TARA_CONTRACT_NAME } });
  const tara = await prisma.character.findFirst({ where: { name: 'Tara Almswood' } });
  const taraGodhead = tara ? await prisma.godHead.findUnique({ where: { characterId: tara.id } }) : null;
  const terminal = await prisma.wallet.findFirst({ where: { walletType: 'RESERVE', label: 'Terminal' } });
  if (!admin || !contract || !tara || !taraGodhead?.walletId || !terminal) {
    console.error('Missing prerequisites — run npm run seed:all first.');
    process.exit(1);
  }

  // Baseline: contract holds
  const baseline = await evaluateContract(contract.id, 'MANUAL');
  check('baseline: predicate holds', baseline.holds, JSON.stringify(baseline.detail.leaves));

  // ── 1. Cross the 20% line ─────────────────────────────────────────
  // Supply excl. Terminal grows by T when Terminal pays out T, so we need
  // T > (0.2*S - tara) / 0.8 where S = current supply excl. Terminal.
  const agg = await prisma.wallet.aggregate({ _sum: { balance: true } });
  const total = Number(agg._sum.balance ?? BigInt(0));
  const supplyExclTerminal = total - Number(terminal.balance);
  const leaves = baseline.detail.leaves;
  const taraNow = Object.entries(leaves).find(([k]) => k.includes('tkv'))?.[1] ?? 0;
  const need = Math.ceil((0.2 * supplyExclTerminal - taraNow) / 0.8) + 1_000_000; // headroom
  console.log(`  supply excl Terminal=${supplyExclTerminal}, tara=${taraNow}, transferring ${need}`);

  await executeTransaction({
    fromWalletId: terminal.id,
    toWalletId: taraGodhead.walletId,
    amount: BigInt(need),
    state: 'FLUID',
    reason: 'CORRECTION',
    description: 'T13 test — synthetic inflation of Tara holdings',
    metadata: { test: 'test-contracts' },
    actorId: 'SYSTEM',
    actorType: 'SYSTEM',
    idempotencyKey: `test-contracts-inflate-${need}`,
  });

  const violatedEval = await evaluateContract(contract.id, 'MANUAL');
  check('violation: predicate no longer holds', !violatedEval.holds);
  check('violation: this evaluation flipped it', violatedEval.violated);

  const after = await prisma.contract.findUnique({ where: { id: contract.id } });
  check('contract status = VIOLATED', after?.status === 'VIOLATED', after?.status);

  const pending = await prisma.penaltyAction.findFirst({
    where: { contractId: contract.id, status: 'PENDING_CONFIRMATION' },
  });
  check('ADMIN penalty confirmation created', !!pending, pending?.kind);
  check('penalty kind = DISSOLUTION (never auto-executes)', pending?.kind === 'DISSOLUTION');
  const taraAfter = await prisma.character.findUnique({ where: { id: tara.id } });
  check('Tara NOT auto-dissolved', taraAfter?.status !== 'DISSOLVED', taraAfter?.status);

  const auditCount = await prisma.contractEvaluation.count({ where: { contractId: contract.id } });
  check('evaluations audit-logged', auditCount >= 2, `${auditCount} rows`);

  // ── 2. Immutable tier ─────────────────────────────────────────────
  const immutableTest = await createContract(
    {
      name: '__TEST__ immutable',
      parties: [{ type: 'CHARACTER', id: tara.id }],
      predicate: { op: 'before', dateISO: '9999-01-01T00:00:00.000Z' },
      penalty: { kind: 'FLAG_ADMIN', message: 'test' },
    },
    admin.id,
    { allowImmutable: true, immutable: true },
  );
  let patchRejected = false;
  try {
    await updateContract(immutableTest.id, { name: 'hacked' });
  } catch (e) {
    patchRejected = e instanceof ForbiddenError;
  }
  check('immutable contract PATCH rejected', patchRejected);
  let revokeRejected = false;
  try {
    await revokeContract(immutableTest.id);
  } catch (e) {
    revokeRejected = e instanceof ForbiddenError;
  }
  check('immutable contract revoke rejected', revokeRejected);

  // API-path check: immutable creation without the seed flag is rejected
  let createRejected = false;
  try {
    await createContract(
      {
        name: '__TEST__ immutable 2',
        parties: [{ type: 'CHARACTER', id: tara.id }],
        predicate: { op: 'before', dateISO: '9999-01-01T00:00:00.000Z' },
        penalty: { kind: 'FLAG_ADMIN', message: 'test' },
      },
      admin.id,
      { immutable: true }, // no allowImmutable — the API route path
    );
  } catch (e) {
    createRejected = e instanceof ForbiddenError;
  }
  check('immutable creation outside seeding rejected', createRejected);

  // ── 3. Cleanup ────────────────────────────────────────────────────
  if (pending) await rejectPenaltyAction(pending.id, admin.id);
  await executeTransaction({
    fromWalletId: taraGodhead.walletId,
    toWalletId: terminal.id,
    amount: BigInt(need),
    state: 'FLUID',
    reason: 'CORRECTION',
    description: 'T13 test — reverse synthetic inflation',
    metadata: { test: 'test-contracts' },
    actorId: 'SYSTEM',
    actorType: 'SYSTEM',
    idempotencyKey: `test-contracts-deflate-${need}`,
  });
  await prisma.contract.update({ where: { id: contract.id }, data: { status: 'ACTIVE' } });
  const recheck = await evaluateContract(contract.id, 'MANUAL');
  check('cleanup: predicate holds again', recheck.holds);
  // Remove the synthetic immutable contract + its audit rows (test artifact)
  await prisma.contractEvaluation.deleteMany({ where: { contractId: immutableTest.id } });
  await prisma.penaltyAction.deleteMany({ where: { contractId: immutableTest.id } });
  await prisma.contract.delete({ where: { id: immutableTest.id } });

  console.log(`\n${failures === 0 ? 'PASS' : `FAIL — ${failures} check(s) failed`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => { console.error(err); process.exit(1); });
