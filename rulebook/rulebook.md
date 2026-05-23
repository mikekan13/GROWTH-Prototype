# GRO.WTH Canonical Rulebook

**Status:** #validated (player-facing edition; full canon lives in [[GRO.WTH Repository]])
**Source:** Compiled distillation of [[GRO.WTH Repository]] 01–07; revised continuously as new canon locks. The repo is authoritative — when this file disagrees with a `#validated` repo file, the repo wins.
**Security:** PUBLIC
**Version**: 0.2.0
**Sections audited**: 01_CORE_RULES, 02_CHARACTER_CREATION
**Last updated**: 2026-05-23

---

> **WTH RETIREMENT (2026-04-05):** This document predates the removal of
> Wealth Level, Tech Level, and Health Level. Any references to those
> systems below are historical context only — they are not active mechanics.
> See [[GROvine_System]] and [[KRMA_System]] for what replaces them.

> **POST-2026-05-19 CANON UPDATES:** This player-facing edition will be re-synced after the 2026-05-19 resolution session locked: Burn formula ([[Frequency_Three_Operations]]), Death engine transformation model ([[Death_Engine_System]]), Body composition as items ([[Body_Composition_System]]), Creature size numeric footprint ([[Creature_Size_System]]), GM subscription drip ([[GM_Subscription_KRMA]]), and trait pillar tagging ([[Nectars_and_Thorns_System]]). Until this file is regenerated, treat the linked repo files as authoritative.

---

## 1. Resolution

### 1.1 Skilled Check Sequence
- **Rule**: Roll Skill Die (SD) openly → wager Effort from attribute pools → roll Fate Die (FD) → total = SD + FD + flat modifiers + Effort vs DR.
- **Effort timing**: after seeing SD, before FD. Effort is always spent regardless of outcome.
- **Source**: `01_CORE_RULES/Basic_Resolution_System.md` + `GROWTH-DESIGN-TRUTH.md §6`
- **Confidence**: solid

### 1.2 Unskilled Check Sequence
- **Rule**: Wager Effort blind (before any dice) → roll FD → total = FD + flat modifiers + Effort vs DR.
- **Source**: `01_CORE_RULES/Basic_Resolution_System.md`
- **Confidence**: solid

### 1.3 Step 0 — Declarations & Locks
- **Rule**: GM declares DR and knowable modifiers. All boosts (allies, Nectars, items, stances) commit before any dice. After SD reveal, only Effort can change.
- **Source**: `01_CORE_RULES/Basic_Resolution_System.md`
- **Confidence**: solid

### 1.4 Success
- **Rule**: Meet or exceed DR = success. One point under = failure.
- **Source**: `01_CORE_RULES/Basic_Resolution_System.md`
- **Confidence**: solid

### 1.5 Effort Capacity
- **Rule**: Max Effort wager = current skill level + Fate Die max. (Skilled checks only; unskilled is GM-gated on which attribute provides effort.)
- **Source**: `01_CORE_RULES/Skill_Level_Progression.md`
- **Confidence**: solid

### 1.6 Contested Checks *(hole — needs Mike's ruling)*
- **Gap**: No written rule for attacker-vs-defender chain ordering. Code currently orchestrates it via SSE. Needs a written rule that matches the code.
- **Status**: NEEDS_REVIEW

---

## 2. Skill Progression

### 2.1 Skill Level Range
- **Rule**: Skill levels run 1–20 (hard cap 20).
- **Source**: `01_CORE_RULES/Skill_Level_Progression.md` + `01_CORE_RULES/Skill_System_Overview.md`
- **Confidence**: solid

### 2.2 Skill Die Progression
| Level  | Die        |
|--------|------------|
| 1–3    | flat bonus (+1, +2, +3) |
| 4–5    | d4         |
| 6–7    | d6         |
| 8–11   | d8         |
| 12–19  | d12        |
| 20     | d20        |
- **Source**: `01_CORE_RULES/Skill_Level_Progression.md`
- **Confidence**: solid

### 2.3 Character Creation Skill Cap *(Mike's ruling 2026-04-22)*
- **Rule**: At character creation, soft cap per skill ≈ 10; up to 12 only with extreme tuning (old character + stacked Root + multiple Branches pushing one skill).
- **In-play**: post-creation, skills can reach 20, but it takes significant play time to reach that on multiple skills.
- **Why this matters for Kai**: when evaluating a Root or Branch blueprint, the *sum of contributed skill levels* can push a skill up to ~10 at birth. Blueprints that trivially create skill-12+ at creation should be flagged.
- **Source**: ruling 2026-04-22
- **Confidence**: solid

