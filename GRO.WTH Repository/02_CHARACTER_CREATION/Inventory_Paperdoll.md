# Inventory_Paperdoll.md

**Status:** #validated
**Source:** GROWTH-DESIGN-TRUTH §13.5 (Inventory); memory `inventory-paperdoll.md`; Mike's confirmation 2026-03-13; finalized 2026-05-23 in alignment with [[Body_Composition_System]] (body-parts-as-items) and [[Inventory_and_Encumbrance_System]] (Carry Level = Clout, global cap).
**Security:** PUBLIC
**Last Updated:** 2026-10-15 (Mike: equipped items are worn OVER a body region, never nested inside the part beside its organs — matches the code's `equippedTo`)

---

# Inventory: Three-Tier System Layered on Body Anatomy

GROWTH inventory is split into **three categories**: Equipped, Carried, and Possessions. The Equipped tier is *not* a fixed list of named slots — it's the [[Body_Composition_System|body anatomy tree]] with items attached to specific body parts.

## The three categories

### 1. Equipped
- Items currently worn or wielded on the character's body.
- Stored as items nested inside body-part containers — see [[#Equipped is the anatomy tree|below]].
- **Counts toward Carry Level** (the global Clout-based encumbrance system), but **worn equipment is exempt from encumbrance penalties** while properly worn — see [[Inventory_and_Encumbrance_System]].
- Affects ActionMod ([[ActionMod_System]]), armor resist, weapon access.

### 2. Carried
- Items the character is carrying but not equipped — backpacks, pouches, slung weapons, items in hand without active use.
- Counts toward Carry Level.
- Items move between Carried and Equipped via player action (donning armor, drawing a weapon, etc.).

### 3. Possessions
- Items the character **owns but is not carrying** — house, vehicle, stashed treasure, business holdings, livestock, real estate, the off-world manor on the moon they bought during Roots.
- **Does NOT count toward Carry Level.** No encumbrance impact.
- Tracked narratively / as KV for character-wealth purposes.
- Replaces the legacy "Assets System" that was tied to the now-retired Wealth Level (see [[Inventory_and_Encumbrance_System]] note about WTH retirement 2026-04-05).

## Equipped is the anatomy tree

The old paperdoll had a fixed list of slots ("Head, Body, Upper Left Arm, ..."). The new model **doesn't have a slot list at all**. Equipped items are attached to body-part regions of the anatomy tree — worn **over** the part, as outer layers.

Example: a character wearing a helmet has the helmet attached to the `Head` region of their `bodyAnatomy`. The helmet is **not** inside the head beside the brain and eyes (Mike, 2026-10-15: "a helmet would go over that"); it is a worn layer on the outside of that region. The anatomy tree still decides *where* things can be worn, and the organs stay inside the part.

This is the point: armor and organs share the same damage cascade. Damage to the head hits the helmet first (the outer-most worn layer), then passes through to the head and its contents per the cascade rules ([[Body_Composition_System]] §"Damage cascade").

### Authoring view

When the player equips an item, the UI attaches it to the appropriate body-part region (in code: the item instance's `equippedTo` = that region; equipped items form the region's `wornLayers`, outer-most first). The player picks the body part (or the UI infers one based on the item's `properties` — e.g., "Helmet" property auto-targets Head). Two characters of the same Seed share the same anatomy *template*, but each character's tree is mutable: parts can be lost, replaced, modified.

### Non-humanoid bodies

Each Seed declares its own anatomy from scratch ([[Body_Composition_System]] §"Baseline anatomy"). A six-armed Seed has six Arm body parts; equipping a sword "on the third left arm" places the item in that specific arm's `contains`. A tailed Seed has a Tail part with its own equippable region. There is no separate "non-humanoid paperdoll override" system — the anatomy tree IS the paperdoll.

## Per-region weight caps

**There are no per-region weight caps.** Carry Level is global (`Clout × 10 lbs`, see [[Inventory_and_Encumbrance_System]]). Equipping 50 lbs of armor on one shoulder is mechanically identical to spreading it across the whole body — the engine cares about the total, not the per-region distribution.

(Narratively, the GM may rule that obviously absurd loadouts — three helms stacked on the head — don't fit. That's a Terminal ruling, not a hard rule.)

## Multi-region items

Items that span multiple body parts (e.g., a plate cuirass covering torso + upper arms, or a full-body robe) are represented by **attaching the item to the OUTERMOST shared region**. A cuirass spanning the upper body is worn on `Torso`; armor that covers an entire humanoid is worn on `Body` (the root of the anatomy tree).

Damage cascading down then sees the cuirass first regardless of where the strike lands within its coverage area, because the cascade descends from outermost to innermost.

For items whose coverage is genuinely multiple non-overlapping regions (e.g. paired pauldrons with one piece per shoulder), each piece is a separate item placed in its respective container.

## Slot conflicts (two-handed, dual-wielding)

- **Two-handed weapons** occupy both Hand parts simultaneously. The UI prevents equipping the second Hand while a two-handed weapon is active. Internally, both `Left Hand.contains` and `Right Hand.contains` reference the same item id — when the weapon is unequipped, both references clear.
- **Dual-wielding** is allowed only with one-handed weapons in each Hand. No mechanical bonus or penalty for dual-wielding by default; specific Nectars/Thorns can grant or restrict it.
- **Layered armor** is allowed up to the layer caps defined in [[Armor_System]] (Clothing 3 / Light 1 / Heavy 1 max per layer at the same body region).
- **Conflict resolution** when an authoring tool genuinely doesn't know which slot an item belongs to (e.g., "rune ring of vague placement") — the player or GM picks. The system does not auto-resolve ambiguous slots.

## Implementation implication

The character sheet's "Inventory" panel is **not** a static layout. It must:

1. Render the character's `bodyAnatomy` tree.
2. For each body part, gather the items worn on it (`equippedTo` = that region) — the worn layers, outer-most first.
3. Organs (`isBodyPart: true`, inside the part's `contains`) are the internal anatomy; equipment is never inside a part.
4. Render equipment in slot-like UI over the region; render organs in an internal-anatomy UI.
5. Allow drag-equip: dropping a Carried item onto a body part attaches it to that region.

The UI is dynamic on every render. Items moving in or out of the tree affect downstream calculations (ActionMod, total Carry weight, damage cascade routing).

## Cross-reference

| Game term | Code surface |
|---|---|
| Body anatomy | `character.bodyAnatomy` (top-level on `GrowthCharacter`) |
| Equipped item | a CampaignItem held by the character with `data.equippedTo` = a body-part region (worn over it; `services/inventory.ts`) |
| Carried items | `character.inventory` (existing field for non-equipped carry) |
| Possessions | `character.identity.possessions` (free-form text + future structured items) |
| Carry Level | `Clout × 10 lbs` — see [[Inventory_and_Encumbrance_System]] |
| UI components | `components/character/InventorySection.tsx`, `components/canvas/InventoryCard.tsx` |
| Drag-equip handlers | `components/canvas/RelationsCanvas.tsx` (inventory drag-drop hit-tests) |

---

## Links
- Related: [[Body_Composition_System]], [[Inventory_and_Encumbrance_System]], [[Seeds_Roots_Branches_System]], [[Armor_System]]
- References: [[Equipment_Conditions]], [[Weapon_System]], [[Material_System]]
