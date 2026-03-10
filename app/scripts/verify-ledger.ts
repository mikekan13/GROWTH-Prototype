/**
 * Verify KRMA ledger integrity.
 * Usage: npx tsx scripts/verify-ledger.ts
 */
import { fullAudit } from '../src/services/krma/reconciliation';

async function main() {
  console.log('Running full KRMA ledger audit...\n');

  const report = await fullAudit();

  console.log('═══ Audit Report ═══');
  console.log(`  Status:           ${report.valid ? 'VALID' : 'INVALID'}`);
  console.log(`  Wallets checked:  ${report.walletCount}`);
  console.log(`  Discrepancies:    ${report.discrepancies.length}`);
  console.log(`  Global invariant: ${report.globalInvariantHolds ? 'HOLDS' : 'BROKEN'}`);
  console.log(`  Total in wallets: ${report.totalInWallets.toString()}`);
  console.log(`  Total burned:     ${report.totalBurned.toString()}`);
  console.log(`  Checksum chain:   ${report.checksumChainValid ? 'VALID' : 'BROKEN'}`);

  if (report.brokenAtSequence !== undefined) {
    console.log(`  Chain broken at:  sequence ${report.brokenAtSequence.toString()}`);
  }

  if (report.discrepancies.length > 0) {
    console.log('\n  Discrepancies:');
    for (const d of report.discrepancies) {
      console.log(`    Wallet ${d.walletId}: expected=${d.expected.toString()}, actual=${d.actual.toString()}`);
    }
  }

  console.log(`\n  Checked at: ${report.checkedAt.toISOString()}`);
}

main()
  .catch(console.error)
  .finally(() => process.exit(0));
