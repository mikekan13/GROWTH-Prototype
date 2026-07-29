/**
 * WP3 acceptance — DAYA wake-on-trigger event bus + dream-tick scheduler.
 *
 *  1. Disabled (DAYA_ENABLED unset): wake() writes pending-audit behavior
 *     only — no DayaEntity, no DayaMemoryEntry rows.
 *  2. Enabled: a stimulus trigger creates the DayaEntity-if-missing and
 *     writes a DayaMemoryEntry ingest row (source passed through); a
 *     gm_intervention trigger writes one with source 'gm_intervention';
 *     adjudication_result/vine_tick run their log-only stub handlers
 *     (no memory row).
 *  3. Dream-tick cadence modulation math (pure functions, no DB): a
 *     drained pool produces a LONGER interval than a full one.
 *  4. runDueDreamTicks fires only entities whose next-due timestamp has
 *     passed, and writes a source:'dream' DayaMemoryEntry for each firer.
 *
 * Uses throwaway NPC characters prefixed '__TEST_DAYA_WP3__', cleaned
 * before and after. Run: npx tsx scripts/test-daya-wp3.ts
 */
import './_server-only-shim';
import { prisma } from '../src/lib/db';
import { wake, deliverStimulus, isDayaEnabled } from '../src/daya/events';
import {
  dreamIntervalModulation,
  computeNextDreamTickFromState,
  baseDreamIntervalMs,
  runDueDreamTicks,
} from '../src/daya/scheduler';
import type { GrowthCharacter } from '../src/types/growth';

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

const NAME_PREFIX = '__TEST_DAYA_WP3__';

async function cleanupStale() {
  const stale = await prisma.character.findMany({
    where: { name: { startsWith: NAME_PREFIX } },
    select: { id: true },
  });
  for (const c of stale) {
    const entity = await prisma.dayaEntity.findUnique({ where: { characterId: c.id }, select: { id: true } });
    if (entity) {
      await prisma.dayaMemoryEntry.deleteMany({ where: { entityId: entity.id } });
      await prisma.dayaAffect.deleteMany({ where: { entityId: entity.id } });
      await prisma.dayaBelievedSheet.deleteMany({ where: { entityId: entity.id } });
      await prisma.dayaRelationship.deleteMany({ where: { entityId: entity.id } });
      await prisma.dayaEntity.delete({ where: { id: entity.id } });
    }
    await prisma.historyEntry.deleteMany({ where: { subjectId: c.id } });
    await prisma.character.delete({ where: { id: c.id } });
  }
}

async function makeCharacter(
  name: string,
  admin: { id: string },
  campaign: { id: string },
  overrides: Partial<{ createdAt: Date }> = {},
) {
  const sheet: Partial<GrowthCharacter> = {
    attributes: {
      frequency: { level: 10, current: 10 },
    } as GrowthCharacter['attributes'],
  };
  return prisma.character.create({
    data: {
      name,
      entityType: 'NPC',
      userId: admin.id,
      campaignId: campaign.id,
      data: JSON.stringify(sheet),
      status: 'ACTIVE',
      ...overrides,
    },
  });
}

