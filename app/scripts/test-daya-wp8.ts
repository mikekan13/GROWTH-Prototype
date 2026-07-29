/**
 * WP8 acceptance — mechanics coupling: effort as motivated choice (Ruling
 * 10), skill-specificity DR fit (Ruling 9), pool-spend persistence, Thorn
 * firing (Ruling 7), vine progress via the existing goal service (Ruling
 * 22), and pool damage -> cognition degradation + mood (Ruling 20/7).
 *
 * Mock-based for anything that reaches a model (skill-fit judge, and the
 * full stimulus->act->adjudicator pipeline's usual six roles). Pure-function
 * coverage for effort.ts/skill-fit.ts/thorns.ts lives in their own
 * *.test.ts (vitest) siblings — this script is the cross-module, DB-backed
 * acceptance pass per the spec's §8 list. Dedicated throwaway test campaign
 * (__DAYA_TEST_WP8__), cleaned up before and after.
 *
 * Run: npx tsx scripts/test-daya-wp8.ts
 */
import './_server-only-shim';
import { prisma } from '../src/lib/db';
import '../src/daya/ensemble'; // registers the real handlers over the WP3 stubs
import { wake } from '../src/daya/events';
import { type AnthropicLike, type DayaFetch } from '../src/daya/model-client';
import { sealLint, hasHardHit } from '../src/daya/seal';
import { degradationForFraction, poolFraction } from '../src/daya/router';
import { judgeSkillFit, selectCandidateSkills, SPECIFICITY_SWING, type SkillCandidate } from '../src/daya/mechanics/skill-fit';
import { resolveEffortCheck, maybeAdvanceVine, restAndRecover } from '../src/daya/mechanics/resolve';
import { detectAndFireThorns, loadActiveThornBlocks } from '../src/daya/mechanics/thorns';
import { seedDayaRoom } from './seed-daya-room';

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

const TEST_CAMPAIGN_NAME = '__DAYA_TEST_WP8__';

// ── Mock transports (same discipline as test-daya-wp9.ts) ─────────────────

function mockOpenAiQueue(responses: string[]): { fetchImpl: DayaFetch; calls: unknown[] } {
  let i = 0;
  const calls: unknown[] = [];
  const fetchImpl: DayaFetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    const text = responses[Math.min(i, responses.length - 1)];
    i++;
    return {
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: text } }], usage: { prompt_tokens: 5, completion_tokens: 5 } }),
      text: async () => '',
    };
  };
  return { fetchImpl, calls };
}

function mockAnthropicQueue(responses: string[]): { client: AnthropicLike; calls: unknown[] } {
  let i = 0;
  const calls: unknown[] = [];
  const client: AnthropicLike = {
    messages: {
      create: async (params) => {
        calls.push(params);
        const text = responses[Math.min(i, responses.length - 1)];
        i++;
        return { content: [{ type: 'text', text }], usage: { input_tokens: 10, output_tokens: 10 } };
      },
    },
  };
  return { client, calls };
}

// ── Cleanup ─────────────────────────────────────────────────────────────

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
      await prisma.dayaBelievedSheet.deleteMany({ where: { entityId: entity.id } });
      await prisma.dayaEntity.delete({ where: { id: entity.id } });
    }
    await prisma.goal.deleteMany({ where: { characterId: c.id } });
    await prisma.historyEntry.deleteMany({ where: { subjectId: c.id } });
  }
  await prisma.campaignEvent.deleteMany({ where: { campaignId: campaign.id } });
  await prisma.character.deleteMany({ where: { campaignId: campaign.id } });
  await prisma.campaignMember.deleteMany({ where: { campaignId: campaign.id } });
  await prisma.worldFact.deleteMany({ where: { campaignId: campaign.id } });
  await prisma.campaign.delete({ where: { id: campaign.id } });
}

// ── Test character factory ─────────────────────────────────────────────

function baseAttr(level: number, current?: number) {
  return { level, current: current ?? level, augmentPositive: 0, augmentNegative: 0 };
}

