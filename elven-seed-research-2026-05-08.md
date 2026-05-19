# Elven Seed Research — 2026-05-08

## Executive Summary
- Paper-canon Human seedKV = **225**, Elven = **255**, Cambion = **280** (`app/src/lib/seed-catalog.ts:1`); these are the only stable anchors we have, and the rulebook reaffirms 225 for Human (`rulebook/rulebook.md:186`).
- GM wallet is a **capacity ceiling, not a sink**: ~4,000 lump sum + ~400/month flat (`memory/krma-economy-master-reference.md`); a 400-500 KRMA Elven seed consumes 10-12% of a fresh wallet — well within range.
- Approach 2 (every year costs KRMA) reconstructs Paper-Human cleanly (130 base + 40 age + ~55 N/T = 225) while Approach 1 needs Nectar/Thorn ~+95 to hit the same anchor — Approach 1 is the worse fit to canon.
- The "negatives belong only in thorns/liens" rule is preserved by Approach 2: short-lived seeds still pay positive KRMA for their (short) life and recoup via Nectars or a Brevity-style Thorn — they aren't refunded for being short-lived.
- **Recommendation: Lock Approach 2** (`fatedAgeKV = ceil(fatedAge × 0.5)`, absolute, every year costs KRMA). It is canon-consistent, economically supportable, and avoids the design debt of authoring a Brevity Thorn for every short-lived seed.

## KRMA Economy Current State

| Norm | Value | Source |
|---|---|---|
| Total supply | 100B (hard cap) | `KRMA_System.md:18` |
| Reserves | Terminal 75B / Balance 12.5B / Mercy 6.25B / Severity 6.25B | `KRMA_System.md:21-25` |
| Burn cap | 5B globally, then disabled forever | `KRMA_System.md:27` |
| GM signup lump sum | ~4,000 KRMA | `memory/krma-economy-master-reference.md` |
| GM monthly allocation | ~400 KRMA flat | same |
| Nectar decline tax | ~10% to GM | `KRMA_System.md:76` |
| Character growth rate | ~60-75 KRMA/month via GRO.vine | `memory/krma-economy-master-reference.md` |
| Starting character TKV | ~200 (paper anchor 225 Human) | same + `seed-catalog.ts` |
| God-tier TKV | ~3,000 | same |
| GROvine Frequency gift | 1-3 KRMA | `memory/grovine-krma-flow.md` |
| Attribute aug | 1 KRMA per point | locked (Mike) |
| Frequency point | 1 KRMA | `KRMA_System.md:120` |
| Base Resist | 2 KRMA per point | `rulebook/rulebook.md:148` |
| Fate Die | 5/10/20/40/80 (d4/d6/d8/d12/d20) | same |
| Age-to-KRMA on Roots/Branches | 1 year = 2 KRMA | `Seeds_Roots_Branches_System.md` (ruling r-2026-04-22-04) |
| Bell-curve subscription tiers | `[NEEDS MIKE]` | `ROADMAP.md:248` |

Reference character (per `rulebook/rulebook.md:186`): Plain 18-yr Human = Seed 225 + Root 100 = **TKV 325**.

## Formula Comparison

Using locked Elven components (augs +60, FateDie d4=5, BaseResist 13×2=26, Nectar +50, Thorn −200 = **−59 fixed**) plus per-seed fatedAge KV plus Frequency.

For other seeds, I use paper-catalog stats (`seed-catalog.ts:1`) and reduce Nectar/Thorn to a single net term `±N/T` to compare structures cleanly.

### Elven (locked: augs 60, freq variable, age 1000, FD 5, BR 26, N 50, T −200)

| Freq | Approach 1 (clamp, age=460) | Approach 2 (absolute, age=500) | Δ |
|---|---|---|---|
| 20 | 421 | 461 | +40 |
| 30 | 431 | 471 | +40 |
| 40 | 441 | 481 | +40 |
| 50 | 451 | 491 | +40 |

### Paper-seed reconstruction (does the formula recover canon anchors?)

Component recipe: `augs + FD + BaseResist×2 + Frequency + fatedAgeKV + N/T = seedKV` (paper).

| Seed | augs | FD | BR×2 | Freq | Age | A1 ageKV | A2 ageKV | Paper seedKV | A1 implied N/T | A2 implied N/T |
|---|---|---|---|---|---|---|---|---|---|---|
| Human | 50 | 10 | 30 | 40 | 80 | 0 | 40 | 225 | **+95** | **+55** |
| Altered Human | 50 | 10 | 30 | 70 | 85 | 3 | 43 | 350 | +187 | +147 |
| Elven (paper, age 500) | 60 | 5 | 26 | 30 | 500 | 210 | 250 | 255 | −76 | **−116** |
| Cambion | 53 | 10 | 32 | 40 | 150 | 35 | 75 | 280 | +110 | +70 |
| Goblinoid (hypothetical, age 45) | 50 | 10 | 30 | 30 | 45 | 0 | 23 | TBD | TBD | TBD |

Two observations matter:

