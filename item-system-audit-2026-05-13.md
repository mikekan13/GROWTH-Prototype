# Item System Audit — 2026-05-13

## Executive Summary

- **Item model is flat.** `GrowthWorldItem` (`app/src/types/item.ts:9-53`) and `CampaignItem` (`app/prisma/schema.prisma`) have **no parent/child relations**. The "body parts = items" decision requires adding container nesting as the foundational change.
- **No concept of "function declarations"** exists. Items have damage/resist/armor stats but cannot declare senses (Vision) or actions (Manipulation, Breath Weapon). This is entirely greenfield.
- **Equipment Conditions are well-specified** (5 levels 0-4, ruling r-2026-04-22-12) and partially wired (`item.ts:115-133`, `Equipment_Conditions.md`). Condition→function-degradation rules are missing and need to be designed.
- **Material taxonomy is robust** for crafted/mineral materials (~50+ entries across eras in `Complete_Materials_Reference.md`) but **flesh/bone/scale/chitin/organ-tissue entries are sparse** (Bone, Antler, common Leather only). Body-material catalog needs expansion.
- **Weight system is dual-state.** Code uses Weight Levels 0-10 (`material.ts:60-77`, `item.ts:12`); Mike has retired this in favor of actual lbs but the change has not been applied. Migration is straightforward (one field).

**Recommended sequence:** (1) Container nesting → (2) Function/Sense/Action catalogs → (3) Permanent-equipped flag → (4) Function degradation rules → (5) Sub-part damage targeting → (6) Body-material expansion → (7) Weight-to-lbs migration.

---

## What's Built

| Concern | Status | Implementation |
|---|---|---|
| Item core type | BUILT | `app/src/types/item.ts:9-53` (`GrowthWorldItem`) |
| DB persistence | BUILT | `app/prisma/schema.prisma` `model CampaignItem` (id, name, type, data JSON, holderId, locationId, status) |
| Item service | BUILT | `app/src/services/campaign-item.ts` (CRUD + Zod schemas) |
| Forge authoring of items | BUILT | `app/src/services/forge.ts` (ForgeItem `type='item'`, item sub-types weapon/armor/etc.) |
| Equipment conditions (5 levels) | BUILT | `app/src/types/item.ts:115-133`, `GRO.WTH Repository/03_ITEMS_CRAFTING/Equipment_Conditions.md` |
| Damage type taxonomy | BUILT | `item.ts:19-27` (P/S/H/D/C/B/E), `formatDamage` `:109-112` |
| Armor layering rules | BUILT | `app/src/types/material.ts:80-84` (`ARMOR_LAYER_RULES`), `Armor_System.md` |
| Weight level scale | BUILT | `material.ts:60-77`, `Inventory_and_Encumbrance_System.md` (0-10) |
| Material taxonomy (general) | BUILT | `material.ts:9-50`, `Complete_Materials_Reference.md` (Primitive/Bronze/Iron/Industrial/Precious/Gemstone eras) |
| Material modifiers | BUILT | `material.ts:9-32` (Dampening, Proof, Flexible, Brittle, etc.) |
| Body part coverage list (armor) | PARTIAL | `item.ts:69-74` (`BODY_PARTS` = Head/Neck, Torso, Arms, Legs — flat, no sub-parts) |
| Item rarity/value | BUILT | `item.ts:55, 99-106` |
| Holder/location tracking | BUILT | `CampaignItem.holderId`, `.locationId` in schema |

---

## Gaps to Fill

### 1. Container behavior — MISSING
No `parentItemId` field on `CampaignItem`; no nested-items relation. `grep` of `app/src/` for container/nested/subItems returns only UI refs (HubLogo container divs), not item-domain code.
**Needed:** `parentItemId String?` self-relation on `CampaignItem`, plus a `slotName String?` (e.g., "left_eye_socket") so a parent can address where a child sits. Service must recursively load/walk the tree. JSON-only nesting inside `data` is a non-starter — sub-items need their own row to be individually targetable and to hold their own state (condition, holderId).

