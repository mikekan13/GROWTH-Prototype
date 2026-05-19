# Seed_KV_Formulas.md

**Status:** #needs-validation
**Source:** Formulas locked 2026-05-08 (Elven design session, `WIP-elven-seed-design.md`); Approach 2 fated-age formula recommended by `elven-seed-research-2026-05-08.md` and confirmed by Mike; tier framework and aug-totals-vary rule confirmed 2026-05-10 (`memory/seed-aug-totals-vary-by-tier`); negatives-only-in-Thorns rule per `memory/negatives-only-in-thorns-liens`
**Security:** PUBLIC
**Rulebook:** `rulebook/rulebook.md` §6 (Character Creation), §3 (Attributes & Depletion)
**Last Updated:** 2026-05-10

---

# Seed KV Formulas — Per-Component KRMA Costs for Seed Authoring

This file is the single canonical reference for how to compute a **seedKV** (the KRMA cost a GM pays from their wallet to spawn one character of a given Seed). It exists to make Seed and Nectar/Thorn authoring fully self-sufficient: a fresh Claude session reading this file plus [[Seeds_Roots_Branches_System]] and [[Nectars_and_Thorns_System]] should be able to author balanced Seeds without further context.

> Authority: these formulas were locked by Mike on 2026-05-08 during the Elven seed design session and validated against the locked Elven seedKV of 476. They supersede any contrary text in older repository files. If conflict arises, this file and `WIP-elven-seed-design.md` win.

## 1. The seedKV Formula

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