1. **Approach 2 recovers Paper-Human at N/T = +55.** That is plausible for "Ambitious" Nectar (+1 GRO.vine slot, baseline-shifting trait) net of "Bounded Potential" Thorn. Approach 1 demands N/T = +95, which is a far heavier nectar than a single +1-slot trait.
2. **Paper Elven (age 500)** under Approach 2 implies a net N/T of **−116**, very close to our locked Elven recipe's net of **−150** (+50 First-Born minus −200 Diminishing). This is internally consistent — the locked Elven is a slightly thornier paper-Elven, which makes sense given Diminishing is a hefty thorn.

### Locked-Elven seedKV under Approach 2 (recommended)

| Freq budget | seedKV | % of fresh GM wallet (4,000) |
|---|---|---|
| 20 | 461 | 11.5% |
| 30 | 471 | 11.8% |
| 40 | 481 | 12.0% |
| 50 | 491 | 12.3% |

A GM with one fresh 4,000 wallet can spawn ~8 Elven characters at this density before hitting capacity — comfortably above the "5 seats per Watcher" subscription baseline (CLAUDE.md). Monthly +400 + ~60-75/character/month GRO.vine inflow keeps the wallet growing faster than character investment ages it.

## Short-Lived Seed Treatment

**Goblinoid (fatedAge 45) under both approaches:**

- Approach 1: ageKV = 0 (clamped). The Goblinoid pays the same age-line as a Human despite a 35-year-shorter life. To get the "short-lived = cheaper" feel, we must author a per-seed *Brevity Thorn* (lien collected at Goblinoid's earlier death). This is design debt: every short-lived seed needs its own Brevity Thorn, each Kai-graded for synergy, and the discount is conditional on Lady Death not settling the lien.
- Approach 2: ageKV = 23. Goblinoid is genuinely cheaper than Human (40) by 17 KRMA — a clean economic identity ("you exist for less time, you cost less to manifest"). No Brevity Thorn required. A Goblinoid player who *wants* to lean further into the short-life identity can still take an *optional* Diminishing-style thorn (lien) for additional KRMA, but the seed itself doesn't depend on it.

**Approach 2 also preserves the "negatives belong only in thorns/liens" rule.** Every year of fatedAge produces *positive* seedKV. Short-lived seeds aren't refunded for dying young — they simply have a smaller positive bill. Refund-for-shortness would still require a Thorn, which is exactly the rule we want.

## Recommendation

**Lock Approach 2: `fatedAgeKV = ceil(fatedAge × 0.5)`** (absolute, every year costs KRMA, positive only).

Reasoning:

1. **Canon fit.** Approach 2 reconstructs Paper-Human at a believable Nectar/Thorn net (+55), while Approach 1 demands +95 — outside the realistic grading range for a single +1-slot Nectar.
2. **Budget fit.** A 460-490 Elven seedKV (locked recipe + freq 20-50) fits inside ~12% of a fresh GM wallet. Across the 5-seat subscription baseline, total seed investment is ~2,500 KRMA, leaving ~1,500 KRMA headroom for Roots, Branches, NPCs, and items at spawn. Monthly inflow (+400 sub + GRO.vine) outpaces aging.
3. **Design simplicity.** Approach 2 makes fatedAge a single deterministic KV term, removes the need to author per-seed Brevity Thorns, and keeps the "thorns are liens, not refunds" rule clean.
4. **Inflation is small and uniform.** The "+40 per Human-equivalent floor" inflation lifts every seedKV by exactly `ceil(80×0.5)` relative to Approach 1 in the human range. It does not break the 100B supply, the 5B burn cap, or the bell-curve subscription model — those scale with GM count, not per-seed cost.
5. **Forward compatibility.** When non-humanoid bodies, immortal seeds, or god-tier seeds (TKV ~3000) are reintroduced post-beta, a positive linear age term scales gracefully. Approach 1's clamp would need new piecewise rules at the immortality boundary.

**Locked Elven seedKV (Approach 2) with Frequency budget 30** (paper-Elven default): **471 KRMA**. Recommend this as the canonical Elven baseline for beta, with Frequency 20-50 as the GM-tunable knob.

## Open Questions for Mike

1. **Freq budget for canonical Elven** — recommendation is 30 (matches paper Elven). Confirm? Or do you want the Diminishing thorn to push it lower (20) since the thorn already constrains late-life Frequency operations?
2. **fatedAge 0.5 ratio** — locked at 0.5 KRMA/year per your guidance. Worth flagging that this is exactly half the Roots/Branches age rate (2 KRMA/year of *narrative content*). The asymmetry is intentional (lifespan-as-resource vs. age-as-content), but worth confirming you want them decoupled.
3. **Brevity Thorn library** — even under Approach 2, optional Brevity-style thorns may be useful for short-lived seeds that want to lean into their identity for additional Frequency. Ship a template, or let Kai grade them ad-hoc per submission?
4. **Bell-curve allocation** — `[NEEDS MIKE]` per ROADMAP.md:248. Recommended 471-KRMA Elven seedKV assumes the 4,000/400 baseline from the Master Reference. If the bell-curve tiers materially change wallet sizes, revisit.
