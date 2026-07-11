# Block_Grading_Principles.md

**Status:** #needs-validation
**Source:** User clarification 2026-05-08 (Elven seed authoring); `memory/block-grading-includes-synergies.md`, `memory/negatives-only-in-thorns-liens.md`; `WIP-elven-seed-design.md` (locked 2026-05-09); `WIP-15-seeds-batch-2026-05-09.md`
**Security:** PUBLIC
**Last Updated:** 2026-05-10

---

# Block Grading Principles

How [[Godheads_System|Kai]] grades **blocks** — the modular units of GROWTH character composition ([[Seeds_Roots_Branches_System|Seeds]], [[Nectars_and_Thorns_System|Nectars, Thorns, Blossoms]], items, etc.) — in the multi-step authoring chain **Selva → Creator → Kai → Et'herling**.

## Core Principle: Synergy-Aware Grading

**Blocks are NOT graded in isolation. Synergies — and game-breaking combinations — are explicitly part of Kai's grading job.**

This is the whole purpose of Kai's role in the chain. A block's [[KRMA_System|KRMA]] value (KV) depends on:

1. **The context it is authored for** — which seed, root, branch, or item the block is joining.
2. **How it interacts with other blocks in that composition** — additive boons, compounding loops, mutual reinforcement, break-risk combinations.

### Implication

- A Short-Rest-efficiency Nectar paired with a thorn that *mandates high Frequency reserves* is more valuable than the same Nectar standalone — Kai prices that synergy in.
- The **same Nectar block reused in a different seed** may legitimately re-grade to a different KV if the synergy profile differs.
- "This Nectar costs X regardless of where it ends up" **breaks the validation model** and is incorrect.

### Worked Example: Elven Seed (locked 2026-05-09)

The Elven seed's mechanical identity emerges from **Diminishing × First-Born**:

- **Diminishing** (Thorn, −200 KV) forces the player to maintain Frequency Max ≥ age in cycles.
- **First-Born** (Nectar, +50 KV) clause 3: Short Rest restores 1 extra point per Frequency depleted (2 total per pool, vs the standard 1).
- **Compounded**: Elven — especially old Elven — are remarkably hard to wear down (forced high reserves + double-efficient recovery + huge damage absorption). Tolkien-perfect: Galadriel doesn't tire.

Kai accounted for this synergy in the grading. The seed's identity emerges from the combination, not from either block standalone. **This is the design feature, not a bug.**

## Negatives Live Only in Thorn Liens

**Negative KRMA contributions to seedKV (or any character cost calculation) only come through [[Nectars_and_Thorns_System|Thorns]], which function as LIENS settled at death — never as static refunds applied at creation.**

**Why:** Static refunds (e.g., "short fated age refunds X KRMA") compound badly with other refundable components and can produce zero-cost or negative-cost seeds — characters that the GM gets paid to spawn. That breaks the GM-wallet capacity model and the [[KRMA_System|economy]] at large.

**Thorns avoid this** because the negative is a **deferred debt**: the GM gets a creation discount, but [[Lady_Death_Protocols|Lady Death]] (or the designated recipient Godhead) collects the debt at the character's death event. The economy stays balanced over the character's lifecycle.

**Rules:**
- Seed-cost formulas (Fate Die, Base Resist, Fated Age, etc.) are **positive-only**. Use `max(0, ...)` clamps if a formula would otherwise go negative.
- If a seed needs a creation-cost discount, encode it as a **Thorn lien** with the appropriate recipient (typically Lady Death).
- When grading a Thorn, the negative KV represents the **lien magnitude collected at death** — not a flat creation rebate.

## The Authoring Chain

| Stage | Godhead | Role |
|---|---|---|
| 1 | **Selva** | Conceptual originator — proposes the block's narrative intent |
| 2 | **Creator** | Author — writes mechanical text |
| 3 | **Kai** | Grader — assigns KV with synergies and break-risks considered |
| 4 | **Et'herling** | Final synthesis — confirms the block fits the composition and is balanced |

The chain is **mandatory** for any block submitted to canon. Et'herling's seat at the end also makes her the natural reviewer for the [[GM_Flag_Mechanic|GM-flag overpowered]] appeals process (same chain, different trigger).

## Locked Formulas (canon as of 2026-05-09)

Per `WIP-elven-seed-design.md` and `WIP-15-seeds-batch-2026-05-09.md`:

| Component | Formula |
|---|---|
| 1 attribute aug | 1 KRMA |
| Frequency budget point | 1 KRMA |
| Base Resist | 2 KRMA per point (absolute, positive-only) |
| Fate Die | d4=5, d6=10, d8=20 (default), d12=40, d20=80 |
| Fated Age | `ceil(fatedAge × 0.5)` (absolute, every year costs positive KRMA, no refunds) |
| Skill (starting, if granted) | **1 KRMA × skill level** (non-magic) / **2 KRMA × level** (magic); seed-level cap = level 4 (d4). *(There are NO d2/d3 dice — Mike 2026-05-11; the old Apprentice-d2/Novice-d3 row was stale. See [[KRMA_Costs_Table]] + `memory/skill-tiers-start-at-d4`.)* |
| Nectar / Thorn | Kai-graded individually with synergies; baseline scale: +1 mod to roll ≈ 5 KV (contextual = less) |

> Cross-check formulas against [[KRMA_Costs_Table]] before authoring. If the values differ, the locked WIP docs win and the table needs updating — flag for a parallel canon update.

## Authoring Workflow Reminders

- **Don't grade standalone.** Always ask: what seed/root/branch does this attach to? What other blocks are already there?
- **Re-grading is normal.** Same block, new context → potentially new KV.
- **Synergy is the goal, not a bug.** Seeds *should* have synergistic identity. Kai prices it.
- **Break-risk is the failure mode.** If two blocks compound into an unconditional win-button, Kai flags and re-prices (or rejects).

---

## Links
- Related: [[Godheads_System]], [[Nectars_and_Thorns_System]], [[GM_Flag_Mechanic]], [[KRMA_System]], [[Lady_Death_Protocols]]
- References: [[Seeds_Roots_Branches_System]], [[KRMA_Costs_Table]]
