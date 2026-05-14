# Session Status — 2026-05-14 (end-of-session)

Orientation doc for next session. Supersedes the 2026-05-06 version.

---

## 🎯 Next session — single biggest goal

**Wire character creation end-to-end so a real character spawns with all values initialized from Seed + Root + Branches.** Once that pipeline is intact, we can actually test the systems we built.

What that requires:
- A handful of **test Roots** authored (no real ones exist yet)
- A handful of **test Branches** authored
- The character-creation pipeline applies Seed augs/Frequency/Fate Die/Fated Age, Root attribute/skill grants, Branch attribute/skill grants, and starting Nectars/Thorns
- Replaces the placeholder "Vex Thornwood" test character with a properly-generated character
- Lets the TKV calc see ALL the seed-contributed components (currently missing — see "Known TKV gaps" below)

Mike's exact framing: "we need to rig up the character creation so it initializes all the values based on the seed root and branches. This will mean we will need some test roots and branches generated and ensure the whole character creation process is complete to bring in an actual functioning character sheet for us to test."

---

## What landed this session (2026-05-11 → 2026-05-14)

### Forge picker spawn flow
- Canvas Tool Card "Item" button no longer opens a name prompt. Now opens a **Forge item picker** populated from `ForgeItem` blueprints (status=published) for the campaign.
- Iron Sword blueprint seeded into "The Prime Campaign" (`scripts/seed-example-item.ts`).
- Spawned items land at viewport's upper-third (visible), persisted via `data.x/y` in the JSON blob.
- Page-load reads stored x/y; falls back to old formula for legacy items.

### Inventory display — all canonical fields
- New `ItemAbility` interface (Nectars/Thorns for items — KV hidden from UI but folds into total item KV).
- `GrowthWorldItem` extended with: `primaryMaterial`, `subordinateMaterials[]`, `materialClass` (Soft/Hard ONLY — no Hybrid), `baseResist` (universal, 1-50), `properties[]` (universal, not weapon-specific), `quality` (1-10), `itemAbilities[]`, `armorCategory` (Clothing/Light/Heavy), `damageScaling`, `shots`, `reload`, `weightLbs`.
- Deprecated (kept for back-compat): `material`, `weightLevel`, `weaponProperties`, `materialModifiers`, `coveredParts`, `armorLayer`, `resistance`.
- Rarity now `ItemRarity | number` — supports both legacy enum AND canonical 1-10 tier.
- `getRarityColor` / `getRarityLabel` helpers handle both forms.
- Both `InventoryCard` (canvas popup) and `InventorySection` (character sheet) render all the new fields when populated.

### Weight system migrated to lbs
- `getCarryCapacityLbs(clout)` formula = `clout × 10 lbs`.
- `getItemWeightLbs(item)` returns `weightLbs` if set, else `weightLevel × 2` fallback for legacy items.
- Both inventory views display "X / Y lbs" with encumbrance status color.
- Old 10-level abstraction kept as fallback but new items use lbs.

