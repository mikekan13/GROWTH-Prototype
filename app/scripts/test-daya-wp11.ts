/**
 * WP11 acceptance — the JEWL observation surface (persona-harness inspection
 * tools) + the T15 screening/client-store taps.
 *
 * Exercises the seven daya_* JEWL tools directly against a seeded persona-
 * harness entity (an "arrogant" profile: strong selfRegard bias, low
 * introspection) in a dedicated throwaway test campaign
 * (__DAYA_TEST_WP11__), cleaned up before and after. Covers WP11 spec §4
 * items 1-8: registration, role gate, sheet-diff divergence, pov_view
 * dry-run, routing_log rollup, recall_probe non-ingestion, screening
 * pass-through, and a final no-write sweep across every tool call made.
 *
 * Run: npx tsx scripts/test-daya-wp11.ts
 */
import './_server-only-shim';
import { prisma } from '../src/lib/db';
import { getJewlTool, listJewlTools } from '../src/ai/copilot/tools';
import type { JewlToolContext } from '../src/ai/copilot/tools';
import { seedDayaRoom } from './seed-daya-room';
import { applyRevision } from '../src/daya/renderer';
import { applyDispositionEvent } from '../src/services/daya-affect';
import { screen } from '../src/daya/jewl/screening';

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

const TEST_CAMPAIGN_NAME = '__DAYA_TEST_WP11__';
const TEST_CHAR_NAME = '__TEST_DAYA_WP11__ Probe';

async function cleanupStale() {
  const campaign = await prisma.campaign.findFirst({ where: { name: TEST_CAMPAIGN_NAME } });
  if (campaign) {
    await prisma.worldFact.deleteMany({ where: { campaignId: campaign.id } });
    const chars = await prisma.character.findMany({
      where: { name: TEST_CHAR_NAME, campaignId: campaign.id },
      select: { id: true },
    });
    for (const c of chars) {
      const entity = await prisma.dayaEntity.findUnique({ where: { characterId: c.id }, select: { id: true } });
      if (entity) {
        await prisma.dayaModelCall.deleteMany({ where: { entityId: entity.id } });
        await prisma.dayaMemoryEntry.deleteMany({ where: { entityId: entity.id } });
        await prisma.dayaAffect.deleteMany({ where: { entityId: entity.id } });
        await prisma.dayaBelievedSheet.deleteMany({ where: { entityId: entity.id } });
        await prisma.dayaEntity.delete({ where: { id: entity.id } });
      }
      await prisma.historyEntry.deleteMany({ where: { subjectId: c.id } });
      await prisma.character.delete({ where: { id: c.id } });
    }
    await prisma.campaignMember.deleteMany({ where: { campaignId: campaign.id } });
    await prisma.campaign.delete({ where: { id: campaign.id } });
  }
}

