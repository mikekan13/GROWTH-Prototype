/**
 * WP14 acceptance — L1 warming/waking UX for cold starts.
 *
 * Exercises the parts of WP14 that need a real DB + the real ensemble
 * pipeline (converseWithEntity -> deliverStimulus -> wake -> ensemble's
 * tagger/soul/spirit L1 calls) — the auth-header threading and the
 * warming-vs-core_offline distinction both only matter once that whole
 * chain is live, which is why this is a script (like WP12's acceptance
 * script) rather than a DB-free vitest unit. model-client.ts's and
 * l1-warm.ts's own header/timeout logic is unit-tested directly in
 * src/daya/model-client.test.ts and src/daya/l1-warm.test.ts.
 *
 * Run: npx tsx scripts/test-daya-wp14.ts
 */
import './_server-only-shim';
import { prisma } from '../src/lib/db';
import '../src/daya/ensemble'; // registers the real handlers over the WP3 stubs
import { seedDayaRoom } from './seed-daya-room';
import type { DayaFetch } from '../src/daya/model-client';
import {
  wrapCharacterAsDaya,
  seedInitialVines,
  setDayaStatus,
} from '../src/daya/authoring';
import { converseWithEntity, warmEntityCore } from '../src/daya/conversation';
import { l1Status, warmL1 } from '../src/daya/l1-warm';

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

const TEST_CAMPAIGN_NAME = '__DAYA_TEST_WP14__';
const TEST_CHAR_NAME = '__TEST_DAYA_WP14__ Probe';

// ── Mock transport: sequential queue that also records headers + whether an
// AbortSignal was threaded through, so we can assert on both the auth
// header (WP14 item 1) and the timeout wiring (WP14 item 1b). ──────────────

interface RecordedCall {
  url: string;
  headers: Record<string, string>;
  body: unknown;
  hadSignal: boolean;
}

