/**
 * Woven-spell pipeline acceptance (r-2026-07-22-01 #5) — player request →
 * GM approve (godhead-authored mechanics via modifiedData) → learnSpell →
 * knownSpells → woven cast of the learned spell.
 *
 *  1. Player request is INTENT-ONLY (no dr/manaCost) and validates.
 *  2. Additive-DR invariant: total ≠ sum of parts is rejected.
 *  3. GM approve with authored mechanics → draft ForgeItem('spell').
 *  4. Teaching an intent-only (unauthored) spell is rejected.
 *  5. learnSpell lands the spell in magic.<primary-school-pillar>.knownSpells
 *     with requiresSystemReview derived from config; duplicate learn rejected.
 *  6. The learned spell's params drive a woven executeCast.
 *
 * NO KRMA moves anywhere in this pipeline (spell-learning pricing is a
 * pending Mike ruling — see NEEDS-MIKE).
 *
 * Run: npx tsx scripts/test-spell-pipeline.ts
 */
import './_server-only-shim';
import { prisma } from '../src/lib/db';
import { createPlayerRequest, resolvePlayerRequest, forgeSpellDataSchema } from '../src/services/forge';
import { learnSpell } from '../src/services/spell-grant';
import { executeCast } from '../src/services/magic-cast-ops';
import { getMagicCastingConfig } from '../src/services/economy-config';
import { MAGIC_SCHOOLS, type GrowthCharacter, type MagicSchool } from '../src/types/growth';

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

async function expectError(name: string, fn: () => Promise<unknown>) {
  try {
    await fn();
    check(name, false, 'expected an error, got success');
  } catch (err) {
    check(name, true, err instanceof Error ? err.message : String(err));
  }
}

const SPELL_NAME = 'Emberlight Ward (pipeline test)';
const SCHOOL: MagicSchool = 'Abjuration';
const AUTHORED = {
  description: 'A shimmering ward of ember-light that turns aside one incoming strike.',
  school: SCHOOL,
  schools: [SCHOOL],
  castingMethod: 'weaving',
  dr: { base: 10, duration: 2, total: 12 },
  manaCost: 2,
  failureConditions: 'The ward flickers out; the caster is dazzled for one round.',
  persistentEffects: [],
};

async function main() {
  const character = await prisma.character.findFirst({ where: { name: 'Test Pilgrim' } });
  if (!character?.campaignId) {
    console.error('Missing Test Pilgrim — run npm run seed:all.');
    process.exit(1);
  }
  const campaign = await prisma.campaign.findUnique({ where: { id: character.campaignId } });
  const gm = campaign ? await prisma.user.findUnique({ where: { id: campaign.gmUserId } }) : null;
  if (!campaign || !gm) {
    console.error('Missing campaign/GM.');
    process.exit(1);
  }
  const backup = character.data;
  const cleanupForgeIds: string[] = [];
  let requestId: string | undefined;

  try {
    // 1. Intent-only player request validates (mechanics come later).
    const request = await createPlayerRequest(campaign.id, gm.id, {
      type: 'spell',
      name: SPELL_NAME,
      data: { description: 'I want a ward that blocks one hit.', school: SCHOOL },
    });
    requestId = request.id;
    check('intent-only spell request accepted', request.status === 'pending');

    // 2. Additive-DR invariant enforced.
    const badDr = forgeSpellDataSchema.safeParse({
      ...AUTHORED, dr: { base: 10, duration: 2, total: 20 },
    });
    check('non-additive DR rejected', !badDr.success);

    // 3. GM approve with authored mechanics → draft ForgeItem('spell').
    const resolved = await resolvePlayerRequest(request.id, gm.id, gm.role, {
      status: 'approved',
      gmNotes: 'Authored via godhead chain (test fill).',
      modifiedData: AUTHORED,
    });
    check('approve creates a spell ForgeItem draft', !!resolved.forgeItemId);
    if (resolved.forgeItemId) cleanupForgeIds.push(resolved.forgeItemId);

    // 4. Unauthored (intent-only) spell cannot be taught.
    const unauthored = await prisma.forgeItem.create({
      data: {
        campaignId: campaign.id, type: 'spell', name: 'Unauthored Intent',
        status: 'draft', createdBy: gm.id,
        data: JSON.stringify({ description: 'vague wish', school: SCHOOL }),
      },
    });
    cleanupForgeIds.push(unauthored.id);
    await expectError('teaching an unauthored spell rejected', () =>
      learnSpell(gm.id, gm.role, { characterId: character.id, forgeItemId: unauthored.id }));

    // 5. Learn the authored spell.
    const learned = await learnSpell(gm.id, gm.role, {
      characterId: character.id, forgeItemId: resolved.forgeItemId!,
    });
    const expectedPillar = MAGIC_SCHOOLS[SCHOOL].pillar;
    check('spell lands in the primary school\'s pillar', learned.pillar === expectedPillar);
    const config = await getMagicCastingConfig();
    check('requiresSystemReview derived from config',
      learned.spell.requiresSystemReview === (AUTHORED.dr.total >= config.systemEngagementDR));
    const sheet = JSON.parse(
      (await prisma.character.findUnique({ where: { id: character.id } }))!.data,
    ) as GrowthCharacter;
    const known = sheet.magic?.[expectedPillar]?.knownSpells ?? [];
    check('knownSpells persisted', known.some((s) => s.name === SPELL_NAME));
    await expectError('duplicate learn rejected', () =>
      learnSpell(gm.id, gm.role, { characterId: character.id, forgeItemId: resolved.forgeItemId! }));

    // 6. Cast the learned spell (woven, spell params drive the cast).
    const spell = known.find((s) => s.name === SPELL_NAME)!;
    const cast = await executeCast(gm.id, gm.role, {
      characterId: character.id,
      schools: spell.schools ?? [spell.school],
      method: 'woven',
      dr: spell.dr!.total,
      manaSpent: 0,
      associatedSkillName: 'Weaving',
      spellName: spell.name,
    });
    check('learned spell drives a woven cast',
      cast.resolution.dr === 12 && !cast.resolution.monkeyPaw);
  } finally {
    await prisma.character.update({ where: { id: character.id }, data: { data: backup } });
    if (requestId) await prisma.playerRequest.deleteMany({ where: { id: requestId } });
    if (cleanupForgeIds.length) {
      await prisma.forgeItem.deleteMany({ where: { id: { in: cleanupForgeIds } } });
    }
  }

  console.log(failures === 0 ? '\nALL PASS' : `\n${failures} FAILURE(S)`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => { console.error(err); process.exit(1); });
