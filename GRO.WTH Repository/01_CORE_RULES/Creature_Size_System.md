# Creature_Size_System.md

**Status:** #validated
**Source:** Mike resolution session 2026-05-19 ([[NEEDS-MIKE_RESOLUTIONS_2026-05-19]] §4). Implemented in `app/src/lib/creature-size.ts` (`sizeValue`, `meleeReachSquares`, `canSqueezeThrough`, `HUMAN_BASELINE_SIZE`).
**Security:** PUBLIC
**Rulebook:** `rulebook/rulebook.md` (§Combat — needs sync)
**Last Updated:** 2026-05-23

---

# Creature Size — Numeric Footprint, No Categories

## What size is

A creature's size is **two numbers and a descriptor**:

- `width × length` — the grid footprint in 5ft squares. **Asymmetric is allowed**. A horse is `2 × 3`. A snake is `1 × 4`. A human is `1 × 1`.
- `height` — a descriptive value used by the Terminal for contextual rulings (doorways, ceilings, reach narrative). No fixed unit — the GM chooses (feet, meters, abstract level). This is *narrative*, not grid-tactical.

**There are no size categories.** No "Tiny / Small / Medium / Large / Huge" enum. There's just the footprint. Effects in the catalog refer to size *numerically* — "affects creatures `4×4` or smaller" — and the engine evaluates the comparison directly.

This is open-ended. A 1×1 character. A 5×5 ogre. A 100×100 dragon. A 1000×1000 city-spirit. The math works either way because it's just multiplication.

## Hard rules

These are the deterministic minimum the engine guarantees. Anything beyond is a Terminal contextual ruling.

### Rule 1 — Reach scales with footprint

Melee reach (in 5ft squares) = `max(width, length)`. A 1×1 human reaches 1 square. A 2×3 horse reaches 3. A 5×5 ogre reaches 5. Asymmetric creatures reach to their longer dimension.

This is the only "size affects combat" rule baked into the engine.

### Rule 2 — Squeeze through

A creature can squeeze through an opening one size smaller than its own footprint. `canSqueezeThrough(creature, openingSize)` returns true iff `openingSize >= max(width, length) - 1`. So a 3×3 creature can squeeze through a 2-size opening but not a 1-size opening.

This rule exists because dungeon crawls need an answer to "can the bear fit through the door?" and the design pick is that *any* creature can squeeze one tier smaller than itself with effort.

### Rule 3 — Numeric references in effects

Effects in Nectars/Thorns/Spells/Items can reference size numerically. "Reach 3 squares" or "affects creatures of footprint 4×4 or smaller" or "grapple targets `>= 2×` the wielder's size" are all valid. The engine evaluates the expression at resolution time using the target's actual width/length values.

## NOT size-tied

Some things you might expect to scale with size do not:

- **Carrying capacity** — governed by Clout, not size. A 1×1 Halfling Warrior with Clout 20 carries more than a 3×3 Ogre with Clout 5. Size is not a strength proxy.
- **Push/pull/shove** — contests of Clout. The bigger creature usually has higher Clout, so it usually wins, but the rule is Clout-based, not size-based.
- **Grapple** — works regardless of size disparity. The *effect* scales narratively: grappling a smaller target restrains them; grappling a much larger target means you're climbing it or hanging on. Same Clout contest mechanic; the Terminal narrates the outcome.

## Terminal contextual rulings

These ARE size-influenced but resolved by the Terminal at scene time, not by a fixed engine rule:

- **Cover** — a 3×3 creature provides cover to anything smaller behind it; a 1×1 creature behind a 2×2 boulder is in cover. Terminal decides whether cover is full, half, or none based on geometry.
- **Line of sight** — same. A 5×5 statue blocks LOS to most creatures behind it; a 1×1 mouse barely blocks LOS to anything.
- **Visual concealment** — Stealth checks have a contextual modifier when the hider's size is significantly smaller than the seeker. Terminal applies the modifier.
- **Vehicle/mount fit** — a 2×2 mount needs a 2×2 saddle. The Terminal rules on whether smaller creatures can ride larger ones (almost always yes).

## Human baseline

The default size for any newly-created character whose seed doesn't declare otherwise:

```
{ width: 1, length: 1, height: 6 }   // HUMAN_BASELINE_SIZE
```

`height: 6` is feet by convention (six feet tall) but the unit is not enforced.

## Seed declarations

Each seed authors its own canonical size. Examples (these are designs, not all yet authored in the seed catalog):

- **Halfling** — `{ width: 1, length: 1, height: 3.5 }`
- **Human** — `{ width: 1, length: 1, height: 6 }`
- **Nephilim** — `{ width: 1, length: 1, height: 8 }` (taller, still single-square footprint)
- **Goblinoid** — `{ width: 1, length: 1, height: 5 }`
- **Soul-Forged Giant** — `{ width: 2, length: 2, height: 12 }`
- **Dragon (NPC)** — `{ width: 4, length: 6, height: 15 }`

When seeded onto a character, the size lives at `character.identity.size`.

## Why this design

Mike's reasoning during the resolution session:

> "Categories are arbitrary. I want continuous, asymmetric, open-ended. A snake is 1 wide and 4 long, that's its actual shape. I don't want to round it into 'Medium.' And I want effects to be able to say 'affects creatures of footprint 4x4 or smaller' without me having to look up which category that's in."

The hard rules (reach, squeeze) are the *deterministic minimum* the engine needs. Everything else is Terminal contextual rulings during dilated turn-based time. The system gives the GM clean primitives — `width`, `length`, `height` — and trusts the Terminal to make the narrative ruling rather than encoding 30 lookup tables.

## Cross-reference

| Game term | Code surface |
|---|---|
| Footprint type | `CreatureSize { width, length, height? }` on `GrowthIdentity` |
| Size value (max dim) | `sizeValue(size)` in `lib/creature-size.ts` |
| Melee reach | `meleeReachSquares(size)` (returns max(width,length), min 1) |
| Squeeze check | `canSqueezeThrough(size, openingSize)` |
| Pretty-printer | `formatSize(size)` → `"2×3 (height 8)"` |
| Human default | `HUMAN_BASELINE_SIZE` |

---

## Links

- Related: [[Combat_Grid_System]], [[Movement_and_Positioning]], [[Seeds_Roots_Branches_System]]
- References: [[Three_Pillar_Attributes]] (Clout for shoves/grapples), [[Body_Composition_System]] (size + anatomy work together)
- Memory: locked in NEEDS-MIKE_RESOLUTIONS_2026-05-19 §4
