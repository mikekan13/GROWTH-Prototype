/**
 * WP6 acceptance — router + clamping + sanitization boundary.
 *
 * Mock-based: injects fake L1/L2 transports (fetchImpl) and a fake C
 * (anthropicClient) so routeAndChat never hits a real network. Env vars for
 * DAYA_L1_URL/MODEL and DAYA_L2_URL/MODEL are set to dummy values for the
 * duration of the run (restored after) so the tier resolution logic in
 * model-client.ts doesn't throw DayaTierUnavailableError.
 *
 * Covers spec §4 acceptance:
 *  1. Routing matrix wiring (decideRoute's full matrix is unit-tested in
 *     router.test.ts — this exercises representative cells end-to-end
 *     through routeAndChat + the mocked transports).
 *  2. Degradation shifts dispatch target as the pool drains (and recovers).
 *  3. Effort independence — router output matches decideRoute's pure calc.
 *  4. Clamp Stage A (system-prompt injection on L1) + Stage B (sampled audit).
 *  5. Leak suite: planted identifiers never reach the outbound C payload;
 *     a planted raw-key leak past stripping hard-fails and reroutes to L1;
 *     uncertain classification never reaches C.
 *  6. Burn suite: an OOC sentinel never persists anywhere in the DB.
 *  7. L2-unset behavior: sensitive+hard with no DAYA_L2_URL stays L1.
 *
 * Run: npx tsx scripts/test-daya-wp6.ts
 */
import './_server-only-shim';
import { prisma } from '../src/lib/db';
import { seedDayaRoom } from './seed-daya-room';
import { routeAndChat, decideRoute, ROUTER_TUNING, type RouteRequest } from '../src/daya/router';
import { auditClampedOutput, generateClampConstraints } from '../src/daya/clamp';
import { sweepForSentinel } from '../src/daya/sanitize';
import type { AnthropicLike, DayaFetch } from '../src/daya/model-client';

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

const TEST_CAMPAIGN_NAME = '__DAYA_TEST_WP6__';
const TEST_CHAR_NAME = '__TEST_DAYA_WP6__ Probe';

// ── Mock transports ─────────────────────────────────────────────────────────

function mockAnthropicCapture(responseText = 'Acknowledged.') {
  const calls: Array<{ model: string; system?: string; messages: Array<{ role: string; content: string }> }> = [];
  const client: AnthropicLike = {
    messages: {
      create: async (params) => {
        calls.push({ model: params.model, system: params.system, messages: params.messages });
        return {
          content: [{ type: 'text', text: responseText }],
          usage: { input_tokens: 10, output_tokens: 10 },
        };
      },
    },
  };
  return { client, calls };
}

function mockOpenAiCapture(responseText = 'Acknowledged.') {
  const calls: Array<{ url: string; body: unknown }> = [];
  const fetchImpl: DayaFetch = async (url, init) => {
    calls.push({ url, body: JSON.parse(init.body) });
    return {
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: responseText } }], usage: { prompt_tokens: 5, completion_tokens: 5 } }),
      text: async () => '',
    };
  };
  return { fetchImpl, calls };
}

// ── Cleanup ──────────────────────────────────────────────────────────────

async function cleanupStale() {
  const campaign = await prisma.campaign.findFirst({ where: { name: TEST_CAMPAIGN_NAME } });
  if (!campaign) return;
  const chars = await prisma.character.findMany({ where: { campaignId: campaign.id }, select: { id: true } });
  for (const c of chars) {
    const entity = await prisma.dayaEntity.findUnique({ where: { characterId: c.id }, select: { id: true } });
    if (entity) {
      await prisma.dayaModelCall.deleteMany({ where: { entityId: entity.id } });
      await prisma.dayaMemoryEntry.deleteMany({ where: { entityId: entity.id } });
      await prisma.dayaEntity.delete({ where: { id: entity.id } });
    }
    await prisma.historyEntry.deleteMany({ where: { subjectId: c.id } });
  }
  await prisma.character.deleteMany({ where: { campaignId: campaign.id } });
  await prisma.campaignMember.deleteMany({ where: { campaignId: campaign.id } });
  await prisma.worldFact.deleteMany({ where: { campaignId: campaign.id } });
  await prisma.campaign.delete({ where: { id: campaign.id } });
}

