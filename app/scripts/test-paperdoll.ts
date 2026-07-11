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

    // Piercing 16 targeted at the torso. Cascade:
    //   Body envelope (resist 4)      absorbs 4 → 12 continue
    //   Breastplate (eff. resist 6)   absorbs 6 → 6 reach the torso   ← OUTER LAYER for its region
    //   Torso (resist 5)              absorbs 5 → 1 dealt, tier drops
    // Without the armor the torso would have seen 12, not 6.
    const dmg = await applyDamageToCharacter(admin.id, admin.role, {
      characterId: character.id,
      damageType: 'piercing',
      amount: 16,
      piercingTargetPath: ['Torso'],
    });
    const armorHit = dmg.wornDamage.find(w => w.itemId === armorRow.id);
    check('damage: armor absorbed FIRST (outer layer for its region)', !!armorHit, JSON.stringify(armorHit));
    check('damage: armor effective resist = base×1.5 (Heavy)', armorHit?.effectiveResist === 6, String(armorHit?.effectiveResist));
    check('damage: armor passed 6 through (12 in − 6 resist)', armorHit?.damageDealt === 6, String(armorHit?.damageDealt));
    const torsoEvent = dmg.events.find(e => e.partName === 'Torso');
    check('damage: torso saw 6 (armored), dealt 1 past its resist 5', !!torsoEvent && torsoEvent.damageDealt === 1, JSON.stringify(torsoEvent));
    check('damage: armor condition tier dropped', armorHit?.conditionAfter === 2);
    const armorAfter = await prisma.campaignItem.findUnique({ where: { id: armorRow.id } });
    const armorAfterData = JSON.parse(armorAfter!.data) as { condition?: number };
    check('damage: armor condition PERSISTED to item row', armorAfterData.condition === 2, String(armorAfterData.condition));

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
      isBodyPart: true,
      partName: 'Serpent',
      baseResist: 3,
      condition: 3,
      contains: [
        { name: 'Head', isBodyPart: true, partName: 'Head', baseResist: 4, condition: 3, contains: [
          { name: 'Venom Gland', isBodyPart: true, partName: 'Venom Gland', baseResist: 1, condition: 3 } as GrowthWorldItem,
        ] } as GrowthWorldItem,
        { name: 'Coil A', isBodyPart: true, partName: 'Coil A', baseResist: 3, condition: 3 } as GrowthWorldItem,
        { name: 'Coil B', isBodyPart: true, partName: 'Coil B', baseResist: 3, condition: 3 } as GrowthWorldItem,
        { name: 'Tail', isBodyPart: true, partName: 'Tail', baseResist: 2, condition: 3 } as GrowthWorldItem,
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
