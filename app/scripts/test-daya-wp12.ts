/**
 * WP12 acceptance — test canvas + first-soul authoring flow + time-skip.
 *
 * Exercises the full Mike-authors-in-app flow end to end: wrap an existing
 * Character as a persona-harness entity, author her soul-level params, seed
 * vines + memories, flip the wake gate, converse (mocked L1 stimulus ->
 * speak), run one time-skip (vine_tick -> adjudicator -> adjudication_
 * result), and confirm the L1-offline state surfaces gracefully instead of
 * a raw error. Mock-based throughout (mockOpenAiQueue/mockAnthropicQueue,
 * same shape WP9's acceptance script uses).
 *
 * Run: npx tsx scripts/test-daya-wp12.ts
 */
import './_server-only-shim';
import { prisma } from '../src/lib/db';
import '../src/daya/ensemble'; // registers the real handlers over the WP3 stubs
import { seedDayaRoom } from './seed-daya-room';
import type { AnthropicLike, DayaFetch } from '../src/daya/model-client';
import {
  wrapCharacterAsDaya,
  updateDayaAuthoring,
  seedInitialVines,
  seedEntityMemories,
  setDayaStatus,
  getDayaAuthoringState,
} from '../src/daya/authoring';
import { converseWithEntity } from '../src/daya/conversation';
import { runTimeSkip } from '../src/daya/timeskip';

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

async function expectThrows(label: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    check(label, false, 'did not throw');
  } catch {
    check(label, true);
  }
}

const TEST_CAMPAIGN_NAME = '__DAYA_TEST_WP12__';
const TEST_CHAR_NAME = '__TEST_DAYA_WP12__ Probe';

