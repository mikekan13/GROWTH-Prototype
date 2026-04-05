# KV Pricing Reference

> Canonical reference for all KRMA Value (KV) pricing. Updated 2026-04-05.
> WTH (Wealth/Tech/Health) system removed — see decision log.

## Atomic Unit

**1 KRMA = 1 attribute level = 1 frequency level**

This is the foundation. Everything else is priced relative to this.

---

## Deterministic Track (Formula-Calculated)

These components have fixed KV costs. The evaluator calculates them automatically.

| Component | Rate | Notes |
|-----------|------|-------|
| Attribute point | **1 KRMA** each | All 8 standard attributes (Clout, Celerity, Constitution, Flow, Focus, Willpower, Wisdom, Wit) |
| Frequency level | **1 KRMA** each | Special attribute — no augments, overflow/XP target |
| Body Resist | **2 KRMA** per point | Passive defense premium — always-on damage reduction |
| Skill level | **1 KRMA** per level | Flat rate, all skills. Levels 1–20. |
| Magic skill level | **2 KRMA** per level | Magic schools cost double (existing, confirmed) |

### Fate Die Pricing

| Die | KV | Context |
|-----|-----|---------|
| d4 | 5 | Severely limited fate rolls + nectar/thorn cap |
| d6 | 10 | Human baseline |
| d8 | 20 | Standard adventurer |
| d12 | 40 | Exceptional — rare seeds only |
| d20 | 80 | Near-divine — 1–2 seeds max |

### Fated Age

Fated age (lifespan in years) is set by seed. It is **not a KV line item** — it's a narrative/mechanical property that determines when Lady Death's system activates. Death saves use the Fate Die.

### Age on Roots (Floor Mechanic)

Years added on a root establish a **minimum KV floor** for that root:
- `yearsAdded × AGE_KV_PER_YEAR = minimum root KV`
- Rate TBD (~2 KRMA/year draft, needs validation against root data)
- Root can exceed the floor with attributes, skills, frequency — but can't go below it
- This ensures roots represent meaningful life experience proportional to time lived

---

## Non-Deterministic Track (Kai-Evaluated with Guardrails)

These components are authored by God-heads and evaluated by Kai. The evaluator enforces guardrail ranges.

### Nectar/Thorn Guardrails

| Rarity | Nectar KV | Thorn KV (credit) |
|--------|-----------|-------------------|
| Common | 15–25 | -10 to -20 |
| Uncommon | 25–40 | -20 to -35 |
| Rare | 40–60 | -35 to -50 |

- Thorns are **liens** (locked KRMA), not transfers
- Nectar/thorn KV is stamped at authoring time by God-head + Kai
- Nectars and thorns are character-defining — many seeds/roots have NONE

### Forge Items (Future)

Items, materials, and other forge creations will have KV determined by:
- Mechanical fingerprinting (novelty scoring)
- Kai evaluation within guardrails
- Creative attribution (derivative IP tax)

---

## Currency System (Replaces Wealth Levels)

- Campaign-flavored money (gold, dollars, credits — GM's choice)
- Backed by KRMA at a campaign-set exchange rate
- Items have both a currency price and a KV
- GM wallet capacity limits total wealth in campaign
- Exchange rate is a campaign setting, not a global constant

---

## What Was Removed (2026-04-05)

**WTH (Wealth, Tech, Health) levels** — exponential pricing curves created an unsolvable "+1 level" problem. Replaced by:
- **Wealth** → Campaign currency backed by KRMA
- **Tech** → Skills (campaign setting determines available technology)
- **Health** → Fated Age on seed + Fate Die for death saves

---

## Sanity Check: Human Seed

| Component | Value | KV |
|-----------|-------|----|
| Attributes (8) | 50 total | 50 |
| Frequency | 40 | 40 |
| Body Resist | 15 | 30 |
| Fate Die (d6) | — | 10 |
| Nectar (Ambitious) | Common | ~20 |
| Thorn (Bounded Potential) | Common | ~-15 |
| **Seed Total** | | **~135** |

With root (adds attributes, skills, frequency; age floor ~36): starting character ~150–180 KRMA.

---

## Open Tuning Parameters

| Parameter | Current | Tunable Range | Notes |
|-----------|---------|---------------|-------|
| Body Resist rate | 2 KRMA/pt | 1–3 | Passive defense premium |
| Fate Die scale | 5/10/20/40/80 | ±50% | Roughly doubling per step |
| Nectar guardrails | 15–60 | Adjustable by rarity | Kai-enforced |
| Thorn guardrails | -10 to -50 | Adjustable by rarity | Kai-enforced |
| Age floor rate | ~2 KRMA/year | 1–3 | Root minimum KV |
| Magic skill premium | 2x | 1.5–3x | Schools are powerful |
| Currency exchange rate | Per campaign | Wide range | GM sets for their world |
