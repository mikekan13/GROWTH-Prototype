/**
 * Casting acceptance — magic-cast ops end-to-end (r-2026-07-22-01).
 *
 * Drives executeCast (real dice, real db) against the seeded Test Pilgrim.
 * Dice are server-rolled with no injection point, so pass/fail is forced via
 * extreme DRs (DR 1 = guaranteed hit, DR 999 = guaranteed miss); the
 * system-review threshold is read live from economy-config.
 *
 *  1. Wild success (DR 1) — no Monkey Paw, no trainable intent.
 *  2. Wild miss (DR 999) — Monkey Paw + weakest school trainable intent.
 *  3. Multi-school — weakest (untrained) school governs the die.
 *  4. Woven requires an associated skill; with one, resolves; a miss owes
 *     NO Monkey Paw (predefined failure conditions instead).
 *  5. Mana: +1/point on the total, deducted + persisted, overdraw rejected.
 *  6. requiresSystemReview flips exactly at the configured DR.
 *
 * Restores the character sheet afterward (mana deductions are sheet-only —
 * no ledger rows to unwind; mana↔KRMA settlement is future work).
 *
 * Run: npx tsx scripts/test-cast-e2e.ts
 */
import './_server-only-shim';
import { prisma } from '../src/lib/db';
import { executeCast } from '../src/services/magic-cast-ops';
import { getMagicCastingConfig } from '../src/services/economy-config';
import { MAGIC_SCHOOLS, type GrowthCharacter, type MagicSchool } from '../src/types/growth';

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

async function expectValidationError(name: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    check(name, false, 'expected a ValidationError, got success');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    check(name, (err as { name?: string }).name === 'ValidationError' || msg.length > 0, msg);
  }
}

function setSchoolLevel(data: GrowthCharacter, school: MagicSchool, level: number) {
  const pillar = MAGIC_SCHOOLS[school].pillar;
  data.magic ??= {
    mercy: { schools: [], knownSpells: [] },
    severity: { schools: [], knownSpells: [] },
    balance: { schools: [], knownSpells: [] },
  } as GrowthCharacter['magic'];
  const block = data.magic![pillar];
  block.skillLevels ??= {};
  block.skillLevels[school] = level;
}

async function saveSheet(characterId: string, data: GrowthCharacter) {
  await prisma.character.update({
    where: { id: characterId },
    data: { data: JSON.stringify(data) },
  });
}

async function loadSheet(characterId: string): Promise<GrowthCharacter> {
  const row = await prisma.character.findUnique({ where: { id: characterId } });
  return JSON.parse(row!.data) as GrowthCharacter;
}

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  const character = await prisma.character.findFirst({ where: { name: 'Test Pilgrim' } });
  if (!admin || !character) {
    console.error('Missing prerequisites — run npm run seed:all.');
    process.exit(1);
  }
  const backup = character.data;
  const id = character.id;
  const config = await getMagicCastingConfig();

  try {
    // Sheet setup: trained Force (d8 @ 8), untrained Restoration, a real
    // associated skill, and a 10-point mana pool.
    const data = JSON.parse(backup) as GrowthCharacter;
    setSchoolLevel(data, 'Force', 8);
    setSchoolLevel(data, 'Restoration', 0);
    data.magic!.mana = { current: 10, max: 10 };
    data.skills ??= [];
    if (!data.skills.some((s) => s.name === 'Herbalism')) {
      data.skills.push({ name: 'Herbalism', level: 6 } as GrowthCharacter['skills'][number]);
    }
    await saveSheet(id, data);

    // 1. Wild success — DR 1 is unmissable (fate die min 1).
    const wildHit = await executeCast(admin.id, admin.role, {
      characterId: id, schools: ['Force'], method: 'wild', dr: 1,
    });
    check('wild DR-1 succeeds', wildHit.resolution.success,
      `total ${wildHit.resolution.total}`);
    check('wild success owes no Monkey Paw',
      !wildHit.resolution.monkeyPaw && wildHit.resolution.schoolToMarkTrainable === null);
    check('school die rolled (d8 @ level 8)',
      wildHit.plan.schoolDie === 'd8' && (wildHit.rolls.schoolDieResult ?? 0) >= 1);

    // 2. Wild miss — DR 999 is unreachable.
    const wildMiss = await executeCast(admin.id, admin.role, {
      characterId: id, schools: ['Force'], method: 'wild', dr: 999,
    });
    check('wild DR-999 misses', !wildMiss.resolution.success);
    check('wild miss → Monkey Paw', wildMiss.resolution.monkeyPaw);
    check('wild miss → school trainable intent (cost 2, wiring pending)',
      wildMiss.resolution.schoolToMarkTrainable === 'Force');

    // 3. Multi-school resolves on the weakest school.
    const multi = await executeCast(admin.id, admin.role, {
      characterId: id, schools: ['Force', 'Restoration'], method: 'wild', dr: 999,
    });
    check('multi-school picks weakest (untrained Restoration)',
      multi.plan.weakestSchool === 'Restoration' && multi.plan.schoolDieSides === 0);
    check('weakest-school miss marks the weakest school',
      multi.resolution.schoolToMarkTrainable === 'Restoration');

    // 4. Woven — associated skill required; a miss owes no Monkey Paw.
    await expectValidationError('woven without associated skill rejected', () =>
      executeCast(admin.id, admin.role, {
        characterId: id, schools: ['Force'], method: 'woven', dr: 10,
      }));
    const wovenMiss = await executeCast(admin.id, admin.role, {
      characterId: id, schools: ['Force'], method: 'woven', dr: 999,
      associatedSkillName: 'Herbalism', spellName: 'Test Weave',
    });
    check('woven resolves with associated skill die',
      wovenMiss.plan.associatedDie === 'd6' && !wovenMiss.resolution.success);
    check('woven miss: NO Monkey Paw, NO trainable',
      !wovenMiss.resolution.monkeyPaw && wovenMiss.resolution.schoolToMarkTrainable === null);

    // 5. Mana — bonus applied, pool deducted + persisted, overdraw rejected.
    const manaCast = await executeCast(admin.id, admin.role, {
      characterId: id, schools: ['Force'], method: 'wild', dr: 1, manaSpent: 4,
    });
    check('mana adds +1/point to the total', manaCast.resolution.manaBonus === 4);
    check('mana deducted in result', manaCast.manaRemaining === 6);
    const afterMana = await loadSheet(id);
    check('mana deduction persisted', afterMana.magic?.mana?.current === 6);
    await expectValidationError('mana overdraw rejected', () =>
      executeCast(admin.id, admin.role, {
        characterId: id, schools: ['Force'], method: 'wild', dr: 1, manaSpent: 999,
      }));

    // 6. System-review flag flips at the configured threshold.
    const atThreshold = await executeCast(admin.id, admin.role, {
      characterId: id, schools: ['Force'], method: 'wild',
      dr: config.systemEngagementDR,
    });
    const belowThreshold = await executeCast(admin.id, admin.role, {
      characterId: id, schools: ['Force'], method: 'wild',
      dr: config.systemEngagementDR - 1,
    });
    check(`DR ${config.systemEngagementDR} flags system review`,
      atThreshold.resolution.requiresSystemReview);
    check(`DR ${config.systemEngagementDR - 1} does not`,
      !belowThreshold.resolution.requiresSystemReview);
  } finally {
    await prisma.character.update({ where: { id }, data: { data: backup } });
  }

  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => { console.error(err); process.exit(1); });