### Drag-drop UX overhaul
- Inventory rows: mousedown → 5px threshold → portal-rendered ghost follows cursor → mouseup hit-tests for drop target via `document.elementFromPoint` + `data-character-id` attributes on CharacterCard and InventoryCard roots.
- Drop on **different character** → transfer to their inventory. Drop on **same inventory** → no-op (per Mike's spec). Drop on **empty canvas** → detach + position at drop point.
- Canvas-item drag (WorldItemCard) hit-test extended to include open inventory panels using real anchor math (`cardLeft + 436 + 88`, etc.) matching the actual panel render position.
- Both hit-tests use **rect-vs-rect overlap** (`|cx − tx| < c.w/2 + t.w/2`) so ANY part of the dragged item touching the target counts as a drop.

### Visual hover feedback (gold glow)
- Live `invDragHoverCharId` state tracks which character is under the cursor during inventory-row drag.
- `isDropTarget` flag passes to CharacterCard + InventoryCard for both inventory-drag AND canvas-item-drag flows.
- InventoryCard: 3px gold border + 24px outer glow + inset tint.
- CharacterCard: stacked `filter: drop-shadow()` chains (2 layers when hovered, same count as baseline depth shadows) — alpha-aware glow that follows the **complex non-rectangular shape** of the character sheet. `will-change: filter` keeps GPU layer warm during hover.
- Three earlier attempts taught us: rectangular `outline` cuts through the complex shape; triple stacked drop-shadows tank FPS; soft box-shadow is rectangular but acceptable for InventoryCard; drop-shadow with `will-change` is the right answer for CharacterCard.

### Item KV calculator
- `calculateItemKV` now prefers the item's explicit `value` field (the authored KV) over the rarity placeholder.
- Condition multiplier corrected per `Equipment_Conditions.md` (r-2026-04-22-12): conditions 3-4 = 100% value, 2 = 75%, 1 = 25%, 0 = 0%.
- Item Abilities KV folds into the item's total KV (hidden from UI per spec).

### Character TKV wiring
- `calculateCharacterTKV(character, heldItems)` now sums items into the total.
- Server-side `services/krma/evaluator.ts` mirrors the change.
- 3 call sites in `CampaignCanvas` updated to pull held items via `getHeldItemsForCharacter`.
- Item transfer re-stamps the affected character's TKV so the canvas badge updates immediately.
- **Null-safe access** added — character data with missing attributes (like Vex's null frequency) no longer crashes the calc silently.

### Vex Thornwood data patch
- Vex's `attributes.frequency` was null → contributed 0 to TKV.
- Patched in DB to `{level: 20, current: 12, augmentPositive: 0, augmentNegative: 0}`.
- `scripts/seed-test-character.ts` already populates frequency correctly — script not changed.

### Canon updates landed in `GRO.WTH Repository/` and pushed
(Committed and pushed earlier in session as `529124c`):
- Locked seed-authoring rules: formulas, exploits framing, governance
- New files: `Seed_KV_Formulas.md`, `GM_Flag_Mechanic.md`, `Block_Grading_Principles.md`
- Updated: `Seeds_Roots_Branches_System.md`, `KRMA_Costs_Table.md`, `Nectars_and_Thorns_System.md`
- Skill level/die rules corrected (levels 1-3 = flat +1/+2/+3, no d2/d3, die starts at level 4 = d4)

---

## Known TKV gaps (next session priority)

The current TKV calc sums: attribute LEVELS + skills + (baseResist × 2) + traits (parsed) + items.

**Missing from TKV** (these need wiring once character creation is complete):
1. **Attribute augs** — `augmentPositive` and `augmentNegative` from each attribute (each aug = 1 KRMA per locked formula)
2. **Fate Die KV** — d4=5, d6=10, d8=20, d12=40, d20=80 (lookup from `creation.seed.baseFateDie`)
3. **Fated Age KV** — `ceil(fatedAge × 0.5)` per the locked Approach 2 formula (lookup from seed)
4. **Seed-granted Nectars/Thorns** — characters don't currently get the seed's starting traits applied. Once they do, the existing `traits[]` parser will catch them.

Vex's TKV after my fix: **119** (without sword). The "right" TKV including seed contributions would be roughly:
- 119 (current) + augs (~10-15) + Fate Die (10 for d6) + Fated Age (40 for Human 80yr) + Nectars/Thorns (TBD) ≈ ~180-200+

---

## Open systems / features pending design

- **Body composition system** — modular, custom bodies are coming. Currently only HUMANOID_BODY exists. Mike: "discussed before implementing." Still pending.
- **Creature Size system** — categories + per-category effects (reach, weapon sizing, etc.). Halfling, Goblinoid, Nephilim seed designs are blocked on this.
- **Item Abilities authoring** — type exists in code but no UI to author. Future.
- **Crystallization line cascade** — items inherit char's line state when held; verified during design discussion but no UI/code to make it visible. Items below-the-line shouldn't contribute to "active KRMA" computations (currently they do; minor for now since the example test character is "above the line").
- **Brevity-Thorn template** for short-lived seeds — pending Mike's call (open question from the May 8 KRMA economy research).
- **Quality field** — type and UI exist (1-10 number). Per-tier descriptions ("Poor", "Standard", etc.) are NOT canon — Mike rejected the old Weapon_System.md list. Future Mike-decision.
- **GM "flag overpowered" mechanic** — repo doc exists, no implementation. Post-beta feature.

---

## Files touched this session (app code)

Modified:
- `app/src/types/item.ts` (new fields + ItemAbility + getRarityColor/Label helpers + ITEM_PROPERTIES)
- `app/src/types/material.ts` (lbs helpers — getCarryCapacityLbs, getItemWeightLbs)
- `app/src/types/krma.ts` (TKVBreakdown: items, itemsTotal)
- `app/src/lib/kv-calculator.ts` (calculateCharacterTKV with items + null-safe; calculateItemKV uses value field + corrected condition multiplier)
- `app/src/services/krma/evaluator.ts` (mirror of calculator's items wiring)
- `app/src/services/campaign-item.ts` (default condition 3)
- `app/src/components/canvas/RelationsCanvas.tsx` (Forge picker, drag-drop hit-tests, hover state, panel positioning)
- `app/src/components/canvas/InventoryCard.tsx` (rewrite — single-row layout, popup details, data attributes, gold drop-target, drag ghost)
- `app/src/components/canvas/CharacterCard.tsx` (data attributes, gold drop-shadow hover, with `will-change: filter`)
- `app/src/components/canvas/WorldItemCard.tsx` (rarity helper migration)
- `app/src/components/character/InventorySection.tsx` (rewrite — all canon fields, lbs)
- `app/src/components/character/CharacterTab.tsx` (mounts InventorySection with heldItems)
- `app/src/components/CampaignCanvas.tsx` (TKV wiring includes items)
- `app/src/app/campaign/[id]/page.tsx` (item nodes read stored x/y)
- `app/scripts/seed-example-item.ts` (creates Iron Sword as ForgeItem blueprint)

DB:
- `app/dev.db` patched: Vex's frequency populated (was null)
- Iron Sword blueprint in ForgeItem table for "The Prime Campaign"

Memory files added (in `~/.claude/projects/C--Projects-GRO-WTH/memory/`):
- `non-humanoid-bodies-deferred.md` (UPDATED — now says NOT deferred; modular body system coming)
- `weight-system-stripped-actual-lbs.md`
- `crystallization-line-canvas-drafting-vs-active.md`
- `item-fields-canon-corrections-2026-05-14.md`
- (plus several others from earlier in the session)

---

## Not committed yet

App-side code changes from this session are uncommitted. Worth a focused commit before next session starts.

Suggested commit message: `feat(inventory): forge picker spawn, drag-drop UX, all canon fields, lbs migration, TKV items`

Repo-side canon changes were already committed and pushed (`529124c`).

---

## Footer

The whole canvas item+inventory loop is now meaningful, even if the character sheet itself doesn't initialize from creation flow yet. Next session's job is to close that creation gap so the systems we built can be tested against a real character.
