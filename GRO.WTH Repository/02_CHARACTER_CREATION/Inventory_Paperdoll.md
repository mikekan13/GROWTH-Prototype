# Inventory_Paperdoll.md

**Status:** #needs-review
**Source:** GROWTH-DESIGN-TRUTH §13.5 (Inventory), memory `inventory-paperdoll.md`, Mike's confirmation 2026-03-13
**Security:** PUBLIC
**Last Updated:** 2026-05-03

---

# Inventory: Three-Tier System with Per-Seed Paperdoll

GROWTH inventory is split into **three categories**. Two of them use the Weight system (1-10); the third is narrative-only. The equipped paperdoll is **defined by the Seed**, not hardcoded — non-humanoid Seeds get their own slot regions.

## The Three Categories

### 1. Equipped
- Items currently worn or wielded on the character's body.
- Slots are **body-region paperdoll regions** — see "Per-Seed Paperdoll" below.
- Uses the **Weight system (1-10)** — Carry Level constrains how much can be equipped without encumbrance.
- Affects ActionMod, armor resist, weapon access, etc.

### 2. Inventory
- Items the character is **carrying but not equipped** — backpacks, pouches, hands of friends, etc.
- Uses the **Weight system (1-10)** — counts against Carry Level.
- Items move between Inventory and Equipped via player action (donning, drawing weapons, etc.).

### 3. Possessions
- Items the character **owns but is not carrying** — house, vehicle, stashed treasure, business holdings, livestock, real estate.
- **Does NOT use the Weight system.** No encumbrance impact.
- Tracked narratively / as KV for character-wealth purposes.
- Replaces the legacy "Assets System" that was tied to the now-retired Wealth Level (see [[Inventory_and_Encumbrance_System]] note about WTH retirement 2026-04-05).

## Per-Seed Paperdoll

The set of equipped slots is **NOT a fixed list**. Each Seed defines its own paperdoll regions during Seed creation. The character sheet UI must render slots dynamically based on the character's Seed.

### Default Humanoid (10 regions)

For Seeds whose body plan is human-shaped (Humans, Elves, Dwarves, most playable races), the default paperdoll has **10 regions**:

1. Head
2. Body (torso)
3. Upper Left Arm
4. Lower Left Arm
5. Upper Right Arm
6. Lower Right Arm
7. Upper Left Leg
8. Lower Left Leg
9. Upper Right Leg
10. Lower Right Leg

### Non-Humanoid Seeds

When the GM creates a non-humanoid Seed, the paperdoll is customized. Examples:

- **Tailed Seed** — adds a Tail slot.
- **Winged Seed** — adds Left Wing / Right Wing slots.
- **Multi-limbed Seed (e.g., Insectoid)** — adds extra arm/leg pairs.
- **Centauroid** — replaces leg regions with horse-body and four hoof regions.
- **Serpentine / Wormlike** — collapses leg regions, expands body into segments.

The Seed's paperdoll definition lives on the Seed, not the character. Two characters of the same Seed share the same paperdoll layout; characters of different Seeds may have very different layouts.

## Implementation Implication

The character sheet's paperdoll panel is **not** a static layout. It must:

1. Read the character's Seed.
2. Pull the Seed's `equipment_slots` definition (array of slot regions with positions and labels).
3. Render slots dynamically.
4. Store equipped items keyed by slot ID, not by hardcoded slot name.

This applies to both the player sheet and the Watcher's view of party members.

## Open Items

- **Slot weight caps per region:** **[NEEDS MIKE]** — whether each region has its own carry limit, or only the global Carry Level applies.
- **Multi-region items (e.g. plate cuirass spans torso + upper arms):** **[NEEDS MIKE]** — exact rule for items that occupy multiple regions.
- **Slot conflict (two-handed weapons, dual-wielding):** **[NEEDS MIKE]**.

---

## Links
- Related: [[Inventory_and_Encumbrance_System]], [[Seeds_Roots_Branches_System]], [[Armor_System]]
- References: [[Equipment_Conditions]], [[Weapon_System]], [[Material_System]]
- Examples: *(none yet)*
