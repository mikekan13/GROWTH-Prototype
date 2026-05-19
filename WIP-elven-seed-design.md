# Elven Seed Design — LOCKED 2026-05-09

> Final design state. Replaces the WIP version. Used as canonical reference for the Elven seed during beta authoring.

## Locked Components

| Component | Value | KRMA |
|---|---|---|
| Body Structure | HUMANOID_BODY | — |
| **Augs (60 net)** | Clout 4 / Cel 8 / Con 7 / Foc 7 / Flow 10 / Will 7 / Wis 13 / Wit 4 | **+60** |
| Pillar shape | Body 19, Spirit 17, Soul 24 | — |
| **Fated Age** | 1000 cycles | **+500** |
| **Base Fate Die** | d6 | **+10** |
| **Base Resist** | 13 | **+26** |
| Skills | none | 0 |
| **Starting Frequency Budget** | 30 | **+30** |
| **First-Born** Nectar (Et'herling-owned, seed-bound) | see clauses below | **+50** |
| **Diminishing** Thorn (Lady-Death-owned, seed-bound, lien) | see mechanic below | **−200** |
| **TOTAL seedKV** | | **+476** |

### Pillar shape narrative
- **Body 19**: 4 Clout (light-built) / 8 Celerity (graceful) / 7 Constitution (hardy, disease-resistant). They aren't strong but they're agile and enduring.
- **Spirit 17**: 7 Focus / 10 Flow. Magical attunement is the seed's defining virtue (mercy/receiving > severity/giving).
- **Soul 24**: 7 Willpower / 13 Wisdom / 4 Wit. Defining trait = Wisdom 13, mirroring Human's Willpower 13. Wisdom-spike replaces willpower-spike — Galadriel signature.

### First-Born — full Nectar text
*Owner: Et'herling (was Elven before ascension). Seed-bound. KV: +50.*

Three mechanical clauses:
- On Wisdom checks for perception (distance, hearing, low-light), the Wisdom pool gains **+1 contextual**. Low-light conditions impose no penalty on Elven sight.
- On Willpower checks resisting mental compulsion, charm, fear, or domination, the Willpower pool gains **+2 contextual**.
- On Short Rest, each 1 Frequency depleted restores 1 additional point to every non-Frequency attribute pool (2 total per pool, vs the standard 1).

### Diminishing — full Thorn text
*Owner: Lady Death. Seed-bound. KV: −200 (lien collected at death).*

> **Cannot Spend or Burn Frequency that would take Max ≤ current age in cycles.**

Lien is collected by Lady Death at the character's death event, *before* the normal death-split per `thorn-krma-mechanics`. The thorn enforces the Tolkien arc: actively-engaged Elven outpace the floor through GROvines and stay viable; dormant/withdrawn Elven let the floor catch up and become locked from advancement (preserved but unable to grow).

### Trait slot accounting
Fate Die d6 → max 6 traits combined. Currently 2 used (First-Born + Diminishing). **4 slots free** for in-play acquisition.

## Synergies

The seed's defining mechanical character emerges from the Diminishing × First-Born interaction:
- Diminishing forces the player to maintain Frequency Max ≥ age in cycles
- First-Born clause 3 (Short Rest doubled) means Elven recover those reserves at half the Frequency cost everyone else pays
- Compounded: Elven, especially old Elven, are remarkably hard to wear down — high mandatory reserves, efficient recovery, huge damage absorption
- Tolkien-perfect: Galadriel doesn't tire, doesn't get sick, doesn't easily fall

This is the design *feature*, not a bug. Synergies emerging from seed-bound block combinations are the whole point of the modular block system. Kai accounted for this in the synergy-aware grading.

## Locked Formulas (canon as of 2026-05-09)

| Component | Formula |
|---|---|
| 1 attribute aug | 1 KRMA |
| Frequency budget point | 1 KRMA |
| Base Resist | 2 KRMA per point (absolute, positive-only) |
| Fate Die | d4=5, d6=10, d8=20 (default), d12=40, d20=80 |
| **Fated Age (Approach 2)** | `ceil(fatedAge × 0.5)` (absolute, every year costs positive KRMA) |
| Age-Cost Ratio (R/B reductions) | 1 year of age = 2 KRMA reduction |

## Locked Principles (canon)

- **Block grading considers synergies**, not standalone — Kai's job in the Selva→Creator→Kai→Et'herling chain.
- **Negatives in the economy live only as Thorn liens** (settled at death by Lady Death or designated recipient). Static refunds are forbidden because they break the GM-wallet capacity model.
- **Seed-bound traits are bound to the seed, not the character** — if the character changes seed mid-game, bound traits change with it.
- **Trait flag schema** (post-beta implementation): `source`, `bound`, `permanence`, `origin_godhead`, `lien_amount`, `lien_recipient`.

## Lore captured

- **Et'herling was Elven before ascending to Godhead status.** Pronoun: she. She is the natural sponsor of Elven seed-bound Nectar blocks.
- Tolkien archetype is canonical for the Elven Seed in GROWTH's multiversal cosmology.

## Knock-on changes locked

- **Human Fate Die**: d6 → **d8** (system default per Basic Resolution canon). +10 KRMA delta.
- **Altered Human Fate Die**: d6 → **d8**. +10 KRMA delta.
- **Approach 2 fated-age formula** applies system-wide. Human ageKV becomes +40 (was 0). Altered Human ageKV becomes +43.

These are propagated into `app/src/lib/seed-catalog.ts` for Human and Altered Human entries (FD field). Other paper-version seeds in the catalog are not balanced for this canon and will be re-authored individually.

## Budget validation

- Locked Elven seedKV 476 = ~12% of fresh GM wallet (4,000 KRMA per `memory/krma-economy-master-reference.md`).
- 5-seat campaign baseline = ~2,500 KRMA total seed investment, ~1,500 KRMA headroom for Roots/Branches/NPCs/items.
- Monthly +400 sub + ~60-75 KRMA/character/month from GROvine inflow outpaces Elven aging tax.
- Comfortable budget fit. Reference: `elven-seed-research-2026-05-08.md`.

## Next

Move to **Dwarven** seed design. Dwarven is the next fantasy-staple after Elven. Then Tiefling/Cambion (planetouched), then sci-fi/spiritual buckets per the catalog plan.
