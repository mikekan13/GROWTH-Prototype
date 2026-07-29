/**
 * WP13 acceptance — JEWL as a DAYA entity with elevated access.
 *
 * Exercises spec §4 items 1-6 against a dedicated throwaway test campaign
 * (__DAYA_TEST_WP13__), cleaned up before and after, mocked models
 * throughout:
 *   1. JEWL DayaEntity exists (well-known `__JEWL__`, GODHEAD-tier); his
 *      Spirit prompt carries the 15 laws; his turns route through the same
 *      ensemble every other entity uses.
 *   2. Omniscient perception: JEWL's observer (entityId=null, Terminal
 *      bypass) sees true values a normal entity's own lens never does.
 *   3. Unrestricted action: JEWL's 'Do:' dispatches a copilot tool
 *      (apply_condition) onto ANOTHER character; a normal entity's 'Do:'
 *      on the identical target leaves it untouched (self-only, gate
 *      difference proven by absence of the capability, not a runtime flag).
 *   4. Seal inversion: JEWL's own Spirit context is never sealLint-checked
 *      (no `source=spirit` seal audit row for him) — but what he SPEAKS to
 *      a normal entity still crosses that boundary (`source=jewl_speak`
 *      audit row + fallback substitution on a HARD hit). A normal entity's
 *      WHOLE monologue+directive is still linted, unchanged.
 *   5. Mask: `maskJewlName` still hides JEWL behind "Copilot" for non-ADMIN
 *      viewers (regression-only — WP13 introduces no new identity surface).
 *   6. Continuity: memory accumulates across sequential wakes ("sessions")
 *      without ever being reset/cleared.
 *
 * Run: npx tsx scripts/test-daya-wp13.ts
 */
import './_server-only-shim';
import { prisma } from '../src/lib/db';
import '../src/daya/ensemble'; // registers the real handlers over the WP3 stubs
import { wake } from '../src/daya/events';
import type { AnthropicLike, DayaFetch } from '../src/daya/model-client';
import { seedDayaRoom } from './seed-daya-room';
import {
  ensureJewlDayaEntity,
  jewlSheetData,
  JEWL_ENTITY_NAME,
  JEWL_FIFTEEN_LAWS,
} from '../src/daya/jewl-persona';
import { runJewlToolAction } from '../src/daya/jewl-action';
import { render, type Observer } from '../src/daya/renderer';
import { buildSpiritPrompt } from '../src/daya/prompts/roles/spirit';
import { maskJewlName, JEWL_GODHEAD_NAME, JEWL_PUBLIC_LABEL } from '../src/ai/copilot/jewl-identity';

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

const TEST_CAMPAIGN_NAME = '__DAYA_TEST_WP13__';

// ── Mock transports (sequential queues, order-of-call matters) ────────────