function probeCharacterData(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    attributes: {
      clout: baseAttr(10),
      celerity: baseAttr(10),
      constitution: baseAttr(10),
      flow: baseAttr(10),
      frequency: { level: 20, current: 20 },
      focus: baseAttr(10),
      willpower: baseAttr(10),
      wisdom: baseAttr(10),
      wit: baseAttr(10),
    },
    conditions: {
      weak: false, clumsy: false, exhausted: false, deafened: false, deathsDoor: false,
      muted: false, overwhelmed: false, confused: false, incoherent: false,
    },
    skills: [{ name: 'Mountain Climbing', level: 8, governors: ['clout'] }],
    traits: [
      {
        name: 'Grief Over Her Mother',
        type: 'thorn',
        category: 'utility',
        pillar: 'soul',
        description: "The bearer struggles and flinches whenever her mother comes up; a cold dread settles in and won't explain itself.",
      },
    ],
    creation: { seed: { baseFateDie: 'd8' } },
    ...overrides,
  });
}

let ownerId: string;
let campaignId: string;

async function makeProbe(name: string, overrides: Record<string, unknown> = {}) {
  const character = await prisma.character.create({
    data: { name, entityType: 'NPC', userId: ownerId, campaignId, data: probeCharacterData(overrides), status: 'ACTIVE' },
  });
  const entity = await prisma.dayaEntity.upsert({ where: { characterId: character.id }, create: { characterId: character.id }, update: {} });
  return { character, entityDaId: entity.id };
}

// ── Test 1: skill-fit DR adjustment (Ruling 9) ──────────────────────────

async function testSkillFit() {
  console.log('\n-- Test 1: skill-specificity DR fit --');

  const candidates: SkillCandidate[] = [{ name: 'Mountain Climbing', level: 8, governors: ['clout'] }];

  const highFitMock = mockAnthropicQueue([JSON.stringify({ skill: 'Mountain Climbing', fit: 0.9, reason: 'exact match' })]);
  const highFit = await judgeSkillFit('climb the sheer rock face', candidates, { anthropicClient: highFitMock.client });
  check('high fit yields a POSITIVE drAdjust (lowers effective DR)', highFit.drAdjust > 0, `drAdjust=${highFit.drAdjust}`);

  const lowFitMock = mockAnthropicQueue([JSON.stringify({ skill: 'Mountain Climbing', fit: 0.1, reason: 'poor match' })]);
  const lowFit = await judgeSkillFit('recite an ancient poem', candidates, { anthropicClient: lowFitMock.client });
  check('low fit yields a NEGATIVE drAdjust (raises effective DR)', lowFit.drAdjust < 0, `drAdjust=${lowFit.drAdjust}`);
  check('high fit DR is easier than low fit DR on the same nominal task', highFit.drAdjust > lowFit.drAdjust);

  const untrained = selectCandidateSkills('perform advanced calculus', candidates);
  check('untrained: no plausible candidate at all (empty prefilter)', untrained.length === 0);
  const neverCalled = mockAnthropicQueue(['SHOULD NEVER BE CALLED']);
  const untrainedResult = await judgeSkillFit('perform advanced calculus', untrained, { anthropicClient: neverCalled.client });
  check('untrained: judge never invoked (no plausible candidates)', neverCalled.calls.length === 0);
  check('untrained: skill null, fit 0, drAdjust 0 (adjudicator takes the unskilled path)', untrainedResult.skill === null && untrainedResult.fit === 0 && untrainedResult.drAdjust === 0);
  check('SPECIFICITY_SWING is exported and tunable', typeof SPECIFICITY_SWING === 'number');
}

// ── Test 2: pool spend persists + affect moves ──────────────────────────

async function testPoolSpendPersists() {
  console.log('\n-- Test 2: pool spend persists via the real service, DispositionEvent fired --');

  const { character, entityDaId } = await makeProbe('__TEST_DAYA_WP8__ pool-spend');
  const fitMock = mockAnthropicQueue([JSON.stringify({ skill: 'Mountain Climbing', fit: 0.6, reason: 'reasonable fit' })]);

  const result = await resolveEffortCheck({
    characterId: character.id,
    intent: 'climb up the rock face toward the ledge',
    attribute: 'clout',
    dr: 8, // below hardMin(14) -> extraDamage always 0, keeping the spend deterministic
    effortContext: 'deliberate',
    care: 0.4,
    overrides: { anthropicClient: fitMock.client },
  });
  check('resolveEffortCheck returned a result', !!result);
  check('effort actually wagered (> 0)', !!result && result.effortSpent > 0, JSON.stringify(result));
  check('extraDamage is 0 below the hard-DR threshold (deterministic spend)', result?.extraDamage === 0);

  const charAfter = await prisma.character.findUnique({ where: { id: character.id } });
  const dataAfter = JSON.parse(charAfter!.data);
  const expectedCurrent = 10 - (result!.effortSpent + result!.extraDamage);
  check(
    'the governing pool (clout) CURRENT dropped by exactly effortSpent via the real spendAttribute path',
    dataAfter.attributes.clout.current === expectedCurrent,
    `current=${dataAfter.attributes.clout.current} expected=${expectedCurrent}`,
  );

  const affect = await prisma.dayaAffect.findUnique({ where: { entityId: entityDaId } });
  check('a pool_spent DispositionEvent fired (DayaAffect row exists)', !!affect);
}

