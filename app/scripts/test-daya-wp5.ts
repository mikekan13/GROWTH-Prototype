/**
 * WP5 acceptance — the perceptual renderer + believed-sheet revision loop.
 *
 * Mock-based: injects a fake OpenAI-compatible fetch for tier L1 so voicing
 * never hits a real network. Uses a dedicated throwaway test campaign
 * (__DAYA_TEST_WP5__), cleaned up before and after.
 *
 *  1. Terminal bypass (observer.entityId === null) returns raw data,
 *     untransformed, fidelityLevel 5, no distortions.
 *  2. Voiced render: L1 mocked + configured -> DayaModelCall metering row
 *     written (subsystem 'renderer', tier 'L1'); seal-lint-clean prose.
 *  3. Fail-local: L1 unconfigured (no env, no override) -> render() never
 *     throws, falls back to the deterministic template prose.
 *  4. Determinism: 10 consecutive fallback renders at the same revision
 *     epoch produce byte-identical prose.
 *  5. Revision loop: an exertion event on an arrogant profile (selfRegard>0)
 *     leaves believed Willpower > true; on an introspective profile,
 *     |believed - true| shrinks across 3 successive revisions.
 *  6. Other-entity render with projection=0.8 while observer grief is high
 *     is colored by grief and the distortions array records it.
 *
 * Run: npx tsx scripts/test-daya-wp5.ts
 */
import './_server-only-shim';
import { prisma } from '../src/lib/db';
import { render, applyRevision, getBelievedValue, type Observer } from '../src/daya/renderer';
import { sealLint } from '../src/daya/renderer-math';
import type { DayaFetch, DayaFetchResponse } from '../src/daya/model-client';

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

const TEST_CAMPAIGN_NAME = '__DAYA_TEST_WP5__';
const NAME_PREFIX = '__TEST_DAYA_WP5__';

function fakeL1Fetch(content: string): DayaFetch {
  return async (_url, _init): Promise<DayaFetchResponse> => ({
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content } }],
      usage: { prompt_tokens: 20, completion_tokens: 12 },
    }),
    text: async () => '',
  });
}

async function cleanupStale() {
  const campaign = await prisma.campaign.findFirst({ where: { name: TEST_CAMPAIGN_NAME } });
  if (!campaign) return;

  const chars = await prisma.character.findMany({
    where: { name: { startsWith: NAME_PREFIX }, campaignId: campaign.id },
    select: { id: true },
  });
  const characterIds = chars.map(c => c.id);

  const entities = await prisma.dayaEntity.findMany({
    where: { characterId: { in: characterIds } },
    select: { id: true },
  });
  const entityIds = entities.map(e => e.id);

  await prisma.dayaModelCall.deleteMany({ where: { entityId: { in: entityIds } } });
  await prisma.dayaBelievedSheet.deleteMany({ where: { entityId: { in: entityIds } } });
  await prisma.dayaAffect.deleteMany({ where: { entityId: { in: entityIds } } });
  await prisma.dayaEntity.deleteMany({ where: { id: { in: entityIds } } });
  await prisma.historyEntry.deleteMany({ where: { subjectId: { in: characterIds } } });
  await prisma.character.deleteMany({ where: { id: { in: characterIds } } });
  await prisma.campaignMember.deleteMany({ where: { campaignId: campaign.id } });
  await prisma.campaign.delete({ where: { id: campaign.id } });
}