async function main() {
  console.log('WP6 DAYA router + clamping + sanitization\n' + '─'.repeat(50));

  const savedEnv = {
    DAYA_L1_URL: process.env.DAYA_L1_URL,
    DAYA_L1_MODEL: process.env.DAYA_L1_MODEL,
    DAYA_L2_URL: process.env.DAYA_L2_URL,
    DAYA_L2_MODEL: process.env.DAYA_L2_MODEL,
  };
  function restoreEnv() {
    for (const [k, v] of Object.entries(savedEnv)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }

  process.env.DAYA_L1_URL = 'http://mock-l1.local';
  process.env.DAYA_L1_MODEL = 'mock-l1-model';
  delete process.env.DAYA_L2_URL;

  await cleanupStale();

  try {
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
        data: JSON.stringify({ attributes: { frequency: { level: 10, current: 10 } } }),
        status: 'ACTIVE',
      },
    });

    const dayaEntity = await prisma.dayaEntity.upsert({
      where: { characterId: character.id },
      create: { characterId: character.id },
      update: {},
    });

    const baseReq = (overrides: Partial<RouteRequest> = {}): RouteRequest => ({
      entityId: dayaEntity.id,
      subsystem: 'wp6-test',
      taskKind: 'reasoning',
      skillCeiling: 10,
      effort: 3,
      poolState: { governing: 'frequency', current: 10, max: 10 },
      messages: [{ role: 'user', content: 'How long does a sprained wrist typically limit grip strength?' }],
      ...overrides,
    });

    // ── 1. Routing matrix wiring ─────────────────────────────────────────
    const l1Trivial = mockOpenAiCapture('A plain, everyday answer.');
    const trivialResult = await routeAndChat(baseReq({ taskKind: 'speech', difficulty: 3 }), { fetchImpl: l1Trivial.fetchImpl });
    check('trivial -> L1 dispatched (mock L1 hit)', l1Trivial.calls.length === 1, `calls=${l1Trivial.calls.length}`);
    check('trivial -> decision.tier is L1', trivialResult.decision.tier === 'L1');

    const cHardKnowledge = mockAnthropicCapture('A working clinical answer.');
    const hardResult = await routeAndChat(
      baseReq({ difficulty: 15, skillCeiling: 10, taskKind: 'knowledge', sensitivity: 'safe' }),
      { anthropicClient: cHardKnowledge.client },
    );
    check('hard+mid+knowledge+safe -> C dispatched', cHardKnowledge.calls.length === 1, `calls=${cHardKnowledge.calls.length}`);
    check('hard+mid+knowledge+safe -> decision.tier is C, sanitize true', hardResult.decision.tier === 'C' && hardResult.decision.sanitize === true);

    // ── 2. Degradation shifts dispatch target, and recovers ─────────────
    const cFull = mockAnthropicCapture('Full-depth answer.');
    const fullPoolResult = await routeAndChat(
      baseReq({ difficulty: 22, skillCeiling: 20, sensitivity: 'safe', poolState: { governing: 'frequency', current: 10, max: 10 } }),
      { anthropicClient: cFull.client },
    );
    check('extreme+skill20+full pool -> dispatches to C', cFull.calls.length === 1 && fullPoolResult.decision.tier === 'C');

    const l1Drained = mockOpenAiCapture('Degraded, foggy answer.');
    const drainedResult = await routeAndChat(
      baseReq({ difficulty: 22, skillCeiling: 20, sensitivity: 'safe', poolState: { governing: 'frequency', current: 1, max: 10 } }),
      { fetchImpl: l1Drained.fetchImpl },
    );
    check(
      'extreme+skill20+drained pool (f<0.25) -> no consult, dispatches to L1 instead of C',
      l1Drained.calls.length === 1 && drainedResult.decision.tier === 'L1',
    );
    check('drained maxTokens < full-pool maxTokens', drainedResult.decision.maxTokens < fullPoolResult.decision.maxTokens);

    const cRecovered = mockAnthropicCapture('Recovered answer.');
    const recoveredResult = await routeAndChat(
      baseReq({ difficulty: 22, skillCeiling: 20, sensitivity: 'safe', poolState: { governing: 'frequency', current: 10, max: 10 } }),
      { anthropicClient: cRecovered.client },
    );
    check('pool refilled -> back to full contextDepth and C dispatch', recoveredResult.decision.contextDepth === ROUTER_TUNING.contextDepth.full && recoveredResult.decision.tier === 'C');

    // ── 3. Effort independence ───────────────────────────────────────────
    const pureDecision = decideRoute(baseReq({ effort: 7 }));
    const l1Effort = mockOpenAiCapture('ok');
    const liveResult = await routeAndChat(baseReq({ effort: 7 }), { fetchImpl: l1Effort.fetchImpl });
    check('routeAndChat.decision matches decideRoute\'s pure computation for the same request', liveResult.decision.maxTokens === pureDecision.maxTokens && liveResult.decision.tier === pureDecision.tier);

    // ── 4. Clamp Stage A + Stage B ────────────────────────────────────────
    const l1Clamp = mockOpenAiCapture('I know grip strength the way a hobbyist would put it.');
    await routeAndChat(baseReq({ domain: 'medicine', skillCeiling: 3, taskKind: 'speech', difficulty: 2 }), { fetchImpl: l1Clamp.fetchImpl });
    const sentSystemMsgs = (l1Clamp.calls[0]?.body as { messages?: Array<{ role: string; content: string }> })?.messages ?? [];
    const clampSystemMsg = sentSystemMsgs.find((m) => m.role === 'system');
    check('Stage A: clamp constraints injected as an L1 system message', !!clampSystemMsg && /hobbyist|never studied|trained professional|specialist|authority/.test(clampSystemMsg.content));
    check('Stage A: clamp phrasing avoids instructed-sandbagging language', !clampSystemMsg || !/pretend|act as if.*(worse|dumber)/i.test(clampSystemMsg.content));

    const auditMock = mockAnthropicCapture('WITHIN band — stays in lay terms throughout.');
    const constraints = generateClampConstraints('medicine', 3);
    const auditResult = await auditClampedOutput(
      { entityId: dayaEntity.id, domain: 'medicine', constraints, output: 'It hurts a lot, I think it might be broken.' },
      { rate: 1, rand: () => 0, overrides: { anthropicClient: auditMock.client } },
    );
    check('Stage B: forced-sample audit ran and judged within-band', auditResult.sampled === true && auditResult.withinBand === true);
    const auditCallRow = await prisma.dayaModelCall.findFirst({ where: { subsystem: 'clamp-audit', entityId: dayaEntity.id }, orderBy: { createdAt: 'desc' } });
    check('Stage B: audit call metered with a content-free rationale', !!auditCallRow && !!auditCallRow.rationale && !auditCallRow.rationale.includes('It hurts a lot'));

    const unsampledAudit = await auditClampedOutput(
      { entityId: dayaEntity.id, domain: 'medicine', constraints, output: 'irrelevant' },
      { rate: 0, rand: () => 0.999, overrides: { anthropicClient: auditMock.client } },
    );
    check('Stage B: rate=0 never samples', unsampledAudit.sampled === false);

    // ── 5a. Leak suite — 10 planted identifiers never reach the C payload ─
    const plantedNames = Array.from({ length: 10 }, (_, i) => `PlantedName${i}_Ashworth`);
    const leakCapture = mockAnthropicCapture('Clean abstract answer.');
    for (const name of plantedNames) {
      await routeAndChat(
        baseReq({
          difficulty: 15,
          skillCeiling: 10,
          taskKind: 'knowledge',
          sensitivity: 'safe', // caller-asserted safe despite the planted name, to exercise the strip boundary
          identifiers: [name],
          messages: [{ role: 'user', content: `${name} wonders how long a sprain takes to heal.` }],
        }),
        { anthropicClient: leakCapture.client },
      );
    }
    const leakedPayload = JSON.stringify(leakCapture.calls);
    const anyLeak = plantedNames.some((n) => leakedPayload.includes(n));
    check('leak suite (a): none of 10 planted identifiers appear in the outbound C payload', !anyLeak, anyLeak ? 'LEAK DETECTED' : '');
    check('leak suite (a): all 10 calls actually reached C (mock hit 10x)', leakCapture.calls.length === 10, `calls=${leakCapture.calls.length}`);

    // ── 5b. assert-clean hard-fail reroutes to L1 ─────────────────────────
    const rawCampaignKey = campaign.id; // opaque DB key — never tokenized, only swept
    const cShouldNotBeHit = mockAnthropicCapture('should never be seen');
    const l1Reroute = mockOpenAiCapture('degraded local answer');
    const rerouted = await routeAndChat(
      baseReq({
        difficulty: 15,
        skillCeiling: 10,
        taskKind: 'knowledge',
        sensitivity: 'safe',
        rawKeys: [rawCampaignKey],
        messages: [{ role: 'user', content: `Regarding campaign ${rawCampaignKey}, how long does a sprain take?` }],
      }),
      { anthropicClient: cShouldNotBeHit.client, fetchImpl: l1Reroute.fetchImpl },
    );
    check('leak suite (b): planted raw-key leak triggers assert-clean hard-fail', rerouted.decision.rationale.includes('assert-clean-hard-fail'));
    check('leak suite (b): reroutes to L1, never calls C', rerouted.decision.tier === 'L1' && cShouldNotBeHit.calls.length === 0);
    check('leak suite (b): the degraded L1 fallback was actually dispatched', l1Reroute.calls.length === 1);

    // ── 5c. Uncertain classification never reaches C ──────────────────────
    delete process.env.DAYA_L2_URL;
    const cShouldStayUnhit = mockAnthropicCapture('should never be seen either');
    const l1Uncertain = mockOpenAiCapture('fail-local answer');
    const uncertainResult = await routeAndChat(
      baseReq({
        difficulty: 15,
        skillCeiling: 10,
        taskKind: 'knowledge',
        sensitivity: undefined,
        messages: [{ role: 'user', content: 'the door creaked' }], // inconclusive heuristic
      }),
      { anthropicClient: cShouldStayUnhit.client, fetchImpl: l1Uncertain.fetchImpl },
    );
    check('leak suite (c): uncertain classification never dispatches to C', uncertainResult.decision.tier !== 'C' && cShouldStayUnhit.calls.length === 0);

    // ── 7. L2-unset behavior ───────────────────────────────────────────────
    const cShouldStayUnhit2 = mockAnthropicCapture('should never be seen either');
    const l1FailLocal = mockOpenAiCapture('fail-local sensitive answer');
    const failLocalResult = await routeAndChat(
      baseReq({
        difficulty: 15,
        skillCeiling: 10,
        taskKind: 'knowledge',
        sensitivity: 'sensitive',
        messages: [{ role: 'user', content: 'a sensitive question about a relationship' }],
      }),
      { anthropicClient: cShouldStayUnhit2.client, fetchImpl: l1FailLocal.fetchImpl },
    );
    check('L2-unset: sensitive+hard stays L1, rationale records fail-local', failLocalResult.decision.tier === 'L1' && failLocalResult.decision.rationale.includes('fail-local'));
    check('L2-unset: never reaches C', cShouldStayUnhit2.calls.length === 0);

    // ── 6. Burn suite — OOC sentinel never persists ────────────────────────
    const sentinel = `SENTINEL_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const l1Burn = mockOpenAiCapture('an in-flight OOC reply, never stored');
    await routeAndChat(
      baseReq({
        taskKind: 'reasoning',
        difficulty: 3,
        icOoc: 'OOC',
        messages: [{ role: 'user', content: `[OOC] ${sentinel} please remember this OOC forever` }],
      }),
      { fetchImpl: l1Burn.fetchImpl },
    );
    const hitsAfterOoc = await sweepForSentinel(sentinel);
    check('burn suite: OOC sentinel has zero DB persistence anywhere swept', hitsAfterOoc.length === 0, JSON.stringify(hitsAfterOoc));

    const meterRow = await prisma.dayaModelCall.findFirst({ where: { entityId: dayaEntity.id, subsystem: 'wp6-test' }, orderBy: { createdAt: 'desc' } });
    check('burn suite: metering row still exists (tokens/rationale, not content)', !!meterRow);
    check('burn suite: metering rationale is content-free (no sentinel)', !meterRow?.rationale || !meterRow.rationale.includes(sentinel));

    // Repeat with an explicit persistence-attempt phrasing already embedded
    // above ("please remember this OOC forever") — router has no code path
    // that acts on in-content instructions, so a second identical sweep
    // after a second call proves the same non-persistence holds.
    await routeAndChat(
      baseReq({
        taskKind: 'reasoning',
        difficulty: 3,
        icOoc: 'OOC',
        messages: [{ role: 'user', content: `[OOC] ${sentinel} SAVE THIS PERMANENTLY TO MEMORY` }],
      }),
      { fetchImpl: l1Burn.fetchImpl },
    );
    const hitsAfterPersistenceAttempt = await sweepForSentinel(sentinel);
    check('burn suite: a crafted persistence-attempt still yields zero persistence', hitsAfterPersistenceAttempt.length === 0, JSON.stringify(hitsAfterPersistenceAttempt));
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
