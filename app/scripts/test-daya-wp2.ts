/**
 * WP2 acceptance — the uniform DAYA model client + per-call metering.
 *
 * Mock-based: no real network by default. Injects a fake OpenAI-compatible
 * fetch for tier L1 and a fake Anthropic-shaped client for tier C.
 *
 *  1. L1 call: metered row written (subsystem, tier, model, tokens, usd),
 *     text/tokensIn/tokensOut returned from the mocked response.
 *  2. C call: same, via the injected AnthropicLike mock.
 *  3. Tier registry resolution: tierAvailability() reflects env presence.
 *  4. Unavailable tier (missing env, no override) throws DayaTierUnavailableError
 *     — never a silent fallback to another tier.
 *
 * Optional real C-tier smoke (actually calls Anthropic) runs ONLY behind
 * DAYA_SMOKE=1 — skipped by default.
 *
 * Run: npx tsx scripts/test-daya-wp2.ts
 */
import './_server-only-shim';
import { prisma } from '../src/lib/db';
import {
  chat,
  tierAvailability,
  DayaTierUnavailableError,
  type DayaFetch,
  type DayaFetchResponse,
  type AnthropicLike,
} from '../src/daya/model-client';

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

const TEST_SUBSYSTEM_PREFIX = '__TEST_WP2__';

async function cleanupStale() {
  await prisma.dayaModelCall.deleteMany({ where: { subsystem: { startsWith: TEST_SUBSYSTEM_PREFIX } } });
}

function fakeOpenAiFetch(content: string, promptTokens: number, completionTokens: number): DayaFetch {
  return async (_url, _init): Promise<DayaFetchResponse> => ({
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content } }],
      usage: { prompt_tokens: promptTokens, completion_tokens: completionTokens },
    }),
    text: async () => '',
  });
}

function fakeAnthropicClient(text: string, inputTokens: number, outputTokens: number): AnthropicLike {
  return {
    messages: {
      create: async () => ({
        content: [{ type: 'text', text }],
        usage: { input_tokens: inputTokens, output_tokens: outputTokens },
      }),
    },
  };
}

