# ActionMod_System.md

**Status:** #needs-review
**Source:** GROWTH-DESIGN-TRUTH §7.5 (Combat Action Economy), memory `combat-grid-system.md`
**Security:** PUBLIC
**Last Updated:** 2026-05-03

---

# ActionMod System

**ActionMod** is the per-action modifier applied to action-based rolls in combat (initiative, action speed, certain reactive timings).

## Base Rule

> **Every character starts at ActionMod 0.**

ActionMod is **not** an attribute the player allocates or invests in directly. It is an **emergent property** of what the character is wearing, wielding, and which traits they have purchased.

## Sources of ActionMod

ActionMod is modified by exactly two categories:

1. **Items** — armor, weapons, trinkets, magical equipment.
   - Heavy armor typically applies a **negative** ActionMod (slower).
   - Light or specialized gear (rapiers, certain rings, etc.) may apply **positive** ActionMod.
2. **Traits** — Nectars, Thorns, racial features from Seeds, advancement choices.
   - Specific examples and exact values: **[NEEDS MIKE]**.

ActionMod does **not** come from attributes, skills, levels, or KRMA spending directly. The only way to raise it is to acquire items or traits that grant it.

## What ActionMod Affects

- **Initiative roll:** added to the initiative result that determines turn order in a phase.
- **Action speed / reactive timing:** **[NEEDS MIKE]** — exact list of which rolls/checks consume ActionMod is not yet recorded in DESIGN-TRUTH.
- **Cross-pillar movement substitution:** ActionMod still applies regardless of which pillar's action is being spent.

## Stacking & Limits

- **[NEEDS MIKE]** — whether item ActionMod and trait ActionMod stack additively, whether there is a cap, and how negative + positive resolve.

## Why It Lives Here

This file exists because the audit (`_cleanup_audit/04-repository-rules.md`) flagged ActionMod as a missing system. It is referenced in `app/docs/` and the live combat canvas, but had no corresponding rules-repo file. This document holds the canonical bare-minimum rules until Mike fleshes them out.

---

## Links
- Related: [[Combat_Grid_System]], [[Armor_System]], [[Weapon_System]]
- References: [[Three_Pillar_Attributes]], [[Equipment_Conditions]]
- Examples: *(none yet)*
