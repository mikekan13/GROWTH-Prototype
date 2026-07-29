/**
 * WP10 acceptance — dream consolidation + rumination/trauma dynamics.
 *
 * Mock-based: every dream-role call goes through a sequential L1
 * (OpenAI-compatible) fetchImpl queue, same pattern as WP9's mockOpenAiQueue.
 * `runDreamConsolidation` (src/daya/dream.ts) is called directly, with a
 * hand-rolled `fireTick` helper that first writes the same tick-marker row
 * scheduler.ts's real dreamTickHandler writes (dream.ts's tickIndex/spacing
 * bookkeeping counts those rows) — so this exercises the exact code path
 * production dream ticks run, just without going through wake()/scheduler.
 *
 * Covers WP10 spec §6 items 1-8. Dedicated throwaway test campaign
 * (__DAYA_TEST_WP10__), cleaned up before and after; each scenario gets its
 * own throwaway character/entity so tick indices and lock state never cross
 *-contaminate between scenarios.
 *
 * Run: npx tsx scripts/test-daya-wp10.ts
 */
import './_server-only-shim';
import { prisma } from '../src/lib/db';
import { runDreamConsolidation } from '../src/daya/dream';
import { sealLint, hasHardHit } from '../src/daya/seal';
import type { DayaFetch } from '../src/daya/model-client';

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

const TEST_CAMPAIGN_NAME = '__DAYA_TEST_WP10__';
const NAME_PREFIX = '__TEST_DAYA_WP10__';

// ── Mock L1 transport (sequential queue) ──────────────────────────────────

function mockOpenAiQueue(responses: string[]): { fetchImpl: DayaFetch; callCount: () => number } {
  let i = 0;
  return {
    fetchImpl: async (_url, _init) => {
      const text = responses[Math.min(i, responses.length - 1)];
      i++;
      return {
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: text } }], usage: { prompt_tokens: 5, completion_tokens: 5 } }),
        text: async () => '',
      };
    },
    callCount: () => i,
  };
}

function neverCalled(): DayaFetch {
  return async () => {
    throw new Error('this mock should never be invoked (low-depth ticks must make zero model calls)');
  };
}

function dreamJson(opts: {
  clusterTheme?: string;
  retag?: Array<{ memoryId: string; valence?: number; arousal?: number; salience?: number }>;
  metaMemory?: { content: string; valence: number; salience: number } | null;
  affectDrift?: { morale?: number; stress?: number; grief?: number };
}): string {
  return JSON.stringify({
    clusterTheme: opts.clusterTheme ?? 'an ordinary stretch of days',
    links: [],
    retag: opts.retag ?? [],
    metaMemory: opts.metaMemory === undefined ? null : opts.metaMemory,
    affectDrift: opts.affectDrift ?? {},
  });
}

// ── Fixtures ───────────────────────────────────────────────────────────────

async function cleanupStale() {
  const campaign = await prisma.campaign.findFirst({ where: { name: TEST_CAMPAIGN_NAME } });
  if (!campaign) return;
  const chars = await prisma.character.findMany({ where: { campaignId: campaign.id }, select: { id: true } });
  for (const c of chars) {
    const entity = await prisma.dayaEntity.findUnique({ where: { characterId: c.id }, select: { id: true } });
    if (entity) {
      await prisma.dayaModelCall.deleteMany({ where: { entityId: entity.id } });
      await prisma.dayaMemoryEntry.deleteMany({ where: { entityId: entity.id } });
      await prisma.dayaAffect.deleteMany({ where: { entityId: entity.id } });
      await prisma.dayaEntity.delete({ where: { id: entity.id } });
    }
    await prisma.historyEntry.deleteMany({ where: { subjectId: c.id } });
  }
  await prisma.character.deleteMany({ where: { campaignId: campaign.id } });
  await prisma.campaignMember.deleteMany({ where: { campaignId: campaign.id } });
  await prisma.campaign.delete({ where: { id: campaign.id } });
}

interface Fixture {
  characterId: string;
  entityDaId: string;
}

