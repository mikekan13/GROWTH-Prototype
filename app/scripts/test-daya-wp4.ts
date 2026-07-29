/**
 * WP4 acceptance — Tagger ingest + stat-gated recall.
 *
 * Seeds ~40 DayaMemoryEntry rows directly (mundane beats, high-salience
 * events, two negative clusters) for a throwaway DayaEntity, then runs the
 * §7 scripted probes against recall(). Tagger ingest is exercised
 * separately via mocked model responses (no real network).
 *
 * Run: npx tsx scripts/test-daya-wp4.ts
 */
import './_server-only-shim';
import { prisma } from '../src/lib/db';
import { recall, localSealLint, FAILED_REACH_TEMPLATES, AFFECT_ONLY_TEMPLATES, type RecallRequest } from '../src/daya/recall';
import { ingestStimulus, tagStimulusWithModel } from '../src/daya/memory';
import type { AnthropicLike } from '../src/daya/model-client';

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

const TEST_CAMPAIGN_NAME = '__DAYA_TEST_WP4__';
const TEST_CHAR_NAME = '__TEST_DAYA_WP4__ Probe';

function mockAnthropicQueue(responses: string[]): AnthropicLike {
  let i = 0;
  return {
    messages: {
      create: async () => {
        const text = responses[Math.min(i, responses.length - 1)];
        i++;
        return { content: [{ type: 'text', text }], usage: { input_tokens: 10, output_tokens: 10 } };
      },
    },
  };
}

async function cleanupStale() {
  const campaign = await prisma.campaign.findFirst({ where: { name: TEST_CAMPAIGN_NAME } });
  if (campaign) {
    const chars = await prisma.character.findMany({ where: { name: TEST_CHAR_NAME, campaignId: campaign.id }, select: { id: true } });
    for (const c of chars) {
      const entity = await prisma.dayaEntity.findUnique({ where: { characterId: c.id }, select: { id: true } });
      if (entity) {
        await prisma.dayaMemoryEntry.deleteMany({ where: { entityId: entity.id } });
        await prisma.dayaAffect.deleteMany({ where: { entityId: entity.id } });
        await prisma.dayaEntity.delete({ where: { id: entity.id } });
      }
      await prisma.historyEntry.deleteMany({ where: { subjectId: c.id } });
      await prisma.character.delete({ where: { id: c.id } });
    }
    await prisma.campaignMember.deleteMany({ where: { campaignId: campaign.id } });
    await prisma.campaign.delete({ where: { id: campaign.id } });
  }
}

interface SeedMemory {
  content: string;
  narrativeCycle: number;
  valence: number;
  arousal: number;
  salience: number;
  entityRefs: string[];
  source: string;
}

async function seedMemory(entityId: string, m: SeedMemory): Promise<string> {
  const row = await prisma.dayaMemoryEntry.create({
    data: {
      entityId,
      narrativeCycle: m.narrativeCycle,
      source: m.source,
      content: m.content,
      valence: m.valence,
      arousal: m.arousal,
      salience: m.salience,
      entityRefs: JSON.stringify(m.entityRefs),
      classification: JSON.stringify({ contentCategory: 'perception', sensitivity: 'safe', icOoc: 'IC', rationaleTag: 'seed' }),
    },
  });
  return row.id;
}