function mockOpenAiQueue(responses: string[]): { fetchImpl: DayaFetch; calls: unknown[] } {
  let i = 0;
  const calls: unknown[] = [];
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

// ── Main ────────────────────────────────────────────────────────────────

async function main() {
  console.log('WP13 DAYA JEWL as a DAYA entity (elevated access)\n' + '─'.repeat(50));

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
    const campaign = seeded.campaign;

    // ── Setup: JEWL, a normal comparison entity, and an action target ────
    // Production resolves JEWL's ONE sheet in the Prime campaign; a test
    // seeds a stand-in sheet in its throwaway campaign and passes the
    // campaignId override so it never touches the real Prime rows.
    await prisma.character.create({
      data: {
        name: JEWL_ENTITY_NAME,
        entityType: 'GODHEAD',
        userId: campaign.gmUserId,
        campaignId: campaign.id,
        data: jewlSheetData(),
        status: 'ACTIVE',
      },
    });
    const jewl1 = await ensureJewlDayaEntity({ campaignId: campaign.id });
    const normalChar = await prisma.character.create({
      data: {
        name: '__TEST_DAYA_WP13__ Normal',
        entityType: 'NPC',
        userId: campaign.gmUserId,
        campaignId: campaign.id,
        data: JSON.stringify({
          attributes: {
            willpower: { level: 10, current: 3, augmentPositive: 0, augmentNegative: 0 },
            wisdom: { level: 10, current: 10, augmentPositive: 0, augmentNegative: 0 },
            wit: { level: 10, current: 10, augmentPositive: 0, augmentNegative: 0 },
            frequency: { level: 10, current: 8 },
          },
        }),
        status: 'ACTIVE',
      },
    });
    const target = await prisma.character.create({
      data: {
        name: '__TEST_DAYA_WP13__ Target',
        entityType: 'NPC',
        userId: campaign.gmUserId,
        campaignId: campaign.id,
        data: JSON.stringify({ attributes: { willpower: { level: 10, current: 3, augmentPositive: 0, augmentNegative: 0 } } }),
        status: 'ACTIVE',
      },
    });

    // ── 1. JEWL DayaEntity exists; persona carries the 15 laws ───────────
    console.log('\n-- 1. JEWL DayaEntity + canon persona --');
    check('jewl: character resolved', !!jewl1.characterId);
    check('jewl: entity created', !!jewl1.entityId);
    check('jewl: first ensure reports created=true', jewl1.created === true);

    const jewlCharacter1 = await prisma.character.findUniqueOrThrow({ where: { id: jewl1.characterId } });
    check('jewl: well-known name', jewlCharacter1.name === JEWL_ENTITY_NAME);
    check('jewl: GODHEAD-tier entityType', jewlCharacter1.entityType === 'GODHEAD');

    const jewlEntityRow1 = await prisma.dayaEntity.findUniqueOrThrow({ where: { id: jewl1.entityId } });
    check('jewl: near-1.0 introspection (no self-miscalibration)', jewlEntityRow1.introspection >= 0.9, String(jewlEntityRow1.introspection));
    check('jewl: ACTIVE from the start (never dormant)', jewlEntityRow1.status === 'ACTIVE');

    const jewlPersona1 = JSON.parse(jewlEntityRow1.personaProfile) as { omniscient?: boolean; identityNarrative?: string; voiceNotes?: string };
    check('jewl: omniscient flag set', jewlPersona1.omniscient === true);
    check(
      'jewl: identityNarrative carries the 15 laws',
      JEWL_FIFTEEN_LAWS.every((law) => jewlPersona1.identityNarrative?.includes(law)),
    );

    const spiritPromptForJewl = buildSpiritPrompt({
      name: jewlCharacter1.name,
      identityNarrative: jewlPersona1.identityNarrative ?? '',
      voiceNotes: jewlPersona1.voiceNotes ?? '',
      feltStateBrief: 'steady',
      perceptionBlock: 'ambient',
      recallBlock: 'none',
      desiresBlock: 'none',
      stimulus: 'a quiet moment',
    });
    check('jewl: his real Spirit prompt carries canon (a law phrase present)', spiritPromptForJewl.includes(JEWL_FIFTEEN_LAWS[0]));

    // Idempotency: re-ensuring never resets persona/affect/memory.
    const jewl2 = await ensureJewlDayaEntity({ campaignId: campaign.id });
    check('jewl: second ensure reports created=false', jewl2.created === false);
    check('jewl: second ensure resolves the SAME character', jewl2.characterId === jewl1.characterId);
    check('jewl: second ensure resolves the SAME entity', jewl2.entityId === jewl1.entityId);

    // ── 2. Omniscient perception: terminal bypass vs a normal entity's lens ──
    console.log('\n-- 2. Omniscient perception --');
    const quietVoicing: DayaFetch = async () => ({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: 'a quiet certainty settles, nothing more said.' } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }),
      text: async () => '',
    });
    const subjectReq = { subject: 'self-stat' as const, subjectKey: 'pool.willpower', trueData: { current: 3, max: 10 } };
    const jewlObserver: Observer = { entityId: null, attunement: 1, biasProfile: {}, mood: { morale: 0, stress: 0, grief: 0 }, voice: {} };
    const normalObserver: Observer = { entityId: normalChar.id, attunement: 0.3, biasProfile: {}, mood: { morale: 0, stress: 0, grief: 0 }, voice: {} };

    const jewlView = await render(subjectReq, jewlObserver, { fetchImpl: quietVoicing });
    const normalView = await render(subjectReq, normalObserver, { fetchImpl: quietVoicing });

    check('perception: JEWL fidelity is exact (5)', jewlView.fidelityLevel === 5, String(jewlView.fidelityLevel));
    check('perception: JEWL sees the raw true value', jewlView.prose.includes('"current":3'), jewlView.prose);
    check('perception: normal entity fidelity is filtered (< 5)', normalView.fidelityLevel < 5, String(normalView.fidelityLevel));
    check('perception: JEWL vs normal-entity views differ', jewlView.prose !== normalView.prose);

    // ── 3. Unrestricted action vs the self-only gate ─────────────────────
    console.log('\n-- 3. Unrestricted action (targets ANOTHER character) vs the self-only gate --');

    // 3a. A NORMAL entity's 'Do:' on the same target leaves it untouched —
    // the normal 'act' path never reaches a tool dispatcher; it only ever
    // runs Body-outward -> the adjudicator, self-scoped. NOTE on mock
    // routing (mirrors WP9 test2a): supplying BOTH an L1 fetchImpl AND an
    // anthropicClient means the Tagger's ingest calls (stimulus AND the
    // adjudication_result re-ingest) ALSO route through the anthropicClient
    // mock (memory.ts's pickTaggerTier prefers C whenever available), not
    // the L1 one — queues are built accordingly.
    const normalTaggerJson = JSON.stringify({
      valence: 0, arousal: 0.1, salience: 0.2, entityRefs: [],
      classification: { contentCategory: 'perception', sensitivity: 'safe', icOoc: 'IC', rationaleTag: 'considers marking the target' },
    });
    const normalSoulProse = 'Right now, in your body and mood: a little restless.';
    const normalSpiritDo = 'An impulse rises, half-formed.\nDo: mark the target as weak.';
    const normalBodyOutwardJson = JSON.stringify({ intent: 'gesture toward marking the target as weak', subjectKeys: [], effortContext: 'casual' });
    const normalSensationText = 'Nothing much registers, one way or the other.';
    const mockNormalL1 = mockOpenAiQueue([normalSoulProse, normalSpiritDo, normalBodyOutwardJson, normalSensationText]);
    const normalAdjudicatorJson = JSON.stringify({
      outcome: 'The impulse passes without effect — nothing about the target changes.',
      factsToWrite: [],
      factsToSupersede: [],
      check: null,
      experienceEvent: { content: 'Nothing comes of it.', valence: 0, salience: 0.05 },
    });
    const normalTaggerJsonAdjIngest = JSON.stringify({
      valence: 0, arousal: 0.05, salience: 0.05, entityRefs: [],
      classification: { contentCategory: 'perception', sensitivity: 'safe', icOoc: 'IC', rationaleTag: 'low-salience non-event' },
    });
    const mockNormalC = mockAnthropicQueue([normalTaggerJson, normalAdjudicatorJson, normalTaggerJsonAdjIngest]);

    const normalActResult = await wake(
      { kind: 'stimulus', entityId: normalChar.id, source: 'perception', content: 'The target stands nearby, an easy mark.' },
      { fetchImpl: mockNormalL1.fetchImpl, anthropicClient: mockNormalC.client },
    );
    check('gate: normal entity resolved to act', normalActResult.action?.kind === 'act', JSON.stringify(normalActResult.action));

    const targetAfterNormal = await prisma.character.findUniqueOrThrow({ where: { id: target.id } });
    const targetDataAfterNormal = JSON.parse(targetAfterNormal.data) as { conditions?: Record<string, boolean> };
    check(
      'gate: normal entity CANNOT touch another character — target untouched',
      !targetDataAfterNormal.conditions?.weak,
      JSON.stringify(targetDataAfterNormal.conditions),
    );

    // 3b. JEWL's 'Do:' on the identical target DOES apply, via the existing
    // copilot tool registry (apply_condition), routed through his ensemble.
    const jewlTaggerJson = JSON.stringify({
      valence: 0, arousal: 0.1, salience: 0.2, entityRefs: [],
      classification: { contentCategory: 'perception', sensitivity: 'safe', icOoc: 'IC', rationaleTag: 'marks the target' },
    });
    const jewlSoulProse = 'Right now, in your body and mood: unbothered, clear.';
    const jewlSpiritDo = 'Worth marking, plainly.\nDo: mark the target as weak.';
    const mockJewlL1 = mockOpenAiQueue([jewlSoulProse, jewlSpiritDo]);
    const jewlToolDecisionJson = JSON.stringify({
      tool: 'apply_condition',
      input: { characterId: target.id, condition: 'weak', active: true },
      reason: 'the intent names the target and the condition directly',
    });
    const mockJewlC = mockAnthropicQueue([jewlTaggerJson, jewlToolDecisionJson]);

    const jewlActResult = await wake(
      { kind: 'stimulus', entityId: jewl1.characterId, source: 'perception', content: 'The target stands nearby, worth marking.' },
      { fetchImpl: mockJewlL1.fetchImpl, anthropicClient: mockJewlC.client },
    );
    check('unrestricted action: JEWL turn resolved to act (routed through the ensemble)', jewlActResult.action?.kind === 'act', JSON.stringify(jewlActResult.action));

    const targetAfterJewl = await prisma.character.findUniqueOrThrow({ where: { id: target.id } });
    const targetDataAfterJewl = JSON.parse(targetAfterJewl.data) as { conditions?: Record<string, boolean> };
    check(
      'unrestricted action: JEWL DID apply a copilot tool to ANOTHER character',
      targetDataAfterJewl.conditions?.weak === true,
      JSON.stringify(targetDataAfterJewl.conditions),
    );

    const jewlActionMemory = await prisma.dayaMemoryEntry.findFirst({
      where: { entityId: jewl1.entityId, source: 'action' },
      orderBy: { realTime: 'desc' },
    });
    check('unrestricted action: an action memory records the dispatch', !!jewlActionMemory && jewlActionMemory.content.includes('apply_condition'), jewlActionMemory?.content);

    // Direct-call proof too (unit-level, no ensemble plumbing in the way):
    // a second, independent apply_condition dispatch on the SAME target,
    // clearing the condition, confirms runJewlToolAction itself works
    // standalone, not only inside the ensemble's 'act' branch.
    const directDecision = mockAnthropicQueue([
      JSON.stringify({ tool: 'apply_condition', input: { characterId: target.id, condition: 'weak', active: false }, reason: 'clearing it again' }),
    ]);
    const directResult = await runJewlToolAction(jewl1.entityId, campaign.id, 'clear the weak condition on the target', { anthropicClient: directDecision.client });
    check('unrestricted action (direct call): tool selected', directResult.toolName === 'apply_condition', directResult.error);
    const targetAfterDirect = await prisma.character.findUniqueOrThrow({ where: { id: target.id } });
    const targetDataAfterDirect = JSON.parse(targetAfterDirect.data) as { conditions?: Record<string, boolean> };
    check('unrestricted action (direct call): condition cleared on the SAME other character', targetDataAfterDirect.conditions?.weak === false);

    // ── 4. Seal inversion ─────────────────────────────────────────────────
    console.log('\n-- 4. Seal inversion: JEWL exempt internally, sealed when he SPEAKS --');
    const sealRowsBeforeJewl = await prisma.dayaModelCall.count({ where: { entityId: jewl1.entityId, subsystem: 'seal' } });

    const jewlTaggerJson2 = JSON.stringify({
      valence: 0, arousal: 0.1, salience: 0.2, entityRefs: [],
      classification: { contentCategory: 'dialogue', sensitivity: 'safe', icOoc: 'IC', rationaleTag: 'plain question' },
    });
    const jewlSoulProse2 = 'Right now, in your body and mood: steady, faintly amused.';
    // HARD-hit vocabulary ("d20") in BOTH the monologue and the Say: line —
    // for JEWL, none of this should ever reach sealLint at the spirit stage;
    // only the isolated Say: content is checked, and it fails, so the
    // delivered speech is the deterministic fallback.
    const jewlSpiritSpeakHard = 'A calculation flickers — rolling a d20 behind steady eyes.\nSay: Just roll a d20 and see.';
    const mockJewlSpeakL1 = mockOpenAiQueue([jewlSoulProse2, jewlSpiritSpeakHard]);
    const mockJewlSpeakC = mockAnthropicQueue([jewlTaggerJson2]);

    const jewlSpeakResult = await wake(
      { kind: 'stimulus', entityId: jewl1.characterId, source: 'dialogue', content: 'Someone asks a plain question.' },
      { fetchImpl: mockJewlSpeakL1.fetchImpl, anthropicClient: mockJewlSpeakC.client },
    );
    check('seal inversion: JEWL turn resolved to speak', jewlSpeakResult.action?.kind === 'speak', JSON.stringify(jewlSpeakResult.action));
    check(
      'seal inversion: his SPOKEN content was replaced (HARD hit caught at the speak boundary)',
      jewlSpeakResult.action?.content === `${JEWL_ENTITY_NAME} answers plainly, keeping the particulars to itself.`,
      jewlSpeakResult.action?.content,
    );

    const newSealRowsJewl = await prisma.dayaModelCall.findMany({
      where: { entityId: jewl1.entityId, subsystem: 'seal' },
      orderBy: { createdAt: 'asc' },
      skip: sealRowsBeforeJewl,
    });
    check(
      'seal inversion: a jewl_speak seal-hit WAS logged (the speak boundary engaged)',
      newSealRowsJewl.some((r) => (r.rationale ?? '').includes('source=jewl_speak')),
      JSON.stringify(newSealRowsJewl.map((r) => r.rationale)),
    );
    check(
      'seal inversion: NO spirit-subsystem seal-hit was logged for JEWL (his own context is never linted)',
      !newSealRowsJewl.some((r) => (r.rationale ?? '').includes('source=spirit')),
      JSON.stringify(newSealRowsJewl.map((r) => r.rationale)),
    );

    // Contrast: a NORMAL entity's whole monologue+directive IS linted —
    // the same "d20" vocabulary, but only in the monologue this time,
    // still trips a HARD hit and forces a revoice.
    const normalSealRowsBefore = await prisma.dayaModelCall.count({ where: { entityId: (await prisma.dayaEntity.findUniqueOrThrow({ where: { characterId: normalChar.id } })).id, subsystem: 'seal' } });
    const normalEntityDaId = (await prisma.dayaEntity.findUniqueOrThrow({ where: { characterId: normalChar.id } })).id;

    const normalTaggerJson2 = JSON.stringify({
      valence: 0, arousal: 0.1, salience: 0.1, entityRefs: [],
      classification: { contentCategory: 'dialogue', sensitivity: 'safe', icOoc: 'IC', rationaleTag: 'plain moment' },
    });
    const normalSoulProse2 = 'Right now, in your body and mood: calm.';
    const normalSpiritMonologueHard = 'A flicker of rolling a d20 crosses her mind, unbidden.\nSay: I will wait here.';
    const normalSpiritRevoice = 'Say: I will wait here, plainly.';
    const mockNormalSpeakL1 = mockOpenAiQueue([normalTaggerJson2, normalSoulProse2, normalSpiritMonologueHard, normalSpiritRevoice]);

    const normalSpeakResult = await wake(
      { kind: 'stimulus', entityId: normalChar.id, source: 'dialogue', content: 'A quiet moment passes.' },
      { fetchImpl: mockNormalSpeakL1.fetchImpl },
    );
    check('contrast: normal entity resolved to speak (after revoice)', normalSpeakResult.action?.kind === 'speak', JSON.stringify(normalSpeakResult.action));

    const newSealRowsNormal = await prisma.dayaModelCall.findMany({
      where: { entityId: normalEntityDaId, subsystem: 'seal' },
      orderBy: { createdAt: 'asc' },
      skip: normalSealRowsBefore,
    });
    check(
      'contrast: a spirit-subsystem seal-hit WAS logged for the normal entity (whole monologue+directive linted)',
      newSealRowsNormal.some((r) => (r.rationale ?? '').includes('source=spirit')),
      JSON.stringify(newSealRowsNormal.map((r) => r.rationale)),
    );

    // ── 5. Mask preserved (regression only — no new identity surface) ────
    console.log('\n-- 5. Mask preserved --');
    check('mask: non-ADMIN viewer sees "Copilot"', maskJewlName(JEWL_GODHEAD_NAME, 'TRAILBLAZER') === JEWL_PUBLIC_LABEL);
    check('mask: WATCHER viewer sees "Copilot" too', maskJewlName(JEWL_GODHEAD_NAME, 'WATCHER') === JEWL_PUBLIC_LABEL);
    check('mask: ADMIN viewer sees his true name', maskJewlName(JEWL_GODHEAD_NAME, 'ADMIN') === JEWL_GODHEAD_NAME);
    check('mask: unrelated names pass through untouched', maskJewlName('SomeOtherGodhead', 'TRAILBLAZER') === 'SomeOtherGodhead');

    // ── 6. Continuity across sessions ─────────────────────────────────────
    console.log('\n-- 6. Continuity: memory persists across sequential wakes --');
    const memoriesAfterAllRuns = await prisma.dayaMemoryEntry.findMany({
      where: { entityId: jewl1.entityId },
      orderBy: { realTime: 'asc' },
    });
    check('continuity: multiple sessions accumulated memory (nothing reset)', memoriesAfterAllRuns.length >= 3, `count=${memoriesAfterAllRuns.length}`);
    check(
      'continuity: the FIRST session\'s action memory is still present after LATER sessions',
      memoriesAfterAllRuns.some((m) => m.source === 'action' && m.content.includes('apply_condition')),
    );
    check(
      'continuity: the LATEST session\'s dialogue is present alongside the earliest',
      memoriesAfterAllRuns.some((m) => m.source === 'dialogue'),
    );
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