### 2.4 Freeform Skill Naming
- **Rule**: Players name skills anything fitting their character; no required categories. Mechanics come through contextual triggers on Nectars/effects ("+2 when [trigger in plain English]").
- **Source**: `01_CORE_RULES/Skill_System_Overview.md`
- **Confidence**: solid

### 2.5 Combat Skill Designation
- **Rule**: Some skills are designated as combat skills at character creation. Follows same die progression; extra mechanics (e.g. multiple attacks) come through specific Nectars.
- **Source**: `01_CORE_RULES/Skill_Level_Progression.md`
- **Confidence**: probable — designation mechanism needs detail

---

## 3. Attributes & Depletion

### 3.1 Attribute Layout (9 attributes, 3 pillars)
- **Body (Salt, RED)**: Clout, Celerity, Constitution
- **Spirit (Sulfur, BLUE)**: Flow, Frequency, Focus
- **Soul (Mercury, PURPLE)**: Willpower, Wisdom, Wit
- **Canonical display order** *(ruling r-2026-04-22-09)*: `Clout, Celerity, Constitution, Flow, Frequency, Focus, Willpower, Wisdom, Wit`
- **Note**: Jan 2026 swap applied — old "Soul" labels are now Spirit, and vice versa.
- **Source**: `GROWTH-DESIGN-TRUTH.md §2` + ruling 2026-04-22
- **Confidence**: solid

### 3.2 Attribute Mechanics
- **Rule**: Each attribute has `level`, `current` pool, `augPos`, `augNeg`. Pool max = level + augPos − augNeg. Frequency is special: has level and current only (no augments).
- **Source**: `GROWTH-DESIGN-TRUTH.md §2`
- **Confidence**: solid

### 3.3 Depletion Conditions (attribute hits 0)
| Attribute    | Condition       |
|--------------|-----------------|
| Clout        | Weak            |
| Celerity     | Clumsy          |
| Constitution | Exhausted       |
| Focus        | Muted           |
| Frequency    | Death's Door    |
| Flow         | Deafened        |
| Willpower    | Overwhelmed     |
| Wisdom       | Confused        |
| Wit          | Incoherent      |
- **Multi-depletion**: all applicable effects stack.
- **Source**: `01_CORE_RULES/Attribute_Depletion_Effects.md`
- **Confidence**: solid

---

## 4. GRO.vines