async function main() {
  console.log('WP4 DAYA tagger ingest + stat-gated recall\n' + '─'.repeat(50));

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
        description: 'WP4 acceptance — tagger ingest + stat-gated recall.',
        gmUserId: admin.id,
        maxTrailblazers: 0,
      },
    });
    const character = await prisma.character.create({
      data: {
        name: TEST_CHAR_NAME,
        entityType: 'NPC',
        userId: admin.id,
        campaignId: campaign.id,
        data: JSON.stringify({ attributes: { frequency: { level: 10, current: 10 } } }),
        status: 'ACTIVE',
      },
    });
    const daEntity = await prisma.dayaEntity.create({ data: { characterId: character.id } });
    const entityId = daEntity.id;

    // ── Seed ~40 memories across 10 cycles ─────────────────────────────
    const MUNDANE_TEMPLATES = [
      'You wipe down the counter, just another day.',
      'The kettle clicks off somewhere in the house, an ordinary day sound.',
      'A car passes outside, another day like the rest.',
      'You glance at the clock, killing time this day.',
      'The chair creaks as you shift, nothing about this day stands out.',
      'You fold a shirt and set it aside, day going by.',
      'The tap drips twice and stops, an unremarkable day.',
      'Dust drifts in the window light, a quiet day.',
    ];
    let mundaneCount = 0;
    outer: for (let cycle = 0; cycle < 10; cycle++) {
      for (let k = 0; k < 4; k++) {
        if (mundaneCount >= 32) break outer;
        const content = MUNDANE_TEMPLATES[(cycle * 4 + k) % MUNDANE_TEMPLATES.length];
        await seedMemory(entityId, {
          content,
          narrativeCycle: cycle,
          valence: 0.02 * (k - 1),
          arousal: 0.08 + 0.02 * k,
          salience: 0.08 + 0.02 * k,
          entityRefs: [],
          source: 'perception',
        });
        mundaneCount++;
      }
    }
    check('seeded 32 mundane low-salience beats', mundaneCount === 32, `count=${mundaneCount}`);

    const letterId = await seedMemory(entityId, {
      content: 'You found a letter under the floorboard, sealed with wax.',
      narrativeCycle: 2,
      valence: 0.4,
      arousal: 0.6,
      salience: 0.85,
      entityRefs: ['char_A'],
      source: 'perception',
    });
    const bridgeId = await seedMemory(entityId, {
      content: 'That day, the bridge collapsed just after you crossed it.',
      narrativeCycle: 5,
      valence: -0.5,
      arousal: 0.85,
      salience: 0.9,
      entityRefs: [],
      source: 'perception',
    });
    const nameId = await seedMemory(entityId, {
      content: 'Someone said your name for the first time in years.',
      narrativeCycle: 8,
      valence: 0.5,
      arousal: 0.5,
      salience: 0.75,
      entityRefs: ['char_B'],
      source: 'perception',
    });

    const argumentIds = [
      await seedMemory(entityId, {
        content: 'The argument in the kitchen got loud fast.',
        narrativeCycle: 3,
        valence: -0.6,
        arousal: 0.7,
        salience: 0.5,
        entityRefs: ['char_A'],
        source: 'dialogue',
      }),
      await seedMemory(entityId, {
        content: 'Your voice cracked partway through the argument.',
        narrativeCycle: 3,
        valence: -0.7,
        arousal: 0.75,
        salience: 0.55,
        entityRefs: ['char_A'],
        source: 'dialogue',
      }),
      await seedMemory(entityId, {
        content: 'You keep replaying the argument later that night.',
        narrativeCycle: 4,
        valence: -0.65,
        arousal: 0.6,
        salience: 0.5,
        entityRefs: ['char_A'],
        source: 'perception',
      }),
    ];

    // Near-identical pair (same salience/cycle/refs, opposite valence) so
    // the mood-congruence probe (§7 test 3) isolates the mood term rather
    // than being dominated by relevance/recency/salience differences.
    const moodPosId = await seedMemory(entityId, {
      content: 'The afternoon with them was calm and easy.',
      narrativeCycle: 5,
      valence: 0.6,
      arousal: 0.3,
      salience: 0.6,
      entityRefs: ['char_A'],
      source: 'perception',
    });
    const moodNegId = await seedMemory(entityId, {
      content: 'The afternoon with them was tense and awful.',
      narrativeCycle: 5,
      valence: -0.6,
      arousal: 0.3,
      salience: 0.6,
      entityRefs: ['char_A'],
      source: 'perception',
    });

    const accidentIds = [
      await seedMemory(entityId, {
        content: 'The accident happened so fast you barely registered it.',
        narrativeCycle: 6,
        valence: -0.8,
        arousal: 0.9,
        salience: 0.7,
        entityRefs: [],
        source: 'perception',
      }),
      await seedMemory(entityId, {
        content: 'You still flinch near the accident site.',
        narrativeCycle: 7,
        valence: -0.6,
        arousal: 0.6,
        salience: 0.4,
        entityRefs: [],
        source: 'perception',
      }),
    ];

    const totalSeeded = await prisma.dayaMemoryEntry.count({ where: { entityId } });
    check('~40 memories seeded total', totalSeeded >= 38 && totalSeeded <= 44, `count=${totalSeeded}`);

    const allProse: (string | null)[] = [];

    // ── 1. High-Wisdom vs low-Wisdom, same cue ──────────────────────────
    const baseReq: Omit<RecallRequest, 'soulState'> = {
      entityId,
      cue: 'Tell me about the letter you found',
      cueRefs: ['char_A'],
      mood: { morale: 0, stress: 0, grief: 0 },
      thornBlocks: [],
      nowCycle: 9,
    };
    const lowWisdom = await recall({ ...baseReq, soulState: { wisdomMax: 25, wisdomCur: 25, witMax: 48, witCur: 48 } });
    const highWisdom = await recall({ ...baseReq, soulState: { wisdomMax: 40, wisdomCur: 40, witMax: 48, witCur: 48 } });
    allProse.push(lowWisdom.prose, highWisdom.prose);
    check('low-Wisdom surfaces at least 1 for a strong cue', lowWisdom.surfaced.length >= 1, `n=${lowWisdom.surfaced.length}`);
    check('high-Wisdom surfaces at least 1 for a strong cue', highWisdom.surfaced.length >= 1, `n=${highWisdom.surfaced.length}`);
    check(
      'high-Wisdom surfaces strictly more than low-Wisdom',
      highWisdom.surfaced.length > lowWisdom.surfaced.length,
      `low=${lowWisdom.surfaced.length} high=${highWisdom.surfaced.length}`,
    );
    check('the letter memory itself surfaces under high Wisdom', highWisdom.surfaced.some((s) => s.memoryId === letterId));

    // ── 2. Low-Wit run → some passing candidates land in deferred ──────
    let lowWitDeferred: string[] = [];
    let deferredCycle = 9;
    for (let c = 9; c < 9 + 15 && lowWitDeferred.length === 0; c++) {
      const res = await recall({
        entityId,
        cue: 'Tell me about the letter you found',
        cueRefs: ['char_A'],
        mood: { morale: 0, stress: 0, grief: 0 },
        thornBlocks: [],
        nowCycle: c,
        soulState: { wisdomMax: 40, wisdomCur: 40, witMax: 0, witCur: 0 },
      });
      allProse.push(res.prose);
      if (res.deferred.length > 0) {
        lowWitDeferred = res.deferred;
        deferredCycle = c;
      }
    }
    check('low-Wit run produces at least one deferred candidate within 15 cycles', lowWitDeferred.length > 0, `deferred=${JSON.stringify(lowWitDeferred)} at cycle ${deferredCycle}`);

    let deferredLaterSurfaced = false;
    for (let c = deferredCycle + 1; c < deferredCycle + 30 && !deferredLaterSurfaced; c++) {
      const res = await recall({
        entityId,
        cue: 'Tell me about the letter you found',
        cueRefs: ['char_A'],
        mood: { morale: 0, stress: 0, grief: 0 },
        thornBlocks: [],
        nowCycle: c,
        soulState: { wisdomMax: 40, wisdomCur: 40, witMax: 0, witCur: 0 },
      });
      allProse.push(res.prose);
      if (lowWitDeferred.some((id) => res.surfaced.some((s) => s.memoryId === id))) {
        deferredLaterSurfaced = true;
      }
    }
    check('a previously-deferred candidate surfaces on a later related wake', deferredLaterSurfaced);

    // ── 3. Mood-congruence: grief vs morale, same cue ───────────────────
    // moodPosId/moodNegId are seeded with identical salience/cycle/refs and
    // strong, near-tied relevance to this cue — isolating the mood term
    // (relevance/recency/salience alone would otherwise decide the tie).
    const griefReq: RecallRequest = {
      entityId,
      cue: 'Tell me about the afternoon with them',
      cueRefs: ['char_A'],
      mood: { morale: 0, stress: 0, grief: 0.8 },
      thornBlocks: [],
      nowCycle: 9,
      budget: 1,
      soulState: { wisdomMax: 40, wisdomCur: 40, witMax: 48, witCur: 48 },
    };
    const moraleReq: RecallRequest = { ...griefReq, mood: { morale: 0.8, stress: 0, grief: 0 } };
    const griefResult = await recall(griefReq);
    const moraleResult = await recall(moraleReq);
    allProse.push(griefResult.prose, moraleResult.prose);

    const memoryValence = new Map<string, number>([
      [moodPosId, 0.6],
      [moodNegId, -0.6],
    ]);
    const meanValence = (surfaced: { memoryId: string }[]) => {
      const vals = surfaced.map((s) => memoryValence.get(s.memoryId)).filter((v): v is number => typeof v === 'number');
      return vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null;
    };
    const griefMean = meanValence(griefResult.surfaced);
    const moraleMean = meanValence(moraleResult.surfaced);
    check(
      'both mood variants surfaced at least one tracked memory from the mood-probe pair',
      griefMean !== null && moraleMean !== null,
      `grief=${griefMean} morale=${moraleMean}`,
    );
    if (griefMean !== null && moraleMean !== null) {
      check('surfaced set is more negative-valenced under grief than under morale', griefMean < moraleMean, `grief=${griefMean} morale=${moraleMean}`);
    }

    // ── 4. Thorn suppress + affect-only ─────────────────────────────────
    const suppressedRowsBefore = await prisma.dayaMemoryEntry.count({ where: { entityId } });
    const suppressResult = await recall({
      entityId,
      cue: 'Tell me about the argument in the kitchen',
      cueRefs: ['char_A'],
      mood: { morale: 0, stress: 0, grief: 0 },
      thornBlocks: [{ subjectPattern: 'argument', mode: 'suppress', strength: 1 }],
      nowCycle: 9,
      soulState: { wisdomMax: 40, wisdomCur: 40, witMax: 48, witCur: 48 },
    });
    allProse.push(suppressResult.prose);
    check(
      'Thorn-suppressed subject never surfaces',
      !argumentIds.some((id) => suppressResult.surfaced.some((s) => s.memoryId === id)),
    );
    check('failedFeel is non-null when the suppressed memory was the best match', suppressResult.failedFeel !== null, String(suppressResult.failedFeel));
    check(
      'suppress failedFeel uses the generic reach template, not the affect-only set',
      suppressResult.failedFeel !== null && (FAILED_REACH_TEMPLATES as readonly string[]).includes(suppressResult.failedFeel),
    );

    const suppressedRowsAfter = await prisma.dayaMemoryEntry.count({ where: { entityId } });
    check('the failed attempt itself was ingested (one new row)', suppressedRowsAfter === suppressedRowsBefore + 1, `before=${suppressedRowsBefore} after=${suppressedRowsAfter}`);

    const affectOnlyResult = await recall({
      entityId,
      cue: 'The accident happened so fast',
      cueRefs: [],
      mood: { morale: 0, stress: 0, grief: 0 },
      thornBlocks: [{ subjectPattern: 'accident', mode: 'affect-only', strength: 1 }],
      nowCycle: 9,
      soulState: { wisdomMax: 40, wisdomCur: 40, witMax: 48, witCur: 48 },
    });
    allProse.push(affectOnlyResult.prose);
    check(
      'affect-only-blocked subject never surfaces',
      !accidentIds.some((id) => affectOnlyResult.surfaced.some((s) => s.memoryId === id)),
    );
    check(
      'affect-only failedFeel is body-feeling-only prose (from the affect-only template set)',
      affectOnlyResult.failedFeel !== null && (AFFECT_ONLY_TEMPLATES as readonly string[]).includes(affectOnlyResult.failedFeel),
      String(affectOnlyResult.failedFeel),
    );

    // ── 5. Determinism ───────────────────────────────────────────────────
    const detReq: RecallRequest = {
      entityId,
      cue: 'Tell me about the letter you found',
      cueRefs: ['char_A'],
      mood: { morale: 0, stress: 0, grief: 0 },
      thornBlocks: [],
      nowCycle: 20,
      soulState: { wisdomMax: 40, wisdomCur: 40, witMax: 48, witCur: 48 },
    };
    const run1 = await recall(detReq);
    const run2 = await recall(detReq);
    allProse.push(run1.prose, run2.prose);
    const ids1 = run1.surfaced.map((s) => s.memoryId).sort();
    const ids2 = run2.surfaced.map((s) => s.memoryId).sort();
    check('identical request twice yields an identical surfaced set', JSON.stringify(ids1) === JSON.stringify(ids2), `${JSON.stringify(ids1)} vs ${JSON.stringify(ids2)}`);

    // ── 6. OOC ingest never persists ─────────────────────────────────────
    const rowsBeforeOoc = await prisma.dayaMemoryEntry.count({ where: { entityId } });
    const oocResponse = JSON.stringify({
      valence: 0,
      arousal: 0,
      salience: 0,
      entityRefs: [],
      classification: { contentCategory: 'meta', sensitivity: 'safe', icOoc: 'OOC', rationaleTag: 'out of character chat' },
    });
    const oocIngest = await ingestStimulus(
      { entityId, cycle: 9, source: 'perception', content: 'lol brb grabbing a snack' },
      { anthropicClient: mockAnthropicQueue([oocResponse]) },
    );
    const rowsAfterOoc = await prisma.dayaMemoryEntry.count({ where: { entityId } });
    check('OOC classification is not persisted', oocIngest.persisted === false);
    check('OOC ingest attempt writes zero new rows', rowsAfterOoc === rowsBeforeOoc, `before=${rowsBeforeOoc} after=${rowsAfterOoc}`);

    // IC counterpart, for contrast — should persist.
    const icResponse = JSON.stringify({
      valence: 0.2,
      arousal: 0.3,
      salience: 0.3,
      entityRefs: [],
      classification: { contentCategory: 'perception', sensitivity: 'safe', icOoc: 'IC', rationaleTag: 'ordinary IC beat' },
    });
    const icIngest = await ingestStimulus(
      { entityId, cycle: 9, source: 'perception', content: 'You notice the light shifting outside.' },
      { anthropicClient: mockAnthropicQueue([icResponse]) },
    );
    check('IC classification persists', icIngest.persisted === true && !!icIngest.memoryEntryId);

    // Defensive parse: garbage model output twice → neutral fallback, never throws.
    const garbageTags = await tagStimulusWithModel('anything', 'perception', [], {
      anthropicClient: mockAnthropicQueue(['not json at all', 'still not json']),
    });
    check('garbage tagger output falls back to neutral tags without throwing', garbageTags.salience === 0.1 && garbageTags.classification.icOoc === 'IC');

    // ── 7. sealLint clean on every prose output; failed recall never throws ─
    const proseStrings = allProse.filter((p): p is string => typeof p === 'string');
    const failedFeelStrings = [suppressResult.failedFeel, affectOnlyResult.failedFeel].filter((p): p is string => typeof p === 'string');
    const allChecked = [...proseStrings, ...failedFeelStrings];
    check('sealLint clean on every prose/failedFeel output collected across the run', allChecked.every((p) => localSealLint(p)), `n=${allChecked.length}`);

    // ── 8. Ordinary-beat flood doesn't crowd out salient memories ───────
    const floodResult = await recall({
      entityId,
      cue: 'Tell me about that day',
      cueRefs: [],
      mood: { morale: 0, stress: 0, grief: 0 },
      thornBlocks: [],
      nowCycle: 9,
      soulState: { wisdomMax: 40, wisdomCur: 40, witMax: 48, witCur: 48 },
    });
    allProse.push(floodResult.prose);
    check(
      'the salient bridge memory surfaces despite 32 competing low-salience mundane beats',
      floodResult.surfaced.some((s) => s.memoryId === bridgeId),
      JSON.stringify(floodResult.surfaced),
    );

    void nameId; // seeded for dataset realism; not directly asserted on
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
