# Combat_Grid_System.md

**Status:** #needs-review
**Source:** GROWTH-DESIGN-TRUTH §7.5 (Combat Action Economy), memory `combat-grid-system.md`, Mike's confirmation 2026-03-13
**Security:** PUBLIC
**Last Updated:** 2026-05-03

---

# Combat Grid System

GROWTH combat is **grid-based**. This is canonical and confirmed (Mike, 2026-03-13). Theater-of-mind and zone-based abstractions are **not** the system.

## Grid Specification

- **Square size:** 5 ft per square (standard).
- **Render surface:** the canvas, as **encounter cards** — one card per encounter map, with grid overlay rendered by the canvas system.
- **Initiative tracker:** rendered as a separate canvas card, ordered by initiative roll.
- **Phase length:** 6 seconds (one combat phase / round).

## Action Economy

GROWTH uses **per-pillar actions** rather than a single shared action pool:

- Each pillar (Body, Spirit, Soul) gets its own action per phase.
- **Cross-pillar actions are generally NOT transferable** — a Body action cannot be spent on a Soul-governed task and vice versa.
- **Any action can be used as movement.** This is the one universal substitution: spend a Body, Spirit, or Soul action to move.
- **Multi-pillar skills** are usable, but Effort can only come from governors of the matching action's pillar within a single roll.

## ActionMod

ActionMod is the modifier added to action-based rolls (initiative, attack timing, defensive reactions). See [[ActionMod_System]] for the full rules.

- **Base ActionMod = 0.**
- Modified only by items (e.g. light armor, certain weapons) and traits (e.g. specific Nectars).
- Negative ActionMod is possible (heavy armor, encumbrance).

## Movement

- Movement uses any one action from any pillar (substitution rule above).
- Movement distance per action: **[NEEDS MIKE]** — the canonical squares-per-action value is not yet recorded in DESIGN-TRUTH. Working assumption is 6 squares (30 ft) per action, matching common 5ft-grid TTRPG conventions, but Mike has not confirmed.
- Difficult terrain, climbing, and other movement modifiers: **[NEEDS MIKE]**.

## Encounter Cards

Combat scenes are rendered on the canvas as **encounter cards**:

- AI-generated maps (or GM-supplied) sit at the card's body.
- Grid overlay is rendered by the canvas system, not baked into the map image.
- Tokens for combatants live on the grid and snap to squares.
- Initiative card is a separate canvas card, sortable by initiative roll.

This means combat UI is built **on top of the same canvas primitives** as the rest of the campaign canvas (folders, character cards, dice overlay) — no separate combat screen.

## Open Items

- **Diagonal movement cost:** **[NEEDS MIKE]** (1-1-1 vs 1-2-1 vs other).
- **Reach / threatened squares:** **[NEEDS MIKE]**.
- **Cover system:** **[NEEDS MIKE]**.
- **Squares-per-action movement rate:** **[NEEDS MIKE]** (working assumption: 6 squares).

---

## Links
- Related: [[ActionMod_System]], [[Three_Pillar_Attributes]], [[Basic_Resolution_System]]
- References: [[Attack_Resolution_Mechanics]], [[Movement_and_Positioning]]
- Examples: *(none yet)*