async function makeFixture(name: string, admin: { id: string }, campaign: { id: string }, frequency: { current: number; level: number }): Promise<Fixture> {
  const character = await prisma.character.create({
    data: {
      name: `${NAME_PREFIX} ${name}`,
      entityType: 'NPC',
      userId: admin.id,
      campaignId: campaign.id,
      data: JSON.stringify({ attributes: { frequency } }),
      status: 'ACTIVE',
    },
  });
  const entity = await prisma.dayaEntity.create({ data: { characterId: character.id } });
  return { characterId: character.id, entityDaId: entity.id };
}

async function seedMemory(
  entityDaId: string,
  m: { content: string; narrativeCycle: number; valence: number; arousal: number; salience: number; entityRefs?: string[]; source?: string; classification?: Record<string, unknown> },
): Promise<string> {
  const row = await prisma.dayaMemoryEntry.create({
    data: {
      entityId: entityDaId,
      narrativeCycle: m.narrativeCycle,
      source: m.source ?? 'perception',
      content: m.content,
      valence: m.valence,
      arousal: m.arousal,
      salience: m.salience,
      entityRefs: JSON.stringify(m.entityRefs ?? []),
      classification: JSON.stringify(m.classification ?? { contentCategory: 'perception', sensitivity: 'safe', icOoc: 'IC', rationaleTag: 'seed' }),
    },
  });
  return row.id;
}

async function fireTick(fx: Fixture, fetchImpl?: DayaFetch) {
  await prisma.dayaMemoryEntry.create({
    data: {
      entityId: fx.entityDaId,
      narrativeCycle: 0,
      source: 'dream',
      content: 'A dream tick ran.',
      classification: JSON.stringify({ provisional: true, kind: 'tick_marker' }),
    },
  });
  return runDreamConsolidation(fx.characterId, fetchImpl ? { fetchImpl } : {});
}

async function insertGapMarker(entityDaId: string) {
  await prisma.dayaMemoryEntry.create({
    data: {
      entityId: entityDaId,
      narrativeCycle: 0,
      source: 'dream',
      content: 'A dream tick ran.',
      classification: JSON.stringify({ provisional: true, kind: 'tick_marker' }),
    },
  });
}

