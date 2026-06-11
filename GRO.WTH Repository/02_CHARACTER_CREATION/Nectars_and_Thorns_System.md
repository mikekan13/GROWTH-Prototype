# Nectars_and_Thorns_System.md

**Status:** #needs-validation
**Source:** Core Rulebook v0.4.4.md (lines 610-636); User clarifications 2025-10-03, 2026-04-22, 2026-05-08, 2026-05-10; `WIP-elven-seed-design.md` (locked 2026-05-09); `WIP-15-seeds-batch-2026-05-09.md`
**Security:** PUBLIC
**Rulebook:** `rulebook/rulebook.md` §7 (Nectars, Thorns & Blossoms)
**Last Updated:** 2026-05-10

---

# Nectars & Thorns System

**Nectars & Thorns** represent the **quintessential traits and abilities** that define a character within GROWTH, serving as pivotal aspects of character identity with deep narrative and gameplay impact.

## Paper-Version Name: "Exploits"

The paper-version (pre-digital) name for Nectars, Thorns, and [[Blossoms]] was literally **"Exploits."** That name describes what they do: they **exploit, augment, and change the base rules of the game** to make a character feel mechanically unique.

**MTG analogy (Mike, ADMIN):** "Think MTG commander decks. The abilities of a commander basically define how that person builds and uses their entire deck." A Nectar/Thorn should define how the player builds, plans, and plays the entire character — not just nudge a number on a check.

### Play-Defining Principle (locked 2026-05-10) #needs-validation

A Nectar/Thorn must answer the question: **"How does playing this character feel mechanically different from playing a baseline [[Seeds_Roots_Branches_System|Human]]?"**

- **Failure mode (forbidden):** D&D-style racial traits ("+2 Dex, advantage on Stealth"). These produce variant Humans, not seed-defined characters. A flat +N modifier is NOT, by itself, a Nectar.
- **Success mode (required):** The Nectar/Thorn changes how the player plans, manages resources, takes risks, or interprets game state. It carries weight in **every** session, not only in niche check contexts.

**Authoring checklist:**
1. **"Would removing this make the seed feel meaningfully different?"** If no, it is not pulling its weight.
2. Prefer **resource-economy rewrites** ("Short Rest works differently") over flat numeric modifiers.
3. Prefer **rule-bending exploits** ("once per session, declare a roll succeeded before rolling") over stat tweaks.
4. Prefer **strategic constraints** ("cannot use Flow Effort") over minor penalties.
5. Flat ±N modifiers are acceptable as **part of** a larger play-defining clause, but never as the entire Nectar/Thorn.

**Reference standard:** The locked Elven seed (`WIP-elven-seed-design.md`) is the gold standard — **First-Born** Nectar (Short Rest doubled clause) + **Diminishing** Thorn (Frequency Max ≤ age in cycles forbidden) together rewrite the character's entire Frequency economy across their lifespan.

### Easy-to-Track Principle (locked 2026-05-10) #needs-validation

Even though server-side AI tracks all state, **the player still needs to know what their character does and when it triggers without consulting the screen mid-decision.** Exploits must sit in working memory naturally.

- **Prefer binary state triggers** (in this state / not in this state — a single flag).
- **Prefer player-triggered exploits** ("once per encounter, you may declare X") over auto-trigger thresholds — the player chooses the moment.
- **Prefer zero-thresholds** ("when any pool hits 0") over percentage thresholds ("when at 25%").
- **Avoid** percentage math, ratios, multi-pool conditions, or "if X happened this scene" recall-over-time tracking.
- The mechanical complexity belongs in **what** the exploit does, not in **when** it activates.

## Nectars (Permanent Beneficial Traits)

**Definition:** Permanent positive abilities gained through completing [[GROvine_System|GRO.vines]] or during character creation
**Nature:** Permanent beneficial traits bestowed by Godheads that grant special powers or improve existing skills
**Acquisition:** Granted during character creation through [[Seeds_Roots_Branches_System|Seeds, Roots, and Branches]], or by Godheads upon GRO.vine completion
**Function:** Reflect inherent qualities, training, and growth milestones
**Decline Option:** A player may decline a Nectar and cash it in for raw [[KRMA_System|KRMA]] (transferred to [[Three_Pillar_Attributes|Frequency]]), but a tax applies

> **Not to be confused with [[Blossoms]]:** Blossoms are **temporary** effects bestowed by Godheads during play, whereas Nectars are **permanent**. **Blossoms can be NEGATIVE** (locked Mike 2026-06-11, ruling r-2026-06-11-05) — e.g., Lady Tara may attach a trigger-related Thorn *or Negative Blossom* to a character who survives Facing Death.

