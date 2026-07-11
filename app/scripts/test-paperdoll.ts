/**
 * T26 acceptance — modular paperdoll backend.
 *
 *  1. Humanoid character exposes DERIVED regions (from the body tree, no
 *     slot enum).
 *  2. Equipping armor to the torso makes it the OUTER damage layer in a
 *     real applyDamageToCharacter call (armor absorbs first, part takes
 *     the remainder, armor condition persists to the item row).
 *  3. Encumbrance status flips at the Clout×10 lbs threshold.
 *  4. A hand-built NON-HUMANOID body tree yields correct regions with
 *     zero code changes.
 *
 * Restores all mutated state afterward. Run: npx tsx scripts/test-paperdoll.ts
 */
import './_server-only-shim';
import { prisma } from '../src/lib/db';
import { deriveRegions } from '../src/lib/body-tree';
import { HUMAN_BASELINE_ANATOMY } from '../src/lib/body-damage';
import { listInventory, equipItem, unequipItem, encumbranceStatus } from '../src/services/inventory';
import { applyDamageToCharacter } from '../src/services/damage';
import { getCarryCapacityLbs } from '../src/types/material';
import type { GrowthWorldItem } from '../src/types/item';

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? '✓' : '✗'} ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

async function main() {
  const admin = await prisma.user.findFirst({ where: { role: 'ADMIN' } });
  const character = await prisma.character.findFirst({ where: { name: 'Test Pilgrim' } });
  if (!admin || !character || !character.campaignId) {
    console.error('Missing prerequisites (admin / Test Pilgrim) — run npm run seed:all.');
    process.exit(1);
  }
  const characterDataBackup = character.data;

  // ── 1. Derived humanoid regions ─────────────────────────────────────
  const inv0 = await listInventory(character.id, admin.id, admin.role);
  const keys = inv0.regions.map(r => r.key);
  check('humanoid: regions derived from body tree', keys.length >= 3, keys.join(', '));
  check('humanoid: Torso region present', keys.some(k => k.endsWith('/Torso')));
  const torsoKey = keys.find(k => k.endsWith('/Torso'))!;

  // ── 2. Armor becomes the outer damage layer ─────────────────────────
  const armorData: GrowthWorldItem & { armorCategory: string } = {
    name: 'Test Breastplate',
    description: 'T26 acceptance armor',
    baseResist: 4,
    condition: 3,
    weightLbs: 20,
    materialClass: 'Hard',
    armorCategory: 'Heavy', // effective resist 4 × 1.5 = 6
  } as unknown as GrowthWorldItem & { armorCategory: string };

  const armorRow = await prisma.campaignItem.create({
    data: {
      campaignId: character.campaignId,
      name: 'Test Breastplate',
      type: 'armor',
      data: JSON.stringify(armorData),
      holderId: character.id,
      createdBy: admin.id,
    },
  });

  try {
    await equipItem(character.id, { itemId: armorRow.id, partKey: torsoKey }, admin.id, admin.role);
    const inv1 = await listInventory(character.id, admin.id, admin.role);
    check('equip: armor lands in the equipped tier', inv1.equipped.some(i => i.id === armorRow.id));

    // Reset body + armor between damage scenarios (keeps armor equipped).
    async function resetState() {
      await prisma.character.update({ where: { id: character!.id }, data: { data: characterDataBackup } });
      const row = await prisma.campaignItem.findUnique({ where: { id: armorRow.id } });
      const d = JSON.parse(row!.data) as Record<string, unknown>;
      d.condition = 3;
      await prisma.campaignItem.update({
        where: { id: armorRow.id },
        data: { data: JSON.stringify(d), status: 'ACTIVE' },
      });
    }

    // Damage-type × material matrix (Damage_Type_Interactions.md, #validated).
    // The breastplate is Heavy (eff. resist 4×1.5 = 6) + Hard material.

    // (a) PIERCING vs Hard: absorbs, NO condition loss — a spear thrust
    //     doesn't degrade a steel plate. 16 piercing → Body 4 → plate
    //     absorbs 6 (12 in, not overwhelming) → torso sees 6, dealt 1.
    const pierce = await applyDamageToCharacter(admin.id, admin.role, {
      characterId: character.id,
      damageType: 'piercing',
      amount: 16,
      piercingTargetPath: ['Torso'],
    });
    const pierceHit = pierce.wornDamage.find(w => w.itemId === armorRow.id);
    check('piercing: armor absorbed FIRST (outer layer)', !!pierceHit && pierceHit.effectiveResist === 6, JSON.stringify(pierceHit));
    check('piercing: passed 6 through (12 in − 6 resist)', pierceHit?.damageDealt === 6, String(pierceHit?.damageDealt));
    check('piercing: NO condition loss vs Hard material', pierceHit?.brokeTier === false && pierceHit?.conditionAfter === 3, String(pierceHit?.conditionAfter));
    const torsoEvent = pierce.events.find(e => e.partName === 'Torso');
    check('piercing: torso saw 6 (armored), dealt 1 past its resist 5', !!torsoEvent && torsoEvent.damageDealt === 1, JSON.stringify(torsoEvent));
    await resetState();

    // (b) BASHING vs Hard: condition −1 when dmg ≥ resist — the plate dents.
    //     16 bashing → Body 4 → even-split Head/Torso 6 each → plate: 6 ≥ 6.
    const bash = await applyDamageToCharacter(admin.id, admin.role, {
      characterId: character.id,
      damageType: 'bashing',
      amount: 16,
    });
    const bashHit = bash.wornDamage.find(w => w.itemId === armorRow.id);
    check('bashing: dents Hard armor at threshold (tier 3→2)', bashHit?.brokeTier === true && bashHit?.conditionAfter === 2, JSON.stringify(bashHit));
    const armorAfterBash = JSON.parse((await prisma.campaignItem.findUnique({ where: { id: armorRow.id } }))!.data) as { condition?: number };
    check('bashing: armor condition PERSISTED to item row', armorAfterBash.condition === 2, String(armorAfterBash.condition));
    await resetState();

    // (c) ENERGY: bypasses ALL materials — the plate is transparent,
    //     no absorption, no condition loss, no worn event.
    const zap = await applyDamageToCharacter(admin.id, admin.role, {
      characterId: character.id,
      damageType: 'energy',
      amount: 16,
    });
    check('energy: armor is transparent (no worn interaction)', zap.wornDamage.length === 0, JSON.stringify(zap.wornDamage));
    await resetState();

    // (d) OVERWHELMING: dmg ≥ 3× resist destroys the item instantly.
    //     40 bashing → Body 4 → split 18 each → plate: 18 ≥ 3×6 → destroyed,
    //     12 continues (18 − 6).
    const smash = await applyDamageToCharacter(admin.id, admin.role, {
      characterId: character.id,
      damageType: 'bashing',
      amount: 40,
    });
    const smashHit = smash.wornDamage.find(w => w.itemId === armorRow.id);
    check('overwhelming: 3× resist destroys the plate outright', smashHit?.destroyed === true && smashHit?.conditionAfter === 0, JSON.stringify(smashHit));
    check('overwhelming: resist-reduced remainder continued (12)', smashHit?.damageDealt === 12, String(smashHit?.damageDealt));
    const armorAfterSmash = await prisma.campaignItem.findUnique({ where: { id: armorRow.id } });
    check('overwhelming: item row marked DESTROYED', armorAfterSmash?.status === 'DESTROYED', armorAfterSmash?.status);
    await resetState();

    // ── 3. Encumbrance threshold at Clout×10 ──────────────────────────
    const charData = JSON.parse(characterDataBackup) as { attributes?: { clout?: { level?: number } } };
    const clout = charData.attributes?.clout?.level ?? 0;
    const capacity = getCarryCapacityLbs(clout);
    check(`encumbrance: capacity = Clout(${clout})×10 = ${capacity} lbs`, inv0.encumbrance.capacityLbs === capacity);
    check('encumbrance: pure-function thresholds flip at capacity',
      encumbranceStatus(capacity, capacity) === 'Near Limit'
      && encumbranceStatus(capacity + 1, capacity) === 'Encumbered'
      && encumbranceStatus(Math.ceil(capacity * 1.26), capacity) === 'Overloaded'
      && encumbranceStatus(Math.floor(capacity * 0.5), capacity) === 'Fine');
    const inv2 = await listInventory(character.id, admin.id, admin.role);
    check('encumbrance: equipped armor counts toward total lbs', inv2.encumbrance.totalLbs >= 20, `${inv2.encumbrance.totalLbs} lbs`);

    // ── 4. Non-humanoid tree — zero code changes ──────────────────────
    const serpent: GrowthWorldItem = {
      name: 'Serpent Body',
      description: '',
      isBodyPart: true,
      partName: 'Serpent',
      baseResist: 3,
      condition: 3,
      contains: [
        { name: 'Head', description: '', isBodyPart: true, partName: 'Head', baseResist: 4, condition: 3, contains: [
          { name: 'Venom Gland', description: '', isBodyPart: true, partName: 'Venom Gland', baseResist: 1, condition: 3 } as GrowthWorldItem,
        ] } as GrowthWorldItem,
        { name: 'Coil A', description: '', isBodyPart: true, partName: 'Coil A', baseResist: 3, condition: 3 } as GrowthWorldItem,
        { name: 'Coil B', description: '', isBodyPart: true, partName: 'Coil B', baseResist: 3, condition: 3 } as GrowthWorldItem,
        { name: 'Tail', description: '', isBodyPart: true, partName: 'Tail', baseResist: 2, condition: 3 } as GrowthWorldItem,
      ],
    } as GrowthWorldItem;
    const serpentRegions = deriveRegions(serpent);
    check('non-humanoid: hand-built tree derives its own regions',
      serpentRegions.map(r => r.key).join('|') === 'Serpent|Serpent/Head|Serpent/Head/Venom Gland|Serpent/Coil A|Serpent/Coil B|Serpent/Tail',
      serpentRegions.map(r => r.key).join(', '));
    check('sanity: humanoid default derives Body/Head/Torso spine',
      deriveRegions(HUMAN_BASELINE_ANATOMY as GrowthWorldItem).some(r => r.key === 'Body/Torso'));

    // Unequip round-trip
    await unequipItem(character.id, { itemId: armorRow.id }, admin.id, admin.role);
    const inv3 = await listInventory(character.id, admin.id, admin.role);
    check('unequip: armor back in carried tier', inv3.carried.some(i => i.id === armorRow.id) && !inv3.equipped.some(i => i.id === armorRow.id));
  } finally {
    // ── Cleanup: restore character data (undo damage), delete test armor ──
    await prisma.character.update({ where: { id: character.id }, data: { data: characterDataBackup } });
    await prisma.campaignItem.delete({ where: { id: armorRow.id } }).catch(() => null);
  }

  console.log(`\n${failures === 0 ? 'PASS' : `FAIL — ${failures} check(s) failed`}`);
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(err => { console.error(err); process.exit(1); });