async function main() {
  console.log('WP3 DAYA event bus + dream-tick scheduler\n' + '─'.repeat(50));

  // Make sure we start from a known disabled state regardless of shell env.
  delete process.env.DAYA_ENABLED;
  await cleanupStale();

  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  const campaign = await prisma.campaign.findFirst({ where: { name: { not: '__PRIME__' } } });
  if (!admin || !campaign) {
    console.error('Missing prerequisites (need an ADMIN user + a non-Prime campaign) — run npm run seed:all.');
    process.exit(1);
  }

  try {
    // ── 1. Disabled: pending-audit only, no DB rows ──────────────────────
    check('isDayaEnabled() false by default', !isDayaEnabled());

    const charA = await makeCharacter(`${NAME_PREFIX} A`, admin, campaign);

    const disabledResult = await wake({
      kind: 'stimulus',
      entityId: charA.id,
      source: 'dialogue',
      content: 'a stimulus that should not be ingested while DAYA is off',
    });
    check('disabled: wake() reports ran=false', disabledResult.ran === false);
    check('disabled: wake() returns an auditId (pending-audit trail)', !!disabledResult.auditId, disabledResult.auditId);
    check('disabled: no memoryEntryId returned', disabledResult.memoryEntryId === undefined);

    const noEntity = await prisma.dayaEntity.findUnique({ where: { characterId: charA.id } });
    check('disabled: no DayaEntity created', noEntity === null);

    // ── 2. Enabled: stimulus creates DayaEntity-if-missing + memory row ──
    process.env.DAYA_ENABLED = 'enabled';
    check('isDayaEnabled() true after toggling env in-process', isDayaEnabled());

    const stimResult = await deliverStimulus(charA.id, 'dialogue', 'Hello, entity.');
    check('enabled: wake() reports ran=true', stimResult.ran === true);
    check('enabled: stimulus returns a memoryEntryId', !!stimResult.memoryEntryId);

    const entity = await prisma.dayaEntity.findUnique({ where: { characterId: charA.id } });
    check('enabled: DayaEntity created on first stimulus', !!entity);

    const stimRow = stimResult.memoryEntryId
      ? await prisma.dayaMemoryEntry.findUnique({ where: { id: stimResult.memoryEntryId } })
      : null;
    check('enabled: stimulus memory row has source passed through', stimRow?.source === 'dialogue', stimRow?.source);
    check('enabled: stimulus memory row content matches', stimRow?.content === 'Hello, entity.');
    check(
      'enabled: stimulus memory row has provisional zeroed valence/arousal/salience',
      stimRow?.valence === 0 && stimRow?.arousal === 0 && stimRow?.salience === 0,
    );

    const gmResult = await wake({ kind: 'gm_intervention', entityId: charA.id, content: 'The GM leans in.' });
    check('enabled: gm_intervention ran and returned a memoryEntryId', gmResult.ran && !!gmResult.memoryEntryId);
    const gmRow = gmResult.memoryEntryId
      ? await prisma.dayaMemoryEntry.findUnique({ where: { id: gmResult.memoryEntryId } })
      : null;
    check('enabled: gm_intervention memory row source is gm_intervention', gmRow?.source === 'gm_intervention', gmRow?.source);

    const adjResult = await wake({ kind: 'adjudication_result', entityId: charA.id, payload: { outcome: 'ok' } });
    check('enabled: adjudication_result stub ran, no memory row (log-only)', adjResult.ran && adjResult.memoryEntryId === undefined);

    const vineResult = await wake({ kind: 'vine_tick', entityId: charA.id });
    check('enabled: vine_tick stub ran, no memory row (log-only)', vineResult.ran && vineResult.memoryEntryId === undefined);

    const memCountAfterStubs = await prisma.dayaMemoryEntry.count({ where: { entityId: entity!.id } });
    check('log-only stubs did not add memory rows', memCountAfterStubs === 2, `count=${memCountAfterStubs}`);

    // ── 3. Dream-tick cadence modulation math (pure, no DB) ──────────────
    check('dreamIntervalModulation: null frequency -> 1x', dreamIntervalModulation(null) === 1);
    check('dreamIntervalModulation: full pool -> 1x', dreamIntervalModulation({ current: 10, level: 10 }) === 1);
    check('dreamIntervalModulation: half pool -> 1.5x', dreamIntervalModulation({ current: 5, level: 10 }) === 1.5);
    const drainedFactor = dreamIntervalModulation({ current: 0, level: 10 });
    check('dreamIntervalModulation: drained pool -> 2x (LONGER interval)', drainedFactor === 2, `factor=${drainedFactor}`);
    check(
      'drained pool factor is strictly greater than full-pool factor',
      drainedFactor > dreamIntervalModulation({ current: 10, level: 10 }),
    );

    process.env.DAYA_DREAM_INTERVAL_MS = '1000';
    check('baseDreamIntervalMs() honors env override', baseDreamIntervalMs() === 1000, `${baseDreamIntervalMs()}`);
    const anchor = new Date(0);
    const nextFull = computeNextDreamTickFromState(anchor, { current: 10, level: 10 });
    const nextDrained = computeNextDreamTickFromState(anchor, { current: 0, level: 10 });
    check('computeNextDreamTickFromState: full pool = anchor + base', nextFull.getTime() === anchor.getTime() + 1000);
    check('computeNextDreamTickFromState: drained pool = anchor + 2*base (longer wait)', nextDrained.getTime() === anchor.getTime() + 2000);
    check('drained next-tick is later than full-pool next-tick', nextDrained.getTime() > nextFull.getTime());
    delete process.env.DAYA_DREAM_INTERVAL_MS;

    // ── 4. runDueDreamTicks fires only due entities ──────────────────────
    process.env.DAYA_DREAM_INTERVAL_MS = String(60 * 60 * 1000); // 1h, full pool -> 1h due window

    const fiveHoursAgo = new Date(Date.now() - 5 * 60 * 60 * 1000);
    const charDue = await makeCharacter(`${NAME_PREFIX} B (due)`, admin, campaign);
    const charNotDue = await makeCharacter(`${NAME_PREFIX} C (not due)`, admin, campaign);

    // Establish DayaEntity rows directly, backdating the due one's createdAt
    // (dream ticks require an already-established entity — no create-if-
    // missing from the sweep itself).
    const entityDue = await prisma.dayaEntity.create({ data: { characterId: charDue.id, createdAt: fiveHoursAgo } });
    const entityNotDue = await prisma.dayaEntity.create({ data: { characterId: charNotDue.id } });

    const sweep = await runDueDreamTicks();
    check('runDueDreamTicks: due entity fired', sweep.fired.includes(charDue.id), JSON.stringify(sweep.fired));
    check('runDueDreamTicks: not-due entity skipped', sweep.skipped.includes(charNotDue.id), JSON.stringify(sweep.skipped));
    check('runDueDreamTicks: not-due entity did not fire', !sweep.fired.includes(charNotDue.id));

    const dreamRowDue = await prisma.dayaMemoryEntry.findFirst({ where: { entityId: entityDue.id, source: 'dream' } });
    const dreamRowNotDue = await prisma.dayaMemoryEntry.findFirst({ where: { entityId: entityNotDue.id, source: 'dream' } });
    check('due entity got a source:dream memory row', !!dreamRowDue);
    check('not-due entity got no dream memory row', dreamRowNotDue === null);

    delete process.env.DAYA_DREAM_INTERVAL_MS;
  } finally {
    delete process.env.DAYA_ENABLED;
    delete process.env.DAYA_DREAM_INTERVAL_MS;
    await cleanupStale();
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