async function main() {
  console.log('WP10 DAYA dream consolidation + rumination dynamics\n' + '─'.repeat(50));

  const savedEnv = { DAYA_L1_URL: process.env.DAYA_L1_URL, DAYA_L1_MODEL: process.env.DAYA_L1_MODEL };
  process.env.DAYA_L1_URL = 'http://mock-l1.local';
  process.env.DAYA_L1_MODEL = 'mock-l1-model';
  function restoreEnv() {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }

  await cleanupStale();

  try {
    const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
    if (!admin) {
      console.error('No ADMIN user found — run npm run seed:all first.');
      process.exit(1);
    }
    const campaign = await prisma.campaign.create({
      data: {
        name: TEST_CAMPAIGN_NAME,
        genre: 'DAYA Test',
        description: 'WP10 acceptance — dream consolidation + rumination dynamics.',
        gmUserId: admin.id,
        maxTrailblazers: 0,
      },
    });

    const allProse: string[] = [];

    // ── 1. Hierarchy + meta-memory synthesis ──────────────────────────────
    console.log('\n-- Test 1: hierarchy (clusterId assignment) + gist meta-memory --');
    const fx1 = await makeFixture('hierarchy', admin, campaign, { current: 10, level: 10 });
    const letterA = await seedMemory(fx1.entityDaId, { content: 'You found a letter under the floorboard.', narrativeCycle: 1, valence: 0.2, arousal: 0.3, salience: 0.5, entityRefs: ['char_letter'] });
    const letterB = await seedMemory(fx1.entityDaId, { content: 'You read the letter again by candlelight.', narrativeCycle: 2, valence: 0.1, arousal: 0.2, salience: 0.5, entityRefs: ['char_letter'] });
    const letterC = await seedMemory(fx1.entityDaId, { content: 'The letter\'s wax seal still smells faintly of smoke.', narrativeCycle: 3, valence: 0.1, arousal: 0.2, salience: 0.4, entityRefs: ['char_letter'] });

    const q1 = mockOpenAiQueue([
      dreamJson({ clusterTheme: 'the letter and its quiet secret', metaMemory: { content: 'That whole stretch had the hush of something being kept from her.', valence: 0.1, salience: 0.3 } }),
    ]);
    const report1 = await fireTick(fx1, q1.fetchImpl);
    check('test1: one cluster considered/selected', report1.clustersConsidered >= 1 && report1.clustersSelected === 1, JSON.stringify(report1));
    check('test1: exactly one model call made', report1.modelCallsMade === 1, `calls=${report1.modelCallsMade}`);
    check('test1: one meta-memory created', report1.metaMemoriesCreated.length === 1, JSON.stringify(report1.metaMemoriesCreated));

    const rowsAfter1 = await prisma.dayaMemoryEntry.findMany({ where: { entityId: fx1.entityDaId, id: { in: [letterA, letterB, letterC] } } });
    const clusterIdList = rowsAfter1.map((r) => r.clusterId);
    const uniqueClusterIds = [...new Set(clusterIdList)];
    check(
      'test1: all three members share the same non-null clusterId',
      uniqueClusterIds.length === 1 && uniqueClusterIds[0] !== null,
      JSON.stringify(uniqueClusterIds),
    );

    const metaRow = await prisma.dayaMemoryEntry.findUnique({ where: { id: report1.metaMemoriesCreated[0] } });
    check('test1: meta-memory source is dream', metaRow?.source === 'dream');
    check('test1: meta-memory classification fidelity is gist', JSON.parse(metaRow?.classification ?? '{}').fidelity === 'gist');
    check('test1: meta-memory parentMemoryId points at the cluster anchor (earliest member)', metaRow?.parentMemoryId === letterA);
    if (metaRow?.content) allProse.push(metaRow.content);

    // ── 2. Emotional drift: deepening with NO counterweight ───────────────
    console.log('\n-- Test 2: rumination deepening across ticks, no counterweight --');
    const fx2 = await makeFixture('deepen', admin, campaign, { current: 10, level: 10 });
    await seedMemory(fx2.entityDaId, { content: 'The accident happened so fast you barely registered it.', narrativeCycle: 1, valence: -0.6, arousal: 0.7, salience: 0.5, entityRefs: ['char_accident'] });
    await seedMemory(fx2.entityDaId, { content: 'You keep flinching near the accident site.', narrativeCycle: 2, valence: -0.55, arousal: 0.65, salience: 0.5, entityRefs: ['char_accident'] });

    const q2 = mockOpenAiQueue([dreamJson({}), dreamJson({}), dreamJson({})]);
    const valenceTrace: number[] = [];
    const salienceTrace: number[] = [];
    for (let i = 0; i < 3; i++) {
      const r = await fireTick(fx2, q2.fetchImpl);
      const members = await prisma.dayaMemoryEntry.findMany({ where: { entityId: fx2.entityDaId, source: { not: 'dream' } } });
      valenceTrace.push(members.reduce((s, m) => s + m.valence, 0) / members.length);
      salienceTrace.push(members.reduce((s, m) => s + m.salience, 0) / members.length);
      check(`test2 tick ${i + 1}: cluster is rumination-locked`, r.ruminationLocked.length === 1, JSON.stringify(r.ruminationLocked));
    }
    check('test2: mean valence strictly decreases across all 3 ticks (deepening)', valenceTrace[1] < valenceTrace[0] && valenceTrace[2] < valenceTrace[1], JSON.stringify(valenceTrace));
    check('test2: mean salience increases across ticks', salienceTrace[2] > salienceTrace[0], JSON.stringify(salienceTrace));

    // ── 3. Emotional drift: heal with reactivation + counterweight ────────
    console.log('\n-- Test 3: reconsolidation heal (reactivation + counterweight) --');
    const fx3 = await makeFixture('heal', admin, campaign, { current: 10, level: 10 });
    await seedMemory(fx3.entityDaId, { content: 'The fire spread faster than anyone could react.', narrativeCycle: 1, valence: -0.6, arousal: 0.7, salience: 0.5, entityRefs: ['char_fire'] });
    await seedMemory(fx3.entityDaId, { content: 'The smell of smoke still catches you off guard.', narrativeCycle: 2, valence: -0.55, arousal: 0.65, salience: 0.5, entityRefs: ['char_fire'] });

    const q3lock = mockOpenAiQueue([dreamJson({})]);
    const r3lock = await fireTick(fx3, q3lock.fetchImpl);
    check('test3: lock established on tick 1 (no counterweight yet)', r3lock.ruminationLocked.length === 1);
    const preHeal = await prisma.dayaMemoryEntry.findMany({ where: { entityId: fx3.entityDaId, entityRefs: { contains: 'char_fire' } } });
    const preHealValence = preHeal.reduce((s, m) => s + m.valence, 0) / preHeal.length;

    // Introduce a counterweight (positive social contact) before the next tick.
    await seedMemory(fx3.entityDaId, { content: 'A friend sat with you and just talked for a while.', narrativeCycle: 3, valence: 0.5, arousal: 0.2, salience: 0.3, source: 'dialogue' });
    const q3heal = mockOpenAiQueue([dreamJson({}), dreamJson({})]);
    const r3heal = await fireTick(fx3, q3heal.fetchImpl);
    check('test3: reactivated cluster reported as healed (reactivation + counterweight present)', r3heal.ruminationHealed.length === 1, JSON.stringify(r3heal));
    const postHeal = await prisma.dayaMemoryEntry.findMany({ where: { entityId: fx3.entityDaId, entityRefs: { contains: 'char_fire' } } });
    const postHealValence = postHeal.reduce((s, m) => s + m.valence, 0) / postHeal.length;
    check('test3: healed valence moved toward neutral (less negative than before)', postHealValence > preHealValence, `pre=${preHealValence} post=${postHealValence}`);

    // Lock-break proportion over repeated independent runs (seeded PRNG, T0 §C — expect roughly counterweightBreakP).
    let breaks = 0;
    const TRIALS = 20;
    for (let t = 0; t < TRIALS; t++) {
      const fxT = await makeFixture(`heal-trial-${t}`, admin, campaign, { current: 10, level: 10 });
      await seedMemory(fxT.entityDaId, { content: `The flood took the lower field trial ${t}.`, narrativeCycle: 1, valence: -0.6, arousal: 0.7, salience: 0.5, entityRefs: [`char_flood_${t}`] });
      await seedMemory(fxT.entityDaId, { content: `You still dream about the flood, trial ${t}.`, narrativeCycle: 2, valence: -0.55, arousal: 0.65, salience: 0.5, entityRefs: [`char_flood_${t}`] });
      const qLock = mockOpenAiQueue([dreamJson({})]);
      await fireTick(fxT, qLock.fetchImpl);
      await seedMemory(fxT.entityDaId, { content: `A friend checked in on you, trial ${t}.`, narrativeCycle: 3, valence: 0.5, arousal: 0.2, salience: 0.3, source: 'dialogue' });
      const qHeal = mockOpenAiQueue([dreamJson({})]);
      const rHeal = await fireTick(fxT, qHeal.fetchImpl);
      if (rHeal.ruminationBroken.length > 0) breaks++;
    }
    const breakRate = breaks / TRIALS;
    check(
      `test3: lock-break proportion over ${TRIALS} independent trials is in a plausible band around counterweightBreakP=0.4`,
      breakRate >= 0.1 && breakRate <= 0.75,
      `rate=${breakRate} (${breaks}/${TRIALS})`,
    );

    // ── 4. Reconsolidation age gradient ────────────────────────────────────
    console.log('\n-- Test 4: reconsolidation age gradient (old drifts far less than young) --');
    await prisma.campaign.update({ where: { id: campaign.id }, data: { currentCycle: 30 } });
    const fx4 = await makeFixture('age-gradient', admin, campaign, { current: 10, level: 10 });
    const youngId = await seedMemory(fx4.entityDaId, { content: 'A quiet ordinary morning, cycle 28, part one.', narrativeCycle: 28, valence: 0, arousal: 0.1, salience: 0.3, entityRefs: ['char_ordinary_pair'] });
    const oldId = await seedMemory(fx4.entityDaId, { content: 'A quiet ordinary morning, cycle 0, part two.', narrativeCycle: 0, valence: 0, arousal: 0.1, salience: 0.3, entityRefs: ['char_ordinary_pair'] });

    const q4 = mockOpenAiQueue([
      dreamJson({ retag: [{ memoryId: youngId, valence: 0.9 }, { memoryId: oldId, valence: 0.9 }] }),
    ]);
    await fireTick(fx4, q4.fetchImpl);
    const youngAfter = await prisma.dayaMemoryEntry.findUnique({ where: { id: youngId } });
    const oldAfter = await prisma.dayaMemoryEntry.findUnique({ where: { id: oldId } });
    check(
      'test4: young memory (age 2) drifts strictly more than old memory (age 30) under identical retag pressure',
      (youngAfter?.valence ?? 0) > (oldAfter?.valence ?? 0),
      `young=${youngAfter?.valence} old=${oldAfter?.valence}`,
    );
    await prisma.campaign.update({ where: { id: campaign.id }, data: { currentCycle: 0 } });

    // ── 5. Spacing: consecutive rehearsal gains less than spaced ──────────
    console.log('\n-- Test 5: spacing (consecutive vs spaced dream-tick rehearsal) --');
    const fxConsec = await makeFixture('spacing-consecutive', admin, campaign, { current: 10, level: 10 });
    const consecMemId = await seedMemory(fxConsec.entityDaId, { content: 'Folding laundry on an unremarkable afternoon.', narrativeCycle: 1, valence: 0, arousal: 0.1, salience: 0.3 });
    const qConsec = mockOpenAiQueue([dreamJson({}), dreamJson({})]);
    await fireTick(fxConsec, qConsec.fetchImpl); // tick 1
    await fireTick(fxConsec, qConsec.fetchImpl); // tick 2 (consecutive)
    const consecFinal = await prisma.dayaMemoryEntry.findUnique({ where: { id: consecMemId } });

    const fxSpaced = await makeFixture('spacing-spaced', admin, campaign, { current: 10, level: 10 });
    const spacedMemId = await seedMemory(fxSpaced.entityDaId, { content: 'Folding laundry on an unremarkable afternoon.', narrativeCycle: 1, valence: 0, arousal: 0.1, salience: 0.3 });
    const qSpaced = mockOpenAiQueue([dreamJson({}), dreamJson({})]);
    await fireTick(fxSpaced, qSpaced.fetchImpl); // tick 1 (touched)
    await insertGapMarker(fxSpaced.entityDaId); // tick 2 (gap — not processed at all)
    await fireTick(fxSpaced, qSpaced.fetchImpl); // tick 3 (touched, spaced)
    const spacedFinal = await prisma.dayaMemoryEntry.findUnique({ where: { id: spacedMemId } });

    check(
      'test5: spaced rehearsal ends with higher salience than consecutive rehearsal (same 2 touches)',
      (spacedFinal?.salience ?? 0) > (consecFinal?.salience ?? 0),
      `consecutive=${consecFinal?.salience} spaced=${spacedFinal?.salience}`,
    );

    // ── 6. Depth gating: contextDepth < 0.3 -> affect-only, zero model calls ─
    console.log('\n-- Test 6: low contextDepth -> affect-only maintenance, no meta-memory, zero model calls --');
    const fx6 = await makeFixture('low-depth', admin, campaign, { current: 0, level: 10 }); // drained pool -> contextDepth 0.2
    await seedMemory(fx6.entityDaId, { content: 'A perfectly ordinary quiet evening.', narrativeCycle: 1, valence: 0.1, arousal: 0.1, salience: 0.4 });
    const report6 = await fireTick(fx6, neverCalled());
    check('test6: contextDepth reported below the low-depth threshold', report6.contextDepth < 0.3, `contextDepth=${report6.contextDepth}`);
    check('test6: zero model calls made', report6.modelCallsMade === 0, `calls=${report6.modelCallsMade}`);
    check('test6: zero meta-memories created', report6.metaMemoriesCreated.length === 0);

    // ── 7. sealLint clean on every written content string ──────────────────
    console.log('\n-- Test 7: sealLint clean; a breaching dream-role output falls back to a clean template --');
    const fx7 = await makeFixture('seal', admin, campaign, { current: 10, level: 10 });
    await seedMemory(fx7.entityDaId, { content: 'Walking along the shore at low tide.', narrativeCycle: 1, valence: 0.2, arousal: 0.2, salience: 0.4, entityRefs: ['char_shore'] });
    await seedMemory(fx7.entityDaId, { content: 'The tide pools were full of small crabs.', narrativeCycle: 2, valence: 0.2, arousal: 0.2, salience: 0.4, entityRefs: ['char_shore'] });
    const q7 = mockOpenAiQueue([
      dreamJson({ metaMemory: { content: 'You would roll a d20 to remember it — DR 12, easily.', valence: 0.1, salience: 0.2 } }),
    ]);
    const report7 = await fireTick(fx7, q7.fetchImpl);
    check('test7: a breaching metaMemory still produces exactly one written meta-memory (via fallback)', report7.metaMemoriesCreated.length === 1);
    const metaRow7 = await prisma.dayaMemoryEntry.findUnique({ where: { id: report7.metaMemoriesCreated[0] } });
    check('test7: the written meta-memory content is sealLint clean (breach was held, not persisted)', !hasHardHit(sealLint(metaRow7?.content ?? '')), metaRow7?.content);
    if (metaRow7?.content) allProse.push(metaRow7.content);

    const allWrittenContent = await prisma.dayaMemoryEntry.findMany({ where: { entityId: { in: [fx1.entityDaId, fx2.entityDaId, fx3.entityDaId, fx7.entityDaId] } }, select: { content: true, source: true } });
    const metaOnly = allWrittenContent.filter((r) => r.source === 'dream' && r.content !== 'A dream tick ran.');
    check(
      'test7: every dream-authored content string (meta-memories) across the whole run is sealLint clean',
      metaOnly.every((r) => !hasHardHit(sealLint(r.content))),
      `n=${metaOnly.length}`,
    );

    // ── 8. Determinism ───────────────────────────────────────────────────
    console.log('\n-- Test 8: determinism (same seed + same mocked outputs -> identical deltas) --');
    const fxDetA = await makeFixture('determinism-a', admin, campaign, { current: 10, level: 10 });
    const fxDetB = await makeFixture('determinism-b', admin, campaign, { current: 10, level: 10 });
    for (const fx of [fxDetA, fxDetB]) {
      await seedMemory(fx.entityDaId, { content: 'A calm walk through the market square.', narrativeCycle: 1, valence: 0.1, arousal: 0.2, salience: 0.3, entityRefs: ['char_market'] });
      await seedMemory(fx.entityDaId, { content: 'The vendor remembered your name at the market.', narrativeCycle: 2, valence: 0.2, arousal: 0.2, salience: 0.3, entityRefs: ['char_market'] });
    }
    const qDetA = mockOpenAiQueue([dreamJson({ metaMemory: { content: 'The market kept feeling a little warmer each visit.', valence: 0.15, salience: 0.25 } })]);
    const qDetB = mockOpenAiQueue([dreamJson({ metaMemory: { content: 'The market kept feeling a little warmer each visit.', valence: 0.15, salience: 0.25 } })]);
    const reportDetA = await fireTick(fxDetA, qDetA.fetchImpl);
    const reportDetB = await fireTick(fxDetB, qDetB.fetchImpl);

    const rowsDetA = (await prisma.dayaMemoryEntry.findMany({ where: { entityId: fxDetA.entityDaId, source: { not: 'dream' } }, orderBy: { narrativeCycle: 'asc' } })).map((r) => ({ valence: r.valence, arousal: r.arousal, salience: r.salience }));
    const rowsDetB = (await prisma.dayaMemoryEntry.findMany({ where: { entityId: fxDetB.entityDaId, source: { not: 'dream' } }, orderBy: { narrativeCycle: 'asc' } })).map((r) => ({ valence: r.valence, arousal: r.arousal, salience: r.salience }));
    check('test8: identical seed + identical mocked dream output -> identical per-memory deltas across two entities', JSON.stringify(rowsDetA) === JSON.stringify(rowsDetB), `${JSON.stringify(rowsDetA)} vs ${JSON.stringify(rowsDetB)}`);
    check('test8: identical report shape (clusters/model calls/meta-memory count)', reportDetA.clustersSelected === reportDetB.clustersSelected && reportDetA.modelCallsMade === reportDetB.modelCallsMade && reportDetA.metaMemoriesCreated.length === reportDetB.metaMemoriesCreated.length);

    void allProse;
  } finally {
    await cleanupStale();
    restoreEnv();
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