function mockOpenAiQueue(responses: string[]): { fetchImpl: DayaFetch; calls: RecordedCall[] } {
  let i = 0;
  const calls: RecordedCall[] = [];
  const fetchImpl: DayaFetch = async (url, init) => {
    calls.push({ url, headers: init.headers, body: JSON.parse(init.body), hadSignal: !!init.signal });
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

/** Never resolves on its own — only responds once the AbortSignal fires,
 * simulating a serverless worker that's still spinning up when our own
 * request timeout gives up on it first. */
function hangingUntilAbortedFetchImpl(): DayaFetch {
  return (_url, init) =>
    new Promise((resolve, reject) => {
      const t = setTimeout(
        () =>
          resolve({
            ok: true,
            status: 200,
            json: async () => ({ choices: [{ message: { content: 'too late' } }], usage: {} }),
            text: async () => '',
          }),
        60_000,
      );
      init.signal?.addEventListener('abort', () => {
        clearTimeout(t);
        reject(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }));
      });
    });
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
  console.log('WP14 DAYA L1 warming/waking UX for cold starts\n' + '─'.repeat(50));

  const savedEnv = {
    DAYA_ENABLED: process.env.DAYA_ENABLED,
    DAYA_L1_URL: process.env.DAYA_L1_URL,
    DAYA_L1_MODEL: process.env.DAYA_L1_MODEL,
    DAYA_L1_API_KEY: process.env.DAYA_L1_API_KEY,
    DAYA_L1_TIMEOUT_MS: process.env.DAYA_L1_TIMEOUT_MS,
    DAYA_L1_STATUS_TIMEOUT_MS: process.env.DAYA_L1_STATUS_TIMEOUT_MS,
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
  delete process.env.DAYA_L1_API_KEY;
  delete process.env.DAYA_L1_TIMEOUT_MS;
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

    await wrapCharacterAsDaya(character.id, 'ADMIN');
    await seedInitialVines(character.id, gm.id, 'ADMIN', [{ description: 'wants to reopen the shop her mother lost', priority: 4 }]);
    await setDayaStatus(character.id, 'ADMIN', 'ACTIVE');

    const taggerJson = JSON.stringify({
      valence: 0.2, arousal: 0.1, salience: 0.2, entityRefs: [],
      classification: { contentCategory: 'dialogue', sensitivity: 'safe', icOoc: 'IC', rationaleTag: 'gm greets her' },
    });
    const soulProse = 'Right now, in your body and mood: steady, a little curious.';
    const spiritOutput = 'She looks up from the counter.\nSay: Can I help you with something?';

    // ── 1. Auth header threading: absent when DAYA_L1_API_KEY unset ──────
    console.log('\n-- 1a. No DAYA_L1_API_KEY -> no Authorization header on real L1 calls --');
    const noKeyMock = mockOpenAiQueue([taggerJson, soulProse, spiritOutput]);
    const noKeyResult = await converseWithEntity(character.id, 'ADMIN', 'Hello there.', { fetchImpl: noKeyMock.fetchImpl });
    check('converse resolves ok with no key set', noKeyResult.status === 'ok', noKeyResult.status);
    check('at least one L1 call made', noKeyMock.calls.length > 0, String(noKeyMock.calls.length));
    check('none of the calls carry an Authorization header', noKeyMock.calls.every((c) => !('Authorization' in c.headers)));
    check('every call was made with an AbortSignal wired in (timeout is live)', noKeyMock.calls.every((c) => c.hadSignal));

    // ── 1b. Auth header present once DAYA_L1_API_KEY is set ──────────────
    console.log('\n-- 1b. DAYA_L1_API_KEY set -> Bearer header on every real L1 call --');
    process.env.DAYA_L1_API_KEY = 'wp14-test-secret';
    const keyMock = mockOpenAiQueue([taggerJson, soulProse, spiritOutput]);
    const keyResult = await converseWithEntity(character.id, 'ADMIN', 'Hello again.', { fetchImpl: keyMock.fetchImpl });
    check('converse resolves ok with key set', keyResult.status === 'ok', keyResult.status);
    check('every call carries the Bearer token', keyMock.calls.every((c) => c.headers.Authorization === 'Bearer wp14-test-secret'));
    delete process.env.DAYA_L1_API_KEY;

    // ── 2. Warming: our own timeout firing surfaces 'warming', not 'core_offline' ──
    console.log("\n-- 2. Cold-start timeout surfaces 'warming', distinct from 'core_offline' --");
    process.env.DAYA_L1_TIMEOUT_MS = '75'; // short so the test doesn't hang
    const warmingResult = await converseWithEntity(character.id, 'ADMIN', 'Are you still there?', {
      fetchImpl: hangingUntilAbortedFetchImpl(),
    });
    check("cold-start timeout reports status 'warming'", warmingResult.status === 'warming', warmingResult.status);
    check('warming result carries a human-readable detail', !!warmingResult.detail);
    delete process.env.DAYA_L1_TIMEOUT_MS;

    // ── 3. Regression: genuinely unreachable L1 still reports core_offline ──
    console.log('\n-- 3. Regression: unset L1 endpoint still reports core_offline (WP12 behavior unchanged) --');
    delete process.env.DAYA_L1_URL;
    delete process.env.DAYA_L1_MODEL;
    const offlineResult = await converseWithEntity(character.id, 'ADMIN', 'Hello?');
    check("unreachable/unset L1 still reports 'core_offline', not 'warming'", offlineResult.status === 'core_offline', offlineResult.status);
    process.env.DAYA_L1_URL = 'http://mock-l1.local';
    process.env.DAYA_L1_MODEL = 'mock-l1-model';

    // ── 4. warmEntityCore / l1Status / warmL1 mapping ─────────────────────
    console.log('\n-- 4. warmEntityCore (GM/ADMIN-gated warm trigger) + l1Status/warmL1 mapping --');
    await expectThrows('warmEntityCore: player role is forbidden', () => warmEntityCore('TRAILBLAZER'));

    const readyMock = mockOpenAiQueue(['pong']);
    const readyTrigger = await warmEntityCore('ADMIN', { fetchImpl: readyMock.fetchImpl });
    check("warmEntityCore: quick 200 -> 'ready'", readyTrigger.status === 'ready', readyTrigger.status);

    const disabledStatus = await (async () => {
      const savedUrl = process.env.DAYA_L1_URL;
      const savedModel = process.env.DAYA_L1_MODEL;
      delete process.env.DAYA_L1_URL;
      delete process.env.DAYA_L1_MODEL;
      const s = await l1Status();
      process.env.DAYA_L1_URL = savedUrl;
      process.env.DAYA_L1_MODEL = savedModel;
      return s;
    })();
    check("l1Status: unset DAYA_L1_URL -> 'disabled'", disabledStatus === 'disabled', disabledStatus);

    const offlineStatus = await l1Status({
      fetchImpl: async () => {
        throw new Error('ECONNREFUSED');
      },
    });
    check("l1Status: network failure -> 'offline'", offlineStatus === 'offline', offlineStatus);

    process.env.DAYA_L1_STATUS_TIMEOUT_MS = '30';
    const warmingStatus = await warmL1({ fetchImpl: hangingUntilAbortedFetchImpl() });
    check("warmL1: reachable-but-slow probe -> 'warming'", warmingStatus === 'warming', warmingStatus);
    delete process.env.DAYA_L1_STATUS_TIMEOUT_MS;
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
