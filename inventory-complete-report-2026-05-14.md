# Inventory Work — Three Passes Report (2026-05-14)

## Status
- `npx tsc --noEmit` — clean (exit 0).
- `npm run build` — clean (exit 0). No errors.

## Files Modified

### Pass A — Weight migration to lbs
- **`app/src/types/material.ts`**
  - Added `LBS_PER_CLOUT_LEVEL = 10` constant.
  - Added `getCarryCapacityLbs(clout)` helper.
  - Added `legacyWeightLevelToLbs(level)` (×2 fallback) and `getItemWeightLbs(data)` that prefers `weightLbs` and falls back to legacy `weightLevel`.
  - Kept `WEIGHT_LEVEL_LABELS` / `getWeightLabel` for back-compat (not removed).
- **`app/scripts/seed-example-item.ts`** (edited only — not run)
  - Iron Sword now seeds with `primaryMaterial: 'Iron'`, `materialClass: 'Hard'`, `baseResist: 17`, `weightLbs: 3.5`, `quality: 5`, `rarity: 5` (numeric tier), `properties: ['Sharp']`. Removed deprecated `material`, `weightLevel`, `weaponProperties`, `materialModifiers` keys.

### Pass B — Display all canonical fields
- **`app/src/components/canvas/InventoryCard.tsx`** (rewrite)
  - Stats grid now reads `getItemWeightLbs(...)` and shows `X.X / capacity lbs` with `getWeightStatus` rebased to lbs ratios (Fine/Near Limit/Encumbered/Overloaded).
  - Header subline: `N items • X/Y lbs`.
  - Row line: `<lbs> lbs`, `primaryMaterial` (falls back to legacy `material`), `baseResist` (R##), `damageScaling` shows `+scl`, `quality` shows `Q#`. Inline badges for `materialClass` and `armorCategory`.
  - Popup adds: Quality, Resist, Value mini-stats; Materials block (primary + subordinates + class); Weapon block with shots/reload; Armor block uses `baseResist ?? resistance` and `armorCategory ?? armorLayer`; Item Abilities list (name + description + mechanicalEffect; **kv intentionally hidden**); merged Properties (union of `properties`, `weaponProperties`, `materialModifiers`); Tags.
- **`app/src/components/character/InventorySection.tsx`** (rewrite)
  - Same canonical fields surfaced on the character sheet (materialClass/armorCategory badges, rarity label, lbs weight, primary + subordinate materials, resist, quality, damage scaling, range, target attribute, shots, reload, value, item abilities, properties, tags).

### Pass C — Real drag-drop UX
- **`app/src/components/canvas/InventoryCard.tsx`**
  - Removed `onDragOutStart`; added `onDragEnd?: (itemId, clientX, clientY)`.
  - Row mousedown now tracks start position, only enters drag mode after a 5px threshold, renders a portal-rendered floating ghost row (icon + name, `pointer-events: none`) that follows the cursor while dragging. Below-threshold mouseup = popup toggle (original click behavior). Above-threshold mouseup = `onDragEnd(...)`.
- **`app/src/components/canvas/RelationsCanvas.tsx`**
  - Replaced `onDragOutStart` wiring with `onDragEnd`. Uses existing `clientToSvg` to map client coords → SVG world coords. Hit-tests character cards (expand by 80px) + open inventory panels using the same logic as the item-card drop path (lines ~2526-2547).
  - Same-character drop = no-op. Different character = `onItemTransfer(itemId, charId)`. Empty canvas = `onItemTransfer(itemId, null)` + `setNodePositions` + `onNodePositionChange` at the drop point so the item lands where dropped (no stale page-load formula).

## Skipped / Not Done
- Did **not** run `seed-example-item.ts` (per prohibitions). Existing seeded Iron Sword in DB still uses `weightLevel`; the new `legacyWeightLevelToLbs` fallback (×2) handles it cleanly until a fresh seed.
- Did **not** touch Prisma schema, migrations, or `dev.db`.
- Did not add dependencies.

## Canon Questions Encountered
- **Quality 1-10 description scale** is TBD per Mike's existing note in `types/item.ts`. Displayed as raw `Q#` / `#/10` for now.
- **Legacy `weightLevel` → lbs conversion factor** chosen as ×2 (placeholder rough conversion). Iron Sword's old `weightLevel: 3` → 6 lbs which is heavier than reality (3-3.5 lbs); the corrected seed value (3.5) takes over after a re-seed.
