# Seeds_Roots_Branches_System.md

**Status:** #needs-validation
**Source:** Core Rulebook v0.4.4.md, GROWTH_System_Archive_Complete_Content_Extraction.md, rulings 2026-04-22, formulas locked 2026-05-08 (Elven design session), tier framework + aug-variance rule confirmed 2026-05-10; age-cost math synced to rulings r-2026-04-22-10/-11 on 2026-06-09
**Security:** PUBLIC
**Rulebook:** `rulebook/rulebook.md` §6 (Character Creation)
**Last Updated:** 2026-06-09

---

# Seeds-Roots-Branches Character Creation

The GROWTH character creation system uses a **three-layer approach** that builds character background through interconnected choices.

## Seeds (Character Origins)
*Species/origin templates determining starting resources and abilities.*

**Seeds provide:**
1. **Starting Frequency Budget** — the "currency" spent on Roots/Branches at creation (1 KRMA per point of budget contributes to seedKV).
2. **Base Fate Die** (d4, d6, d8 default, d12, d20).
3. **Fated Age** — species natural lifespan in cycles/years. **Replaces the retired Health Level concept** (Health Level was killed entirely 2026-04-05; do not reference WTH levels).
4. **Starting Nectars and Thorns** — graded individually (no formula) — see [[Nectars_and_Thorns_System]].
5. **Attribute augments only — NOT levels.** Augs are positive modifiers. Seeds can technically carry negative augs but it is atypical; refund-style negatives are forbidden (see "Negatives only in Thorns" below).
6. **Base Resist** — defensive stat for body parts in combat. NOT a Lady Death / death-roll modifier.
7. **Body Structure** — HUMANOID_BODY for beta. Non-humanoid body layouts deferred post-beta.
8. **Starting Skills (rare).** Default = 0 skills. Exception: species with innate-born trained ability (e.g. Synthetic / Technical Interface, Goblinoid / Scavenging, Orcish / Intimidation, Halfling / Stealth). Most starting specialization comes from Roots and Branches, not the Seed.

> **Augs vs. Levels (canon):** Seeds contribute **augs**, not levels. Initial **levels** come from [[Roots_Table|Roots]] and [[Branches_Table|Branches]] at character creation. Levels grow further through play via the **trainable mechanic**: a failed attribute or skill check marks that item `trainable`; on rest, the player Spends 1 Frequency to gain +1 level on each trainable item. Advancement is failure-driven by design. See [[Three_Pillar_Attributes]] and [[Frequency_Three_Operations]] (Spend operation).

## seedKV — How a Seed's KRMA Cost is Computed

A seed's **seedKV** is the KRMA cost a GM pays from their wallet to spawn one character of that seed. It is a deterministic **sum** of component costs plus Kai's individual grades for any Nectars/Thorns. Kai does not re-grade the stat-based components — she only grades the Nectar/Thorn blocks for synergy-aware value.

### Locked Per-Component Formulas (canon as of 2026-05-08 / 2026-05-09)

| Component | Formula | Notes |
|---|---|---|
| 1 attribute aug | **1 KRMA** per point | Mike, 2026-05-08 |
| Starting Frequency budget | **1 KRMA** per point | Matches aug rate |
| Base Resist | **2 KRMA** per point | Positive-only, absolute |
| Fate Die | d4=**5**, d6=**10**, d8=**20** (system default), d12=**40**, d20=**80** | `rulebook/rulebook.md` §3 |
| **Fated Age** | **`fatedAgeKV = ceil(fatedAge × 0.5)`** | Approach 2 / LOCKED 2026-05-08. Absolute, every cycle costs positive KRMA, no refunds. |
| Starting skill (rare) | **1 KRMA × skill level** (or 2x for magic). **Cap: level 4 (d4) at seed level.** | Skill levels 1-3 are flat bonuses (+1/+2/+3, no die); level 4 = d4. Seeds default to 0 skills; exception is species with innate-born trained ability. See [[../01_CORE_RULES/Skill_Level_Progression]]. |
| Nectar / Thorn | Kai-graded individually | No formula. Baseline scale: +1 flat mod to a roll ≈ 5 KV; contextual bonuses score lower. Thorns are LIENS (collected at death by Lady Death or sponsoring Godhead), not creation refunds. |

**Application:**
```
seedKV = sum(augs)
       + (1 × frequencyBudget)
       + (2 × baseResist)
       + fateDieKV
       + ceil(fatedAge × 0.5)
       + sum(starting skill costs)
       + sum(Nectar Kai-grades)            // positive
       - sum(Thorn lien magnitudes)         // negative, encoded as Thorn liens
```

> **Negatives only in Thorns / liens (canon).** Every stat-based formula above is **positive-only**. If a seed needs a creation-cost discount (short-lived, structurally disadvantaged, mechanically constrained), encode the discount as a **Thorn lien** with an owner Godhead (default: Lady Death). The negative KRMA is debt collected at the character's death — never a flat creation refund. Static refunds compound badly and break the GM-wallet capacity model. Reference: `memory/negatives-only-in-thorns-liens.md`.

### Fated Age — Why Approach 2 (research summary)

Approach 2 (every year costs positive KRMA) was selected over Approach 1 (clamp at human baseline) because:
- It reconstructs the paper-canon Human seedKV anchor (225) at a believable Nectar/Thorn grade.
- Short-lived seeds pay a genuinely smaller positive bill ("you exist for less time, you cost less to manifest") without requiring a per-seed Brevity Thorn template.
- It preserves the "negatives only in Thorns" rule without exception.
- It scales gracefully to god-tier and immortal seeds post-beta.

