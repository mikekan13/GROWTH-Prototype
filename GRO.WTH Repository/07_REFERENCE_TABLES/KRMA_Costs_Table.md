# KRMA_Costs_Table.md

**Status:** #needs-review
**Source:** GROWTH_System_Archive_Complete_Content_Extraction.md
**Security:** PUBLIC
**Last Updated:** 2026-05-03

> **WTH retirement (2026-04-05):** Per-character Tech Level and Wealth Level rows have been removed from Character Creation Costs. Tech access is gated by skills + campaign setting; wealth is campaign-flavored currency, not a per-character level.

---

# KRMA Costs Table

Complete reference for all [[KRMA_System|KRMA]] expenditure costs and character advancement options.

## Emergency Rerolls

| Action | First Time | Second Time | Third Time | Notes |
|---|---|---|---|---|
| **Death Save Reroll** | 2 KRMA | 5 KRMA | 10 KRMA | Escalating cost per use |
| **Critical Failure Reroll** | 1 KRMA | 2 KRMA | 4 KRMA | GM discretion required |
| **Important Check Reroll** | Variable | Variable | Variable | GM determines cost |

## Language Acquisition

| Language Difficulty | KRMA Cost | Examples | Learning Time |
|---|---|---|---|
| **Easy** | 3 KRMA | Related to native language | Weeks |
| **Moderate** | 5 KRMA | Standard foreign languages | Months |  
| **Hard** | 8 KRMA | Completely alien languages | Years |

### Language Categories
**Easy:** Same language family, similar grammar structure  
**Moderate:** Different family but established learning resources  
**Hard:** Completely alien structure, limited resources, dead languages

## Skill Proficiency Advancement

**Skill levels go 1 to 20.** Levels 1-3 are flat bonuses (+1, +2, +3 to the Fate Die roll — no Skill Die rolled). Skill Die starts at level 4. **There are no d2 or d3 dice** (Mike confirmed 2026-05-11; corrects earlier `#needs-review` table that listed Apprentice d2 / Novice d3 / Student d4 — those KRMA values were stale).

