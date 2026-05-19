# Item Fields Audit — Canon vs Current Implementation
**Date:** 2026-05-14
**Scope:** Compare item field set in `app/src/types/item.ts` and inventory displays against GRO.WTH Repository canon. Read-only.

---

## 1. Canonical field set

### Universal (all items) — per `Equipment_Conditions.md`, `Material_System.md`, `Inventory_and_Encumbrance_System.md`, rulebook §9
- **Name** (item-level, on `CampaignItem`, not on `GrowthWorldItem`)
- **Type** (weapon / armor / accessory / consumable / tool / artifact / prima_materia / misc — item-level)
- **Description** — universal
- **Primary Material** — `Material_System.md:33`, `rulebook §9.1`
- **Subordinate Materials** (combination formula) — `Material_System.md:108-119, 122-128`. **Not a single string, can be multiple.**
- **Base Resist** (derived from material combo) — `Material_System.md:33-34, 110`; rulebook §9.1.
- **Material Type Class** (Soft / Hard / Hybrid) — `Material_System.md:37-40`
- **Material Modifiers** (Dampening, Resistant, Proof, Vulnerable, Intolerance, Flexible X, Restrictive, Protective, Brittle/Fragile, Sharp, Absorbent, Flammable, Combustible, Unrepairable) — `Material_System.md:72-91`
- **Weight Category** (1–5, paper system) — `Material_System.md:51-68`, rulebook §9.1. NOTE: memory `weight-system-stripped-actual-lbs.md` says migrating to actual lbs; current type uses 0–10 (paper §9.6 `Inventory_System` scale). **Two scales exist in canon (1–5 material, 0–10 inventory). Ambiguity flagged.**
- **Condition** (5-level 0–4: Destroyed, Broken, Worn, Undamaged, Indestructible) — `Equipment_Conditions.md:11-46`, ruling r-2026-04-22-12.
- **Rarity Tier** (1–10, Ubiquitous → Impossible) — `Material_System.md:43`. Current type uses 6 named buckets, not 1–10.
- **KV / Value** (graded per-item, ≥1) — rulebook §9.5, r-2026-04-22-15.
- **Crafting Quality** (Poor / Standard / Superior / Masterwork) — `Weapon_System.md:89-92`. Applies to items broadly.
- **Equipped state** — `inventory-paperdoll.md` (per-character).
- **Equipped Slot** (body-part location when equipped) — `inventory-paperdoll.md`. Customizable per Seed.

### Weapon-specific — `Weapon_System.md`, `Weapon_Examples_Table.md`, rulebook §9.2
- **Damage string** P:S:H/D\C:B:E — `Weapon_System.md:17-28`
- **Target Attribute** — `Weapon_System.md:33, 43-66`, rulebook §9.2
- **Range** (melee / short / medium / long / specific ft) — `Weapon_System.md:60-66`
- **Weapon Size Category** (Light / Medium / Heavy / Ranged) — `Weapon_Examples_Table.md` "Size Categories"
- **Combat Skill Required** (Sword Fighting, Archery, etc.) — `Weapon_Examples_Table.md` "Combat Skills Required"; `Weapon_System.md:97-102`
- **Weapon Properties** (Unblockable, Brittle, Strong, Regenerating X, Sharp, Blunt, Flexible) — `Weapon_System.md:71-79`
- **Ammo / Shots / Reload** — implied in firearm/crossbow examples `Weapon_System.md:60-66` (".38 Revolver: 6 shots, 50ft range"). Not in repo as a formal field; flag as soft canon.
- **Scaling rule** (some weapons add wielder attribute level to damage) — `Weapon_System.md:34`

### Armor-specific — `Armor_System.md`, rulebook §9.4
- **Armor Category** (Clothing / Light / Heavy) — `Armor_System.md:32-48`
- **Layer count** (current layers, max layers — 3 for Clothing, 1 otherwise) — `Armor_System.md:52-68`
- **Coverage / Covered Parts** (full / partial / specific hit locations) — `Armor_System.md:71-74`
- **Effective Resist** (after multiplier + layering + condition) — `Armor_System.md:32-68`, ruling r-2026-04-22-14
- **Mobility Penalty** (Heavy = -1 Celerity) — `Armor_System.md:46-47`
- **Stealth / Climate / Swim modifiers** — `Armor_System.md:88-91`

### Prima Materia-specific
- **Magic School**, **Power Level (1–10)**, **Stable/Unstable**, **Charges** — present in type already; canon location is broader Prima Materia system (not in 03_ITEMS_CRAFTING).

### Inventory-level (carry math) — `Inventory_System.md`, rulebook §9.6
- Carry Level = Clout — universal; lives on character, not item. Implementation correct (`InventoryCard` uses `vitals.carryLevel`).

---

## 2. Current type fields (`app/src/types/item.ts:9-55`)

`GrowthWorldItem`: description, material, weightLevel (0–10), condition, rarity (6-bucket enum), value, notes, damage{P,S,H,D,C,B,E}, range, weaponProperties[], targetAttribute, armorLayer ('clothing'|'lightArmor'|'heavyArmor'), resistance, coveredParts[], materialModifiers[], primaMateria{school,level,stable,charges}, equipped, tags[].

`HeldItemData`: id, name, type, status, data.

---

## 3. Gap table

