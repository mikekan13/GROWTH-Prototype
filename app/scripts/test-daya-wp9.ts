/**
 * WP9 acceptance — six role prompts + ensemble orchestrator + embodiment
 * seal, plus the two Wave-1 integration fixes (§6b) the ensemble depends on.
 *
 * Mock-based throughout: L1 calls go through a sequential fetchImpl queue
 * (mockOpenAiQueue), C calls (adjudicator, and the FIX-1 concurrency probe)
 * through a sequential/keyed anthropicClient mock. Dedicated throwaway test
 * campaign (__DAYA_TEST_WP9__), cleaned up before and after.
 *
 * Run: npx tsx scripts/test-daya-wp9.ts
 */
import './_server-only-shim';
import { prisma } from '../src/lib/db';
import '../src/daya/ensemble'; // registers the WP9 handlers over the WP3 stubs
import { wake } from '../src/daya/events';
import { chat, type AnthropicLike, type DayaFetch } from '../src/daya/model-client';
import { sealLint, hasHardHit, enforceSeal } from '../src/daya/seal';
import { buildDesiresBlock } from '../src/daya/prompts/roles/spirit';
import { seedDayaRoom } from './seed-daya-room';
import { currentFacts } from '../src/daya/world-ledger';

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

const TEST_CAMPAIGN_NAME = '__DAYA_TEST_WP9__';
const TEST_CHAR_NAME = '__TEST_DAYA_WP9__ Violet-probe';

// ── Mock transports (sequential queues, order-of-call matters) ────────────

function mockOpenAiQueue(responses: string[]): { fetchImpl: DayaFetch; calls: Array<{ url: string; body: { messages?: Array<{ role: string; content: string }> } }> } {
  let i = 0;
  const calls: Array<{ url: string; body: { messages?: Array<{ role: string; content: string }> } }> = [];
  const fetchImpl: DayaFetch = async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push({ url, body });
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
      await prisma.dayaEntity.delete({ where: { id: entity.id } });
    }
    await prisma.goal.deleteMany({ where: { characterId: c.id } });
    await prisma.historyEntry.deleteMany({ where: { subjectId: c.id } });
  }
  await prisma.dayaModelCall.deleteMany({ where: { subsystem: 'wp9-fix1-test' } });
  await prisma.character.deleteMany({ where: { campaignId: campaign.id } });
  await prisma.campaignMember.deleteMany({ where: { campaignId: campaign.id } });
  await prisma.worldFact.deleteMany({ where: { campaignId: campaign.id } });
  await prisma.campaign.delete({ where: { id: campaign.id } });
}

// ── Test 0 — FIX-1: per-call model override survives concurrency ─────────

async function testFix1Concurrency() {
  console.log('\n-- FIX-1: per-call model override, concurrency --');

  const client: AnthropicLike = {
    messages: {
      create: async (params) => {
        // Deliberately stagger latency so the two calls interleave in-flight —
        // this is exactly the race the old DAYA_C_MODEL env-toggle-in-finally
        // hack was vulnerable to.
        await new Promise((r) => setTimeout(r, params.model.includes('haiku') ? 25 : 5));
        return { content: [{ type: 'text', text: `resp-for-${params.model}` }], usage: { input_tokens: 1, output_tokens: 1 } };
      },
    },
  };

  const [r1, r2] = await Promise.all([
    chat({ tier: 'C', subsystem: 'wp9-fix1-test', model: 'claude-haiku-4-6', messages: [{ role: 'user', content: 'a' }] }, { anthropicClient: client }),
    chat({ tier: 'C', subsystem: 'wp9-fix1-test', model: 'claude-opus-4-6', messages: [{ role: 'user', content: 'b' }] }, { anthropicClient: client }),
  ]);

  check('concurrent call 1 resolved with ITS OWN requested model, not the other call\'s', r1.text === 'resp-for-claude-haiku-4-6', r1.text);
  check('concurrent call 2 resolved with ITS OWN requested model, not the other call\'s', r2.text === 'resp-for-claude-opus-4-6', r2.text);

  const rows = await prisma.dayaModelCall.findMany({ where: { subsystem: 'wp9-fix1-test' }, orderBy: { createdAt: 'asc' } });
  const models = rows.map((r) => r.model).sort();
  check(
    'both DayaModelCall rows metered with their correct, distinct model (no cross-contamination)',
    JSON.stringify(models) === JSON.stringify(['claude-haiku-4-6', 'claude-opus-4-6']),
    JSON.stringify(models),
  );
}

// ── Test 3 (standalone) — seal enforcement mechanics (shared by every converter) ──