// ── Test 3: degradation loop + rest recovery (Ruling 20/7) ──────────────

async function testDegradationAndRest() {
  console.log('\n-- Test 3: drained pool -> WP6 degradation + affect shift; rest -> recovery --');

  const { character, entityDaId } = await makeProbe('__TEST_DAYA_WP8__ degradation');

  // Simulate an already-drained Willpower (< 25% of level 10) directly —
  // isolates the degradation-loop assertion from any particular roll outcome.
  const drained = JSON.parse(probeCharacterData());
  drained.attributes.willpower.current = 2; // 20% of 10
  await prisma.character.update({ where: { id: character.id }, data: { data: JSON.stringify(drained) } });

  const drainedFrac = poolFraction({ current: 2, max: 10 });
  const drainedDegradation = degradationForFraction(drainedFrac);
  check('WP6 routing degrades below 25% pool (contextDepth < full)', drainedDegradation.contextDepth < 1.0, `contextDepth=${drainedDegradation.contextDepth}`);

  // Fire the pool_spent event directly (mirrors what resolveEffortCheck already
  // does internally) to confirm affect actually shifts on a real drain, since
  // this test drives the drain directly rather than through a check.
  const { applyDispositionEvent } = await import('../src/services/daya-affect');
  await applyDispositionEvent(character.id, { kind: 'pool_spent', attribute: 'willpower', amount: 8, current: 2, max: 10 });
  const affectDrained = await prisma.dayaAffect.findUnique({ where: { entityId: entityDaId } });
  check('affect shows the shift after a heavy Willpower drain (stress rose)', !!affectDrained && affectDrained.stress > 0, JSON.stringify(affectDrained));

  const restResult = await restAndRecover(character.id, 'long');
  check('Long Rest applied', restResult.applied === true, JSON.stringify(restResult.changes));

  const charAfterRest = await prisma.character.findUnique({ where: { id: character.id } });
  const dataAfterRest = JSON.parse(charAfterRest!.data);
  check('willpower current fully restored by rest', dataAfterRest.attributes.willpower.current === 10, `current=${dataAfterRest.attributes.willpower.current}`);

  const restoredFrac = poolFraction({ current: dataAfterRest.attributes.willpower.current, max: 10 });
  const restoredDegradation = degradationForFraction(restoredFrac);
  check('WP6 routing recovers to full contextDepth after rest', restoredDegradation.contextDepth === 1.0, `contextDepth=${restoredDegradation.contextDepth}`);

  const affectAfterRest = await prisma.dayaAffect.findUnique({ where: { entityId: entityDaId } });
  check('affect improves after rest (stress fell from the drained peak, pool_restored fired)', !!affectAfterRest && affectAfterRest.stress < affectDrained!.stress, JSON.stringify(affectAfterRest));
}

// ── Test 4: Thorn firing (Ruling 7) ─────────────────────────────────────