Worked example (Elven): 60 augs + 30 Freq budget + (13 × 2 = 26) Base Resist + d6 FD (10) + ceil(1000 × 0.5) = 500 fatedAgeKV + 50 First-Born Nectar − 200 Diminishing Thorn lien = **476 seedKV** (LOCKED). Full design at `WIP-elven-seed-design.md`.

## TKV Tier Framework

Aug totals are **NOT fixed across seeds.** Different seeds carry different aug magnitudes (a small/simple seed might land at 40 augs; a powerful supernatural seed at 80+). Balance is achieved at the **TKV tier** level — anchoring each seed to a starting tier — not by forcing aug parity.

| Tier | seedKV range | Anchor / Reference Seed |
|---|---|---|
| **Low** | 130 – 220 | Human ≈ 225 (paper anchor) |
| **Medium** | 220 – 350 | Altered Human ≈ 350 (paper anchor) |
| **High** | 350 – 550 | Elven = 476 (LOCKED) |
| **Premium** | 550+ | Celestial proposed ≈ 685 |

**Authoring rule:** When designing a new seed, choose a TKV tier intentionally, then size augs/Frequency/Nectar/Thorn/Fated Age/etc. to land in that tier. A starting catalog should aim for a spread across tiers so GMs at all wallet sizes have viable options. Confirmed by Mike 2026-05-10.

## Fate Die Trait Limit

Total **Nectars + Thorns ≤ Fate Die value** for the seed. Example: an Elven d6 → max 6 traits; with 2 seed-bound traits used (First-Born + Diminishing), 4 slots remain free for in-play acquisition. **Seed-bound traits cannot be replaced via the Fate Die limit mechanic** — they attach to the seed blueprint, not the character.

## Roots (Background/Upbringing)
*Custom-created based on character backstory.*

**GM Creates Root Based On:**
- Player's character backstory
- Upbringing and childhood experiences
- Cultural background and social context
- Integration with party backstories

**Root Effects:**
- **Frequency Cost** (reduced by adding age — see Age-Cost Ratio below)
- Skill proficiencies and knowledge
- Starting wealth and social connections
- Attribute modifications (typically including initial levels — see Augs-vs-Levels note above)

## Branches (Life Events)
*Custom-created based on character experiences.*

**GM Creates Branches Based On:**
- Significant life experiences from backstory
- Career paths and training
- Major events and relationships
- Character growth opportunities

**Branch Effects:**
- **Frequency Cost** (reduced by adding age)
- Advanced skill specializations
- Equipment and resources
- Narrative hooks and connections
- Attribute / level improvements

**Branch Limitations:**
- GM determines maximum number of Branches
- Must fit character's backstory narrative
- Age accumulation affects character timeline

## Character Creation Process

1. **Create Backstory** → Players develop character narrative first
2. **Choose Seed** → Determines starting Frequency budget and base abilities
3. **GM Creates Custom Root** → Based on player's backstory and upbringing
4. **GM Creates Custom Branches** → Based on player's life experiences
5. **Budget Management** → Spend Seed's Frequency on Root/Branches (minimum 1 Frequency remaining)
6. **Age Trade-offs** → Add age to reduce Frequency costs of Root/Branches

## Frequency Budget System

**Starting Budget:** Seed determines total Frequency available for character creation.
**Minimum Reserve:** Must retain at least 1 Frequency to play (cannot spend all).
**Cost Reduction:** Adding age to Roots/Branches reduces their Frequency cost.
**Age-Cost Math (rulings r-2026-04-22-10 + r-2026-04-22-11, superseding the old 2-KRMA/yr placeholder):** Root KV = attribute levels + skill levels + net Nectar/Thorn KV (no direct age term). Frequency cost = `Root KV − break-even`, where **break-even = 100 + (Root age − 18) × 5**. An average year carries ~**5 KRMA of content KV** (baseline weight, not a formula input — intense years weigh far more). **Max Root age = 25**; older development belongs to Branches. This is **decoupled** from the Seed's `fatedAgeKV` formula (`ceil(fatedAge × 0.5)`) — lifespan-as-resource (Seed) is a different economic axis than age-as-narrative-content (Roots/Branches).
**GM Budget:** GM's karma wallet (the **capacity ceiling**, not a sink — see `memory/gm-wallet-capacity.md`) determines what powerful Seeds/Roots/Branches the GM can spawn.

## Custom Creation Philosophy

**Narrative First:** Character backstory drives mechanical creation, not vice versa.
**GM Collaboration:** GMs create custom Roots/Branches to match player stories.
**Party Integration:** Backstories developed to work together as a group.
**Flexible Mechanics:** All numerical values subject to karmic evaluation and GM discretion.
**Module System:** All Seeds/Roots/Branches are custom modules created by GMs (with Selva → Creator → Kai → Et'herling authoring chain per `memory/forge-authoring-flow.md`).

## Integration with Other Systems

**[[Three_Pillar_Attributes|Frequency]] Centrality:** Character creation budget comes from Seed's Frequency.
**Fated Age:** Seeds determine the character's natural lifespan in cycles — death at Fated Age triggers a separate `Fate Die vs Lady Death` 3-strike roll (see [[Lady_Death_Protocols]]) independent of Combat Death.
**[[KRMA_System]] Integration:** Character creation costs tied to karmic evaluation system. Full per-component cost table in [[Seed_KV_Formulas]] and [[KRMA_Costs_Table]].

---

## Links
- Related: [[Three_Pillar_Attributes]], [[Nectars_and_Thorns_System]], [[Character_Advancement]], [[Frequency_Three_Operations]], [[Seed_KV_Formulas]]
- References: [[Seeds_Table]], [[Roots_Table]], [[Branches_Table]], [[KRMA_Costs_Table]]
- Examples: [[Character_Creation_Walkthrough]], `WIP-elven-seed-design.md` (gold-standard locked seed)