### 2. Function declarations on items — MISSING
No `functions`, `senses`, `actions`, or `provides` field anywhere in `item.ts` or schema. `formatDamage`, `getConditionLabel` are the only "function" exports and they are formatters, not declarations.
**Needed:** `functions: ItemFunction[]` field on `GrowthWorldItem`, where `ItemFunction = { id: string; kind: 'sense'|'action'; key: string; magnitude?: number; range?: number }`. Persist in `data` JSON for now; promote to relation if query patterns demand.

### 3. Sub-part addressing in combat — MISSING
Combat resolution (`app/src/services/encounter.ts` not surveyed in detail but no parent/child item plumbing exists) cannot today route "remaining piercing damage" into a child item. Piercing damage type is defined (`item.ts:20`) but has no special carry-through semantics.
**Needed:** damage resolver rule: when damage type = piercing and target is a container with `parentItemId` children, after the container's effective resist absorbs damage, remainder is routed to a child (GM-targeted or random). This is a service-layer change in `encounter.ts` / a new `damage-resolver.ts`.

### 4. Sense + Action catalogs — MISSING
No file `app/src/types/senses.ts` or `actions.ts`. No global catalog model in `schema.prisma`. Existing global catalog plumbing (`ForgeItem.isGlobal`) is for items/skills/nectars only.
**Needed:** seed catalogs (Vision, Hearing, Smell, Touch, Vibration, Echolocation / Manipulation, Locomotion, Breath, Speech, Light) as either a hard-coded `senses.ts` constants file or a new `SystemCapability` Prisma model with `kind: 'sense'|'action'`. The "extensible" requirement leans toward the model approach so GMs can add Vibration Sense at the table.

### 5. Permanently-equipped state — PARTIAL
`equipped?: boolean` exists (`item.ts:49`) but is a soft flag. No `permanent` / `unremovable` / `bodyPart` discriminator. Inventory paperdoll memory note (`memory/inventory-paperdoll.md`) describes "Equipped" as a slot category but the implementation does not exist (no `equipment_slots` field on Seed).
**Needed:** `permanent: boolean` flag on items; service logic that blocks normal unequip operations when true; "destruction" or "surgery" verbs as the only legitimate removers.

### 6. Function degradation by condition — MISSING
Conditions are defined and scaled (Broken = effective Resist halved per `Equipment_Conditions.md`) but there is **no link from condition to declared functions** because declared functions don't exist yet. No cascade rule from child-Destroyed to parent-Dysfunctional.
**Needed:** rule table mapping condition × function-magnitude (e.g., Worn = 0.75×, Broken = 0.5× and chance-to-fail, Destroyed = 0). Cascade rule: parent's function fails if any required-child is Destroyed (e.g., Head loses Speech if Tongue destroyed).

### 7. Material taxonomy for body materials — PARTIAL
Present: Bone (12 resist), Antler (14), Leather variants, Hide. Missing as first-class entries: Flesh, Muscle, Sinew, Cartilage, Organ Tissue, Scale (reptilian/draconic), Chitin (insectoid), Crystal (animate), Living Wood (treant), Soul-Forged Metal (construct).
**Needed:** add a "Biological / Anatomical Materials" section to `Complete_Materials_Reference.md` with these entries and matching catalog rows. The `Material` interface (`material.ts:42-49`) supports them as-is — pure data work.

### 8. Weight system — PARTIAL / NEEDS MIGRATION
See dedicated section below.

---

## Weight System Migration

**Current state (10-level abstraction, to retire):**
- `app/src/types/item.ts:12` — `weightLevel?: number` on `GrowthWorldItem`
- `app/src/types/material.ts:44` — `baseWeight: number; // 1-6` on `Material`
- `app/src/types/material.ts:60-77` — `WEIGHT_LEVEL_LABELS` (0-10) and `getWeightLabel()`
- `app/src/services/forge.ts` — `weightLevel: z.number().int().min(0).max(10).optional()` in forge item schema
- `app/src/services/campaign-item.ts:30-34` — `createDefaultItem()` sets `weightLevel: 1`
- `GRO.WTH Repository/03_ITEMS_CRAFTING/Inventory_and_Encumbrance_System.md` — entire Weight Level / Carry Level (Clout-based) doctrine
- `Complete_Materials_Reference.md` — every material row has a "Weight Cat" column (1-Featherlight … 7-Massive)