### Blossoms — Lighter Design Standard

**Blossoms do NOT need to meet the full play-defining-exploit standard of Nectars and Thorns** (Mike confirmed 2026-05-11). Because they are *temporary* — granted during play, expiring after a scene/encounter/situation — they get a lighter design bar:

- Simple stat boosts, single-clause buffs, or one-encounter resource bonuses are acceptable.
- The play-defining / MTG-commander-analogy standard applies to **Nectars and Thorns** (permanent identity-defining traits), NOT to Blossoms.
- The **easy-to-track principle** (binary states, player-triggered, no mid-combat math) still applies — players still need to remember what their Blossom does.
- Blossoms do NOT count against the Fate Die total-trait limit (already canon — they are temporary).

The MTG-commander analogy is for the things that *define how the deck is built*. Blossoms are tactical instants — flavor and immediate utility, not strategic identity.

### Nectar Characteristics
- **Unlimited Potential:** Crafted from character's experiences, no mechanical restrictions on what they can do
- **Character Growth:** Represent positive development and learned abilities  
- **Story Integration:** Deeply woven into character's narrative and identity
- **Mechanical Benefits:** Provide tangible gameplay advantages and special capabilities

## Thorns (Permanent Challenging Traits)

**Definition:** Permanent negative effects that characters must contend with
**Nature:** Physical, mental, or situational disadvantages
**Purpose:** Add depth and complexity to character narrative
**Acquisition:** Can be gained during character creation, from failed [[GROvine_System|GRO.vines]], or from death

### Thorn Characteristics
- **Narrative Depth:** Create internal conflicts and character development opportunities
- **Realistic Limitations:** Represent the fact that all characters have flaws and struggles
- **Story Hooks:** Provide GMs with built-in adventure and conflict opportunities
- **Balance Mechanism:** Counterbalance powerful Nectars with meaningful limitations

### Thorns Are Liens, Not Refunds (locked 2026-05-08) #needs-validation

A Thorn's negative [[KRMA_System|KRMA]] value represents a **lien** — a deferred debt collected at the character's death by the Thorn's owner Godhead (typically [[Lady_Death_Protocols|Lady Death]]) — **not** a creation-time refund.

**Why:** Static refund mechanics compound badly with other refundable components and can produce zero-cost or negative-cost seeds — characters that the GM gets paid to spawn. That breaks the GM-wallet capacity model and the economy at large. Thorns avoid this because the negative is a deferred debt: the GM gets a creation discount, but Lady Death (or the designated recipient Godhead) collects the debt at the character's death event. The economy stays balanced over the character's lifecycle.

**Authoring rules:**
- When designing seed-cost formulas (Fate Die, Base Resist, Fated Age, etc.), keep them **positive-only**. Use `max(0, ...)` clamps where a formula would otherwise go negative.
- If a seed needs a creation-cost discount (e.g., short-lived races, structural disadvantages), encode it as a **Thorn lien** with the appropriate recipient (typically Lady Death).
- When grading Thorns, the negative KV represents the **lien magnitude** collected at death — not a flat creation rebate.
- **Reference:** Elven `Diminishing` Thorn = −200 KV, lien collected by Lady Death at the death event, *before* the normal death-split per [[Lady_Death_Protocols]].

### Seed-Bound vs Character-Bound

Many Nectars and Thorns are **seed-bound** — they attach to the seed blueprint, not to the character. If the character changes seed mid-game (canonically possible), bound traits change with it. Seed-bound traits **cannot** be replaced via the Fate Die Limit mechanic.

Trait flag schema (post-beta implementation): `source`, `bound`, `permanence`, `origin_godhead`, `lien_amount`, `lien_recipient`.

## Acquisition During Gameplay

*Updated 2026-04-22 (ruling r-2026-04-22-06). The prior "fears and anxieties" trigger language is retired.*

> **Fears:** Reserved for future expansion. Not a current GROWTH system. See FOUNDATIONS.md and design-truth §18.

### Primary Sources
- **[[GROvine_System|GRO.vines]]** — the main driver. Completing a GRO.vine typically bestows a Nectar; failing one typically bestows a Thorn.
- **[[Harvests_System|Harvests]]** — narrative time-skip packages frequently include Nectars as rewards (and occasionally Thorns).
- **Character creation** — Seeds, Roots, and Branches each grant starting Nectars/Thorns per their design.