### 4.1 Structure
- **Rule**: A GRO.vine has three elements — Goal (what's pursued), Resistance (what opposes), Opportunity (what the character can act on).
- **Source**: `GROWTH-DESIGN-TRUTH.md §3` + `01_CORE_RULES/GROvine_System.md`
- **Confidence**: solid

### 4.2 GRO.vine Capacity *(Mike's ruling 2026-04-22)*
- **Hard cap**: 5 active GRO.vines per entity.
- **Seed cap**: 3 at character creation from Seed alone.
- **Getting to 4 or 5**: through Nectars or items (e.g. Human's "Ambitious" Nectar grants +1).
- **Source**: ruling 2026-04-22 + `01_CORE_RULES/GROvine_System.md`
- **Confidence**: solid

### 4.3 Goal Resolution
- **Completion**: god-head bestows a final gift (typically a significant Nectar). Slot frees for new goal.
- **Failure**: character earns a Thorn (permanent negative). Thorns act as liens, not transfers.
- **Decline-to-cash option**: player can decline a Nectar and convert to raw KRMA into Frequency, but pays a tax (less than full karmic value).
- **Source**: `01_CORE_RULES/GROvine_System.md`
- **Confidence**: probable — liens model needs Mike's walkthrough

### 4.4 Opportunity Cycle *(needs Mike's walkthrough)*
- **Gap**: Rich mechanics in repo file (god-head assignment, gift types, proxy wars) that aren't in design-truth. Likely design he may or may not still endorse.
- **Status**: NEEDS_REVIEW

---

## 5. Retired Systems (formerly "WTH")

### 5.1 Per-Character WTH Levels — REMOVED 2026-04-05
- **What was removed**: Per-character Wealth Level, Tech Level, and Health Level (each 1–10, each with KRMA costs).
- **Replaced by**:
  - **Lifespan**: `fatedAge` on each Seed (was Health Level's job).
  - **Death resistance**: `bodyResist` (2:1 KRMA ratio) + Fate Die (5/10/20/40/80 for d4/d6/d8/d12/d20).
- **Still used as**: campaign-level narrative descriptors only. No per-character mechanical role.
- **Stale repo files**: all three deleted from `GRO.WTH Repository/01_CORE_RULES/` on 2026-04-22 per ruling r-2026-04-22-03. If we ever want the lifespan table back as a Seed-design reference, it's recoverable from git history.
- **Source**: `GROWTH-DESIGN-TRUTH.md §3` (WTH section)
- **Confidence**: solid

---

## 6. Character Creation

### 6.1 Three-Layer Model
- **Seed** = species/origin. Provides starting Frequency budget, base Fate Die (d4/d6/d8/d12/d20), `fatedAge` (species lifespan in years), attribute baselines, and starting Nectars/Thorns.
- **Root** = background/upbringing. GM-authored from the player's backstory. Costs Frequency; age reduces the cost.
- **Branch(es)** = life events/training after the Root. GM-authored. Cost Frequency; age reduces the cost.
- **Source**: `02_CHARACTER_CREATION/Seeds_Roots_Branches_System.md`
- **Confidence**: solid

### 6.2 Frequency Budget
- **Budget source**: Seed determines starting Frequency.
- **Minimum reserve**: character must retain ≥ 1 Frequency to play (cannot spend the entire budget).
- **Age offset**: adding years of age to a Root or Branch reduces its Frequency cost at the age-to-KV rate (§6.4).
- **GM cap**: the GM's own KRMA wallet limits the maximum power of Seeds/Roots/Branches they can author for their campaign.
- **Source**: ibid.
- **Confidence**: solid

### 6.3 Starting Nectars & Thorns *(ruling r-2026-04-22-05)*
- **What Seeds grant**: each Seed comes with a set of starting Nectars and/or Thorns. These are graded *individually* — there is no per-ability formula.
- **No "inherent abilities" concept**: the earlier language of generic "inherent abilities" is retired. All traits attached to a Seed are either Nectars, Thorns, or Blossoms (the last is temporary only).
- **Balance**: powerful starting Nectars are offset by lower starting Frequency; Thorns can compensate upward. Kai evaluates each case-by-case.
- **Source**: ruling 2026-04-22
- **Confidence**: solid

### 6.4 Age-Scaled Break-Even *(ruling r-2026-04-22-10 + r-2026-04-22-11 — supersedes r-2026-04-22-04)*

- **Root KV formula**: `Root KV = attribute_levels + skill_levels + net_nectar_thorn_KV`. No direct age term.
- **Age-scaled break-even**: `break-even KV at age Y = 100 + (Y − 18) × 5`. Each year above 18 raises the break-even by 5; each year below lowers it by 5.
- **Frequency cost/refund**: `Freq change = Root KV − break-even`. Positive = pay Freq; negative = refund Freq.
- **Age baseline weight**: an average year produces about **5 KRMA of content KV**. That's descriptive — actual years can be more intense (20–30+ KV) or quieter (1–2 KV). The formula encodes this as the age-linear break-even shift.
- **Anchor**: a Plain 18-year-old Human has a 100-KV Root. Combined with the Human Seed (225 KV), that's a reference character of **TKV 325**.
- **Max Root age (ruling r-2026-04-22-11)**: **25**. Roots cannot start a character older than 25 — past that age, development belongs to Branches, not Roots. Roots represent formative years (childhood through early adulthood).
- **Kai's norm gauge**: flag Roots whose KV-per-year ratio falls outside ~3–15.
- **Derivation**: 100 / 18 ≈ 5.56, rounded to 5.
- **Source**: rulings 2026-04-22 (r-2026-04-22-10, r-2026-04-22-11)
- **Confidence**: solid

### 6.5 Skill Cap at Creation
See §2.3 (ruling r-2026-04-22-02). Short version: per-skill soft cap ≈ 10 at creation, 12 with extreme tuning; 20 is the lifetime hard cap reachable only through extended play.

### 6.6 Approval Workflow
- **Steps**: player submits full sheet → GM reviews → GM chooses direct approval / conditional approval (small tweaks) / revision request / rejection.
- **GM review criteria**: campaign fit, power level, setting integration, thematic alignment, KRMA budget compliance.
- **Source**: `02_CHARACTER_CREATION/Character_Approval_Process.md`
- **Confidence**: solid

### 6.7 Root Ceiling (derived from §6.4)
- **Rule**: `max affordable Root KV = Seed Frequency + break-even(age) = Seed Frequency + 100 + (age − 18) × 5`.
- **Examples for Human (40 Freq)**:
  | Root age | Break-even | Max affordable Root KV |
  |---|---|---|
  | 10 | 60 | 100 |
  | 15 | 85 | 125 |
  | 18 | 100 | 140 |
  | 20 | 110 | 150 |
  | 25 (cap) | 135 | 175 |
- **Design implication**: older Roots can carry richer histories. Younger Roots are tighter. The max Root age of 25 means no Human Root exceeds 175 KV even at the cap.
- **Across Seeds at age 18**: Human → 140, Altered Human (70 Freq) → 170, Neo-Human (20 Freq) → 120.
- **Kai's check**: when evaluating a Root draft, she needs the target Seed(s) *and* the Root age. If Root KV exceeds the ceiling for the target Seed at the Root's declared age, flag it.
- **Note on Branches**: Branches also spend Frequency. A Human taking a max-affordable Root has 0 Freq left for Branches. Practical max Root for a character who wants Branches is lower.
- **Source**: rulings 2026-04-22 (r-2026-04-22-10, r-2026-04-22-11)
- **Confidence**: solid

### 6.8 Altered Human Creation-Phase N/T Mechanic *(noted, not fully locked)*
- **Rule**: Altered Human is a flexible Seed — unlike Human (which comes with baked-in Ambitious Nectar / Bounded Potential Thorn), Altered Human lets the player spend starting Frequency on Nectars, and gain starting Frequency back from Thorns. Effectively allows stacking Thorns to exceed Altered Human's listed 70 Freq and afford bigger Roots.
- **Cap**: constrained by the Fate Die limit on total N+T (§7.2).
- **Status**: mechanic exists; exchange rates and limits not yet fully locked. Altered Human's broader design is close to validated but not final.
- **Source**: Mike's note 2026-04-22; old Google Sheet column "May purchase Nectars with starting frequency / May choose Thorns to increase Frequency"
- **Confidence**: outline-level; details open

---

## 7. Nectars, Thorns & Blossoms

### 7.1 Definitions
- **Nectar** — permanent positive trait. Granted by the Godheads or earned at character creation. Stacks permanently onto the character sheet.
- **Thorn** — permanent negative trait. Incurred, not earned. Attaches permanently to the character sheet.
- **Blossom** — *temporary* positive buff bestowed by a Godhead during play. Not permanent. Not counted against the Fate Die limit.
- **Source**: `02_CHARACTER_CREATION/Nectars_and_Thorns_System.md`
- **Confidence**: solid

### 7.2 Total-Count Limit
- **Rule**: Nectars + Thorns ≤ Fate Die max value. e.g. d6 Fate Die ⇒ max 6 total; d20 ⇒ max 20 total.
- **Blossoms excluded**: temporary, don't count.
- **Source**: ibid.
- **Confidence**: solid

### 7.3 Acquisition *(ruling r-2026-04-22-06)*
- **Primary**: completed GRO.vines → Nectar; failed GRO.vines → Thorn.
- **Secondary**: Harvests frequently include Nectars as rewards; occasionally Thorns.
- **Creation-time**: Seeds, Roots, and Branches each grant a set of starting Nectars/Thorns.
- **Other**: GM assignment in response to play events; Terminal injection tied to story beats the GM authorizes; death-event Thorns.
- **Not**: the old "fears and anxieties" trigger is retired along with the Fears system (cut).
- **Source**: ruling 2026-04-22
- **Confidence**: solid

### 7.4 Individual KV Grading
- **Rule**: each Nectar/Thorn carries its own KV. There is no per-trait formula. Kai (or a human evaluator) assigns KV case-by-case based on mechanical and narrative impact.
- **Source**: ruling 2026-04-22 (r-2026-04-22-05)
- **Confidence**: solid

### 7.5 Replacement at Fate Die Limit
- **New Nectar at limit**: player chooses which Nectar or Thorn to replace.
- **New Thorn at limit**: Thorn *must* replace a Nectar (player chooses which). Cannot replace a Thorn with a Thorn.
- **Destroyed Nectar**: converts to KRMA as max Frequency, minus a small tax.
- **Source**: `02_CHARACTER_CREATION/Nectars_and_Thorns_System.md`
- **Confidence**: solid

### 7.6 Decline-a-Nectar Option
- **Rule**: a player may decline a Nectar and cash it in for raw KRMA transferred to Frequency (max Frequency). A tax applies — the player gets less than the Nectar's full karmic value.
- **Source**: ibid. (see also §4.3)
- **Confidence**: probable — tax rate not yet specified (candidate for a future ruling)

---

## 8. Harvests *(ruling r-2026-04-22-07)*

### 8.1 Concept
- **What**: narrative time-skip between sagas. GM asks "what was your character doing during this stretch of time?", player narrates, GM awards a package of rewards proportional to the time invested.
- **Pattern**: Seeds (1) → Roots (2) → Branches (3) → Harvests (4) — Harvests are the post-creation continuation of the same three-layer creation process.
- **Source**: `02_CHARACTER_CREATION/Harvests_System.md` + ruling 2026-04-22
- **Confidence**: solid

### 8.2 Time = Reward Budget
- **Rule**: the in-game time the character ages during the Harvest × age-to-KV rate (§6.4) = the KV budget the GM has to spend on rewards.
- **Rewards spend the budget**: attribute increases, skill levels, new Nectars, equipment, new tech access. Each reward costs KV per the same math that prices Roots/Branches at creation.
- **Consequence**: Harvests cost real lifespan. Mastery costs years. Strategic trade-off between power and remaining life.
- **Source**: ruling 2026-04-22
- **Confidence**: solid (but dependent on §6.4's placeholder rate)

### 8.3 GM Role
- **GM-initiated**: Harvest triggers are GM-called (not player-demanded), typically at natural story breaks.
- **Collaborative**: reward menu reflects both the player's narrative and the GM's campaign direction.
- **Granularity**: a Harvest can be short (a few months) or long (years of training montage); all use the same per-year conversion.
- **Source**: `02_CHARACTER_CREATION/Harvests_System.md`
- **Confidence**: solid

---

## 9. Items & Crafting

### 9.1 Materials
- **Fractional KV**: raw materials have KV < 1 (0.0000000000001 to 0.9999999999999). Prevents economic inflation from gathering.
- **Core properties**: Base Resist (1–50), Rarity Tier (1–10), Weight Category (1–5), type class (Soft / Hard / Hybrid).
- **Modifiers**: Dampening (halve damage type), Resistant, Proof (near-immunity), Vulnerable (double damage), Intolerance (effective resist halved vs type), plus physical mods (Flexible, Restrictive, Protective, etc.) and material flags (Flammable, Unrepairable, etc.).
- **Soft vs Hard**: Soft materials layer for cumulative protection; Hard materials don't. Soft are sewn/woven/shaped easily; Hard require specialized tools.
- **Combination formula** (current): `Final Resist = (Primary + Subordinate) / 2`. Modifiers inherit; opposing modifiers cancel.
- **No Tech Level**: Tech Level was stripped 2026-04-22 (r-2026-04-22-13). Skills gate usage now where needed.
- **Source**: `03_ITEMS_CRAFTING/Material_System.md`
- **Confidence**: solid (structure); item-level KV values are graded case-by-case (§9.5)

### 9.2 Weapons
- **Damage format**: `P:S:H/D\C:B:E` = Piercing:Slashing:Heat/Decay\Cold:Bashing:Energy.
- **Fixed damage**: weapons deal set amounts; no damage dice. Skill/attribute rolls determine hit, not damage.
- **Target attribute**: each weapon names which attribute it targets on hit (damage goes to that pool).
- **Material effects**: Sharp (bonus vs soft), Blunt (vs armor), Flexible (hard to break).
- **Modifiers**: Unblockable, Brittle, Strong (+3 break resistance), Regenerating X (heals X condition/round).
- **Crafting qualities**: Poor / Standard / Superior / Masterwork.
- **Source**: `03_ITEMS_CRAFTING/Weapon_System.md`
- **Confidence**: solid

### 9.3 Equipment Condition Scale *(ruling r-2026-04-22-12)*

| Level | State | Effect |
|---|---|---|
| **4** | **Indestructible** | Super rare special property. Cannot be destroyed. |
| **3** | Undamaged | Perfect, full effectiveness. Normal max. |
| **2** | Worn | Functional, minor performance penalty. |
| **1** | Broken | Partial function, major penalty. Effective Resist halved. |
| **0** | Destroyed | Item no longer exists. |

- **Ammo / quantity items**: use a 2-level shorthand — Sufficient (like Worn) and Finite (like Broken).
- **Degradation**: normal wear moves items down the scale; combat damage accelerates; destroyed (0) removes from game.
- **Source**: ruling 2026-04-22 (r-2026-04-22-12)
- **Confidence**: solid

### 9.4 Armor Resistance *(ruling r-2026-04-22-14)*
- **Formula**: `armor resist = base material resist × category multiplier`, rounded down.
- **Category multipliers (baseline)**:
  - Clothing: 0.5×
  - Light Armor: 1×
  - Heavy Armor: 1.5×
- **Protective modifier** (material/item mod): shifts to 1.5× / 2× / 2.5×.
- **Example**: Cotton (base resist 2) → Heavy Armor → 2 × 1.5 = 3 (or 2.5 → 2 rounded down).
- **Layered armor**: soft materials can layer for cumulative resistance; hard materials don't layer meaningfully.
- **Source**: `03_ITEMS_CRAFTING/Armor_System.md` + ruling 2026-04-22
- **Confidence**: solid (awaits final walkthrough on layer-stacking math)

### 9.5 Item KV (Graded, Not Formulaic) *(ruling r-2026-04-22-15)*
- **Principle**: a finished item's KV has no single closed-form formula. Kai grades each item individually.
- **Contributors to item KV**:
  - **Material KV**: sum of the raw materials used (these are fractional, so the contribution is small unless large quantities or premium materials are used).
  - **Abilities / powers**: special effects the item grants (e.g. Regenerating, Sharp, magical enchantments) — individually graded.
  - **Mechanical stats**: damage values, resist, capacity, range, etc.
  - **Special properties and modifiers**: Unblockable, Flexible, etc.
- **Floor**: a crafted item has KV ≥ 1 (the act of purposing raises materials above fractional).
- **Source**: ruling 2026-04-22 (r-2026-04-22-15)
- **Confidence**: solid (principle); specific item-type tables grow over time as Kai settles rulings

### 9.6 Inventory & Encumbrance
- **Weight Level scale (0–10)**: 0 negligible → 10 massive objects.
- **Carry Level = Clout attribute level**. Character can carry items at or below their Carry Level without penalty.
- **Encumbrance bands**:
  - At or below Carry Level: no penalty.
  - One level above: minor penalty (movement, actions).
  - Two+ above: cannot carry without help or adjustment.
- **Retired (WTH cleanup, r-2026-04-22-16)**: "Assets System" and "Tech Level Effects" subsections of the repo file are deleted. Large-asset tracking is narrative/GM only; tech gating is via skills.
- **Source**: `03_ITEMS_CRAFTING/Inventory_and_Encumbrance_System.md`
- **Confidence**: solid

---

## Open items for empirical validation

1. ~~Human-seed-at-18 reference character~~ — **CLOSED 2026-04-22**. Rate locked at 5 KRMA/year; Plain 18 Human reference = 325 TKV.
2. **Decline-a-Nectar tax rate** (§7.6) — currently unspecified.
3. **Contested check sequence** (§1.6) — hole. Code has it; rulebook doesn't.
4. **GRO.vine Opportunity Cycle depth** (§4.4) — repo file has rich mechanics (gift types, Liens model, Proxy Wars) pending Mike's walkthrough.
5. ~~**Fated Age KV contribution to Seed total**~~ — **RESOLVED 2026-05-08**. Locked formula: `fatedAgeKV = ceil(fatedAge × 0.5)` (Approach 2, absolute / every-cycle / positive-only, no refunds for short-lived seeds). Human 80yr = +40 KRMA; Elven 1000yr = +500 KRMA; Celestial 1500yr = +750 KRMA. Short-lived seeds pay a smaller positive bill (Goblinoid 45yr = +23) — they are NOT refunded for short lifespans; if a seed wants further KRMA discount it must encode it as a Thorn lien (per `memory/negatives-only-in-thorns-liens`). See `02_CHARACTER_CREATION/Seed_KV_Formulas.md`.
6. **Nectar/Thorn individual KV grading** — Ambitious, Bounded Potential, and others lack locked numbers. Currently Kai grades case-by-case.