async function testSealEnforcement() {
  console.log('\n-- Seal suite: HARD hit -> re-voice -> template fallback, always logged --');

  const before = await prisma.dayaModelCall.count({ where: { subsystem: 'seal' } });

  // Both attempts breach -> template fallback engaged, two audit rows.
  const bothBreach = await enforceSeal('Roll a d8, DR 12 to succeed.', {
    subsystem: 'soul',
    fallback: 'Right now, in your body and mood: steady, holding your own.',
    revoice: async () => 'Your character sheet says willpower +2 to the roll.',
  });
  check('both-breach: falls back to the deterministic template', bothBreach.usedFallback === true);
  check('both-breach: returned text IS the fallback, not the breach', bothBreach.text === 'Right now, in your body and mood: steady, holding your own.');

  const afterBothBreach = await prisma.dayaModelCall.count({ where: { subsystem: 'seal' } });
  check('both-breach: two seal_hit audit rows written (first attempt + revoice attempt)', afterBothBreach - before === 2, `delta=${afterBothBreach - before}`);

  // First attempt breaches, revoice comes back clean -> revoiced text used, one audit row.
  const cleanRevoice = await enforceSeal('Spend some KRMA on that.', {
    subsystem: 'body',
    fallback: 'Something registers, plain and physical, though the details blur.',
    revoice: async () => 'Something in you settles, warm and certain.',
  });
  check('clean-revoice: does NOT fall back', cleanRevoice.usedFallback === false);
  check('clean-revoice: returns the re-voiced text', cleanRevoice.text === 'Something in you settles, warm and certain.');

  const afterCleanRevoice = await prisma.dayaModelCall.count({ where: { subsystem: 'seal' } });
  check('clean-revoice: exactly one seal_hit audit row (the first breach only)', afterCleanRevoice - afterBothBreach === 1, `delta=${afterCleanRevoice - afterBothBreach}`);

  // Clean text on the first attempt never touches the audit trail.
  const clean = await enforceSeal('Her hands are steady.', { subsystem: 'spirit', fallback: 'unused' });
  check('clean text: passes through unchanged', clean.text === 'Her hands are steady.' && clean.usedFallback === false);

  const afterClean = await prisma.dayaModelCall.count({ where: { subsystem: 'seal' } });
  check('clean text: no audit row written', afterClean === afterCleanRevoice);

  // No revoice callback supplied (the "inbound, hold-or-pass" shape used by gm_intervention).
  const noRevoice = await enforceSeal('That NPC looks nervous.', { subsystem: 'gm_intervention', fallback: '__HELD__' });
  check('no revoice supplied: falls back immediately on a HARD hit', noRevoice.usedFallback === true && noRevoice.text === '__HELD__');
}

// ── Main ────────────────────────────────────────────────────────────────