### Other Sources
- **GM assignment** — the GM may grant a Nectar or Thorn in response to in-play events outside the GRO.vine/Harvest cycle (granted powers, wounds, curses, etc.).
- **[[Terminal_Interface|Terminal]] injection** — the Terminal may surface Nectars/Thorns that even the GM did not preconceive, tied to specific story beats or consequences the GM authorizes.
- **Death events** — Thorns can arise from death consequences (see [[Death_Mechanics]] when documented).

### Character of Acquisition
- **Both reward and consequence**: Nectars are earned, Thorns are incurred; both leave permanent marks.
- **Individual grading**: each Nectar/Thorn carries its own KV; there is no formula per trait. Kai evaluates case-by-case.
- **Evolving character**: acquisition is ongoing. A character's Nectar/Thorn set will shift across a campaign's lifetime.

### Synergy-Aware Grading (locked 2026-05-08) #needs-validation

Blocks (Nectars, Thorns, [[Blossoms]], [[Seeds_Roots_Branches_System|Seeds]], items, etc.) are **NOT graded in isolation.** Synergies — and game-breaking combinations — are explicitly part of [[Godheads_System|Kai's]] grading job in the multi-step Godhead authoring chain (Selva → Creator → Kai → Et'herling).

**Implication:** A block's KV depends on the context it's authored for and how it interacts with other blocks in that composition. The same Nectar block reused in a different seed may legitimately re-grade to a different KV if the synergy profile differs. Kai also catches and prices break-risk combinations.

**Example:** In the locked Elven seed, the **Diminishing × First-Born** interaction (forced high Frequency reserves + double-efficient Short Rest recovery) was deliberately priced as a synergy. Old Elven are remarkably hard to wear down — that is the design *feature*, and Kai accounted for it during synergy-aware grading.

See [[Block_Grading_Principles]] for the full grading framework.

## Limits and Management

### The Fate Die Limit
**Maximum Total:** Number of Nectars + Thorns cannot exceed character's **Fate Die** value  
**Example:** Character with d8 Fate Die can have maximum 8 combined Nectars and Thorns

### Replacement Mechanics

**IMPORTANT:** Replacement only occurs when character is **at Fate Die limit**. Characters under the limit simply gain new Nectars/Thorns without replacement.

#### Gaining New Nectars (At Maximum)
**Condition:** Character at Fate Die limit receives new Nectar
**Rule:** Player **chooses** which existing Nectar or Thorn to replace
**Control:** Player maintains agency over character development

#### Gaining New Thorns (At Maximum - Forced Replacement)
**Condition:** Character **at Fate Die limit** receives new Thorn
**Rule:** New Thorn **must replace an existing Nectar** (player chooses which Nectar)
**Cannot Replace:** Cannot replace existing Thorns with new Thorn
**Conversion:** Destroyed Nectar converts to [[KRMA_System|KRMA]] as max [[Three_Pillar_Attributes|Frequency]] (after small tax)
**Consequence:** Character growth through adversity reduces beneficial traits but provides resource compensation

**Example:** Character with d6 Fate Die has 4 Nectars + 2 Thorns (at limit). Gains new Thorn → must choose 1 Nectar to destroy → destroyed Nectar converts to max Frequency (minus tax)

### Strategic Implications
- **Careful Development:** Players must consider long-term character evolution
- **Risk vs Reward:** Pursuing growth opportunities may risk gaining Thorns
- **Narrative Consequences:** Character choices directly impact mechanical development
- **GM Tools:** Thorns provide natural story complications and character challenges

## Integration with Character Creation

**Seeds:** Provide initial Nectars based on racial/origin traits  
**Roots:** Grant Nectars from background and upbringing  
**Branches:** Add both Nectars and potential Thorns from life experiences  
**Starting Balance:** Character creation establishes initial Nectar/Thorn distribution

## Live Balance Adjustments

Nectars and Thorns are **not locked forever**. The [[GM_Flag_Mechanic|GM "flag overpowered" reporting mechanic]] allows GMs to flag any block as imbalanced for review by [[Godheads_System|Et'herling]] (Justice, unbiased). If confirmed, [[Godheads_System|Kai]] reworks the block metaverse-wide and pays the flagging GM a KRMA reward from her own wallet. This means canon evolves through play.

---

## Links
- Related: [[Seeds_Roots_Branches_System]], [[Terminal_Interface]], [[Character_Advancement]], [[Godheads_System]], [[GM_Flag_Mechanic]], [[Block_Grading_Principles]]
- References: [[Fate_Die_Mechanics]], [[Harvests_System]], [[Lady_Death_Protocols]]
- Examples: [[Nectar_Thorn_Development_Scenarios]]