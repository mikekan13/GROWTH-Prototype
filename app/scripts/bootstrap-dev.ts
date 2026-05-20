/**
 * Bootstrap a fresh dev DB after `prisma migrate reset` or `prisma migrate dev`
 * wipes everything. Runs every seeder in the correct dependency order.
 *
 * Designed to be safely re-run — each step is idempotent (the underlying
 * seed scripts use upsert / find-then-create patterns).
 *
 * Run: `npx tsx scripts/bootstrap-dev.ts`
 *
 * Order matters:
 *   1. admin user        → owns global catalog items
 *   2. genesis ledger    → KRMA reserves + system wallets
 *   3. godheads          → three seeded AI agents
 *   4. canonical seeds   → Human + Altered Human into global ForgeItem catalog
 *   5. test campaign     → owned by admin (skipped if any campaign exists)
 *   6. test SRB          → Human + 4 roots + 8 branches in The Prime Campaign
 *   7. example item      → Iron Sword published blueprint
 *   8. pipeline character → Test Pilgrim through assignMechanics
 *
 * Each step is wrapped in a try/catch so a partial failure doesn't strand
 * the next step; the summary at the end reports which ones succeeded.
 */

import { config } from 'dotenv';
config();

import { spawnSync } from 'node:child_process';
import path from 'node:path';

interface Step {
  name: string;
  script: string;
  // If true, a failure aborts subsequent steps (true for the foundational
  // ones; false for content seeders that can be retried independently).
  required: boolean;
}

const STEPS: Step[] = [
  { name: 'admin user', script: 'seed-admin.ts', required: true },
  { name: 'genesis ledger', script: 'seed-genesis.ts', required: true },
  { name: 'godheads', script: 'seed-godheads.ts', required: false },
  { name: 'canonical seeds (global catalog)', script: 'seed-canonical-seeds.ts', required: false },
  { name: 'test campaign', script: 'seed-campaign.ts', required: true },
  { name: 'test seed/root/branch (in campaign)', script: 'seed-test-srb.ts', required: false },
  { name: 'example forge item (Iron Sword)', script: 'seed-example-item.ts', required: false },
  { name: 'pipeline-driven test character (Test Pilgrim)', script: 'seed-pipeline-character.ts', required: false },
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

async function main() {
  console.log('━'.repeat(60));
  console.log('GROWTH dev bootstrap — re-seeding from a clean DB');
  console.log('━'.repeat(60));

  const results: Result[] = [];
  for (const step of STEPS) {
    console.log(`\n▶ ${step.name} (${step.script})`);
    const result = runStep(step);
    results.push(result);
    if (!result.ok) {
      console.error(`✗ ${step.name} FAILED: ${result.error}`);
      if (step.required) {
        console.error(`\nRequired step failed — aborting bootstrap.`);
        printSummary(results);
        process.exit(1);
      }
    } else {
      console.log(`✓ ${step.name} (${result.durationMs}ms)`);
    }
  }
  printSummary(results);
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
