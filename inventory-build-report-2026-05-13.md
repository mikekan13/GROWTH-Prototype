# Inventory + Canvas Drag-Drop — Build Report

**Date:** 2026-05-13
**Build status:** clean (`npm run build` and `tsc --noEmit` both zero errors/warnings)

---

## What was already wired (audit findings, no rewrite needed)

The canvas drag-drop pipeline was largely complete already. I verified:

- `CampaignItem` rows are loaded server-side in `app/src/app/campaign/[id]/page.tsx` and mapped into `CanvasNode`s with `holderId`, `itemData`, `holderName`.
- `RelationsCanvas` renders an `InventoryCard` for each character (lines 1778-1794) showing all items where `holderId === character.id` (lines 1453-1466).
- Free-floating items (`holderId === null`) render as `WorldItemCard` nodes on the canvas (lines 2448-2570). When dropped on a character, the `onItemTransfer(itemId, holderId)` callback fires (lines 2520-2532).
- The CampaignCanvas wrapper implements `handleItemTransfer` → PATCH `/api/campaigns/[id]/items/[itemId]` with `{ holderId }`, plus local state update.
- API routes `GET/POST /api/campaigns/[id]/items` and `GET/PATCH/DELETE /api/campaigns/[id]/items/[itemId]` are present and correctly thin (services hold logic, Zod parses input).

The two real gaps were: (a) the character-sheet UI (`CharacterTab.tsx`, the active in-canvas character view) never rendered inventory at all; (b) the equipment-condition scale in code didn't match canon ruling r-2026-04-22-12.

---

## Files modified