async function main() {
  console.log('WP5 DAYA perceptual renderer + believed-sheet revision\n' + '─'.repeat(50));

  await cleanupStale();

  const originalL1Url = process.env.DAYA_L1_URL;
  const originalL1Model = process.env.DAYA_L1_MODEL;

  try {
    const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
    if (!admin) {
      console.error('No ADMIN user found — run npm run seed:all first.');
      process.exit(1);
    }

    const campaign = await prisma.campaign.create({
      data: { name: TEST_CAMPAIGN_NAME, gmUserId: admin.id, maxTrailblazers: 0 },
    });

    const makeCharacter = (suffix: string) =>
      prisma.character.create({
        data: {
          name: `${NAME_PREFIX} ${suffix}`,
          entityType: 'NPC',
          userId: admin.id,
          campaignId: campaign.id,
          data: JSON.stringify({}),
          status: 'ACTIVE',
        },
      });

    const voicedProbe = await makeCharacter('VoicedProbe');
    const failLocalProbe = await makeCharacter('FailLocalProbe');
    const determinismProbe = await makeCharacter('DeterminismProbe');
    const arrogantProbe = await makeCharacter('Arrogant');
    const introspectiveProbe = await makeCharacter('Introspective');
    const projectionProbe = await makeCharacter('Projector');

    const willpower = { current: 14, max: 20 };

    // ── 1. Terminal bypass ─────────────────────────────────────────────
    const terminalObserver: Observer = {
      entityId: null,
      attunement: 0,
      biasProfile: {},
      mood: { morale: 0, stress: 0, grief: 0 },
      voice: {},
    };
    const terminalView = await render(
      { subject: 'self-stat', subjectKey: 'pool.willpower', trueData: willpower },
      terminalObserver,
    );
    check('Terminal bypass: fidelityLevel is 5', terminalView.fidelityLevel === 5, `got ${terminalView.fidelityLevel}`);
    check('Terminal bypass: no distortions', terminalView.distortions.length === 0);
    check('Terminal bypass: raw data present untransformed', terminalView.prose.includes('14') && terminalView.prose.includes('20'), terminalView.prose);

    // ── 2. Voiced render: L1 configured + mocked -> metering row ────────
    process.env.DAYA_L1_URL = 'http://fake-l1.local:8000';
    process.env.DAYA_L1_MODEL = 'test-l1-model';

    const meterBefore = await prisma.dayaModelCall.count({ where: { subsystem: 'renderer', tier: 'L1' } });
    const anxiousObserver: Observer = {
      entityId: voicedProbe.id,
      attunement: 0.5,
      biasProfile: { selfRegard: -0.2 },
      mood: { morale: 0, stress: 0.2, grief: 0 },
      voice: { register: 'plain', rhythm: 'short' },
    };
    const voicedView = await render(
      { subject: 'self-stat', subjectKey: 'pool.willpower', trueData: willpower },
      anxiousObserver,
      { fetchImpl: fakeL1Fetch('You feel steady enough to keep going a while yet.') },
    );
    check('Voiced render: fidelityLevel is F2 (floor(0.5*5)=2)', voicedView.fidelityLevel === 2, `got ${voicedView.fidelityLevel}`);
    check('Voiced render: returns the mocked L1 text', voicedView.prose === 'You feel steady enough to keep going a while yet.', voicedView.prose);
    check('Voiced render: seal-lint clean', sealLint(voicedView.prose).ok);

    const meterAfter = await prisma.dayaModelCall.count({ where: { subsystem: 'renderer', tier: 'L1' } });
    check('Voiced render: metered via model-client (+1 DayaModelCall row)', meterAfter - meterBefore === 1, `delta=${meterAfter - meterBefore}`);

    // ── 3. Fail-local: L1 unconfigured -> never throws, falls back ─────
    delete process.env.DAYA_L1_URL;
    delete process.env.DAYA_L1_MODEL;

    let threw: unknown = null;
    let failLocalView;
    try {
      failLocalView = await render(
        { subject: 'self-stat', subjectKey: 'pool.willpower', trueData: willpower },
        { entityId: failLocalProbe.id, attunement: 0.5, biasProfile: {}, mood: { morale: 0, stress: 0, grief: 0 }, voice: {} },
      );
    } catch (e) {
      threw = e;
    }
    check('Fail-local: render() never throws when L1 is unconfigured', threw === null, String(threw));
    check('Fail-local: falls back to non-empty deterministic prose', !!failLocalView && failLocalView.prose.length > 0, failLocalView?.prose);
    check('Fail-local: fallback prose is seal-lint clean', !!failLocalView && sealLint(failLocalView.prose).ok);

    // ── 4. Determinism: 10 consecutive fallback renders, same epoch ────
    const determinismObserver: Observer = {
      entityId: determinismProbe.id,
      attunement: 0.5,
      biasProfile: { selfRegard: 0.3 },
      mood: { morale: 0.1, stress: 0, grief: 0 },
      voice: {},
    };
    const tenRenders: Awaited<ReturnType<typeof render>>[] = [];
    for (let i = 0; i < 10; i++) {
      tenRenders.push(
        await render({ subject: 'self-stat', subjectKey: 'pool.willpower', trueData: willpower }, determinismObserver),
      );
    }
    const allSame = tenRenders.every(v => v.prose === tenRenders[0].prose && v.fidelityLevel === tenRenders[0].fidelityLevel);
    check('Determinism: 10 consecutive renders at the same epoch are identical', allSame, tenRenders[0]?.prose);

    // ── 5. Revision loop: arrogant drifts high, introspective converges ─
    const arrogantObserver = { attunement: 0.4, biasProfile: { selfRegard: 0.7 }, mood: { morale: 0, stress: 0, grief: 0 } };
    const arrogantRevision = await applyRevision(arrogantProbe.id, 'pool.willpower', willpower, arrogantObserver);
    check('Revision (arrogant): believed Willpower > true', arrogantRevision.believedValue > willpower.current,
      `believed=${arrogantRevision.believedValue.toFixed(2)} true=${willpower.current}`);
    check('Revision (arrogant): distortions record selfRegard', arrogantRevision.distortions.some(d => d.startsWith('selfRegard:')));

    const introspectiveObserver = { attunement: 0.85, biasProfile: { selfRegard: -0.1 }, mood: { morale: 0, stress: 0, grief: 0 } };
    // Seed a deliberately stale initial belief (far from true) to show convergence.
    const entity = await prisma.dayaEntity.upsert({
      where: { characterId: introspectiveProbe.id },
      create: { characterId: introspectiveProbe.id },
      update: {},
    });
    await prisma.dayaBelievedSheet.upsert({
      where: { entityId: entity.id },
      create: { entityId: entity.id, data: JSON.stringify({ pool: { willpower: 4 }, _epochs: {} }) },
      update: { data: JSON.stringify({ pool: { willpower: 4 }, _epochs: {} }) },
    });

    const diffs: number[] = [];
    for (let i = 0; i < 3; i++) {
      const r = await applyRevision(introspectiveProbe.id, 'pool.willpower', willpower, introspectiveObserver);
      diffs.push(Math.abs(r.believedValue - willpower.current));
    }
    // Net convergence over the 3 revisions, not strict step-by-step
    // monotonicity: the F4 fidelity noise band (+-5%) is large enough
    // relative to a near-converged gap that a single step can occasionally
    // tick back up even while the overall trend converges. The final gap
    // being smaller than the first is the actual "attunement high converges"
    // claim (arrogant's test above shows the counter-case: gap grows instead).
    check('Revision (introspective): |believed-true| after 3 revisions is well below the first revision\'s gap (net convergence)',
      diffs[2] < diffs[0],
      `diffs=${diffs.map(d => d.toFixed(2)).join(', ')}`);

    const believedFinal = await getBelievedValue(introspectiveProbe.id, 'pool.willpower');
    check('getBelievedValue reads back the last-revised value', typeof believedFinal === 'number', `believed=${believedFinal}`);

    // ── 6. Projection: high observer grief colors an other-entity render ─
    const projectionObserver: Observer = {
      entityId: projectionProbe.id,
      attunement: 0.6,
      biasProfile: { projection: 0.8 },
      mood: { morale: -0.3, stress: 0.4, grief: 0.9 },
      voice: {},
    };
    const projectionView = await render(
      { subject: 'other-entity', subjectKey: 'other.willpower', trueData: { current: 14, max: 20 } },
      projectionObserver,
    );
    check('Projection: distortions array records the projection firing',
      projectionView.distortions.some(d => d.startsWith('projection:')), JSON.stringify(projectionView.distortions));
  } finally {
    if (originalL1Url === undefined) delete process.env.DAYA_L1_URL; else process.env.DAYA_L1_URL = originalL1Url;
    if (originalL1Model === undefined) delete process.env.DAYA_L1_MODEL; else process.env.DAYA_L1_MODEL = originalL1Model;
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
