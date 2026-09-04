# Combat Rules — Status Sheet (2026-09-04)

Reference sheet compiled for the reality-simulation combat walkthrough
(`REALITY-SIM-DESIGN-2026-09-02.md` §6.1). Every item carries its source and
status. **Mike's 09-03/04 layered speed model supersedes both Time Stack
write-ups below.** Nothing here is invented; gaps are listed as gaps.

Status legend: **V** = `#validated` · **NV** = `#needs-validation` (draft) ·
**R** = ruling id · **M** = memory-only · **GAP** = not found anywhere.

## 1. Defense
| Rule | Source | Status |
|---|---|---|
| Contested attack: defender with an available action rolls; defender's total becomes the DR. No action / surprised / declines → uncontested, attacker near-auto-hits | Attack_Resolution_Mechanics.md | NV |
| **Defense costs an action**, declared as a reaction when the attack is announced, from the same governor pool as the attack (Clout sword → Clout defense). Block = interception (part/weapon/shield); Dodge = full avoidance, opposed roll; any combat skill may parry | Attack_Resolution_Mechanics.md, Damage_Calculation_System.md | NV |
| Armor: Clothing 0.5× resist (3 layers), Light 1× (1 layer), Heavy 1.5× (−1 Celerity, −1 ActionMod). Layer order Heavy→Light→Clothing→Body, damage overflows sequentially | Armor_System.md, ActionMod_System.md | V |
| Item resist soaks 1:1 until exceeded; condition tiers 4→0; **3× resist = instant destruction** | Damage_Type_Interactions.md | V |
| bodyResist = combat absorption only, never in death saves | r-2026-07-11-01 | R |

## 2. Reactions
| Rule | Source | Status |
|---|---|---|
| Reactive actions inject into the stack only if the reactor's action is still undefined | Turn_Structure_and_Action_Economy.md | V |
| Undefined intentions = reserve; resolve faster than *changed* intentions; changing an intention loses position priority | same | V |
| Opportunity attack: leaving a threatened square "may trigger a reactive check"; ActionMod adds to the reactor's FD | Combat_Grid_System.md, ActionMod_System.md | V (trigger) / GAP (procedure) |