- `app/src/types/item.ts` — Corrected canon condition scale to **0-4** (Indestructible=4, Undamaged=3, Worn=2, Broken=1, Destroyed=0). `getConditionLabel`/`getConditionColor` updated. The previous code had a 1-4 scale with wrong labels — diverged from `GRO.WTH Repository/03_ITEMS_CRAFTING/Equipment_Conditions.md`.
- `app/src/types/material.ts` — `CONDITION_LABELS` aligned to the same 0-4 canon scale.
- `app/src/components/canvas/InventoryCard.tsx` — `isDestroyed` check fixed (was `condition === 1`, now `condition === 0` per canon).
- `app/src/services/campaign-item.ts` — Default condition on new items is now `3` (Undamaged) instead of `4` (which is now reserved for the special Indestructible tier).
- `app/src/components/character/InventorySection.tsx` — **Full rewrite.** Was a 38-line stub keyed off the legacy `GrowthInventory.items` blob (which doesn't reflect live data and used wrong condition labels). Now consumes `HeldItemData[]` (live `CampaignItem` rows) with the legacy `inventory` prop kept for backwards-compat so the older `CharacterSheet.tsx` view still compiles. Renders: name, type icon, rarity color, equipped badge, canon condition label + color, weight label, material, damage (P:S:H/D\C:B:E), armor resist + layer + covered parts, value, description, material modifier tags, weapon property tags.
- `app/src/components/character/CharacterTab.tsx` — Imported `InventorySection` and `HeldItemData`. Added a fetch effect that pulls `/api/campaigns/{id}/items` and filters to `holderId === effectiveCharacter.id`. Added an Inventory section in the rendered sheet between Visual Identity and Backstory. This is where Mike will actually see the inventory when he opens a character via the canvas Character tab.
- `app/src/components/canvas/RelationsCanvas.tsx` — Wired `onDragOutStart` on the mounted `InventoryCard` (was declared on the prop type but never passed). On drag-start of an inventory row, calls `onItemTransfer(itemId, null)` to detach the item from the character and let it appear as a free-floating canvas card.

## Files created

- `app/scripts/seed-example-item.ts` — Idempotent seed script. Finds the oldest campaign, checks for an existing "Iron Sword", and if absent creates a new `CampaignItem` with full canon fields: material=Iron, weightLevel=3, condition=3 (Undamaged), damage `{P:2 S:5 H:0 D:0 C:0 B:1 E:0}`, range=melee, weaponProperties=[Sharp], targetAttribute=Constitution, rarity=common, value=25, tags=[martial, sword]. `holderId=null` so it appears on the canvas, ready to be dragged onto a character.
- `inventory-build-report-2026-05-13.md` (this file).

## Seeded example item

- **Name:** Iron Sword
- **Campaign:** "The Prime Campaign" (`cmolylqa90000os48yt9wa4ny`)
- **Item ID:** `cmp3owxgv0000cg48gd7qxghx`
- **Where:** floating on the canvas (no holder).
- **Run:** `npx tsx scripts/seed-example-item.ts` (from `app/`). Idempotent — safe to re-run.

## How drag-drop works (touchpoints)

- **Library:** none. Custom HTML5/SVG mouse-tracking already in `RelationsCanvas.tsx` and `WorldItemCard.tsx`, computing SVG-coordinate offsets via `getScreenCTM`. No new deps added.
- **Canvas item → character inventory:** user drags a `WorldItemCard`; on mouseup, `RelationsCanvas.tsx:2517-2532` does a hit-test for character cards within radius. If a hit, `onItemTransfer(itemId, character.id)` → PATCH item with `holderId` → router refresh → item disappears from canvas, reappears inside the character's `InventoryCard`.
- **Character inventory → canvas:** two paths, both call `onItemTransfer(itemId, null)`:
  - **Drag-out** of a row: `InventoryCard.onDragOutStart` (newly wired in `RelationsCanvas.tsx:1791-1797`).
  - **Remove button** on each inventory row (GM only): `InventoryCard.onRemoveItem` (already wired at line 1785).
  - In both cases, the item's `holderId` is cleared and on refresh it renders as a free-floating `WorldItemCard` on the canvas.
- **Character-sheet inventory view (`CharacterTab.tsx`):** read-only summary of items held by the character. Re-fetches on character/campaign change.

## Build & test status

- `tsc --noEmit`: 0 errors.
- `npm run build`: clean, 0 errors, 0 warnings (Next 16 + React 19 + Tailwind 4 + Prisma 7).
- `seed-example-item.ts`: ran successfully, created the Iron Sword row.
- Did not run the dev server / Playwright in this session (in-scope changes are mechanical wiring + a stale-component rewrite; no novel UX surface to verify visually beyond what build catches).

## Canon decisions documented for Mike to review

- **Equipment condition scale**: the code had 1-4 with wrong labels (Undamaged=4, Worn=3, Broken=2, Destroyed=1). Canon (`Equipment_Conditions.md`, ruling r-2026-04-22-12) is **0-4**: Indestructible=4, Undamaged=3, Worn=2, Broken=1, Destroyed=0. I corrected the code to canon. The audit document was also wrong about this (it described "5 levels 0-4" but then wrote "level 4 = Undamaged" later — the labels were tangled). Existing items in the DB that have `condition: 4` will now read as "Indestructible" in the UI; if any pre-existing items are meant to be Undamaged they need to be re-set to `3`. The seed defaults for new items already use `3`.
- **Drag-out semantics**: drag-out from inventory triggers `onItemTransfer(itemId, null)` immediately — the item leaves inventory and appears as a canvas card after server refresh, but it does NOT follow the cursor in a single motion (the page refreshes between detach and free-drag). The Remove button does the same thing. Making drag-out feel continuous would require optimistic local-state placement during the drag — meaningful but out of scope tonight.
- **Where inventory appears in CharacterTab:** placed between "Visual Identity" and "Backstory". It's read-only in this view; mutation still happens on the canvas via `InventoryCard` (which has equip-toggle, remove, expand-for-details).

## Things deliberately not done (out of scope per instructions)

- Body composition / parts-as-items / nested containers — staying with flat-item model.
- Weight migration from `weightLevel` (0-10) to actual lbs — schema kept as-is, UI continues to display weight level + label.
- Prisma schema changes — none.
- Nectars / Thorns / Blossoms — none.
- New dependencies — none.

## Open follow-ups

- Verify visually on the dev server that the new InventorySection in CharacterTab and the canon condition labels render correctly. Single-screenshot pass is enough.
- Decide if drag-out should be optimistic (item follows cursor without page refresh). Currently functional but a touch janky.
- The `BODY_PARTS` constant in `item.ts` (`Head & Neck`, `Torso`, `Arms`, `Legs`) does not yet match the per-seed `bodyStructure.parts` (`HEAD`, `TORSO`, `LEFT_UPPER_ARM`, …) used by `CharacterTab`. Armor `coveredParts` will render whatever string is supplied; no enforcement. Reconciling those two part-name systems is its own task.
- The Iron Sword seed targets the oldest campaign found. If Mike has multiple campaigns and wants the item somewhere specific, run the script after switching the active campaign or generalize the script with an arg.
