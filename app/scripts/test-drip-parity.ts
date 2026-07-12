/**
 * T06 acceptance test — subscription drip config refactor parity.
 *
 * 1. PARITY: the new config-driven `monthlyDrip`/`cumulativeDrip` (default
 *    config) produce byte-identical schedules to the OLD hard-coded formula
 *    for months 0..40.
 * 2. CONFIG FLOW: passing a custom DripConfig changes the output as expected.
 * 3. DB ROUND-TRIP: setDripConfig persists, getDripConfig reflects it, and the
 *    live curve uses the override. Cleans up the row afterward.
 *
 * Run: npx tsx scripts/test-drip-parity.ts   (exits non-zero on failure)
 */
import './_server-only-shim';
import { prisma } from '../src/lib/db';
import { monthlyDrip, cumulativeDrip, DEFAULT_DRIP_CONFIG } from '../src/services/subscription-drip';
import { getDripConfig, setDripConfig, __clearEconomyConfigCache } from '../src/services/economy-config';

// ── The historical hard-coded formula (verbatim from pre-T06) ──────────────
const OLD_LUMP = 15_000;
const OLD_RAMP_START = 2_500;
const OLD_PEAK = 10_000;
const OLD_STEADY = 3_000;
function oldMonthlyDrip(m: number): number {
  if (m < 1) return 0;
  if (m === 1) return OLD_RAMP_START;
  if (m <= 11) {
    const inc = (OLD_PEAK - OLD_RAMP_START) / 10;
    return Math.round(OLD_RAMP_START + (m - 1) * inc);
  }
  if (m === 12) return OLD_PEAK;
  if (m <= 35) {
    const dec = (OLD_PEAK - OLD_STEADY) / 23;
    return Math.round(OLD_PEAK - (m - 12) * dec);
  }
  return OLD_STEADY;
}
function oldCumulative(m: number): number {
  let total = OLD_LUMP;
  for (let i = 1; i <= m; i++) total += oldMonthlyDrip(i);
  return total;
}

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

async function main() {
  console.log('T06 drip parity\n' + '─'.repeat(50));

  // 1. PARITY (default config === old formula) for months 0..40.
  let monthlyMatch = true;
  let cumulMatch = true;
  const mismatches: string[] = [];
  for (let m = 0; m <= 40; m++) {
    const oldM = oldMonthlyDrip(m);
    const newM = monthlyDrip(m);
    if (oldM !== newM) { monthlyMatch = false; mismatches.push(`m${m}: old ${oldM} vs new ${newM}`); }
    if (oldCumulative(m) !== cumulativeDrip(m)) cumulMatch = false;
  }
  check('monthlyDrip parity (months 0..40)', monthlyMatch, mismatches.slice(0, 5).join('; '));
  check('cumulativeDrip parity (months 0..40)', cumulMatch);
  check('SUBSCRIBE lump default matches', DEFAULT_DRIP_CONFIG.subscribeLump === OLD_LUMP);

  // 2. CONFIG FLOW — a custom config changes the curve deterministically.
  const doubled = { ...DEFAULT_DRIP_CONFIG, peak: 20_000, steady: 6_000 };
  check('custom peak reflected at month 12', monthlyDrip(12, doubled) === 20_000, `got ${monthlyDrip(12, doubled)}`);
  check('custom steady reflected at month 40', monthlyDrip(40, doubled) === 6_000, `got ${monthlyDrip(40, doubled)}`);
  check('default unaffected by custom call', monthlyDrip(12) === OLD_PEAK);

  // 3. DB ROUND-TRIP — persist an override, confirm it is read back and used.
  const hadRow = await prisma.economyConfig.findUnique({ where: { key: 'drip' } });
  try {
    __clearEconomyConfigCache();
    const saved = await setDripConfig({ steady: 4_242 }, 'test-runner');
    check('setDripConfig returns merged config', saved.steady === 4_242 && saved.peak === OLD_PEAK);
    __clearEconomyConfigCache();
    const loaded = await getDripConfig();
    check('getDripConfig reflects persisted override', loaded.steady === 4_242);
    check('live curve uses override at month 40', monthlyDrip(40, loaded) === 4_242);
  } finally {
    // Cleanup: restore prior state (delete row if we created it, else leave prior value).
    __clearEconomyConfigCache();
    if (hadRow) {
      await prisma.economyConfig.update({ where: { key: 'drip' }, data: { value: hadRow.value } });
    } else {
      await prisma.economyConfig.deleteMany({ where: { key: 'drip' } });
    }
    console.log('  (cleaned up EconomyConfig drip row)');
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