Full level → die mapping is in [[../01_CORE_RULES/Skill_Level_Progression]] (#validated). Summary:

| Skill Level | Die | Effect on rolls |
|---|---|---|
| 1 / 2 / 3 | none | Flat +1 / +2 / +3 to FD roll |
| 4-5 | d4 | Roll Skill Die + Fate Die |
| 6-7 | d6 | Roll Skill Die + Fate Die |
| 8-11 | d8 | Roll Skill Die + Fate Die |
| 12-19 | d12 | Roll Skill Die + Fate Die |
| 20 | d20 | Roll Skill Die + Fate Die |

**KRMA cost per level (post-creation advancement):**

| Skill Type | KRMA per +1 level |
|---|---|
| Non-magic skill | **1 KRMA** |
| Magic skill | **2 KRMA** |

Same 1:1 / 2:1 conversion applies whether the level being advanced is flat-bonus (1-3) or die-rolling (4+). Source: Mike, 2026-05-11. See [[../01_CORE_RULES/Skill_Level_Progression]], `memory/skill-tiers-start-at-d4`, and `memory/attributes-and-skills-krma-rates`.

## Attribute Enhancement (post-creation advancement)

**All attribute levels are 1:1 KRMA:Frequency:level** (Mike confirmed 2026-05-11). Body / Spirit / Soul pillar distinctions do NOT change the cost — the legacy Body=4 / Mind=8 entries below in Character Creation Costs are **outdated** and should be ignored.

| Attribute Action | KRMA Cost | Notes |
|---|---|---|
| **Any attribute +1 level** | **1 KRMA** | Universal rate. Reduces Frequency Max by 1 (the canonical Spend operation). |

Trainable mechanic: a failed non-skill attribute check marks that attribute as **trainable**. On rest, the player may Spend 1 Frequency to advance the trainable attribute by 1 level. Same loop applies to failed skill checks (1 KRMA per skill level, or 2 KRMA for magic skills).

*Source: `memory/trainable-attribute-skill-growth`, `memory/attributes-and-skills-krma-rates`.*

## Special Purchases

| Item/Service | KRMA Cost | Availability | Notes |
|---|---|---|---|
| **Rare Equipment Access** | 5-20 KRMA | GM discretion | Depends on item rarity |
| **Minor Story Influence** | 10 KRMA | Limited scope | Small narrative changes |
| **Divine Favor** | 15-30 KRMA | Deity dependent | Temporary blessing |
| **Professional Training** | Variable | Instructor dependent | Accelerated learning |

## Death Recovery Costs

| Death Circumstance | Base Cost | Modifiers | Success Rate |
|---|---|---|---|
| **First Death** | Standard reroll costs | None | Normal |
| **Second Death** | +5 KRMA to all costs | -1 to all rolls | Reduced |
| **Third Death** | +10 KRMA to all costs | -2 to all rolls | Heavily reduced |

### Death Recovery Modifiers
**Multiple Deaths:** Escalating costs and penalties  
**Heroic Death:** Potential cost reduction for noble sacrifice  
**Cowardly Death:** Potential cost increase for shameful death  
**Time Delay:** Costs may increase if resurrection delayed

## Character Creation Costs

| Creation Option | KRMA Cost | Budget Impact | Notes |
|---|---|---|---|
| **Attunement** | 15 KRMA | Special ability | Magical sensitivity |
| **Supernatural Access** | 30 KRMA | Major ability | Inherent magic/powers |
| ~~Body Attributes (4 KRMA)~~ | **STALE — DO NOT USE** | — | Corrected 2026-05-11: all attribute levels are 1:1 KRMA. See Attribute Enhancement section above. |
| ~~Mind Attributes (8 KRMA)~~ | **STALE — DO NOT USE** | — | Same as above. The 4/8 distinction never reflected canon. |

### Character Creation Budget
**Starting Recommended:** ~50 KV (Karmic Value)
**Base Template:** 200 KV (100 Seed + 100 Root - Age×2) — legacy paper anchor; see TKV tier framework in [[Seeds_Roots_Branches_System]] for current canon (Low 130-220, Medium 220-350, High 350-550, Premium 550+).
**Annual Earning Rate:** ~156 KRMA per year of play

### Branch Examples with Costs
- **Arcane Awakening:** 27 KRMA (Trayman version)
- **Sailor (Greenhorn):** 12 KRMA (+2 age, attribute/skill bonuses)

## Seed Component Costs (canon — locked 2026-05-08 / 2026-05-09)

**Status:** #needs-validation — formulas locked during the Elven design session and confirmed against the locked Elven seed (seedKV 476). Full reasoning in `WIP-elven-seed-design.md` and `elven-seed-research-2026-05-08.md`.

These are the per-component KRMA contributions to a **seedKV** (the cost a GM pays to spawn one character of that Seed). All contributions are **positive-only** — refund-style negatives are forbidden and must be encoded as Thorn liens (see [[Nectars_and_Thorns_System]] and `memory/negatives-only-in-thorns-liens`).

| Component | KRMA Cost | Notes |
|---|---|---|
| **1 attribute aug** | 1 KRMA | Same rate as Frequency budget point. Seeds contribute augs, NOT levels. |
| **Starting Frequency budget** | 1 KRMA per point | The pool of Frequency the player spends on Roots/Branches at creation. |
| **Base Resist** | 2 KRMA per point | Defensive stat for body parts in combat (NOT a death-roll modifier). Positive-only, absolute. |
| **Base Fate Die** | d4 = 5, d6 = 10, **d8 = 20 (system default)**, d12 = 40, d20 = 80 | Source: `rulebook/rulebook.md` §3 |
| **Fated Age** | `ceil(fatedAge × 0.5)` | Approach 2, LOCKED 2026-05-08. Absolute, every cycle costs positive KRMA, no refunds. Worked examples: Human 80yr = +40, Goblinoid 45yr = +23, Elven 1000yr = +500, Celestial 1500yr = +750. |
| **Starting skill (rare)** | **1 KRMA × skill level** (non-magic) or **2 KRMA × skill level** (magic). Capped at level 4 (d4) for seed grants. | Seeds default to 0 skills. Exception: species with innate-born trained ability grant a skill at level 1-4 (never higher at the seed level). Levels 1-3 are flat-bonus skills (no die); level 4 = d4. Cost example: level 4 non-magic = 4 KRMA. |
| **Nectar** | Kai-graded individually | No formula. Baseline scale: +1 flat mod to a roll ≈ 5 KV (contextual / situational bonuses score lower). Graded with synergy awareness — same Nectar in a different seed re-grades differently. |
| **Thorn (lien)** | Kai-graded individually (negative) | Functions as a **lien** collected by Lady Death (or the sponsoring Godhead) at the character's death. Not a creation refund. |

**Application formula:**

```
seedKV = sum(augs)
       + (1 × frequencyBudget)
       + (2 × baseResist)
       + fateDieKV
       + ceil(fatedAge × 0.5)
       + sum(starting skill costs)
       + sum(Nectar Kai-grades)
       - sum(Thorn lien magnitudes)
```

### Age-Cost Ratio (Roots/Branches reductions)

Separate from `fatedAgeKV` above. Adding age to a **Root or Branch** reduces that Root/Branch's Frequency cost at the rate of **1 year = 2 KRMA reduction** (ruling r-2026-04-22-04). This is the *Root/Branch reduction* axis and is **decoupled** from the Seed's `fatedAgeKV` formula by design (lifespan-as-resource vs. age-as-narrative-content).

### TKV Tier Anchors (for balancing new seeds)

| Tier | seedKV range | Reference |
|---|---|---|
| Low | 130 – 220 | Human ≈ 225 paper |
| Medium | 220 – 350 | Altered Human ≈ 350 paper |
| High | 350 – 550 | Elven = 476 LOCKED |
| Premium | 550+ | Celestial proposed ≈ 685 |

Aug totals are NOT fixed across seeds — vary aug magnitude to the seed's identity, then size other components to land in the desired tier. See [[Seeds_Roots_Branches_System]] §"TKV Tier Framework".

## Group and Campaign Costs

| Group Purchase | KRMA Cost | Participants | Duration |
|---|---|---|---|
| **Group Divine Favor** | 50 KRMA total | Entire party | Single adventure |
| **Campaign Influence** | 100+ KRMA | Group decision | Permanent change |
| **Reality Alteration** | 200+ KRMA | GM approval required | Major story impact |

### Group Purchase Rules
**Shared Costs:** Multiple characters can contribute KRMA  
**Consensus Required:** All participants must agree  
**GM Authority:** GM can veto group purchases  
**Campaign Impact:** Major purchases affect entire campaign

## Earning Rate Reference

**Weekly Sessions:** ~3 KRMA per session average  
**Annual Accumulation:** ~156 KRMA per year  
**Exceptional Performance:** Bonus KRMA for outstanding play  
**Story Milestones:** Major achievements grant bonus KRMA

---

## Links
- Related: [[KRMA_System]], [[Character_Advancement]], [[Skill_Level_Progression]], [[Seeds_Roots_Branches_System]], [[Seed_KV_Formulas]], [[Nectars_and_Thorns_System]]
- References: [[Character_Creation_Costs]], [[Advanced_KRMA_Options]]
- Examples: [[KRMA_Spending_Strategies]], `WIP-elven-seed-design.md`