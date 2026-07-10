/**
 * seed-all — rebuild the full dev environment from a clean DB (T08).
 *
 * One idempotent entrypoint that recreates everything after
 * `prisma migrate reset` / `rm dev.db && prisma migrate dev`:
 *
 *   Foundation (required — abort on failure):
 *     1. admin user
 *     2. genesis ledger      → 100B KRMA reserves (INV-13/INV-15)
 *     3. __PRIME__ campaign  → the meta's control room (INV-116)
 *     4. primary godheads    → Tara, Kai, Et'herling, JEWL (+1B endowment)
 *   Prime population:
 *     5. prime additions     → Val, Thomas
 *     6. secondary godheads  → 10 magic-school custodians
 *     7. migrate godheads    → attach all godheads to __PRIME__
 *     8. fund Prime wallet   → Terminal reserve → Prime campaign wallet
 *     9. contracts           → Tara's cap + immutable succession (T13)
 *   Content:
 *    10. canonical seeds     → Human + Altered Human (global catalog)
 *    11. beta content        → seeds/roots/nectars/thorns/items (global)
 *    12. test data           → test watchers, trailblazers, campaigns
 *    13. test SRB            → Human + roots + branches (test campaign)
 *    14. example forge item  → Iron Sword (test campaign)
 *    15. pipeline character  → Test Pilgrim (test campaign)
 *
 * Ends with a ledger audit (fullAudit) + __PRIME__ existence check, so a
 * green run IS the T08 acceptance test.
 *
 * Run: `npm run seed:all`  (or `npx tsx scripts/seed-all.ts`)
 */

import { config } from 'dotenv';
config();

import { spawnSync } from 'node:child_process';
import path from 'node:path';

interface Step {
  name: string;
  script: string;
  // A required step's failure aborts the run; content steps can be
  // retried independently by re-running seed-all.
  required: boolean;
}

const STEPS: Step[] = [
  { name: 'admin user', script: 'seed-admin.ts', required: true },
  { name: 'genesis ledger (100B reserves)', script: 'seed-genesis.ts', required: true },
  { name: '__PRIME__ campaign', script: 'seed-campaign.ts', required: true },
  { name: 'primary godheads (+JEWL endowment)', script: 'seed-godheads.ts', required: true },
  { name: 'prime godhead additions (Val, Thomas)', script: 'seed-godheads-prime-additions.ts', required: false },
  { name: 'secondary godheads (10 custodians)', script: 'seed-godheads-secondary.ts', required: false },
  { name: 'attach godheads to __PRIME__', script: 'migrate-godheads-to-prime.ts', required: false },
  { name: 'fund Prime campaign wallet', script: 'fund-prime-campaign.ts', required: false },
  { name: 'Terminal contracts (Tara cap + succession)', script: 'seed-contracts.ts', required: false },
  { name: 'canonical seeds (global catalog)', script: 'seed-canonical-seeds.ts', required: false },
  { name: 'beta content library (global catalog)', script: 'seed-beta-content.ts', required: false },
  { name: 'test users + campaigns', script: 'seed-test-data.ts', required: false },
  { name: 'test seed/root/branch (test campaign)', script: 'seed-test-srb.ts', required: false },
  { name: 'example forge item (Iron Sword)', script: 'seed-example-item.ts', required: false },
  { name: 'pipeline test character (Test Pilgrim)', script: 'seed-pipeline-character.ts', required: false },
];

interface Result {
  step: Step;
  ok: boolean;
  durationMs: number;
  error?: string;
}

function runStep(step: Step): Result {
  const start = Date.now();
  const scriptPath = path.join(__dirname, step.script);
  const result = spawnSync('npx', ['tsx', scriptPath], {
    stdio: 'inherit',
    shell: true,
    env: process.env,
  });
  const durationMs = Date.now() - start;
  if (result.status !== 0) {
    return {
      step,
      ok: false,
      durationMs,
      error: `exit code ${result.status}${result.error ? `: ${result.error.message}` : ''}`,
    };
  }
  return { step, ok: true, durationMs };
}

/**
 * Post-seed verification — the run only reports success if the economy
 * reconciles and the Prime campaign exists (INV-13, INV-116).
 */
async function verify(): Promise<boolean> {
  const { prisma } = await import('../src/lib/db');
  const { fullAudit } = await import('../src/services/krma/reconciliation');
  const { PRIME_CAMPAIGN_NAME } = await import('../src/lib/prime-campaign');

  let ok = true;

  const prime = await prisma.campaign.findFirst({ where: { name: PRIME_CAMPAIGN_NAME } });
  if (prime) {
    const godheadCount = await prisma.character.count({
      where: { campaignId: prime.id, entityType: 'GODHEAD' },
    });
    console.log(`✓ __PRIME__ exists (id: ${prime.id}) with ${godheadCount} godhead(s)`);
  } else {
    console.error('✗ __PRIME__ campaign missing (INV-116 violated)');
    ok = false;
  }

  const audit = await fullAudit();
  if (audit.valid) {
    console.log(`✓ Ledger audit passed — ${audit.totalInWallets.toString()} in wallets + ${audit.totalBurned.toString()} burned = genesis supply`);
  } else {
    console.error('✗ Ledger audit FAILED:', JSON.stringify({
      discrepancies: audit.discrepancies.length,
      globalInvariantHolds: audit.globalInvariantHolds,
      checksumChainValid: audit.checksumChainValid,
      brokenAtSequence: audit.brokenAtSequence?.toString(),
    }));
    ok = false;
  }

  return ok;
}

async function main() {
  console.log('━'.repeat(60));
  console.log('GROWTH seed:all — rebuilding dev environment');
  console.log('━'.repeat(60));

  const results: Result[] = [];
  for (const step of STEPS) {
    console.log(`\n▶ ${step.name} (${step.script})`);
    const result = runStep(step);
    results.push(result);
    if (!result.ok) {
      console.error(`✗ ${step.name} FAILED: ${result.error}`);
      if (step.required) {
        console.error(`\nRequired step failed — aborting seed:all.`);
        printSummary(results);
        process.exit(1);
      }
    } else {
      console.log(`✓ ${step.name} (${result.durationMs}ms)`);
    }
  }

  printSummary(results);

  console.log('\n' + '━'.repeat(60));
  console.log('Verification');
  console.log('━'.repeat(60));
  const verified = await verify();
  const allSteps = results.every(r => r.ok);
  if (!verified || !allSteps) {
    console.error('\nseed:all completed WITH FAILURES.');
    process.exit(1);
  }
  console.log('\nseed:all complete — dev environment rebuilt.');
  process.exit(0);
}

function printSummary(results: Result[]) {
  console.log('\n' + '━'.repeat(60));
  console.log('Summary');
  console.log('━'.repeat(60));
  for (const r of results) {
    const flag = r.ok ? '✓' : '✗';
    console.log(`${flag} ${r.step.name.padEnd(48)} ${r.durationMs}ms${r.error ? ` — ${r.error}` : ''}`);
  }
  const oks = results.filter(r => r.ok).length;
  console.log(`\n${oks}/${results.length} steps succeeded.`);
}

main().catch(err => { console.error(err); process.exit(1); });