**Migration path:**
1. Rename `weightLevel` → `weightLbs: number` on `GrowthWorldItem` (kept inside `data` JSON, no migration needed for the column itself).
2. Update Zod schemas in `forge.ts` and `campaign-item.ts` (range 0-∞, float allowed).
3. Update `Material.baseWeight` semantics to lbs-per-unit-volume or lbs-per-typical-item (pick one; ask Mike).
4. Carry capacity: Inventory_and_Encumbrance_System.md sets `Carry Level = Clout`. New rule needed (lbs threshold per Clout level — ask Mike).
5. Drop `WEIGHT_LEVEL_LABELS` and `getWeightLabel` from `material.ts`; update any UI rendering (paperdoll, item card) to show "X lbs".
6. Update `Complete_Materials_Reference.md` Weight Cat column to lbs values.

Risk: low. Weight is display-and-encumbrance only; no combat math depends on it.

---

## Recommended Build Sequence

1. **Container nesting on `CampaignItem`** — `parentItemId` self-relation + `slotName`. Service updates: recursive load, cascade-delete options. Foundation for everything else.
2. **Sense + Action catalogs** — start with hard-coded constants in `app/src/types/capabilities.ts` (Vision, Hearing, Smell, Touch, Manipulation, Locomotion, Speech). Promote to DB-backed `SystemCapability` model once GM-extension UI is needed.
3. **`functions` field on `GrowthWorldItem`** — add `functions: ItemFunction[]` to the type. Pure JSON addition, no migration.
4. **`permanent: boolean` flag + service guard** — block unequip when true; expose `destroyItem()` and `surgicallyRemove()` service verbs.
5. **Function degradation rules** — single resolver function `effectiveFunction(item, function) → magnitude` that applies condition multiplier and cascades to children.
6. **Sub-part damage targeting** — extend damage resolver to walk container tree on Piercing damage.
7. **Body-material catalog expansion** — pure data add to `Complete_Materials_Reference.md` (Flesh, Muscle, Scale, Chitin, Crystal, Living Wood, Soul-Forged Metal).
8. **Weight-to-lbs migration** — type/schema/UI/docs sweep.
9. **Seed equipment_slots wiring** — already designed in `memory/inventory-paperdoll.md` but not implemented; now becomes "what body-part items the Seed starts with."

---

## Open Questions for Mike

1. **Body-part items: instances or templates?** Does each humanoid character get a fresh row per body part (~30 rows: head, torso, heart, lungs, brain, 2 eyes, 2 ears, etc.) or do we template from the Seed and instantiate on demand? Recommend: instantiate at character creation (clear ownership, individual condition, no late-binding).
2. **Cascade severity for parent dysfunction.** Head with Destroyed Brain — does the Head item also become Destroyed, or just functionally inert? (Affects loot/repair semantics.)
3. **Action-economy tie-in.** Do declared Actions on items grant action-points to the character (e.g., a second Hand grants a second Manipulation action) or are they prerequisites only? Affects combat resolver design.
4. **Lbs scale.** Realistic (heart ≈ 0.7 lbs, longsword ≈ 3 lbs) or stylized round numbers? Affects carry-capacity formula.
5. **Carry capacity formula.** Old rule: `Carry Level = Clout`. New: `Carry lbs = f(Clout)` — linear, quadratic, table-based?
6. **Sense magnitudes.** Should Vision have a numeric range (e.g., "Vision 8" = sees 80ft) or just present/absent + condition multiplier?
7. **Sub-part addressing UX.** Does a Trailblazer attacker need to *declare* "I aim for the eye" (called shot) or does Piercing always offer a child-target choice after the parent's resist is defeated?
8. **Material rules for organs.** Does a Brain use the same `Material` schema as Steel (resist, weight, mods) or do organs need a different shape? Recommend: same schema; just new entries.
