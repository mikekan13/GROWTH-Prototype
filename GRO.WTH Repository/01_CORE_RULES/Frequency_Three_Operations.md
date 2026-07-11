# Frequency_Three_Operations.md

**Status:** #validated
**Source:** GROWTH-DESIGN-TRUTH §8.5 (Frequency Operations), memory `frequency-three-operations.md`, Mike's clarifications 2026-03-13, Burn formula locked Mike 2026-05-19 ([[NEEDS-MIKE_RESOLUTIONS_2026-05-19]] §0 / burn canon), Spirit Package locked 2026-05-19 ([[Spirit_Package_System]]).
**Security:** PUBLIC
**Last Updated:** 2026-05-23

---

# Frequency: Three Distinct Operations

Frequency is **not a simple resource pool**. It supports three operations that must be modeled and tracked separately. Conflating them is the most common source of mechanical bugs and design-doc rot.

> Frequency is the **central attribute of the Spirit pillar** (Sulfur). Per the Jan 2026 Soul/Spirit swap it sits alongside Flow and Focus on the Spirit pillar — not the Soul pillar (which holds Willpower / Wisdom / Wit).

## The Three Operations

### 1. Spend (advancement currency)
- **Affects:** Maximum Frequency pool (permanently reduces Max).
- **Used for:** Upgrading any aspect of the character — attributes, skills, traits, equipment slots, etc. Also pays the per-rest cost of the **trainable mechanic** (failed attribute or skill check marks the item `trainable`; on rest, Spend 1 Frequency to gain +1 level per trainable item — see [[Three_Pillar_Attributes]] and [[Seeds_Roots_Branches_System]]).
- **Recovery:** None. Spend is permanent reduction of Max. This is the cost of growth.
- **Design intent:** "You must spend to grow."

> **Hoarding does NOT mechanically kill the character — it blocks growth.** Frequency Max is the **last line of defense against death** (damage overflowing from depleted attribute pools spills into current Frequency; current Frequency = 0 triggers a death save vs Lady Death). A character who never Spends keeps the full Max as life-buffer — they stay alive but stagnate as a character. The earlier design-truth phrasing ("safety-seeking is itself a kind of death") is **philosophical, not mechanical** — the system does not auto-kill hoarders. Confirmed by Mike 2026-05-06 (`memory/frequency-hoarding-clarified`). Do not write code or rules that penalize a high Frequency Max.

### 2. Deplete (damage / overflow)
- **Affects:** Current Frequency pool only. Max is **unchanged**.
- **Used for:** Damage taken in combat once other attribute pools have hit zero (overflow damage); rest costs that pull from current Frequency without permanently reducing Max.
- **Recovery:** Refills on rest (Long Rest fully restores; Short Rest recovers other pools at the cost of 1 Frequency depletion — see [[Three_Pillar_Attributes]] §"Rest Mechanics").
- **Triggers death save** if Current hits 0.

### 3. Burn (destructive — true permanent removal)
- **Affects:** Frequency / KRMA permanently destroyed. **No one receives it.** Burned KRMA exits the entire ledger. This is the **only** mechanic in GROWTH that ever removes KRMA from the system. Every other transaction — death, spend, deplete-into-frequency, abandonment — is a *transfer*.
- **Conversion rate:** **1 max Frequency = 1 KRMA.** The character pays the cost by reducing their `frequency.level` (max), permanently. `current` is clamped to the new max.
- **Used for:** Player narrative interventions during play — "I would like to burn Frequency to catch myself before I fall." The player requests; the GM and/or a high-level Godhead evaluate the request and assign a base cost.
- **Cost authority:** a high-level Godhead (currently **Kai** by default; expected to migrate to a Terminal-tier Godhead with Eth'erling and Kai oversight) judges the **base cost** based on (a) the narrative scale of the requested outcome, and (b) the cumulative system-wide burn total.
- **Anti-deflationary formula** (locked Mike 2026-05-19):

```
scaledCost = baseCost × (1 + burnSinkBalance / 50_000)
```

`burnSinkBalance` is the running total of all KRMA ever burned by anyone in the metaverse — the balance of the system-wide Burn Sink wallet. As burns accumulate, every future burn becomes more expensive. Target curve: a 1-KRMA cost at beta start grows toward ~2 KRMA by year 2. The `50_000` denominator is the calibration constant; expect to retune from real beta flux data.

- **Hard global limit:** burning is also capped across the entire metaverse (see [[KRMA_System]] reserve pools — global burn cap is 5B KRMA; once reached, burning is permanently disabled).
- **Meta-gameplay consequences:** because burn permanently shrinks total supply, every burn is a metaverse-level event recorded in the system Burn Sink wallet. The wallet is frozen by genesis; KRMA in it can never re-enter circulation.
- **Example:** Player Tara fails a Celerity check climbing a cliff and is about to fall. She says "I want to burn Frequency to catch myself." Kai evaluates: this is a narrow, low-stakes save → `baseCost = 1`. If the system has burned 0 KRMA ever → `scaledCost = 1`. If the system has burned 50,000 KRMA ever → `scaledCost = 2`. Tara's `frequency.level` drops by 1 permanently; the catch happens; 1 KRMA leaves the ledger forever.

## Why the Distinction Matters

Any code, UI, or rules text touching Frequency must distinguish these three operations:

- **Damage / overflow** must call **Deplete** — never Spend, or characters would lose advancement potential simply by being hit.
- **Advancement / upgrades** must call **Spend** — never Deplete, or upgrades would heal away on a long rest.
- **Burn** must be its own destructive operation routed through the KRMA evaluator's burn ledger, not collapsed into Spend.

A simple "subtract from pool" model is insufficient. The Frequency attribute fundamentally has **two numbers** (Max, Current) and a separate **burn ledger** entry, not one.

## Relationship to Other Systems

- [[Three_Pillar_Attributes]] — Frequency sits in the Spirit pillar (post-swap).
- [[KRMA_System]] — Burn permanently shrinks the 100B global supply, capped at 5B total.
- [[Lady_Death_Protocols]] — Frequency depleted to 0 triggers Combat Death saves.
- [[Spirit_Package_System]] — On death, the character's Frequency `current` pool is already 0 (death triggered because it hit 0). The Frequency `level` (max capacity) is transferred in full to Lady Death's wallet. A ghost has no Frequency capacity.

---

## Links
- Related: [[Three_Pillar_Attributes]], [[KRMA_System]], [[Attribute_Depletion_Effects]]
- References: [[Lady_Death_Protocols]], [[Spirit_Package_System]]
- Examples: *(none yet)*
