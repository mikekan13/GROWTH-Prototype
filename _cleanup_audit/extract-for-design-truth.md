# Extract for GROWTH-DESIGN-TRUTH.md

Audit date: 2026-05-02. Canonical RULES (not TODOs) found in killed docs that are NOT already present in `GROWTH-DESIGN-TRUTH.md`. Cross-checked against the survivor.

Format: each block is a candidate insertion, tagged with target DESIGN-TRUTH section, source file, and a duplicate-check note.

---

## A. Pool & Depletion mechanics (REF-1 deep detail)
[source: COMPREHENSIVE-BUILD-PLAN.md REF-1] — DESIGN-TRUTH §2 covers the pillars, but lacks: pool max formula, all-9 depletion conditions table, overflow rule.

**Add to DESIGN-TRUTH §2 ("Attribute Mechanics"):**

- **Pool Max formula:** `level + augPos - augNeg`.
- **Frequency exception:** only `level + current` (no augments).
- **Overflow rule:** when any attribute hits 0, remaining damage overflows to Frequency.
- **Depletion Conditions (all 9 — confirmed by Mike 2026-03-13):**

| Attribute at 0 | Condition | Effect |
|---|---|---|
| Clout | Weak | Carry Level becomes 1 |
| Celerity | Clumsy | DR 5 Fate Die only check before ANY action; failure = action hesitates + GM negative outcome |
| Constitution | Exhausted | All ability point costs doubled |
| Flow | Deafened | Cannot roll dice for any checks |
| Frequency | Death's Door | FD + Health Level vs Lady Death |
| Focus | Muted | Cannot add Effort to rolls |
| Willpower | Overwhelmed | Cannot Short Rest; recovery effects restore half (round down, min 1) |
| Wisdom | Confused | No color-code hints, no Oracle assistance; must wager Effort upfront |
| Wit | Incoherent | Must use Unskilled checks only |

---

## B. Skill System (REF-2)
[source: COMPREHENSIVE-BUILD-PLAN.md REF-2] — DESIGN-TRUTH has skill mention but no progression table or resolution order.

**Add a new DESIGN-TRUTH section "SKILL SYSTEM":**

**Skill Die Progression:**

| Level | Die/Bonus |
|---|---|
| 0 (unskilled) | No skill die — FD + Effort only |
| 1 | Flat +1 |
| 2 | Flat +2 |
| 3 | Flat +3 |
| 4-5 | d4 |
| 6-7 | d6 |
| 8-11 | d8 |
| 12-19 | d12 |
| 20 | d20 |

Die upgrades at levels 4, 6, 8, 12, 20.

- **Skilled check formula:** FD + Skill Die + flat mods + Effort.
- **Total Max Potential:** Fate Die Max + Skill Level (cap on total roll).
- **Skilled resolution order (drives UI):** roll SD openly -> Terminal color hint -> player wagers Effort -> roll FD -> total vs DR. Meet or exceed = success.
- **Unskilled resolution:** wager Effort blind -> roll FD -> total vs DR.
- **Effort:** ALWAYS spent regardless of success/failure. Comes from governor attributes of the skill matching the action's pillar (body action -> body governors). Player chooses distribution across 1-3 eligible governors.
- **Contested checks:** ties -> defensive side wins. Both offensive -> initiative decides.

---

## C. Terminal Difficulty Color System (REF-3)
[source: COMPREHENSIVE-BUILD-PLAN.md REF-3] — not in DESIGN-TRUTH.

DR expressed as percentage of character's Total Max Potential (FD max + Skill Level):
- **BLUE:** DR <= 25% of potential
- **GREEN:** 25-50%
- **YELLOW:** 50-75%
- **ORANGE:** 75-100%
- **RED:** > 100% (requires Frequency Burning)

Skill relevance adjusts DR: highly relevant -3, moderately -1/-2, slightly +up to 3, irrelevant = impossible without Frequency Burning.

---

## D. Frequency: three operations
[source: memory `frequency-three-operations.md` referenced from CBP] — DESIGN-TRUTH treats Frequency as one resource only.