| Canonical field | In type? | InventorySection? | InventoryCard popup? | Where missing |
|---|---|---|---|---|
| Subordinate materials (multi) | No (single string only) | No | No | type + both displays |
| Material type class (Soft/Hard/Hybrid) | No | No | No | type + popup |
| Base Resist (non-armor) | No (only `resistance` on armor) | No | No | type + popup |
| Crafting Quality (Poor/Std/Superior/Masterwork) | No | No | No | type + popup |
| Rarity Tier 1–10 (canon scale) | Partial (6-bucket only) | Color-only | Label-only | type uses non-canon scale |
| Weight scale ambiguity (1–5 material vs 0–10 inventory vs lbs) | weightLevel 0–10 only | Shown | Shown | flag — needs Mike ruling |
| Equipped slot (which body slot) | No | No (just "Equipped" badge) | No | type + paperdoll wiring |
| Weapon size category (Light/Medium/Heavy/Ranged) | No | No | No | type + popup |
| Combat skill required | No | No | No | type + popup |
| Ammo / shots / reload | No | No | No | type + popup (flag: soft canon) |
| Scaling rule (adds attribute to dmg) | No | No | No | type + popup |
| Armor layer count (current/max) | No | No | No | type + popup |
| Mobility penalty (Heavy -1 Cel) | No (implicit via armorLayer) | No | No | popup display |
| Stealth/climate/swim notes | No | No | No | popup (low-priority) |
| Condition | Yes | Yes | Yes | OK |
| Damage string | Yes | Yes | Yes | OK |
| Range | Yes | No | Yes | InventorySection |
| Target attribute | Yes | No | Yes | InventorySection |
| Weapon properties | Yes | No | Yes | InventorySection |
| Material modifiers | Yes | No | Yes | InventorySection |
| Armor coverage | Yes | No | Yes | InventorySection |
| Primary material | Yes | Yes | Yes (compact line) | OK |
| KV / value | Yes | No | Yes (compact) | InventorySection (low) |

---

## 4. Recommended fixes (display + type only; no schema/DB)

**`app/src/types/item.ts`** — add optional fields to `GrowthWorldItem`:
- Universal: `subordinateMaterials?: string[]`, `materialClass?: 'soft'|'hard'|'hybrid'`, `baseResist?: number`, `craftingQuality?: 'poor'|'standard'|'superior'|'masterwork'`, `equippedSlot?: string`, `rarityTier?: number` (1–10, keep `rarity` for back-compat).
- Weapon-only: `weaponSize?: 'light'|'medium'|'heavy'|'ranged'`, `combatSkill?: string`, `ammo?: { capacity: number; remaining: number; reload?: string }`, `damageScaling?: { addsAttribute?: string }`.
- Armor-only: `armorLayers?: { current: number; max: number }`, `mobilityPenalty?: { attribute: string; value: number }`.
- Update `WEAPON_PROPERTIES` const — add `'Unblockable' | 'Brittle' | 'Strong' | 'Regenerating' | 'Sharp' | 'Blunt' | 'Flexible'` already present; no change.
- Update `BODY_PARTS` to match `inventory-paperdoll.md`: humanoid default is 10 slots (Head, Body, U/L L/R Arm, U/L L/R Leg) — current 4-bucket list is too coarse for the paperdoll vision.

**`app/src/components/character/InventorySection.tsx`** — `ItemRow` (lines ~83+):
- Add weapon line: range, targetAttribute, weaponProperties (chips).
- Add armor line: coveredParts.
- Add universal: materialModifiers chips, craftingQuality badge, equippedSlot.

**`app/src/components/canvas/InventoryCard.tsx`** — popup detail (line ~270+):
- Add Crafting Quality block, Subordinate Materials list, Base Resist (universal), Equipped Slot.
- Weapon block: add Size Category, Combat Skill, Ammo, Scaling.
- Armor block: add Layers (current/max), Mobility Penalty.

---

## 5. Notes for Mike

1. **Weight scale conflict.** Three canonical scales coexist:
   - Material Weight Category 1–5 (`Material_System.md` table)
   - Inventory Weight Level 0–10 (`Inventory_System.md` §Weight Level Scale)
   - Actual lbs (memory `weight-system-stripped-actual-lbs.md`, your 2026-05-13 framing)
   Current `weightLevel: 0–10` matches the inventory scale. Migrating to lbs is documented as intent but not yet ruled. Need a single ruling.

2. **Rarity scale conflict.** Canon says Rarity Tier 1–10 (`Material_System.md:43`). Type uses 6 named buckets ('common'…'artifact'). Mapping is not 1:1. Either rename in type to 1–10 or document the mapping.

3. **`Weapon_Examples_Table.md` is `#needs-review`** (header line 2026-05-03). Its "Size Categories" and "Combat Skills Required" lists are not in `#validated` files yet — treat as soft canon.

4. **Ammo / shots / reload** are mentioned only in flavor in `Weapon_System.md:60-66` (firearm examples). No formal rule exists. If you want this in the UI, it needs a ruling.

5. **Equipped paperdoll is canon but not wired.** `inventory-paperdoll.md` defines per-Seed body-part slots. Current implementation has only a boolean `equipped`, no `equippedSlot`. The `BODY_PARTS` const in `item.ts:71-76` is a 4-bucket coverage list, not the 10-slot humanoid paperdoll — different concept.

6. **Item KV is graded, not formulaic** (rulebook §9.5, r-2026-04-22-15). The `value` field should be a graded number, not computed. Current type matches canon. No change needed beyond documentation.

7. **Material `subordinateMaterials` field absence** means the combination formula in `Material_System.md:110` can't be represented. Today's UI only shows one material string.

8. **Removed/stale fields:** `Tech Level` was stripped (r-2026-04-22-13); type correctly does not include it. `WTH Wealth Level` removed (memory `wth-removed.md`); type correctly does not include it.

---
**End of audit.**