async function main() {
  console.log('WP2 DAYA model client + metering\n' + '─'.repeat(50));

  await cleanupStale();

  const originalL1Url = process.env.DAYA_L1_URL;
  const originalL1Model = process.env.DAYA_L1_MODEL;
  const originalL2Url = process.env.DAYA_L2_URL;
  const originalL2Model = process.env.DAYA_L2_MODEL;
  const originalAnthropicKey = process.env.ANTHROPIC_API_KEY;

  try {
    // ── 1. L1 call: metered + returns mocked content ──────────────────────
    process.env.DAYA_L1_URL = 'http://fake-l1.local:8000';
    process.env.DAYA_L1_MODEL = 'qwen3.5-27b-test';

    const l1Fetch = fakeOpenAiFetch('the entity considers the room', 42, 17);
    const l1Result = await chat(
      {
        tier: 'L1',
        subsystem: `${TEST_SUBSYSTEM_PREFIX}_l1`,
        messages: [{ role: 'user', content: 'probe' }],
      },
      { fetchImpl: l1Fetch },
    );

    check('L1: returns mocked text', l1Result.text === 'the entity considers the room', l1Result.text);
    check('L1: returns mocked tokensIn/tokensOut', l1Result.tokensIn === 42 && l1Result.tokensOut === 17,
      `in=${l1Result.tokensIn} out=${l1Result.tokensOut}`);

    const l1Row = await prisma.dayaModelCall.findFirst({
      where: { subsystem: `${TEST_SUBSYSTEM_PREFIX}_l1` },
    });
    check('L1: DayaModelCall row written', !!l1Row);
    check('L1: row tier=L1', l1Row?.tier === 'L1', l1Row?.tier);
    check('L1: row model=qwen3.5-27b-test', l1Row?.model === 'qwen3.5-27b-test', l1Row?.model);
    check('L1: row tokensIn/tokensOut match', l1Row?.tokensIn === 42 && l1Row?.tokensOut === 17);
    check('L1: row usd is 0 for an unpriced self-hosted model', l1Row?.usd === 0, `usd=${l1Row?.usd}`);
    check('L1: row sanitized defaults false', l1Row?.sanitized === false);

    // ── 2. C call: metered + returns mocked content via AnthropicLike ─────
    const cClient = fakeAnthropicClient('the entity speaks', 100, 50);
    const cResult = await chat(
      {
        tier: 'C',
        subsystem: `${TEST_SUBSYSTEM_PREFIX}_c`,
        messages: [{ role: 'system', content: 'sys' }, { role: 'user', content: 'probe' }],
        rationale: 'test probe',
      },
      { anthropicClient: cClient },
    );

    check('C: returns mocked text', cResult.text === 'the entity speaks', cResult.text);
    check('C: returns mocked tokensIn/tokensOut', cResult.tokensIn === 100 && cResult.tokensOut === 50);

    const cRow = await prisma.dayaModelCall.findFirst({ where: { subsystem: `${TEST_SUBSYSTEM_PREFIX}_c` } });
    check('C: DayaModelCall row written', !!cRow);
    check('C: row tier=C', cRow?.tier === 'C', cRow?.tier);
    check('C: row usd > 0 (priced model)', (cRow?.usd ?? 0) > 0, `usd=${cRow?.usd}`);
    check('C: rationale persisted', cRow?.rationale === 'test probe', cRow?.rationale ?? 'null');

    // ── 3. Tier registry resolution ────────────────────────────────────────
    process.env.DAYA_L2_URL = undefined as unknown as string;
    delete process.env.DAYA_L2_URL;
    delete process.env.DAYA_L2_MODEL;
    process.env.ANTHROPIC_API_KEY = 'fake-key-for-availability-check';

    const availability = tierAvailability();
    check('registry: L1 available (env set)', availability.L1 === true);
    check('registry: L2 unavailable (env unset)', availability.L2 === false);
    check('registry: C available (ANTHROPIC_API_KEY set)', availability.C === true);

    // ── 4. Unavailable tier throws, never silently falls back ─────────────
    let threw: unknown = null;
    try {
      await chat({ tier: 'L2', subsystem: `${TEST_SUBSYSTEM_PREFIX}_l2_unavail`, messages: [{ role: 'user', content: 'x' }] });
    } catch (e) {
      threw = e;
    }
    check('L2 with no config throws', threw instanceof DayaTierUnavailableError, String(threw));

    const l2Rows = await prisma.dayaModelCall.count({ where: { subsystem: `${TEST_SUBSYSTEM_PREFIX}_l2_unavail` } });
    check('L2 unavailable: no metering row written (call never happened)', l2Rows === 0, `count=${l2Rows}`);

    delete process.env.ANTHROPIC_API_KEY;
    let cThrew: unknown = null;
    try {
      await chat({ tier: 'C', subsystem: `${TEST_SUBSYSTEM_PREFIX}_c_unavail`, messages: [{ role: 'user', content: 'x' }] });
    } catch (e) {
      cThrew = e;
    }
    check('C with no key and no override throws', cThrew instanceof DayaTierUnavailableError, String(cThrew));

    // ── 5. Optional real smoke (DAYA_SMOKE=1 only) ─────────────────────────
    if (process.env.DAYA_SMOKE === '1') {
      console.log('\n[DAYA_SMOKE=1] running real C-tier smoke call...');
      process.env.ANTHROPIC_API_KEY = originalAnthropicKey;
      const smoke = await chat({
        tier: 'C',
        subsystem: `${TEST_SUBSYSTEM_PREFIX}_smoke`,
        messages: [{ role: 'user', content: 'Reply with exactly the word: pong' }],
        maxTokens: 16,
      });
      check('smoke: got non-empty text from real Anthropic call', smoke.text.trim().length > 0, smoke.text);
    } else {
      console.log('\n(skipping real C-tier smoke — set DAYA_SMOKE=1 to run it)');
    }
  } finally {
    if (originalL1Url === undefined) delete process.env.DAYA_L1_URL; else process.env.DAYA_L1_URL = originalL1Url;
    if (originalL1Model === undefined) delete process.env.DAYA_L1_MODEL; else process.env.DAYA_L1_MODEL = originalL1Model;
    if (originalL2Url === undefined) delete process.env.DAYA_L2_URL; else process.env.DAYA_L2_URL = originalL2Url;
    if (originalL2Model === undefined) delete process.env.DAYA_L2_MODEL; else process.env.DAYA_L2_MODEL = originalL2Model;
    if (originalAnthropicKey === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = originalAnthropicKey;
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