async function testThornFiring() {
  console.log('\n-- Test 4: Thorn fires on a matching context -> affect + ThornBlock + ledger --');

  const { character, entityDaId } = await makeProbe('__TEST_DAYA_WP8__ thorn');

  const before = await loadActiveThornBlocks(entityDaId);
  check('precondition: no active thorn blocks yet', before.length === 0);

  const fireResult = await detectAndFireThorns({
    characterId: character.id,
    entityDaId,
    cycle: 0,
    stimulusContent: 'Someone at the market brings up your mother, out of nowhere.',
  });
  check('the Thorn fired (matching trigger)', fireResult.fired.length === 1, JSON.stringify(fireResult.fired.map((f) => f.name)));

  const noMatch = await detectAndFireThorns({
    characterId: character.id,
    entityDaId,
    cycle: 1,
    stimulusContent: 'A merchant haggles over the price of bread.',
  });
  check('an unrelated stimulus does NOT fire the thorn', noMatch.fired.length === 0);

  const blocks = await loadActiveThornBlocks(entityDaId);
  check('a WP4 ThornBlock is now persisted and active', blocks.length === 1 && blocks[0].strength > 0, JSON.stringify(blocks));

  const affect = await prisma.dayaAffect.findUnique({ where: { entityId: entityDaId } });
  check('affect moved from the thorn firing (thorn_fired DispositionEvent)', !!affect && (affect.stress > 0 || affect.grief > 0), JSON.stringify(affect));

  const ledgerRows = await prisma.dayaMemoryEntry.findMany({ where: { entityId: entityDaId, content: fireResult.fired[0].feltLine } });
  check('the firing is logged to the ledger as the entity\'s own felt experience', ledgerRows.length >= 1);

  const anyHard = fireResult.fired.some((f) => hasHardHit(sealLint(f.feltLine)));
  check('the delivered felt line carries zero HARD sealLint hits (never named "Thorn")', !anyHard);
  check('the felt line never literally says "thorn"', !fireResult.fired.some((f) => /thorn/i.test(f.feltLine)));
}

// ── Test 5: vine progress via the EXISTING goal service (Ruling 22) ────

async function testVineProgress() {
  console.log('\n-- Test 5: vine progress calls the existing goal service, never a parallel store --');

  const { character } = await makeProbe('__TEST_DAYA_WP8__ vine');
  const goal = await prisma.goal.create({
    data: { characterId: character.id, campaignId, description: 'reach the summit of the mountain', status: 'ACTIVE', priority: 3 },
  });
  const opportunityId = crypto.randomUUID();
  await prisma.goal.update({
    where: { id: goal.id },
    data: { opportunities: JSON.stringify([{ id: opportunityId, description: 'a clear path opens up the mountain', status: 'OPEN', declaredAt: new Date().toISOString() }]) },
  });

  const noRoll = await maybeAdvanceVine(character.id, { outcome: 'She looks at the mountain.', experienceEvent: { content: 'The peak is far off.', valence: 0, salience: 0.1 } });
  check('a pure-narrative outcome (no roll) never auto-advances a vine (Ruling 22)', noRoll === null);

  const goalUnchanged = await prisma.goal.findUnique({ where: { id: goal.id } });
  const oppsUnchanged = JSON.parse(goalUnchanged!.opportunities!);
  check('the opportunity is still OPEN after a no-roll outcome', oppsUnchanged[0].status === 'OPEN');

  const advance = await maybeAdvanceVine(character.id, {
    outcome: 'She reaches the summit of the mountain at last.',
    experienceEvent: { content: 'The summit view stretches out below her.', valence: 0.6, salience: 0.5 },
    roll: { attribute: 'clout', dr: 10, total: 15, success: true },
  });
  check('a matching check-driven success resolves the EXISTING opportunity as SEIZED', advance?.outcome === 'SEIZED' && advance.opportunityId === opportunityId, JSON.stringify(advance));

  const goalAfter = await prisma.goal.findUnique({ where: { id: goal.id } });
  const oppsAfter = JSON.parse(goalAfter!.opportunities!);
  check('resolveOpportunity (the existing goal service) actually flipped the opportunity to RESOLVED/SEIZED', oppsAfter[0].status === 'RESOLVED' && oppsAfter[0].outcome === 'SEIZED', JSON.stringify(oppsAfter));

  const again = await maybeAdvanceVine(character.id, {
    outcome: 'She reaches the summit of the mountain at last.',
    experienceEvent: { content: 'The summit view stretches out below her.', valence: 0.6, salience: 0.5 },
    roll: { attribute: 'clout', dr: 10, total: 15, success: true },
  });
  check('an already-resolved opportunity is never re-matched (no parallel progress store, single source of truth)', again === null);
}

// ── Test 6: full effort -> resolve -> sensation path, seal-clean ───────