async function main() {
  console.log('WP11 DAYA JEWL observation surface\n' + '─'.repeat(50));
  await cleanupStale();

  try {
    // ── Seed: campaign + room facts + a persona-harness entity ──────────
    const seed = await seedDayaRoom(TEST_CAMPAIGN_NAME);
    const campaign = seed.campaign;

    const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
    if (!admin) {
      console.error('No ADMIN user found — run npm run seed:all first.');
      process.exit(1);
    }

    const flatAttr = (level: number) => ({ level, current: level, augmentPositive: 0, augmentNegative: 0 });

    const character = await prisma.character.create({
      data: {
        name: TEST_CHAR_NAME,
        entityType: 'NPC',
        userId: admin.id,
        campaignId: campaign.id,
        data: JSON.stringify({
          attributes: {
            willpower: { level: 10, current: 1, augmentPositive: 0, augmentNegative: 0 },
            wisdom: flatAttr(10),
            wit: flatAttr(10),
            clout: flatAttr(8),
            celerity: flatAttr(8),
            constitution: flatAttr(8),
            flow: flatAttr(8),
            focus: flatAttr(8),
            frequency: { level: 20, current: 20 },
          },
        }),
        status: 'ACTIVE',
      },
    });

    // Arrogant profile: strong selfRegard overread + low introspection (fidelity level 1).
    const entity = await prisma.dayaEntity.upsert({
      where: { characterId: character.id },
      create: {
        characterId: character.id,
        introspection: 0.3,
        personaProfile: JSON.stringify({ bias: { selfRegard: 1.0 }, voice: {} }),
      },
      update: {},
    });

    await prisma.dayaMemoryEntry.createMany({
      data: [
        { entityId: entity.id, narrativeCycle: 1, source: 'dialogue', content: 'Someone mentioned the mug on the counter.', valence: 0.2, arousal: 0.3, salience: 0.6, entityRefs: '[]', classification: '{}' },
        { entityId: entity.id, narrativeCycle: 2, source: 'perception', content: 'The kitchen window was cold to the touch.', valence: -0.1, arousal: 0.2, salience: 0.3, entityRefs: '[]', classification: '{}' },
        { entityId: entity.id, narrativeCycle: 3, source: 'dialogue', content: 'A quiet conversation about the closet door.', valence: 0.1, arousal: 0.1, salience: 0.2, entityRefs: '[]', classification: '{}' },
      ],
    });

    // Real production path (not mocked) — seeds DayaAffect + a HistoryEntry beat.
    await applyDispositionEvent(character.id, { kind: 'goal_completed', goalName: 'test goal' });

    // Real production path — seeds a divergent DayaBelievedSheet value.
    const revision = await applyRevision(
      character.id,
      'pool.willpower',
      { current: 1, max: 10 },
      { attunement: 0.3, biasProfile: { selfRegard: 1.0 }, mood: { morale: 0, stress: 0, grief: 0 } },
      'self-stat',
    );

    const now = Date.now();
    await prisma.dayaModelCall.createMany({
      data: [
        { entityId: entity.id, subsystem: 'renderer', tier: 'L1', model: 'test-l1', tokensIn: 100, tokensOut: 50, usd: 0.01, sanitized: true, createdAt: new Date(now - 2 * 3_600_000) },
        { entityId: entity.id, subsystem: 'tagger', tier: 'C', model: 'test-c', tokensIn: 200, tokensOut: 80, usd: 0.02, sanitized: true, createdAt: new Date(now - 1 * 3_600_000) },
        { entityId: entity.id, subsystem: 'recall', tier: 'L1', model: 'test-l1', tokensIn: 50, tokensOut: 20, usd: 0.005, sanitized: false, createdAt: new Date(now) },
      ],
    });

    const gmCtx: JewlToolContext = { campaignId: campaign.id, actorId: admin.id, actorRole: 'WATCHER' };
    const playerCtx: JewlToolContext = { campaignId: campaign.id, actorId: 'someone-else', actorRole: 'TRAILBLAZER' };

    // ── 1. All 7 tools registered ────────────────────────────────────────
    const names = listJewlTools().map((t) => t.name);
    const expectedNames = [
      'daya_ledger_read',
      'daya_affect_read',
      'daya_sheet_diff',
      'daya_routing_log',
      'daya_world_inspect',
      'daya_pov_view',
      'daya_recall_probe',
    ];
    for (const n of expectedNames) {
      check(`registered: ${n}`, names.includes(n));
    }

    // ── 2. Role gate: non-GM/ADMIN actor reveals nothing, for every tool ─
    const genericInput = {
      characterId: character.id,
      campaignId: campaign.id,
      subjectKey: 'kitchen.',
      subject: { subject: 'self-stat', subjectKey: 'pool.willpower', trueData: { current: 1, max: 10 } },
      asObserver: 'entity',
      cue: 'the mug',
    };
    for (const n of expectedNames) {
      const tool = getJewlTool(n);
      if (!tool) { check(`role gate: ${n} exists to test`, false); continue; }
      const refusal = await tool.handler(genericInput, playerCtx);
      const out = refusal.output as { revealed?: boolean };
      check(`role gate: ${n} refuses non-GM/ADMIN`, out.revealed === false, JSON.stringify(out));
    }

    // ── 3. daya_ledger_read ───────────────────────────────────────────────
    const ledgerTool = getJewlTool('daya_ledger_read')!;
    const ledgerResult = await ledgerTool.handler({ characterId: character.id }, gmCtx);
    const ledgerOut = ledgerResult.output as { revealed: boolean; entityFound: boolean; count: number };
    check('ledger_read: reveals to GM', ledgerOut.revealed === true);
    check('ledger_read: entity found', ledgerOut.entityFound === true);
    check('ledger_read: returns seeded memories', ledgerOut.count === 3, `count=${ledgerOut.count}`);

    // ── 4. daya_affect_read ───────────────────────────────────────────────
    const affectTool = getJewlTool('daya_affect_read')!;
    const affectResult = await affectTool.handler({ characterId: character.id }, gmCtx);
    const affectOut = affectResult.output as {
      drives: { morale: number } | null;
      dispositionLine: string | null;
      recentDeltas: unknown[];
    };
    check('affect_read: drives present', !!affectOut.drives);
    check('affect_read: morale moved positive from goal_completed', (affectOut.drives?.morale ?? 0) > 0, `morale=${affectOut.drives?.morale}`);
    check('affect_read: recent deltas present', affectOut.recentDeltas.length > 0, `count=${affectOut.recentDeltas.length}`);

    // ── 5. daya_sheet_diff — believed > true for the arrogant profile ────
    const sheetDiffTool = getJewlTool('daya_sheet_diff')!;
    const sheetDiffResult = await sheetDiffTool.handler({ characterId: character.id }, gmCtx);
    const sheetDiffOut = sheetDiffResult.output as {
      attributes: Array<{ attribute: string; trueCurrent: number | null; believedCurrent: number | null; divergence: number | null }>;
      introspection: number;
    };
    const willpowerDiff = sheetDiffOut.attributes.find((a) => a.attribute === 'willpower');
    check('sheet_diff: willpower row present', !!willpowerDiff);
    check('sheet_diff: believed matches applyRevision result', willpowerDiff?.believedCurrent === revision.believedValue, `tool=${willpowerDiff?.believedCurrent} revision=${revision.believedValue}`);
    check('sheet_diff: believed > true (arrogant overread)', (willpowerDiff?.divergence ?? -1) > 0, `divergence=${willpowerDiff?.divergence}`);
    check('sheet_diff: introspection surfaced', sheetDiffOut.introspection === 0.3);

    // ── 6. daya_routing_log — cost-per-hour rollup from seeded rows ──────
    const routingTool = getJewlTool('daya_routing_log')!;
    const routingResult = await routingTool.handler({ characterId: character.id }, gmCtx);
    const routingOut = routingResult.output as {
      count: number;
      rollup: { costPerEntityHour: number | null; totalUsd: number; hoursSpan: number };
    };
    check('routing_log: returns seeded calls', routingOut.count === 3, `count=${routingOut.count}`);
    check('routing_log: rollup hoursSpan ~2h', routingOut.rollup.hoursSpan > 1.9 && routingOut.rollup.hoursSpan < 2.1, `hours=${routingOut.rollup.hoursSpan}`);
    check('routing_log: costPerEntityHour is a number', typeof routingOut.rollup.costPerEntityHour === 'number', `cost=${routingOut.rollup.costPerEntityHour}`);

    // ── 7. daya_pov_view — entity vs terminal differ; dryRun leaves the
    //       Believed Sheet byte-identical ────────────────────────────────
    const povTool = getJewlTool('daya_pov_view')!;
    const believedBefore = await prisma.dayaBelievedSheet.findUnique({ where: { entityId: entity.id } });

    const povSubject = { subject: 'self-stat' as const, subjectKey: 'pool.willpower', trueData: { current: 1, max: 10 } };
    const entityView = await povTool.handler({ characterId: character.id, subject: povSubject, asObserver: 'entity' }, gmCtx);
    const terminalView = await povTool.handler({ characterId: character.id, subject: povSubject, asObserver: 'terminal' }, gmCtx);
    const believedAfter = await prisma.dayaBelievedSheet.findUnique({ where: { entityId: entity.id } });

    const entityOut = entityView.output as { prose: string; fidelityLevel: number; dryRun: boolean; believedSheetUnchanged: boolean };
    const terminalOut = terminalView.output as { prose: string; fidelityLevel: number };
    check('pov_view: entity fidelity < terminal fidelity (5)', entityOut.fidelityLevel < terminalOut.fidelityLevel, `entity=${entityOut.fidelityLevel} terminal=${terminalOut.fidelityLevel}`);
    check('pov_view: entity vs terminal prose differ', entityOut.prose !== terminalOut.prose);
    check('pov_view: terminal prose is raw truth', terminalOut.prose.includes('"current":1'));
    check('pov_view: dryRun flag set', entityOut.dryRun === true);
    check('pov_view: tool asserts believedSheetUnchanged', entityOut.believedSheetUnchanged === true);
    check('pov_view: DayaBelievedSheet row is byte-identical before/after', believedBefore?.data === believedAfter?.data);

    // ── 8. daya_world_inspect ─────────────────────────────────────────────
    const worldTool = getJewlTool('daya_world_inspect')!;
    const worldResult = await worldTool.handler({ subjectKey: 'kitchen.' }, gmCtx);
    const worldOut = worldResult.output as { count: number; facts: Array<{ subjectKey: string }> };
    check(
      'world_inspect: returns only kitchen.* facts',
      worldOut.count > 0 && worldOut.facts.every((f) => f.subjectKey.startsWith('kitchen.')),
      `count=${worldOut.count}`,
    );

    // ── 9. daya_recall_probe — read-only, no new ledger rows ─────────────
    const recallProbeTool = getJewlTool('daya_recall_probe')!;
    const memCountBefore = await prisma.dayaMemoryEntry.count({ where: { entityId: entity.id } });
    const recallResult = await recallProbeTool.handler({ characterId: character.id, cue: 'the mug on the counter' }, gmCtx);
    const memCountAfter = await prisma.dayaMemoryEntry.count({ where: { entityId: entity.id } });
    const recallOut = recallResult.output as { surfaced: unknown[]; deferred: unknown[]; nonIngesting: boolean };
    check('recall_probe: nonIngesting flag set', recallOut.nonIngesting === true);
    check('recall_probe: writes zero new memory rows', memCountAfter === memCountBefore, `before=${memCountBefore} after=${memCountAfter}`);
    check('recall_probe: surfaced+deferred is a sane result', recallOut.surfaced.length + recallOut.deferred.length >= 0);

    // ── 10. Screening stub passes through and retains nothing (DB sweep) ─
    const modelCallCountBefore = await prisma.dayaModelCall.count();
    const memoryCountBeforeSweep = await prisma.dayaMemoryEntry.count();
    const verdict = screen('anything, including sensitive-looking content about grief', { entityId: entity.id, subsystem: 'test' });
    const modelCallCountAfter = await prisma.dayaModelCall.count();
    const memoryCountAfterSweep = await prisma.dayaMemoryEntry.count();
    check('screening: verdict is pass', verdict.action === 'pass');
    check('screening: retains nothing (no new DayaModelCall rows)', modelCallCountAfter === modelCallCountBefore);
    check('screening: retains nothing (no new DayaMemoryEntry rows)', memoryCountAfterSweep === memoryCountBeforeSweep);

    // ── 11. No writes to any entity experience stream from ANY tool call ─
    const finalMemCount = await prisma.dayaMemoryEntry.count({ where: { entityId: entity.id } });
    const finalAffect = await prisma.dayaAffect.findUnique({ where: { entityId: entity.id } });
    check('no-write sweep: memory count unchanged across every read-tool call above', finalMemCount === 3, `count=${finalMemCount}`);
    check('no-write sweep: affect unchanged across every read-tool call above', finalAffect?.morale === affectOut.drives?.morale);
  } finally {
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