**Three distinct operations on Frequency (confirmed):**
- **Spend** — costs from Max pool (advancement currency). Permanent reduction of Max.
- **Deplete** — costs from Current pool only (does not reduce Max). Recovered via rest.
- **Burn** — converts Frequency directly to a temporary stat boost or impossible-action enabler. Distinct from Spend; mechanics TBD per Mike.

---

## E. Death — TWO systems (REF-4)
[source: COMPREHENSIVE-BUILD-PLAN.md "Data Conflicts ALL RESOLVED #2"] — DESIGN-TRUTH mentions Lady Death but doesn't separate the two systems.

- **Combat Death:** triggered when Frequency hits 0 in combat. Roll = FD + Health Level vs Lady Death. 3-strike rule.
- **Fated Age Death:** triggered at Fated Age. Roll = Health Level + mods vs Lady Death (no FD). 3-strike rule, independent of combat strikes.

Spirit Package detail (per memory `death-two-systems.md`): on death, KRMA splits per the death-split service; mechanical inheritance rules govern what passes to next character.

---

## F. GROWTH acronym — canon resolution
[source: QUESTIONS-FOR-MIKE 2.5 + 3.1] — DESIGN-TRUTH has earlier framing; explicit kill of Thread model needed.

- **GRO** = **Goals / Resistance / Opportunity** = the GRO.vines (character growth threads, source of new traits + Frequency Max increases).
- **WTH** = **Wealth / Tech / Health** = meta-level "levels" of a character (1-10 scales).
- **The six-letter Thread facet model from brainstorming is DISCARDED.** No sub-letter mechanics.
- **GRO.vine capacity:** 3 base, Humans 4. Nectar/Thorn cap = Fate Die value.
- **Decline option:** convert Nectar to raw KRMA with tax.

---

## G. Combat Action Economy (REF-12 / Q1.6)
[source: QUESTIONS-FOR-MIKE 1.6 + memory `combat-grid-system.md`] — not in DESIGN-TRUTH.

- **Grid:** standard 5ft squares (canvas-rendered encounter cards).
- **ActionMod base = 0.** Modified only by items and traits.
- **Cross-pillar actions:** generally not transferable. Any action CAN be used as movement.
- **Multi-pillar skills:** usable, but Effort can only come from governors of the matching action type within a single roll.

---

## H. Short Rest (Q1.5)
[source: QUESTIONS-FOR-MIKE 1.5] — DESIGN-TRUTH does not specify rest mechanics.

- **Simple model (current canon):** Deplete 1 Frequency (current pool only — NOT spending Max) -> heal every other attribute by 1 point.
- **May change** to a per-pillar rest model later; build the simple version swappable.

---

## I. Effort Pools (Q1.3)
[source: QUESTIONS-FOR-MIKE 1.3] — partial in DESIGN-TRUTH; full rule:

- Max effort on roll = Fate Die Max + Skill Level (skilled); Fate Die Max only (unskilled).
- Effort sourced from skill's governor attributes matching action pillar.
- Player splits effort freely across 1-3 eligible governors.
- Cap is on the *total added to the roll*, not on the amount spent from pools.

---

## J. KRMA Reserves (Q1.7) — already canon, but make explicit
[source: QUESTIONS-FOR-MIKE 1.7] — confirm in DESIGN-TRUTH.

- Total supply: **100 Billion KRMA**, hard cap, only shrinks via burn.
- Split: Terminal 75B (75%) — one-way drain. Balance 12.5B. Mercy 6.25B. Severity 6.25B. (Last three can recirculate among God-heads.)
- **Burn cap:** 5B globally; once reached, burning is permanently disabled.
- May change before public release — keep reserve system re-seedable.

---

## K. Inventory: three-tier system (Q3.5)
[source: QUESTIONS-FOR-MIKE 3.5 + memory `inventory-paperdoll.md`] — DESIGN-TRUTH does not yet describe paperdoll regions.

