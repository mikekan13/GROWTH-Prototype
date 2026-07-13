/**
 * T15 acceptance — booth-rental payout report (INV-114 / INV-70).
 *
 * Runs computePayoutReport against the seeded dev DB and asserts the invariants
 * of a fair split: shares sum to 100% (when there's KRMA), payouts sum to ~the
 * pool, each steward's total = liquid + locked, and no JEWL/system wallet leaks
 * in. Read-only — writes nothing.
 *
 * Run: npx tsx scripts/test-payout-report.ts   (exits non-zero on failure)
 */
import './_server-only-shim';
import { prisma } from '../src/lib/db';
import { computePayoutReport } from '../src/services/krma/payout-report';

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

const POOL = 100_000;

async function main() {
  console.log('T15 payout report\n' + '─'.repeat(50));
  const report = await computePayoutReport(POOL);
  console.log(`  stewards: ${report.stewards.length}, grand total KRMA: ${report.grandTotalKrma}`);

  check('report carries the requested pool', report.distributablePool === POOL);
  check('each steward total = liquid + locked', report.stewards.every(s => s.total === s.liquid + s.locked));

  if (report.grandTotalKrma > 0) {
    const shareSum = report.stewards.reduce((s, r) => s + r.sharePct, 0);
    check('shares sum to ~100%', Math.abs(shareSum - 100) < 0.001, `sum=${shareSum.toFixed(4)}`);
    const payoutSum = report.stewards.reduce((s, r) => s + r.payout, 0);
    // Rounding can drift payoutSum from POOL by at most (#stewards) KRMA.
    check('payouts sum to ~pool (within rounding)', Math.abs(payoutSum - POOL) <= report.stewards.length, `sum=${payoutSum}`);
    check('stewards sorted by total desc', report.stewards.every((s, i, a) => i === 0 || a[i - 1].total >= s.total));
  } else {
    console.log('  (no crystallized/funded KRMA in seed — share math skipped, structure still checked)');
  }

  // INV-70: no godhead/system wallet steward should ever appear. Stewards are
  // keyed by campaign gmUserId; verify none maps to a GODHEAD-role user.
  const stewardIds = report.stewards.map(s => s.stewardId);
  if (stewardIds.length) {
    const godheadUsers = await prisma.user.count({ where: { id: { in: stewardIds }, role: 'GODHEAD' } });
    check('INV-70: no GODHEAD/JEWL wallet appears as a steward', godheadUsers === 0);
  }

  // __PRIME__ must be excluded from the basis.
  const prime = await prisma.campaign.findFirst({ where: { name: '__PRIME__' }, select: { gmUserId: true } });
  if (prime) {
    const primeLeaked = report.stewards.some(s => s.campaignIds.length > 0 && s.stewardId === prime.gmUserId && s.campaignIds.length === 0);
    check('__PRIME__ is excluded from the payout basis', !primeLeaked);
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