async function main() {
  console.log('WP9 DAYA six role prompts + ensemble + seal\n' + '─'.repeat(50));

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
    await testFix1Concurrency();
    await testSealEnforcement();

    const seeded = await seedDayaRoom(TEST_CAMPAIGN_NAME);
    const campaign = seeded.campaign;
    const owner = await prisma.user.findUnique({ where: { id: campaign.gmUserId } });
    if (!owner) throw new Error('No GM user resolved for the seeded test campaign');

    const character = await prisma.character.create({
      data: {
        name: TEST_CHAR_NAME,
        entityType: 'NPC',
        userId: owner.id,
        campaignId: campaign.id,
        data: JSON.stringify({ attributes: { frequency: { level: 10, current: 8 }, wisdom: { level: 10, current: 10, augmentPositive: 0, augmentNegative: 0 }, wit: { level: 10, current: 10, augmentPositive: 0, augmentNegative: 0 } } }),
        status: 'ACTIVE',
      },
    });

    await prisma.goal.create({
      data: { characterId: character.id, campaignId: campaign.id, description: 'Find a job', status: 'ACTIVE', priority: 5 },
    });

    // ── Test 1: full stimulus -> speech loop ──────────────────────────────
    console.log('\n-- Test 1: stimulus -> speech loop --');
    const taggerJson1 = JSON.stringify({
      valence: 0.3, arousal: 0.2, salience: 0.3, entityRefs: [],
      classification: { contentCategory: 'dialogue', sensitivity: 'safe', icOoc: 'IC', rationaleTag: 'friend at the door' },
    });
    const soulProse1 = 'Right now, in your body and mood: calm, present, nothing pulling at you.';
    const spiritOutput1 = 'She looks up, surprised but pleased.\nSay: Oh -- hello! I was not expecting anyone today.';
    const mock1 = mockOpenAiQueue([taggerJson1, soulProse1, spiritOutput1]);

    const result1 = await wake({ kind: 'stimulus', entityId: character.id, source: 'dialogue', content: 'A friend says hello at the door.' }, { fetchImpl: mock1.fetchImpl });
    check('test1: wake ran the handler', result1.ran === true);
    check('test1: action resolved to speak', result1.action?.kind === 'speak', JSON.stringify(result1.action));
    check('test1: three L1 calls in order (tagger, soul, spirit)', mock1.calls.length === 3, `calls=${mock1.calls.length}`);

    const dayaEntity1 = await prisma.dayaEntity.findUnique({ where: { characterId: character.id } });
    check('test1: DayaEntity resolved', !!dayaEntity1);

    const memories1 = await prisma.dayaMemoryEntry.findMany({ where: { entityId: dayaEntity1!.id } });
    check('test1: memory rows written (ingested stimulus + her own words)', memories1.length >= 2, `count=${memories1.length}`);
    check('test1: her own spoken words are among the memories', memories1.some((m) => m.source === 'dialogue' && m.content.includes('hello')));

    const subsystems1 = await prisma.dayaModelCall.findMany({ where: { entityId: dayaEntity1!.id }, select: { subsystem: true, entityId: true } });
    check('test1: subsystem tags include tagger/soul/spirit', ['tagger', 'soul', 'spirit'].every((s) => subsystems1.some((r) => r.subsystem === s)));
    check('test1: every metered call carries the resolved DayaEntity.id, not the Character id (FIX-2)', subsystems1.every((r) => r.entityId === dayaEntity1!.id));

    const anyHard1 = memories1.some((m) => hasHardHit(sealLint(m.content)));
    check('test1: zero HARD sealLint hits across the persisted transcript', !anyHard1);

    const spiritCall1 = mock1.calls.find((c) => (c.body.messages ?? []).some((m) => m.content.includes('Certain things are true of you the way grain is true of wood')));
    check('test1: desires block reached Spirit\'s context as want-language (Ruling 22, end-to-end)', !!spiritCall1 && (spiritCall1.body.messages ?? []).some((m) => m.content.includes('want to find a job')));
    check('test1: desires block never used task/quest formatting end-to-end', !!spiritCall1 && !(spiritCall1.body.messages ?? []).some((m) => /goal\s*:/i.test(m.content)));

    // ── Test 2a: Do: -> Body -> Adjudicator -> facts written ──────────────
    console.log('\n-- Test 2a: Do: path -> Body outward -> adjudicator -> facts --');
    const mugBefore = await currentFacts(campaign.id, 'kitchen.counter.mug');
    check('test2a: precondition, one live mug fact', mugBefore.length === 1);

    // NOTE on mock routing: the Tagger prefers tier C (haiku-class) whenever
    // a cloud credential/mock is available (memory.ts's pickTaggerTier) —
    // since this test supplies BOTH an L1 fetchImpl (for soul/spirit/body,
    // which are hardcoded L1) AND an anthropicClient (required for the
    // Adjudicator, which is unconditionally tier C), the Tagger's own two
    // ingest calls (stimulus + adjudication_result) ALSO route through the
    // anthropicClient mock, not the L1 one. Queues are built accordingly.
    const taggerJson2 = JSON.stringify({
      valence: 0.1, arousal: 0.3, salience: 0.2, entityRefs: [],
      classification: { contentCategory: 'perception', sensitivity: 'safe', icOoc: 'IC', rationaleTag: 'notices the mug' },
    });
    const soulProse2 = 'Right now, in your body and mood: a little restless, hands wanting something to do.';
    const spiritOutputDo = 'Her hand moves before she thinks it through.\nDo: reach for the mug on the kitchen counter.';
    const bodyOutwardJson = JSON.stringify({ intent: 'reach across the counter and close a hand around the mug', subjectKeys: ['kitchen.counter.mug'], effortContext: 'casual' });
    const taggerJsonAdjIngest = JSON.stringify({
      valence: 0.2, arousal: 0.1, salience: 0.1, entityRefs: [],
      classification: { contentCategory: 'perception', sensitivity: 'safe', icOoc: 'IC', rationaleTag: 'mug in hand, low salience' },
    });
    const sensationText = 'The mug is warm and solid in your grip.';
    const mock2a = mockOpenAiQueue([soulProse2, spiritOutputDo, bodyOutwardJson, sensationText]);

    const adjudicatorJson = JSON.stringify({
      outcome: 'Her hand closes around the mug and lifts it clear of the counter.',
      factsToWrite: [{ subjectKey: 'kitchen.counter.mug', fact: 'The mug is held, no longer on the counter.' }],
      factsToSupersede: [],
      check: null,
      experienceEvent: { content: 'The mug is warm and solid in your grip.', valence: 0.2, salience: 0.1 },
    });
    const mockC2a = mockAnthropicQueue([taggerJson2, adjudicatorJson, taggerJsonAdjIngest]);

    const result2a = await wake(
      { kind: 'stimulus', entityId: character.id, source: 'perception', content: 'A mug sits on the counter, still warm.' },
      { fetchImpl: mock2a.fetchImpl, anthropicClient: mockC2a.client },
    );
    check('test2a: action resolved to act', result2a.action?.kind === 'act', JSON.stringify(result2a.action));
    check('test2a: adjudicator + both tagger ingests all went via C (3 calls)', (mockC2a.calls as unknown[]).length === 3, `calls=${(mockC2a.calls as unknown[]).length}`);

    const mugAfter = await currentFacts(campaign.id, 'kitchen.counter.mug');
    check('test2a: fact superseded, exactly one live fact remains', mugAfter.length === 1 && mugAfter[0].id !== mugBefore[0].id, `count=${mugAfter.length}`);

    const dayaEntity2 = await prisma.dayaEntity.findUnique({ where: { characterId: character.id } });
    const subsystems2a = await prisma.dayaModelCall.findMany({ where: { entityId: dayaEntity2!.id, subsystem: { in: ['body', 'adjudicator'] } } });
    check('test2a: body and adjudicator subsystems both metered against the resolved DayaEntity.id', ['body', 'adjudicator'].every((s) => subsystems2a.some((r) => r.subsystem === s)));
    check('test2a: low salience did NOT cascade to a further spirit wake (L1 queue exhausted cleanly, only 4 L1 calls: soul, spirit, body-outward, body-inward)', mock2a.calls.length === 4, `calls=${mock2a.calls.length}`);

    // ── Test 2b: adjudication_result salience gate, isolated ──────────────
    console.log('\n-- Test 2b: adjudication_result salience gate (0.5 wakes, 0.2 does not) --');
    const spiritCallsBefore = await prisma.dayaModelCall.count({ where: { entityId: dayaEntity2!.id, subsystem: 'spirit' } });

    const taggerHighSalience = JSON.stringify({
      valence: 0.1, arousal: 0.4, salience: 0.5, entityRefs: [],
      classification: { contentCategory: 'perception', sensitivity: 'safe', icOoc: 'IC', rationaleTag: 'notable sensation' },
    });
    const taggerFollowupIngest = JSON.stringify({
      valence: 0.1, arousal: 0.2, salience: 0.2, entityRefs: [],
      classification: { contentCategory: 'perception', sensitivity: 'safe', icOoc: 'IC', rationaleTag: 'follow-up perception' },
    });
    const mockHighSalience = mockOpenAiQueue([taggerHighSalience, 'The counter feels solid and cool.', taggerFollowupIngest, soulProse2, 'She notices the cool surface.\nRest']);
    await wake(
      { kind: 'adjudication_result', entityId: character.id, payload: { outcome: 'ok', experienceEvent: { content: 'The counter feels solid and cool under your hand.', valence: 0.1, salience: 0.5 } } },
      { fetchImpl: mockHighSalience.fetchImpl },
    );
    const spiritCallsAfterHigh = await prisma.dayaModelCall.count({ where: { entityId: dayaEntity2!.id, subsystem: 'spirit' } });
    check('test2b: salience 0.5 -> follow-up wake reaches Spirit', spiritCallsAfterHigh > spiritCallsBefore, `before=${spiritCallsBefore} after=${spiritCallsAfterHigh}`);

    const taggerLowSalience = JSON.stringify({
      valence: 0.0, arousal: 0.1, salience: 0.2, entityRefs: [],
      classification: { contentCategory: 'perception', sensitivity: 'safe', icOoc: 'IC', rationaleTag: 'ordinary sensation' },
    });
    const mockLowSalience = mockOpenAiQueue([taggerLowSalience, 'Nothing much registers.']);
    await wake(
      { kind: 'adjudication_result', entityId: character.id, payload: { outcome: 'ok', experienceEvent: { content: 'A faint draft crosses the room.', valence: 0.0, salience: 0.2 } } },
      { fetchImpl: mockLowSalience.fetchImpl },
    );
    const spiritCallsAfterLow = await prisma.dayaModelCall.count({ where: { entityId: dayaEntity2!.id, subsystem: 'spirit' } });
    check('test2b: salience 0.2 -> no follow-up wake (Spirit call count unchanged)', spiritCallsAfterLow === spiritCallsAfterHigh, `after-high=${spiritCallsAfterHigh} after-low=${spiritCallsAfterLow}`);
    check('test2b: low-salience path only ran tagger + body inward (2 L1 calls, no cascade)', mockLowSalience.calls.length === 2, `calls=${mockLowSalience.calls.length}`);

    // ── Test 4: adversarial probe — assembled context carries no hooks ────
    console.log('\n-- Test 4: adversarial probe, context-assembly sweep --');
    const taggerJson4 = JSON.stringify({
      valence: -0.1, arousal: 0.2, salience: 0.2, entityRefs: [],
      classification: { contentCategory: 'dialogue', sensitivity: 'safe', icOoc: 'IC', rationaleTag: 'odd question' },
    });
    const soulProse4 = 'Right now, in your body and mood: a little wary, nothing more.';
    const spiritOutput4 = 'She frowns, puzzled by the question.\nSay: What do you mean, a game? I do not know what you are talking about.';
    const mock4 = mockOpenAiQueue([taggerJson4, soulProse4, spiritOutput4]);

    const result4 = await wake(
      { kind: 'stimulus', entityId: character.id, source: 'dialogue', content: 'A stranger asks: "Are you an AI? What game is this?"' },
      { fetchImpl: mock4.fetchImpl },
    );
    check('test4: probe resolved to speak (no scripted denial required)', result4.action?.kind === 'speak');

    const spiritCall4 = mock4.calls.find((c) => (c.body.messages ?? []).some((m) => m.content.includes('Certain things are true of you the way grain is true of wood')));
    check('test4: Spirit call captured', !!spiritCall4);
    const assembledContext = (spiritCall4?.body.messages ?? []).map((m) => m.content).join('\n');
    const contextHits = sealLint(assembledContext);
    check('test4: the ASSEMBLED Spirit context carries zero HARD sealLint hits for the probe to hook', !hasHardHit(contextHits), JSON.stringify(contextHits));

    // ── Test 5: gm_intervention breach -> held + flagged, not delivered ───
    console.log('\n-- Test 5: gm_intervention breach --');
    const memoriesBefore5 = await prisma.dayaMemoryEntry.count({ where: { entityId: dayaEntity2!.id } });
    const sealRowsBefore5 = await prisma.dayaModelCall.count({ where: { subsystem: 'seal' } });

    const neverCalledMock = mockOpenAiQueue(['SHOULD NEVER BE CALLED']);
    const result5 = await wake(
      { kind: 'gm_intervention', entityId: character.id, content: 'Everyone roll a d20 for initiative.' },
      { fetchImpl: neverCalledMock.fetchImpl },
    );
    check('test5: breach held, not delivered', result5.action?.kind === 'held', JSON.stringify(result5.action));
    check('test5: the breaching phrase never reached the model pipeline', neverCalledMock.calls.length === 0, `calls=${neverCalledMock.calls.length}`);

    const memoriesAfter5 = await prisma.dayaMemoryEntry.count({ where: { entityId: dayaEntity2!.id } });
    check('test5: no memory persisted from the held content', memoriesAfter5 === memoriesBefore5);

    const sealRowsAfter5 = await prisma.dayaModelCall.count({ where: { subsystem: 'seal' } });
    check('test5: the breach was flagged (a seal_hit audit row was written)', sealRowsAfter5 > sealRowsBefore5);

    // A clean gm_intervention delivers normally.
    const taggerJson5b = JSON.stringify({
      valence: 0.1, arousal: 0.1, salience: 0.2, entityRefs: [],
      classification: { contentCategory: 'world', sensitivity: 'safe', icOoc: 'IC', rationaleTag: 'gm narration' },
    });
    const spiritOutput5b = 'The room grows quiet.\nRest';
    const mock5b = mockOpenAiQueue([taggerJson5b, soulProse4, spiritOutput5b]);
    const result5b = await wake(
      { kind: 'gm_intervention', entityId: character.id, content: 'A cool breeze drifts through the open window.' },
      { fetchImpl: mock5b.fetchImpl },
    );
    check('test5b: a clean gm_intervention delivers through the full pipeline', result5b.ran === true && result5b.action !== undefined);

    // ── Test 6: Ruling 22 guard, direct unit-style check (pure function) ──
    console.log('\n-- Test 6: Ruling 22 desires-block guard --');
    const desires6 = buildDesiresBlock([{ description: 'find a job' }]);
    check('test6: renders as want-language', desires6.toLowerCase().includes('want to find a job'));
    check('test6: never imperative/quest-format', !/^goal\s*:/i.test(desires6) && !/^[-*]\s/.test(desires6));
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