async function testFullPipelineSealClean() {
  console.log('\n-- Test 6: full Do: -> mechanics -> adjudicator -> sensation pipeline, zero HARD seal hits --');

  const { character, entityDaId } = await makeProbe('__TEST_DAYA_WP8__ full-pipeline');

  const taggerIngest = JSON.stringify({
    valence: 0.1, arousal: 0.3, salience: 0.3, entityRefs: [],
    classification: { contentCategory: 'perception', sensitivity: 'safe', icOoc: 'IC', rationaleTag: 'sees the rock face' },
  });
  const soulProse = 'Right now, in your body and mood: a little keyed up, ready to move.';
  const spiritOutputDo = 'She sizes up the rock face.\nDo: climb up the rock face toward the ledge above.';
  const bodyOutwardJson = JSON.stringify({ intent: 'climb up the rock face toward the ledge above', subjectKeys: [], effortContext: 'deliberate' });
  const sensationText = 'Your hands find the holds; the stone is rough and cool under your fingers.';
  const mockL1 = mockOpenAiQueue([soulProse, spiritOutputDo, bodyOutwardJson, sensationText]);

  const adjudicatorJson = JSON.stringify({
    outcome: 'She works her way up the rock face, hand over hand.',
    factsToWrite: [],
    factsToSupersede: [],
    check: { attribute: 'clout', dr: 8 }, // below hardMin(14) -> deterministic, no extraDamage
    experienceEvent: { content: sensationText, valence: 0.3, salience: 0.3 },
  });
  const skillFitJson = JSON.stringify({ skill: 'Mountain Climbing', fit: 0.85, reason: 'directly on target' });
  const taggerAdjIngest = JSON.stringify({
    valence: 0.2, arousal: 0.2, salience: 0.2, entityRefs: [],
    classification: { contentCategory: 'perception', sensitivity: 'safe', icOoc: 'IC', rationaleTag: 'mid-climb' },
  });
  const mockC = mockAnthropicQueue([taggerIngest, adjudicatorJson, skillFitJson, taggerAdjIngest]);

  const cloutBefore = 10;
  const result = await wake(
    { kind: 'stimulus', entityId: character.id, source: 'perception', content: 'A rock face rises ahead, ready to climb.' },
    { fetchImpl: mockL1.fetchImpl, anthropicClient: mockC.client },
  );
  check('the pipeline resolved to act', result.action?.kind === 'act', JSON.stringify(result.action));
  check('the skill-fit judge was actually consulted (mechanics coupling engaged, not the old placeholder)', (mockC.calls as unknown[]).length === 4, `calls=${(mockC.calls as unknown[]).length}`);

  const charAfter = await prisma.character.findUnique({ where: { id: character.id } });
  const dataAfter = JSON.parse(charAfter!.data);
  check(
    'effort actually spent from the governing pool (clout) end-to-end through the ensemble',
    dataAfter.attributes.clout.current < cloutBefore,
    `current=${dataAfter.attributes.clout.current}`,
  );

  const memories = await prisma.dayaMemoryEntry.findMany({ where: { entityId: entityDaId } });
  const anyHard = memories.some((m) => hasHardHit(sealLint(m.content)));
  check('zero HARD sealLint hits across every memory the full pipeline wrote (seal, Ruling 13)', !anyHard);

  const affect = await prisma.dayaAffect.findUnique({ where: { entityId: entityDaId } });
  check('affect moved somewhere along the pipeline (pool_spent at minimum)', !!affect);
}

// ── Main ────────────────────────────────────────────────────────────────

async function main() {
  console.log('WP8 DAYA mechanics coupling\n' + '─'.repeat(50));

  const savedEnv = {
    DAYA_ENABLED: process.env.DAYA_ENABLED,
    DAYA_L1_URL: process.env.DAYA_L1_URL,
    DAYA_L1_MODEL: process.env.DAYA_L1_MODEL,
    DAYA_L2_URL: process.env.DAYA_L2_URL,
  };
  function restoreEnv() {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
  process.env.DAYA_ENABLED = 'enabled';
  process.env.DAYA_L1_URL = 'http://mock-l1.local';
  process.env.DAYA_L1_MODEL = 'mock-l1-model';
  delete process.env.DAYA_L2_URL;

  await cleanupStale();

  try {
    const seeded = await seedDayaRoom(TEST_CAMPAIGN_NAME);
    campaignId = seeded.campaign.id;
    const owner = await prisma.user.findUnique({ where: { id: seeded.campaign.gmUserId } });
    if (!owner) throw new Error('No GM user resolved for the seeded test campaign');
    ownerId = owner.id;

    await testSkillFit();
    await testPoolSpendPersists();
    await testDegradationAndRest();
    await testThornFiring();
    await testVineProgress();
    await testFullPipelineSealClean();
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