// ── Mock transports (sequential queues) ─────────────────────────────────

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
      await prisma.dayaBelievedSheet.deleteMany({ where: { entityId: entity.id } });
      await prisma.dayaAffect.deleteMany({ where: { entityId: entity.id } });
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
  console.log('WP12 DAYA test canvas + first-soul authoring + time-skip\n' + '─'.repeat(50));

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
    const gm = await prisma.user.findUnique({ where: { id: campaign.gmUserId } });
    if (!gm) throw new Error('No GM user resolved for the seeded test campaign — run npm run seed:all first');

    const character = await prisma.character.create({
      data: {
        name: TEST_CHAR_NAME,
        entityType: 'NPC',
        userId: gm.id,
        campaignId: campaign.id,
        data: JSON.stringify({
          attributes: {
            willpower: { level: 12, current: 9, augmentPositive: 0, augmentNegative: 0 },
            wisdom: { level: 10, current: 10, augmentPositive: 0, augmentNegative: 0 },
            wit: { level: 10, current: 10, augmentPositive: 0, augmentNegative: 0 },
            frequency: { level: 10, current: 10 },
          },
        }),
        status: 'ACTIVE',
      },
    });

    // ── 1. Wrap ───────────────────────────────────────────────────────────
    console.log('\n-- 1. Wrap: create the 1:1 DayaEntity substrate --');
    const wrap1 = await wrapCharacterAsDaya(character.id, 'ADMIN');
    check('wrap: entity created', !!wrap1.entityId);
    check('wrap: not previously wrapped', wrap1.alreadyWrapped === false);
    check('wrap: status starts DORMANT', wrap1.status === 'DORMANT');
    check('wrap: believed sheet revised once (willpower present on the sheet)', wrap1.believedRevised === true);

    const affect1 = await prisma.dayaAffect.findUnique({ where: { entityId: wrap1.entityId } });
    check('wrap: DayaAffect baseline created', !!affect1 && affect1.morale === 0 && affect1.stress === 0 && affect1.grief === 0);

    const believedSheet1 = await prisma.dayaBelievedSheet.findUnique({ where: { entityId: wrap1.entityId } });
    check('wrap: believed sheet row exists with a divergent pool.willpower estimate', !!believedSheet1);

    // Idempotency: wrapping again does not re-run the revision or reset state.
    const wrap2 = await wrapCharacterAsDaya(character.id, 'ADMIN');
    check('wrap: second call reports alreadyWrapped', wrap2.alreadyWrapped === true);
    check('wrap: second call does not re-revise', wrap2.believedRevised === false);

    await expectThrows('wrap: player role is forbidden', () => wrapCharacterAsDaya(character.id, 'TRAILBLAZER'));

    // ── 2. Author ─────────────────────────────────────────────────────────
    console.log('\n-- 2. Author: soul-level params not on the standard sheet --');
    const authored = await updateDayaAuthoring(character.id, 'ADMIN', {
      introspection: 0.7,
      voice: { register: 'plain, working-class', rhythm: 'short, clipped' },
      bias: { selfRegard: -0.2, optimism: 0.1 },
      identityNarrative: 'She has run this same street corner for a decade and trusts her own two hands more than anyone\'s promises.',
    });
    check('author: introspection persisted', authored.introspection === 0.7, String(authored.introspection));
    check('author: voice persisted', authored.persona.voice?.register === 'plain, working-class');
    check('author: bias persisted', authored.persona.bias?.selfRegard === -0.2);
    check('author: identityNarrative persisted', !!authored.persona.identityNarrative);

    await expectThrows('author: out-of-range introspection rejected', () =>
      updateDayaAuthoring(character.id, 'ADMIN', { introspection: 1.5 }),
    );
    await expectThrows('author: player role is forbidden', () =>
      updateDayaAuthoring(character.id, 'TRAILBLAZER', { introspection: 0.4 }),
    );

    // ── 3. Seed vines ─────────────────────────────────────────────────────
    console.log('\n-- 3. Seed initial vines (existing goal service) --');
    const vines = await seedInitialVines(character.id, gm.id, 'ADMIN', [
      { description: 'wants to reopen the shop her mother lost', priority: 4 },
      { description: 'wants to make peace with her brother', dormant: true, opportunity: { description: 'he writes to her out of the blue' } },
    ]);
    check('vines: two goals created', vines.length === 2);
    check('vines: second is dormant', vines[1].dormant === true);
    check('vines: opportunity declared on the dormant vine', !!vines[1].opportunityId);

    const goalRows = await prisma.goal.findMany({ where: { characterId: character.id } });
    check('vines: one ACTIVE, one DORMANT on the DB row', goalRows.some((g) => g.status === 'ACTIVE') && goalRows.some((g) => g.status === 'DORMANT'));

    await expectThrows('vines: more than 3 rejected', () =>
      seedInitialVines(character.id, gm.id, 'ADMIN', [
        { description: 'a' }, { description: 'b' }, { description: 'c' }, { description: 'd' },
      ]),
    );

    // ── 4. Seed memories ──────────────────────────────────────────────────
    console.log('\n-- 4. Seed memories (sealLint-checked, all-or-nothing) --');
    const memBefore = await prisma.dayaMemoryEntry.count({ where: { entityId: wrap1.entityId } });
    const seeded1 = await seedEntityMemories(character.id, 'ADMIN', [
      { content: 'The morning the shop closed, the key stuck in the lock and would not turn.', valence: -0.4, arousal: 0.3 },
      { content: 'Her brother\'s handwriting on an envelope, after years of nothing.', valence: 0.2, arousal: 0.2 },
    ]);
    check('memories: two rows written', seeded1.length === 2);
    const memAfter = await prisma.dayaMemoryEntry.count({ where: { entityId: wrap1.entityId } });
    check('memories: count increased by exactly 2', memAfter - memBefore === 2, `delta=${memAfter - memBefore}`);

    await expectThrows('memories: a mechanical-vocabulary hit rejects the whole batch', () =>
      seedEntityMemories(character.id, 'ADMIN', [
        { content: 'A quiet afternoon at the counter.' },
        { content: 'Roll a d20 to see if she notices.' },
      ]),
    );
    const memAfterRejected = await prisma.dayaMemoryEntry.count({ where: { entityId: wrap1.entityId } });
    check('memories: rejected batch left no partial write', memAfterRejected === memAfter, `count=${memAfterRejected}`);

    // ── 5. Enable / wake gate ──────────────────────────────────────────────
    console.log('\n-- 5. Enable: the wake gate --');
    const stateBeforeEnable = await getDayaAuthoringState(character.id);
    check('enable: starts DORMANT', stateBeforeEnable.status === 'DORMANT');

    const converseBeforeEnable = await converseWithEntity(character.id, 'ADMIN', 'hello?');
    check('enable: conversing before enable reports dormant, no model call', converseBeforeEnable.status === 'dormant');

    await setDayaStatus(character.id, 'ADMIN', 'ACTIVE');
    const stateAfterEnable = await getDayaAuthoringState(character.id);
    check('enable: flips to ACTIVE', stateAfterEnable.status === 'ACTIVE');

    // ── 6. Converse ────────────────────────────────────────────────────────
    console.log('\n-- 6. Converse: stimulus -> Say --');
    const taggerJson = JSON.stringify({
      valence: 0.2, arousal: 0.1, salience: 0.2, entityRefs: [],
      classification: { contentCategory: 'dialogue', sensitivity: 'safe', icOoc: 'IC', rationaleTag: 'gm greets her' },
    });
    const soulProse = 'Right now, in your body and mood: steady, a little curious.';
    const spiritOutput = 'She looks up from the counter.\nSay: Can I help you with something?';
    const mockConverse = mockOpenAiQueue([taggerJson, soulProse, spiritOutput]);

    const converseResult = await converseWithEntity(character.id, 'ADMIN', 'Hello there.', { fetchImpl: mockConverse.fetchImpl });
    check('converse: resolves ok', converseResult.status === 'ok', converseResult.status);
    check('converse: she spoke', converseResult.action?.kind === 'speak', JSON.stringify(converseResult.action));

    await expectThrows('converse: player role is forbidden', () => converseWithEntity(character.id, 'TRAILBLAZER', 'hi'));

    // ── 7. Time-skip ───────────────────────────────────────────────────────
    console.log('\n-- 7. Time-skip: vine_tick -> adjudicator -> adjudication_result --');
    const vineTickText = 'Weeks passed with her hands full of small repairs, saving what little she could toward the lease.';
    const bodyInwardText = 'Something in your chest loosens, just slightly.';
    const mockTimeSkipL1 = mockOpenAiQueue([vineTickText, bodyInwardText]);

    const adjudicatorJson = JSON.stringify({
      outcome: 'She scrapes together a little more toward reopening the shop, though not enough yet.',
      factsToWrite: [{ subjectKey: 'shop.lease.savings', fact: 'A small amount has been saved toward the lease.' }],
      factsToSupersede: [],
      check: null,
      experienceEvent: { content: bodyInwardText, valence: 0.1, salience: 0.3 },
    });
    const mockTimeSkipC = mockAnthropicQueue([adjudicatorJson]);

    const skipResult = await runTimeSkip(
      character.id,
      'ADMIN',
      { fetchImpl: mockTimeSkipL1.fetchImpl, anthropicClient: mockTimeSkipC.client },
      false,
    );
    check('timeskip: resolves ok', skipResult.status === 'ok', skipResult.status);
    check('timeskip: she stated an intent', !!skipResult.statedIntent);
    check('timeskip: adjudicator resolved an outcome', !!skipResult.adjudication?.outcome);

    const factRows = await prisma.worldFact.findMany({ where: { campaignId: campaign.id, subjectKey: 'shop.lease.savings' } });
    check('timeskip: adjudicated fact was written to the world ledger', factRows.length === 1);

    const memoriesAfterSkip = await prisma.dayaMemoryEntry.findMany({ where: { entityId: wrap1.entityId }, orderBy: { realTime: 'desc' }, take: 5 });
    check(
      'timeskip: the outcome was stamped as a lived memory',
      memoriesAfterSkip.some((m) => m.content.includes('loosens') || m.source === 'reasoning' || m.source === 'perception'),
    );

    // ── 8. L1-offline surfaced gracefully ─────────────────────────────────
    console.log('\n-- 8. L1-offline: surfaced as a clear state, not a raw error --');
    delete process.env.DAYA_L1_URL;
    delete process.env.DAYA_L1_MODEL;
    const offlineResult = await converseWithEntity(character.id, 'ADMIN', 'Are you still there?');
    check('offline: surfaces core_offline, not a thrown error', offlineResult.status === 'core_offline', offlineResult.status);
    check('offline: carries a human-readable detail', !!offlineResult.detail);
    process.env.DAYA_L1_URL = 'http://mock-l1.local';
    process.env.DAYA_L1_MODEL = 'mock-l1-model';

    // DAYA_ENABLED off entirely -> 'disabled', never a throw either.
    delete process.env.DAYA_ENABLED;
    const disabledResult = await converseWithEntity(character.id, 'ADMIN', 'hello');
    check('disabled: DAYA_ENABLED off surfaces disabled, not a throw', disabledResult.status === 'disabled');
    process.env.DAYA_ENABLED = 'enabled';
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