- **Three tiers:** Equipped slots (body regions) / Inventory (carried) / Possessions (owned, not carried — houses, vehicles).
- **Equipped + Inventory** use the **Weight system, levels 1-10**.
- **Equipped slot regions are per-Seed (not hardcoded).** GM defines paperdoll regions during Seed creation.
- **Default humanoid (10 regions):** Head, Body, Upper Left Arm, Lower Left Arm, Upper Right Arm, Lower Right Arm, Upper Left Leg, Lower Left Leg, Upper Right Leg, Lower Right Leg.
- Non-humanoid Seeds may add tails, wings, extra limbs, etc.

---

## L. Onboarding / Crystallization (Q5.14)
[source: QUESTIONS-FOR-MIKE 5.14] — DESIGN-TRUTH has player flow but not "crystallize" terminology.

Character creation flow:
1. Tutorial.
2. Structured backstory prompts.
3. GM assigns Seed / Roots / Branches.
4. System generates initial sheet from those.
5. Player + GM discussion phase.
6. **GM "crystallizes"** the sheet -> locks it active in the campaign.

AI portrait generation is available throughout.

---

## M. KRMA Subscription (Q4.4) — flag as post-beta vision
[source: QUESTIONS-FOR-MIKE 4.4 + memory `cloud-vs-local-model-stack.md`] — keep in DESIGN-TRUTH "future economics" section.

- Confirmed direction: subscription KRMA generation follows diminishing returns over time.
- Eventually social/creative contributions become primary KRMA source.
- Draft tuning targets (NOT yet canon): GM lump sum ~4,000 KRMA on signup (~20 character units), monthly ~400 KRMA (~2 character units), growth ~50% from subscription / ~50% from GRO.vine God-head gifts.

---

## N. Data conflict resolutions (already canon — folded for the record)
[source: COMPREHENSIVE-BUILD-PLAN.md "Data Conflicts ALL RESOLVED 2026-03-13"]

These are already obeyed by the codebase but should be CALLED OUT in DESIGN-TRUTH so future readers don't relitigate:

1. Skill levels 1-3 = flat +1/+2/+3 (no Skill Die).
2. Death = TWO systems (Combat vs Fated Age), 3-strike each, independent.
3. Soul/Spirit Jan 2026 swap is canonical (Spirit=Blue/Flow-Frequency-Focus, Soul=Purple/Will-Wisdom-Wit).
4. Pillar colors: Body=Red, Spirit=Blue, Soul=Purple, Terminal=Teal, KRMA=Gold. (Note memory correction: hex codes in CLAUDE.md mis-assign #3EB89A under Spirit — it's Terminal.)
5. Effort is ALWAYS spent regardless of success/failure.
6. Skilled = FD + Skill Die (FD is base).
7. Thread facet model is DISCARDED.

---

## O. NOT extracted (already in DESIGN-TRUTH or not-canon)

- Terminal Language symbol set — already in DESIGN-TRUTH §17.
- Consciousness hierarchy (Terminal -> Godheads -> Watchers -> Trailblazers) — already in §9.
- Three pillars overview — already in §2.
- Magic spell list / mercy-severity framework — Mike confirmed GM-flexible, no hardcoded framework. Already in DESIGN-TRUTH spirit.
- Values/Addictions — CUT per memory `values-addictions-not-current.md`. Do NOT add.
- Six-letter GROWTH Thread mechanics — DISCARDED. Do NOT add.

---

## P. Flagged for Mike (canon uncertainty)

- **Frequency "Burn" mechanics** — referenced by REF-3 ("requires Frequency Burning" for irrelevant skills) and the three-ops memory, but no formula specified. Confirm before writing rule.
- **Spirit Package on death** — memory mentions "Spirit Package details" but the killed docs don't define what propagates. Need Mike's definition before locking.
- **Fear "hidden paradoxical power"** — REF-13 says many fears have a hidden power on alignment, but mechanics are unstated. Flag.
- **Color-code DR percentages** (REF-3, §C above) — confirm exact thresholds; killed doc gives bands but they may have shifted.
- **Nectar -> raw KRMA tax rate** — Decline option mentioned but tax % not given.
