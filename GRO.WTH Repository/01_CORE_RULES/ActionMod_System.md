# ActionMod_System.md

**Status:** #validated
**Source:** GROWTH-DESIGN-TRUTH §7.5 (Combat Action Economy); memory `combat-grid-system.md`; finalized 2026-05-23 under Mike's "complete the repository" directive following the patterns established by [[Three_Pillar_Attributes]] (additive modifier stacking is the GROWTH default) and [[Armor_System]] (Heavy armor Celerity penalty as the template for item-borne negatives).
**Security:** PUBLIC
**Last Updated:** 2026-05-23

---

# ActionMod System

**ActionMod** is the per-action modifier applied to combat-relevant timing rolls and to certain reactive checks. It is the "how fast and how cleanly does this character act" delta.

## Base rule

> **Every character starts at ActionMod 0.**

ActionMod is **not** an attribute the player allocates. It is **emergent** — entirely a function of what the character is wearing, wielding, and which traits they carry.

## Sources of ActionMod

ActionMod comes from exactly two categories:

### 1. Items
- **Heavy armor** typically applies a **negative** ActionMod. The canonical Heavy armor template ([[Armor_System]]) applies ActionMod −1 in addition to its Celerity penalty.
- **Light or specialized gear** may apply **positive** ActionMod. Examples: a fine-balanced rapier (+1), a Cloak of Quickening (+1), a featherweight ring (+1).
- Item-borne ActionMod is declared on the item via `properties` (canonical universal property) or, for play-defining cases, encoded as an Item Ability.

### 2. Traits
- Nectars/Thorns/Blossoms may grant or take ActionMod. The trait's `mechanicalEffect` text declares the delta (e.g. "+1 ActionMod while wielding a one-handed weapon").
- Seed-granted features ([[Seeds_Roots_Branches_System]]) can include innate ActionMod (rare; typically reserved for naturally-quick species).

ActionMod does NOT come from attributes, skills, levels, KRMA spending, or rest. It is purely equipment + trait emergent. This is by design — the lever for "I want to be faster" is "acquire something that makes you faster," not "spend KRMA on a Quickness stat."

## What ActionMod affects

ActionMod adds to the following rolls:

1. **Initiative** — the [[Combat_Grid_System|Time Stack]] sort uses presence score (Flow + Focus) as the primary; ActionMod is the tiebreaker after presence and before the deterministic-id tiebreaker.
2. **Reactive checks during another combatant's turn** — opportunity attacks, reflexive parries, dodge reactions. Add ActionMod to the reactor's Fate Die roll.
3. **Action-speed contests** — when two characters race to perform the same action in the same phase (e.g. "first to grab the key"), each rolls Fate Die + relevant skill + ActionMod.

ActionMod does **NOT** add to ordinary skill checks. The default skill check is `Skill Die + Fate Die + Effort vs DR` (see [[Basic_Resolution_System]]). ActionMod is specifically a *timing* modifier, not a *capability* modifier.

## Stacking and limits

- **Stacking is additive.** Every source contributes its delta to a single running total. A character wearing Heavy Armor (−1), wielding a Rapier (+1), and carrying a Cloak of Quickening (+1) ends up at ActionMod +1.
- **No hard cap.** ActionMod can in principle range from large-negative to large-positive. In practice, item designers and Kai's evaluator should treat any item with `|ActionMod| ≥ 3` as a play-defining piece worth Nectar-level scrutiny.
- **Conditions can also modify ActionMod.** The Clumsy depletion state (Celerity = 0, see [[Attribute_Depletion_Effects]]) forces a DR 5 Fate-Die-only check before any action; that check is unaffected by ActionMod (ActionMod is for *timing*, not for *passing the Clumsy gate*). Other future conditions may add a flat penalty — declared on the condition.

## How combat encounters use ActionMod

The encounter engine recomputes ActionMod for each participant at the start of each round from their currently-equipped items + active traits. This means dropping a heavy weapon mid-fight, picking up a faster one, or having a Blossom applied can shift ActionMod between rounds.

ActionMod is **not** stored on the character sheet as a static number; it is a computed value derived from current equipment + traits + active conditions. The UI displays the current value but doesn't let the player edit it directly.

## Cross-pillar action substitution

When a character uses an action from a different pillar than the action they're attempting (e.g., using a Spirit action to perform a Body-typed maneuver), ActionMod **still applies** — it is a universal timing modifier, not a pillar-specific one.

## Why this design

The GROWTH design philosophy: keep what's *narrative* in the player's hands and keep what's *emergent* in the items'. Speed and timing are properties of *what you're carrying*, not who you are at the soul level. A frail scholar with a feather-light dueling rapier is genuinely faster than a strong warrior in plate — because the items make them so.

## Cross-reference

| Game term | Code surface |
|---|---|
| ActionMod field | `EncounterParticipant.actionMod` (computed) in `types/encounter.ts` |
| Initiative tiebreaker | Time Stack pillar tier > presence > ActionMod > id (deterministic) in `lib/time-stack.ts` |
| Item-borne | declared on `GrowthWorldItem.properties` or `itemAbilities` |
| Trait-borne | declared in `GrowthTrait.mechanicalEffect` |

---

## Links
- Related: [[Combat_Grid_System]], [[Armor_System]], [[Weapon_System]], [[Equipment_Conditions]]
- References: [[Three_Pillar_Attributes]], [[Attribute_Depletion_Effects]], [[Basic_Resolution_System]]