A seedKV is a **sum**. Kai does NOT re-grade the stat-based components — she only grades the Nectar/Thorn blocks for synergy-aware value. Every stat-based component is **positive-only**. If a seed needs a creation-cost discount, encode it as a **Thorn lien** (debt collected by Lady Death or sponsoring Godhead at the character's death) — never as a static creation refund.

## 2. Per-Component Reference Table

| Component | KRMA Contribution | Source / Notes |
|---|---|---|
| **Attribute aug** | **1 KRMA per point** | Mike, 2026-05-08. Seeds contribute augs (positive modifiers), NOT levels. Levels come from Roots/Branches at creation and grow in play via the trainable mechanic (see [[Three_Pillar_Attributes]]). Negative augs are technically possible but atypical; do not use them as a creation-cost discount mechanism. |
| **Starting Frequency budget** | **1 KRMA per point** | Same rate as attribute aug. The Frequency budget is the pool a player spends on Roots/Branches at character creation. |
| **Base Resist** | **2 KRMA per point** | Positive-only, absolute. Source: `rulebook/rulebook.md` line 148. Base Resist applies to **body-part combat damage**, NOT death rolls — do not conflate with Lady Death formulas. |
| **Base Fate Die** | d4 = **5**, d6 = **10**, **d8 = 20 (system default)**, d12 = **40**, d20 = **80** | Source: `rulebook/rulebook.md` §3. Doubles each tier up from d6. The Fate Die also caps the seed's total Nectar + Thorn slots (see §4 below). |
| **Fated Age** | **`fatedAgeKV = ceil(fatedAge × 0.5)`** (Approach 2, LOCKED 2026-05-08) | Every cycle of lifespan costs positive KRMA, no refunds. Worked examples: Human 80yr = **+40**, Goblinoid 45yr = **+23**, Cambion 150yr = **+75**, Elven 1000yr = **+500**, Celestial 1500yr = **+750**. See §3 below for the research justification. |
| **Starting skill (rare)** | **1 KRMA × skill level** (non-magic) or **2 KRMA × skill level** (magic). Cap: **level 4 (d4)** at the seed level — never higher. | Skill levels 1-3 are flat bonuses (+1/+2/+3 to FD roll, no Skill Die); level 4 = d4. Default Seeds grant 0 skills. Exception: species with innate-born trained ability — Synthetic (Technical Interface), Goblinoid (Scavenging), Orcish (Intimidation), Halfling (Stealth), etc. See [[../01_CORE_RULES/Skill_Level_Progression]] for the full level→die chart. Cost example: a Seed granting a level-4 non-magic skill contributes 4 KRMA. |
| **Nectar** | **Kai-graded individually** (positive KV) | No formula. Baseline scale anchor: a +1 flat modifier to a roll ≈ **5 KV**; contextual / situational bonuses score lower. Graded with synergy awareness — same Nectar in a different seed re-grades differently. Reference example: Elven First-Born = +50 KV for three clauses (perception +1, mental-resistance +2, doubled short-rest recovery). |
| **Thorn (lien)** | **Kai-graded individually** (negative KV) | Functions as a **lien** — debt collected by Lady Death (default) or the sponsoring Godhead at the character's death event. Not a creation refund. Reference example: Elven Diminishing = −200 KV (Cannot Spend/Burn Frequency that would take Max ≤ current age in cycles). |

## 3. Why Approach 2 for Fated Age (research summary)

Mike commissioned a research pass on 2026-05-08 to decide between two candidate fated-age formulas. The locked decision is **Approach 2** (`ceil(fatedAge × 0.5)`, absolute, every cycle costs positive KRMA). Full reasoning is in `elven-seed-research-2026-05-08.md`. Summary of why Approach 2 won:

1. **Canon fit.** Approach 2 reconstructs the paper-canon Human seedKV anchor (225) at a believable Nectar/Thorn net (+55) for a single +1-slot Ambitious Nectar. Approach 1 (clamp at human baseline) demanded N/T = +95, outside realistic grading range.
2. **Economy fit.** A locked-Elven seedKV of 476 (Approach 2) ≈ 12% of a fresh 4,000 KRMA GM wallet — comfortable for the 5-seat subscription baseline. Monthly +400 sub + ~60-75 KRMA/character/month GRO.vine inflow outpaces aging tax.
3. **Design simplicity.** Approach 2 makes fated age a single deterministic KV term and removes the need to author a per-seed Brevity Thorn for every short-lived species.
4. **Rule preservation.** Approach 2 preserves the "negatives belong only in Thorns / liens" rule with zero exception. Short-lived seeds simply pay a smaller positive bill — they aren't refunded for short lifespans.
5. **Forward compatibility.** Linear positive scaling extends gracefully to god-tier and immortal seeds reintroduced post-beta.

## 4. Fate Die Trait Limit

Total **Nectars + Thorns ≤ Fate Die value** for the seed.

Examples:
- Elven d6 → max 6 traits. Currently uses 2 seed-bound (First-Born + Diminishing); 4 slots free for in-play acquisition.
- Synthetic d8 → max 8 traits.
- Moon-Blessed d4 → max 4 traits.

**Seed-bound traits cannot be replaced via the Fate Die limit mechanic** — they attach to the seed blueprint, not the character. If a character changes seed mid-game (canonically possible), bound traits change with it.

## 5. TKV Tier Framework

Aug totals are **NOT fixed across seeds.** Different seeds carry different aug magnitudes (a small/simple seed might land at 40 augs; a powerful supernatural seed at 80+). Balance is achieved at the TKV tier level — anchoring each seed to a starting tier — not by forcing aug parity.

| Tier | seedKV range | Anchor / Reference Seed |
|---|---|---|
| **Low** | 130 – 220 | Human ≈ 225 (paper anchor); Goblinoid ~145 |
| **Medium** | 220 – 350 | Altered Human ≈ 350 paper; Tiefling ~220; Memory-Keeper ~313 |
| **High** | 350 – 550 | Elven = 476 (LOCKED); Synthetic ~421; Starborn ~519 |
| **Premium** | 550+ | Celestial proposed ~685 |

When authoring a new seed, choose a TKV tier intentionally, then size augs/Frequency/Nectar/Thorn/Fated Age/etc. to land in that tier. A starting catalog should aim for a spread across tiers so GMs at all wallet sizes have viable options.

## 6. Worked Example — Elven (LOCKED)

This is the gold-standard reference. Use it as a template for new seed authoring.

| Component | Value | KRMA |
|---|---|---|
| Body Structure | HUMANOID_BODY | — |
| Augs (60 net) | Clout 4 / Cel 8 / Con 7 / Foc 7 / Flow 10 / Will 7 / Wis 13 / Wit 4 | **+60** |
| Fated Age | 1000 cycles → `ceil(1000 × 0.5)` | **+500** |
| Base Fate Die | d6 | **+10** |
| Base Resist | 13 → `13 × 2` | **+26** |
| Skills | none | 0 |
| Starting Frequency Budget | 30 → `30 × 1` | **+30** |
| **First-Born** Nectar (Et'herling-owned, seed-bound) | Kai-graded | **+50** |
| **Diminishing** Thorn (Lady Death lien, seed-bound) | Kai-graded | **−200** |
| **TOTAL seedKV** | | **+476** |

Full design (clauses, narrative, synergy analysis) at `WIP-elven-seed-design.md`.

## 7. Rules for Authoring New Seeds

1. **Pick a TKV tier first.** Decide what the seed is supposed to feel like economically — Low (accessible to mid-tier GM wallets), Medium (balanced), High (premium), or Premium (god-tier).
2. **Size augs to identity, not parity.** Smaller/simpler seeds get fewer augs; powerful/magical seeds get more.
3. **Apply the formulas mechanically** for augs / Frequency / Base Resist / Fate Die / Fated Age / Skills.
4. **Author Nectars and Thorns as play-defining EXPLOITS**, not D&D-style stat tweaks. A +1 flat modifier alone is not a Nectar — the trait should reshape resource economy, action options, or rule interactions in a way that defines the character's mechanical identity throughout the campaign. See `WIP-15-seeds-batch-2026-05-09.md` and the locked Elven (First-Born + Diminishing) for the model.
5. **All Thorns are LIENS.** Encode them as negative KV graded by Kai; the lien is collected at character death by the owner Godhead (default: Lady Death).
6. **Sum to your target tier.** Validate that the resulting seedKV lands within the chosen tier range.
7. **Submit via the Forge authoring chain** (Selva → Creator → Kai → Et'herling, per `memory/forge-authoring-flow`). GMs submit, Et'herling approves.

---

## Links
- Related: [[Seeds_Roots_Branches_System]], [[Three_Pillar_Attributes]], [[Nectars_and_Thorns_System]], [[Frequency_Three_Operations]], [[KRMA_System]]
- References: [[KRMA_Costs_Table]], [[Seeds_Table]]
- Examples: `WIP-elven-seed-design.md` (LOCKED), `WIP-15-seeds-batch-2026-05-09.md` (15-seed authoring briefing)
