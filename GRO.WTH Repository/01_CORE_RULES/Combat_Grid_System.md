# Combat_Grid_System.md

**Status:** #validated
**Source:** GROWTH-DESIGN-TRUTH §7.5 (Combat Action Economy); memory `combat-grid-system.md`; Mike's confirmation 2026-03-13 (grid-based, 5ft squares); finalized 2026-05-23 under Mike's "complete the repository" directive following the canon established by [[Creature_Size_System]] (footprint-based reach), [[Three_Pillar_Attributes]] (Celerity drives speed), and [[ActionMod_System]] (additive emergent modifier).
**Security:** PUBLIC
**Last Updated:** 2026-05-23

---

# Combat Grid System

GROWTH combat is **grid-based**. Theater-of-mind and zone-based abstractions are not the system.

## Grid specification

- **Square size:** 5 ft per square (standard).
- **Phase length:** 6 seconds (one combat phase / round).
- **Render surface:** the canvas, as **encounter cards** — one card per encounter map, with grid overlay rendered by the canvas system on top of the map image (or a blank gridded background).
- **Initiative tracker:** a separate canvas card sortable by the [[#Time Stack initiative|Time Stack]].
- **Tokens:** one token per participant, snapped to squares. Asymmetric creatures (see [[Creature_Size_System]]) occupy a `width × length` rectangle of squares.

## Time Stack initiative

Initiative ordering (the "Time Stack") is **deterministic and pillar-tiered**, not a single-roll free-for-all. Each participant is classified by which pillar dominates their action posture:

- **Mercy tier** (acts first) — Flow > Focus. Gracious, flowing, river-of-time fighters.
- **Balance tier** (middle) — Flow = Focus, or both 0. Steady, balanced fighters.
- **Severity tier** (acts last) — Focus > Flow. Precise, deliberate, severance-aligned fighters.

Within a tier, ordering uses three keys in order:

1. **Presence score** — Flow + Focus levels. Higher acts first.
2. **ActionMod** (see [[ActionMod_System]]). Higher acts first.
3. **Participant ID** (deterministic tiebreaker). Lower id acts first.

This makes initiative replay-safe: the same encounter state always produces the same Time Stack. No initiative rolls are made — speed is *who you are* (Flow/Focus pillar bias) and *what you carry* (ActionMod).

## Action economy

GROWTH uses **per-pillar action pools** rather than a single shared pool.

Each phase, each participant has actions allocated per pillar:

```
Body actions   = max(1, floor((Clout + Celerity + Constitution) / 25))
Spirit actions = max(1, floor((Flow + Focus) / 25))          ← Frequency EXCLUDED
Soul actions   = max(1, floor((Willpower + Wisdom + Wit) / 25))
```

Frequency is intentionally excluded from Spirit actions (locked Mike 2026-05-20): Frequency is the life/death pool, not an action source.

Rules:

- **Cross-pillar actions are NOT freely transferable.** A Body action cannot be spent on a pure-Soul-governed task and vice versa.
- **Movement is the universal substitution.** Any action — Body, Spirit, or Soul — can be spent as movement.
- **Multi-governor skills** can be triggered from any participating pillar's action, but Effort wagered on that roll must come from the SAME pillar's attribute pool as the action spent (you can't wager Soul Effort using a Body action).
- **Used actions are tracked per-pillar** (`participant.actions.used.body/.spirit/.soul`) for the duration of the phase; they reset at phase end.

## Movement

- **Movement distance per action = Celerity level / 5 squares**, rounded down, with a floor of 1 square per action. So Celerity 5 = 1 square, Celerity 10 = 2 squares, Celerity 15 = 3 squares, Celerity 25 = 5 squares.
- **Diagonal movement = 1 square** (the simple "5-5-5" rule; not 5-10-5). Each diagonal step costs the same as an orthogonal step.
- **Difficult terrain** doubles the cost: 1 square of difficult terrain costs 2 squares of movement allowance.
- **Climbing / swimming** doubles the cost (same as difficult terrain) and requires the appropriate skill check at GM discretion.
- **Standing up from prone** costs half of one action's movement allowance.
- **Standing in a body's square** is allowed when the body is at condition 0 (Destroyed) or smaller than your footprint; otherwise the square is occupied.

## Reach and threatened squares

Melee reach is **size-based**, set by [[Creature_Size_System]]:

```
meleeReach = max(width, length) squares
```

A 1×1 humanoid reaches 1 square. A 2×3 horse reaches 3. A 5×5 ogre reaches 5. **Reach weapons** (polearms, whips) add their own reach modifier on top — e.g. a halberd grants +1 reach to a 1×1 wielder, giving them 2-square reach.

A combatant **threatens** all squares within their melee reach. Moving out of a threatened square may trigger an Opportunity Attack reactive check (see [[Special_Combat_Actions]]).

## Cover and line of sight

Cover and LOS are **Terminal contextual rulings**, not deterministic engine rules. The Terminal evaluates the geometry of the encounter (participant sizes, intervening terrain, intervening creatures) and decides whether a target is in full cover, half cover, or no cover. The hard rules the engine guarantees:

- A creature provides full cover to anything fully behind it that is smaller than its footprint.
- A creature provides half cover to anything partially behind it.
- Solid intervening objects (walls, large boulders) of size ≥ target size block LOS.

Cover modifiers (when the Terminal applies them):

- **Half cover:** +2 DR on incoming ranged attacks; no change to melee.
- **Full cover:** ranged attacks impossible; melee requires reaching past the cover.

## Encounter card surface

Combat scenes are rendered on the canvas as **encounter cards**:

- AI-generated maps (or GM-supplied) at the card body.
- Grid overlay rendered by the canvas system (not baked into the map image).
- Tokens snap to squares and respect their participant's footprint.
- Initiative card is a separate, draggable canvas card sortable by the Time Stack.
- The encounter card has its own `status`: `PLANNED → ACTIVE → PAUSED → RESOLVED`. Only `ACTIVE` consumes actions and progresses phases.

This means combat UI is built **on top of the same canvas primitives** as the rest of the campaign canvas (folders, character cards, dice overlay) — no separate combat screen.

## Phase structure

Each phase resolves in three sub-phases:

1. **Intention** — every participant declares their planned action(s) (the Terminal may collect these silently or publicly).
2. **Resolution** — actions resolve in Time Stack order. Each action triggers any reactive checks from threatened combatants.
3. **Impact** — damage applies, conditions update, deaths trigger, the encounter card refreshes.

The three-phase split exists so that simultaneous-feeling moments (two characters going for the same item) can resolve cleanly without the GM having to mentally interleave six rolls.

## Cross-reference

| Game term | Code surface |
|---|---|
| Encounter | `Encounter` model in `prisma/schema.prisma`; `GrowthEncounter` in `types/encounter.ts` |
| Participant | `EncounterParticipant` in `types/encounter.ts` |
| Time Stack | `buildTimeStack(participants)`, `nextParticipantId()` in `lib/time-stack.ts` |
| Pillar tier | `classifyPillarTier(flow, focus)` |
| Action pool formula | per [[#Action economy]]; UI in `components/canvas/CharacterCard.tsx` |
| Reach | `meleeReachSquares(size)` in `lib/creature-size.ts` |

---

## Links
- Related: [[ActionMod_System]], [[Three_Pillar_Attributes]], [[Basic_Resolution_System]], [[Creature_Size_System]]
- References: [[Attack_Resolution_Mechanics]], [[Movement_and_Positioning]], [[Special_Combat_Actions]], [[Damage_Type_Interactions]]
