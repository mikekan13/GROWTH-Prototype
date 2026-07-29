/**
 * WP1 acceptance — DAYA persona-harness storage (entity/memory/affect/world
 * models) + the affect service that absorbed the disposition prototype.
 *
 *  1. DayaEntity auto-creation: applying an affect event to a character with
 *     no DayaEntity yet creates one (create-if-missing upsert).
 *  2. Affect events move drives in the expected direction: a Frequency
 *     depletion raises stress/lowers morale; a subsequent death-save
 *     survival partially releases stress and raises grief.
 *  3. Each event writes a first-person HistoryEntry beat
 *     (subjectId = characterId, type = narrative_event).
 *  4. decayDrives halves correctly across one half-life, and
 *     renderDispositionLine's thresholds render the expected words — both
 *     pure, no DB.
 *
 * Uses a throwaway NPC character prefixed '__TEST_DAYA__', cleaned before
 * and after. Run: npx tsx scripts/test-daya-wp1.ts
 */
import './_server-only-shim';
import { prisma } from '../src/lib/db';
import {
  applyDispositionEvent,
  decayDrives,
  renderDispositionLine,
  DISPOSITION_TUNING,
} from '../src/services/daya-affect';
import type { GrowthCharacter } from '../src/types/growth';

let failures = 0;
function check(label: string, ok: boolean, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

const TEST_NAME = '__TEST_DAYA__ Probe';

async function cleanupStale() {
  const stale = await prisma.character.findMany({ where: { name: TEST_NAME }, select: { id: true } });
  for (const c of stale) {
    const entity = await prisma.dayaEntity.findUnique({ where: { characterId: c.id }, select: { id: true } });
    if (entity) {
      await prisma.dayaMemoryEntry.deleteMany({ where: { entityId: entity.id } });
      await prisma.dayaAffect.deleteMany({ where: { entityId: entity.id } });
      await prisma.dayaBelievedSheet.deleteMany({ where: { entityId: entity.id } });
      await prisma.dayaRelationship.deleteMany({ where: { entityId: entity.id } });
      await prisma.dayaEntity.delete({ where: { id: entity.id } });
    }
    await prisma.historyEntry.deleteMany({ where: { subjectId: c.id } });
    await prisma.character.delete({ where: { id: c.id } });
  }
}

async function main() {
  console.log('WP1 DAYA persona-harness storage\n' + '─'.repeat(50));

  await cleanupStale();

  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  const campaign = await prisma.campaign.findFirst({ where: { name: { not: '__PRIME__' } } });
  if (!admin || !campaign) {
    console.error('Missing prerequisites (need an ADMIN user + a non-Prime campaign) — run npm run seed:all.');
    process.exit(1);
  }

  const minimalSheet: Partial<GrowthCharacter> = {
    attributes: {
      frequency: { level: 10, current: 10 },
    } as GrowthCharacter['attributes'],
  };

  const character = await prisma.character.create({
    data: {
      name: TEST_NAME,
      entityType: 'NPC',
      userId: admin.id,
      campaignId: campaign.id,
      data: JSON.stringify(minimalSheet),
      status: 'ACTIVE',
    },
  });

  try {
    // ── 1. DayaEntity auto-creation ────────────────────────────────────
    const preEntity = await prisma.dayaEntity.findUnique({ where: { characterId: character.id } });
    check('no DayaEntity before first event', preEntity === null);

    await applyDispositionEvent(character.id, {
      kind: 'frequency_depleted',
      amount: 8,
      current: 2,
      max: 10,
    });

    const entity = await prisma.dayaEntity.findUnique({ where: { characterId: character.id } });
    check('DayaEntity auto-created on first affect event', !!entity);

    const afterDeplete = await prisma.dayaAffect.findUnique({ where: { entityId: entity!.id } });
    check('affect row created', !!afterDeplete);
    check('frequency_depleted: stress rose', (afterDeplete?.stress ?? 0) > 0, `stress=${afterDeplete?.stress}`);
    check('frequency_depleted: morale fell', (afterDeplete?.morale ?? 0) < 0, `morale=${afterDeplete?.morale}`);
    const stressAfterDeplete = afterDeplete?.stress ?? 0;
    const griefAfterDeplete = afterDeplete?.grief ?? 0;

    // ── 2. death_save_survived: stress partially releases, grief rises ──
    await applyDispositionEvent(character.id, { kind: 'death_save_survived' });
    const afterSurvive = await prisma.dayaAffect.findUnique({ where: { entityId: entity!.id } });
    check('death_save_survived: stress dropped from the depleted peak', (afterSurvive?.stress ?? 0) < stressAfterDeplete,
      `before=${stressAfterDeplete} after=${afterSurvive?.stress}`);
    check('death_save_survived: stress still positive (partial release, not zeroed)', (afterSurvive?.stress ?? 0) > 0,
      `stress=${afterSurvive?.stress}`);
    check('death_save_survived: grief rose', (afterSurvive?.grief ?? 0) > griefAfterDeplete,
      `before=${griefAfterDeplete} after=${afterSurvive?.grief}`);

    // ── 3. HistoryEntry beats written from the character's perspective ──
    const beats = await prisma.historyEntry.findMany({
      where: { subjectId: character.id, subjectType: 'character', type: 'narrative_event' },
      orderBy: { realTime: 'asc' },
    });
    check('two narrative_event HistoryEntry beats written', beats.length === 2, `count=${beats.length}`);
    check('beats belong to this campaign', beats.every(b => b.campaignId === campaign.id));

    // ── 4. Pure math: decayDrives + renderDispositionLine ───────────────
    const decayed = decayDrives({ morale: 0.8, stress: 0.8, grief: 0.8 }, DISPOSITION_TUNING.halfLifeCycles);
    check('decayDrives halves across one half-life', Math.abs(decayed.stress - 0.4) < 1e-9, `stress=${decayed.stress}`);
    check('decayDrives halves all three drives identically', decayed.morale === decayed.stress && decayed.stress === decayed.grief);

    const noElapsed = decayDrives({ morale: 0.5, stress: 0.5, grief: 0.5 }, 0);
    check('decayDrives no-op at 0 elapsed cycles', noElapsed.stress === 0.5);

    check('renderDispositionLine: null at baseline', renderDispositionLine({ morale: 0, stress: 0, grief: 0 }) === null);
    check('renderDispositionLine: null input -> null', renderDispositionLine(null) === null);
    const highStress = renderDispositionLine({ morale: 0, stress: 0.8, grief: 0, } as never);
    check('renderDispositionLine: high stress renders "hair trigger"', !!highStress && highStress.includes('hair trigger'), highStress ?? 'null');
    const lowMorale = renderDispositionLine({ morale: -0.6, stress: 0, grief: 0 } as never);
    check('renderDispositionLine: low morale renders "defeated"', !!lowMorale && lowMorale.includes('defeated'), lowMorale ?? 'null');
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