## 3. Special actions
| Rule | Source | Status |
|---|---|---|
| Grapple: Unarmed check to initiate, opposed each round; small weapons only | Special_Combat_Actions.md | NV |
| Grapple/push/shove = Clout contest regardless of size (later, higher authority) | Creature_Size_System.md, r-2026-05-19-05 | V |
| Called shots: Head/Neck +2 DR (lose all offensive actions), Torso +0 (lose one action), Arms −1 (lose that arm's actions), Legs −1 (movement penalty). Supersedes flat +2 | Combat_Hit_Locations.md | V |
| Coup de grace vs helpless: auto-hit, "may bypass health/frequency" — **unreconciled with one-roll Facing Death** | Special_Combat_Actions.md | NV / NEEDS MIKE |
| Disarm (skill vs skill, may damage weapon); Sunder (targets gear); Free actions (speak, drop, gesture); Joint actions (shared cost, compatible intentions) | Special_Combat_Actions.md; Turn_Structure (joint/free corroborated) | NV / V |
| Trip / Shove as named maneuvers | — | GAP (only the generic Clout contest) |

## 4. Ranged
| Rule | Source | Status |
|---|---|---|
| DR doubles per range increment past effective range: +2, +4, +8, +16, +32 | Attack_Resolution_Mechanics.md, Movement_and_Positioning.md | NV |
| Bands: Close 0–5 ft, Short 5–20, Medium 20–100, Long 100+ | same | NV |
| Cover: half = +2 DR ranged; full = ranged impossible. Terminal contextual call on geometry | Combat_Grid_System.md | V |
| Weapon catalog examples (revolvers, bows, crossbows) explicitly stale | Weapon_System.md, r-2026-06-11-01 | stale |
| Ammo tracked by item Condition: miss = −1 condition (lost), hit = recoverable | Inventory_and_Encumbrance_System.md | V |
| Reload as an action cost | — | GAP ("slow reload" tag only) |

## 5. Movement & physics
| Rule | Source | Status |
|---|---|---|
| Move per action = floor(Celerity level / 5) squares, min 1; diagonal = 1; difficult terrain ×2; climb/swim ×2 + check; stand from prone = half an action's move; can't enter occupied square unless occupant Destroyed or smaller | Combat_Grid_System.md | V |
| **Encumbrance = Clout × 10 lbs, real pounds** (repository's 0–10 Weight-Level file is STALE) | memory weight-system-stripped-actual-lbs, SoP 2026-07-11 | M (wins) |
| Falling damage | — | **GAP** |
| Drowning / breath | — | **GAP** (narrative mention only) |
| Jumping formula | — | GAP |
| Vehicle / object speed, velocity, mass, impact | — | **GAP** |

## 6. Damage application
| Rule | Source | Status |
|---|---|---|
| Impact phase: all damage/status/KRMA shifts apply simultaneously at round end | Turn_Structure, Combat_Grid_System | V |
| Multi-type order: Piercing → Slashing → Heat → Decay → Cold → Bashing → Energy | Damage_Type_Interactions.md | V |
| Body parts = items; outer layer soaks to baseResist, excess cascades. **Piercing** = attacker picks ONE internal path; all other types split evenly across children. Part at/over resist drops one condition tier. Vital part at 0 = Facing Death trigger | Body_Composition_System.md, r-2026-05-19-04 | V |
| Multiple hits same target | — | GAP (only "each cascades independently at Impact") |
| No inherent bleeding/DoT; persistent effects only via Nectars/Thorns/materials/spells/hazards | Damage_Type_Interactions.md | V |
| Short Rest: −1 Frequency current → +1 to every other attribute. Long Rest: full Frequency + clear depletion conditions; advancement window | CANON_CORE §6, r-2026-07-15-01 | R |
| In-combat healing action | — | GAP (Restoration magic only) |

## 7. Effort in combat
| Rule | Source | Status |
|---|---|---|
| **Real rule:** Effort cap = Fate Die max + Skill Level (skilled) / FD max (unskilled) — caps the total added to a roll, not pool spend. Always spent, win or lose, from governors matching the action's pillar (1–3 governors) | GROWTH-DESIGN-TRUTH §Resolution, CANON_CORE §5 | V |
| "Effort per action is limited in combat" | Turn_Structure_and_Action_Economy.md | **MISLEADING — Mike 09-03; rewrite to point at the cap above** |
| Multi-pillar skill from any participating pillar's action, but Effort must come from the SAME pillar as the action spent | Combat_Grid_System.md | V |
| Focus at 0 (Muted) = no Effort at all | CANON_CORE §2 | V |

## 8. Creatures, NPCs, objects
| Rule | Source | Status |
|---|---|---|
| Size = numeric width×length footprint; reach = max(w,l); squeeze one tier smaller; carry/push are Clout-based; cover/LOS/mount-fit = Terminal rulings | Creature_Size_System.md, r-2026-05-19-05 | V |
| Resistance = actual entities with GRO.vines + custodian Godhead, not text | memory resistance-is-entities | M |
| DR-tiered creature table (Small Animal → Ein Sof, DR 2–200+, HP/Mana framing) | Creature_Classifications.md | NV / likely pre-KRMA stale |
| Morale / NPC tactical behavior | — | **GAP** (this IS the DAYA loop in combat) |
| Objects/vehicles with actions | — | **GAP** (Mike 09-04 confirmed they exist; only mount-fit written) |

## 9. Spirit actions / magic in combat
| Rule | Source | Status |
|---|---|---|
| Spirit actions = floor((Flow+Focus)/25), Frequency excluded | r-2026-05-20-01 | R |
| Wild cast: FD + school skill vs DR, fail = Monkey Paw. Woven: FD + school + associated skill, no Monkey Paw. Multi-school uses weakest | Casting_Methods.md | NV — **assumes a Mana pool; unreconciled with Frequency-only economy — NEEDS MIKE** |
| Godhead casts carry a signature; proxy casting = anonymity | CANON_CORE §8, r-2026-08-21-03 | R |
| Failed wild cast marks skill trainable; magic levels cost 2 Frequency at Long Rest | r-2026-07-15-01 | R |

## 10. Encounter card (UI-implied)
Status PLANNED→ACTIVE→PAUSED→RESOLVED; only ACTIVE consumes actions. Map image + separate grid overlay; tokens snap by footprint; separate draggable Initiative card. Used actions tracked per pillar per participant, reset at phase end. (Combat_Grid_System.md, V.) **Time Stack ordering in that file is superseded by Mike's layered model.**

## Contradictions to resolve
1. Encumbrance: repository Weight-Level file vs locked Clout×10 lbs → rewrite file.
2. Called shots: flat +2 vs hit-location table → table wins; retire the flat rule.
3. Time Stack: BOTH repository versions vs Mike's layered model (09-03/04) → rewrite Combat_Grid_System + Turn_Structure to the layered model once complete.
4. Creature_Classifications HP/Mana framing vs Frequency/KRMA economy → likely dead; confirm.
5. **Mana / Prima Materia pool vs Frequency-only** → NEEDS MIKE: dead, folded, or separate?
6. Grapple: Unarmed-skill version vs Clout-contest version → probably compatible; state it.
7. **Coup de grace vs one-roll Facing Death** → NEEDS MIKE.

## Genuine gaps (Mike expects to fill some)
Falling damage · drowning · reload cost · ammo × action economy · trip/shove ·
morale / NPC tactics · vehicle & object action economy · multi-hit stacking ·
combat healing action · Terminal color DR thresholds · opportunity-attack
procedure · Mana status · **defense vs the slot model** (open question in the
walkthrough: does a block/dodge spend one of the defender's actions, pulling
it forward out of its later slots?).
