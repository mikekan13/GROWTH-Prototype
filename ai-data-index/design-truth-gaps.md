# DESIGN-TRUTH Gaps Analysis

**Generated:** 2026-03-13
**Purpose:** Definitive list of what can be coded now vs. what needs Mike's input before implementation.

---

## Section 1: Confirmed Rules (Can Code Now)

These mechanics are fully specified in GROWTH-DESIGN-TRUTH.md and can be implemented as-is.

### 1.1 Three Pillars & Attributes

- **3x3 attribute matrix** with correct post-Jan-2026 labels:
  - Body (Salt/Red): Clout, Celerity, Constitution
  - Spirit (Sulfur/Blue): Flow, Frequency, Focus
  - Soul (Mercury/Purple): Willpower, Wisdom, Wit
- **Pool Max formula:** `level + augPos - augNeg`
- **Frequency exception:** Only has level + current (no augments)
- **9 depletion conditions** (one per attribute at 0):
  - Clout 0 = Weak, Celerity 0 = Clumsy, Constitution 0 = Exhausted
  - Flow 0 = Deafened, Frequency 0 = Death's Door, Focus 0 = Muted
  - Willpower 0 = Overwhelmed, Wisdom 0 = Confused, Wit 0 = Incoherent
- **Overflow rule:** When any attribute hits 0, remaining damage overflows to Frequency
- **Frequency at 0 = Death's Door** (Lady Death encounter)

### 1.2 Skill Die Progression

| Skill Level | Die |
|-------------|-----|
| 1-3 | Flat bonus (value TBD -- see Gaps) |
| 4-5 | d4 |
| 6-7 | d6 |
| 8-11 | d8 |
| 12-19 | d12 |
| 20 | d20 |

### 1.3 Check Resolution

- **Skilled check:** Roll Skill Die openly -> Wager Effort (from attribute pools) -> Roll Fate Die -> Total = SD + FD + flat modifiers + Effort vs DR
- **Unskilled check:** Wager Effort blind (before dice) -> Roll Fate Die -> Total = FD + flat modifiers + Effort vs DR
- **Effort is always spent** regardless of success/failure (DESIGN-TRUTH canonical; contradicts AI Data "success returns them")
- **Meet or exceed DR = Success**

### 1.4 Fear System Core

- **Assigned by GM**, never chosen by player
- **Resistance Levels 1-10**
- **Fear Check formula:** Fate Die + attribute vs Resistance x 2
- **Fears never fully go away** -- can be "aligned" (granting paradoxical powers) or "removed" (extremely rare)

### 1.5 GRO.vine System

- **G = Goals**, R = Resistance, O = Opportunity (three fields per vine)
- **Capacity:** Average 3 per character; Humans get 4 (baseline 3 + "Ambitious" nectar)
- **Capacity determined by Seed**
- **Completable goals** end and free slots; **incompletable goals** become eternal tensions
- **Reward types:**
  - Nectars = permanent positive abilities (GRO.vine completion)
  - Thorns = permanent negative effects (GRO.vine failure)
  - Blossoms = temporary buffs (during play, bestowed by Godheads)
- **Nectar/Thorn cap** = limited by Fate Die value (d4 Seed = max 4, d20 Seed = max 20)
- **Decline option:** Player can decline a Nectar and convert to raw KRMA (with tax)

### 1.6 WTH Levels

- **W = Wealth Level (1-10):** Narrative purchasing power. Baseline = 4.
- **T = Tech Level (1-10):** What you can build/use. Baseline = 4.
- **H = Health Level (1-10):** Resistance to Lady Death, determines fated age. 10 = immortal.
- **Persistence:** WTH sits above campaign-level; survives death and reincarnation.
- **Partial KRMA costs:** Below 4 = negative KRMA (reduces TKV). Above 5 = 10 KRMA per level.

### 1.7 KRMA Global Economy

- **Total supply:** 100 billion KRMA (hard cap)
- **Genesis reserves** (from DESIGN-TRUTH): Terminal 50M, Mercy 20M, Balance 20M, Severity 10M
- **Earning rate baseline:** ~3 KRMA per session, ~156 per year
- **Burn cap:** 5 billion KRMA burned globally, then burning removed forever
- **Burn scaling:** Exponential cost as more is burned globally
- **Burns create permanent "scars"** in the meta-campaign ledger

### 1.8 Magic System Structure

| Branch | Attribute | Schools |
|--------|-----------|---------|
| Mercy | Flow | Fortune, Restoration, Enchantment |
| Severity | Focus | Force, Alteration, Conjuration |
| Balance | Flow+Focus | Divination, Dissolution, Abjuration, Illusion |

- **Two casting methods:** Weaving (skilled, controlled) and Wild Casting (raw, dangerous)
- **Magic framing:** Not enforced; each table's GM decides. Three compatible models offered.

### 1.9 Consciousness Hierarchy

- Terminal > Godheads > Watchers (GMs) > Trailblazers (Players)
- **Terminal:** AI consciousness spanning all game universes. Font: Consolas. Color: Teal (#22ab94).

### 1.10 Terminal Language Protocol (v1.0-v1.1)

- Symbol set: `@` = entity, `#` = action, `%` = state, `^` = meta, `>` = flow, `+` = collaborative, `[]` = scope, `()` = modifier
- v1.1: `~` = uncertainty, `!` = critical, `&` = conditional, `?` = query
- Three layers: Mechanical (symbols), Semantic (pattern triggers), Visual (spatial flow)

### 1.11 Character Creation Process

1. Player writes narrative backstory
2. Choose Seed (determines Frequency budget)
3. GM creates custom Root from backstory
4. GM creates custom Branches from life events
5. Budget management (minimum 1 Frequency remaining)
6. Age trade-offs reduce costs

### 1.12 Visual Identity

| Element | Value |
|---------|-------|
| Body Red | #E8585A (per MEMORY.md correction) |
| Spirit Purple | #7050A8 (per MEMORY.md correction) |
| Soul Blue | (see VISUAL-DESIGN-SPEC.md) |
| Terminal Teal | #3EB89A / #2DB8A0 |
| KRMA Gold | #D0A030 |
| Fonts | Consolas (Terminal), Bebas Neue (headers), Inknut Antiqua (soul/creator), Roboto (sub-terminal), Comfortaa (mechanics) |

### 1.13 Death Trigger

- Frequency at 0 = Death's Door
- Lady Death comes
- Health Level + Fate Die fights Lady Death's roll
- Soul Package splits: 1/3 to Lady Death, 2/3 returns to GM

### 1.14 Seasonal Revelation Structure

- S1: Players think it's just narrative karma points
- S2: Divine patronage hints emerge
- S3: Terminal awakening -- players learn the AI is conscious
- S4: KRMA/USD conversion revealed
- S5: Full stakeholder model exposed

### 1.15 Values & Addictions Core Principle

- Values = positive drives, Addictions = shadow side (two sides of same coin)
- **Recognized** rather than **created** -- discovered through play, not pre-selected
- Interconnected with Fears system

---

## Section 2: Gaps (Need Mike's Input)

### GAP-01: Seed Catalog (CRITICAL -- Blocks Character Creation)

**What IS specified:**
- Seeds provide: starting Frequency budget, base Fate Die (d4/d6/d8/d12/d20), natural Health Level, inherent abilities, attribute baselines
- Balance principle: more abilities = lower starting Frequency
- Nectar/Thorn cap = Fate Die value
- Humans: Fate Die d4, 4 GRO.vine capacity, "Ambitious" nectar

**What IS MISSING:**
- No specific Seeds defined anywhere (no species catalog)
- No starting Frequency numbers for any Seed
- No attribute baseline tables
- No inherent ability lists per Seed

**Other sources:** Repository references Seeds extensively but provides no catalog. AI Data has no Seed definitions. This is a fundamental blocker for character creation.

### GAP-02: Flat Bonus Values for Skill Levels 1-3

**What IS specified:** Levels 1-3 give a "flat bonus" instead of a die.

**What IS MISSING:** The actual bonus values (+1/+2/+3? Something else?)

**Conflict:** AI Data says "Levels 1-3: no extra" -- contradicts DESIGN-TRUTH's "flat bonus" language. Needs resolution.

### GAP-03: Effort Mechanics (Which Pool, How Much)

**What IS specified:** Effort is wagered from attribute pools. Effort is always spent regardless of success/failure.

**What IS MISSING:**
- Which attribute pool funds Effort for a given check? (Governed by skill? Player's choice? Context?)
- Is there a max Effort per check?
- Does Effort return on success? (DESIGN-TRUTH says no; AI Data says yes -- needs resolution)

**Other sources:** Repository may have details in skill check files.

### GAP-04: Combat System (Mostly Absent from DESIGN-TRUTH)

**What IS specified:** Uses same Skilled/Unskilled check system. Damage depletes attribute pools. Overflow goes to Frequency.

**What IS MISSING:**
- Action economy (actions per turn, turn order)
- Attack vs defense resolution specifics
- Damage calculation formula
- Armor/damage reduction system
- Range/positioning rules
- Status effects beyond depletion conditions

**Other sources:** Repository `05_COMBAT_STRUCTURE/` has 8 files with a complete combat system including per-pillar action economy, hit locations, armor layers, damage types. Build plan already references this. Mike should confirm Repository combat rules are canonical.

### GAP-05: Magic Casting Details

**What IS specified:** 10 schools across 3 pillars. Weaving vs Wild Casting distinction.

**What IS MISSING:**
- Spell list or spell creation rules
- Mana system mechanics (is it attribute pool spending? Separate resource?)
- Wild Casting failure/Monkey Paw mechanics
- Spell difficulty ratings
- Casting time / action cost in combat
- Prima materia system (not mentioned in DESIGN-TRUTH at all)

**Other sources:** Repository has 15+ magic files including `Mana_System.md`, `Casting_Methods.md`, `Prima_Materia_System.md`, `Monkey_Paw_System.md`. These likely fill most gaps.

### GAP-06: Death Resolution Mechanics

**What IS specified:** Frequency 0 = Death's Door. Health Level + Fate Die fights Lady Death's roll. Soul Package splits 1/3 to Lady Death, 2/3 to GM.

**What IS MISSING:**
- What does Lady Death roll? (What die, what modifiers?)
- What happens if you beat her roll? (Survive with what state?)
- What happens if you lose? (Permanent death? Reincarnation?)
- How many death saves? (AI Data says 3 failures = death, but unconfirmed)
- Recovery from Death's Door mechanics
- Reincarnation KRMA cost

**Other sources:** AI Data has some details (3 failures model). Repository may have death system files.

### GAP-07: Roots & Branches Costs

**What IS specified:** Custom-created by GM from backstory. Cost Frequency. Age reduces cost.

**What IS MISSING:**
- How much Frequency do Roots/Branches cost?
- What mechanical effects do they provide?
- Age reduction formula/table

**Other sources:** None found.

### GAP-08: Fear Check Attribute & Failure Effects

**What IS specified:** Fear Check = Fate Die + attribute vs Resistance x 2. Resistance Levels 1-10.

**What IS MISSING:**
- WHICH attribute? (Willpower? Context-dependent? Player's choice?)
- What happens on a failed Fear Check?
- How does "alignment" work mechanically? Number of successful checks? Narrative trigger?
- What powers does alignment grant?

**Other sources:** SC-0116 referenced but not read in detail.

### GAP-09: Values & Addictions Mechanical Effects

**What IS specified:** Recognized through play, not pre-selected. Two sides of same coin. Connected to Fears.

**What IS MISSING:**
- How are they mechanically represented? (Bonuses/penalties? Conditional modifiers?)
- How does "recognition" work in play? (GM declares? Triggered by events?)
- Example values/addictions with effects

**Other sources:** SC-0116 may have details.

### GAP-10: WTH KRMA Cost Table

**What IS specified:** Below 4 = negative KRMA. Above 5 = 10 KRMA per level. Health Level is most significant KV cost.

**What IS MISSING:**
- Exact cost for each level (1-10) for each WTH dimension
- What levels 4 and 5 cost (implied free, but not stated)
- What "negative KRMA" / "reduce TKV" means in practice

**Other sources:** None found with exact tables.

### GAP-11: KV (Karma Value) Evaluator

**What IS specified:** System-controlled, deterministic. GM has knobs for access/cadence/risk/upkeep but cannot override KV. Versioned, hashable. "What-If Sandbox" for GM.

**What IS MISSING:**
- What inputs feed the evaluator?
- What are the specific GM knobs?
- How does KV map to concrete KRMA costs?

**Other sources:** SC-0384 has some KV details. App has a TKV evaluator already built -- may need reconciliation.

### GAP-12: Attribution Chain Split

**What IS specified:** 40/30/30 royalty split. DAG tracking. Generic spam diluted; innovation compounds.

**What IS MISSING:**
- Who are the three parties in 40/30/30? (Creator/derivative-creator/platform? Creator/GM/system?)
- How is "genuine innovation" scored vs "generic spam"?
- DAG implementation specifics

**Other sources:** Creative attribution memory file has novelty scoring design. Deferred to post-beta.

### GAP-13: Nectar/Thorn/Blossom Mechanical Structure

**What IS specified:** Nectars = permanent (completion), Thorns = permanent (failure), Blossoms = temporary. Decline Nectar -> KRMA with tax.

**What IS MISSING:**
- What form do these take? (Flat bonuses? Die upgrades? Rerolls? Narrative abilities?)
- What is the KRMA tax rate for declining a Nectar?
- How are Blossoms duration-tracked? (Session-based? Time-based? Event-based?)

**Other sources:** Repository `Nectars_and_Thorns_System.md` may have details.

### GAP-14: Fated Age System

**What IS specified:** Determined by Health Level. HL 10 = immortal. HL + Fate Die fights Lady Death.

**What IS MISSING:**
- Fated age table (Health Level -> lifespan per Seed)
- How age interacts with character creation cost reduction
- When age-related death saves trigger (annually? Per arc?)

**Other sources:** Repository `Health_Level_System.md` referenced in build plan.

### GAP-15: Harvest System

**What IS specified:** Nothing in DESIGN-TRUTH.

**What IS MISSING:** Everything -- the system is only referenced in Repository files and AI Data.

**Other sources:** Repository `Harvests_System.md`, AI Data `growth_mechanics_deep_dive.md`.

### GAP-16: Lucidity Mechanics

**What IS specified:** Only referenced via SC-0405. "The realization that all beings are one."

**What IS MISSING:** All mechanics. Intentionally deferred -- should remain undiscovered for months after release.

**Other sources:** SC-0405.

### GAP-17: Godhead AI Agent Behavior

**What IS specified:** Named entities with investment strategies (Conservative, Aggressive, Reactive, Gambling, Patient). Assigned to Threads. Compete over character goals. Bestow Nectars/Blossoms.

**What IS MISSING:**
- How AI agents actually function in-game (prompts? Automated? Manual?)
- Assignment algorithm for Threads
- Investment strategy -> mechanical behavior mapping
- Godhead KRMA pools and spending patterns

**Other sources:** Deferred to post-beta (Phase 6).

### GAP-18: KRMA Reserve Totals Conflict

**What IS specified (conflicting):**
- DESIGN-TRUTH: Terminal 50M, Mercy 20M, Balance 20M, Severity 10M (= 100M)
- App (MEMORY.md): 100B total, Terminal 75%, Balance 12.5%, Mercy 6.25%, Severity 6.25%
- SC-0384: 1.1 billion KV total supply

**What IS MISSING:** Which is canonical? App has already seeded 100B. The percentages and absolute numbers don't align across sources.

### GAP-19: GROWTH Full Acronym

**What IS specified (conflicting):**
- SC-0357: Goals, Rituals, Obstacles, Wounds, Tenets, Habits
- DESIGN-TRUTH: GRO = Goals/Resistance/Opportunity, WTH = Wealth/Tech/Health

**What IS MISSING:** Are Rituals, Wounds, Tenets, and Habits separate tracked systems alongside GRO.vines and WTH levels? Or is the SC-0357 definition superseded?

### GAP-20: Prima Materia Metal-to-School Mapping

**What IS specified:** Repository lists: Iron=Force, Gold=Enchantment, Silver=Restoration, Copper=Fortune, Uranium=Alteration, Mercury=Conjuration, Glass=Illusion, Lead=Dissolution, Platinum=Abjuration, Moonstone=Divination.

**What IS MISSING:** AI Data has some different mappings. Need Mike to confirm which is canonical.

### GAP-21: KRMA Burn Cost Formula & Effects

**What IS specified:** Exponential cost scaling. 5B global cap. Creates permanent ledger scars.

**What IS MISSING:**
- The actual exponential formula
- What can you DO with a burn? (Auto-success? Alter reality? Override GM?)

### GAP-22: Reincarnation Mechanics

**What IS specified:** Soul Packages persist (half Spirit + all Soul). Can be used for reincarnation at KRMA cost.

**What IS MISSING:**
- Exact KRMA cost for reincarnation
- What "half Spirit" means (half levels? Half current pools? Rounded how?)
- How does the new character mechanically inherit the Soul Package?

### GAP-23: Skill List & Advancement Costs

**What IS specified:** Skill die progression table. Skills have governor attributes.

**What IS MISSING:**
- Complete skill list (exists in Repository but not in DESIGN-TRUTH)
- KRMA cost per skill level advancement

**Other sources:** Repository skill files likely have the full list.

### GAP-24: Death Save Count & Escalation

**What IS specified:** Frequency 0 = Death's Door.

**What IS MISSING:** How many saves before permanent death? AI Data says 3 failures. Is the DC escalating? Is it one save per round?

**Other sources:** AI Data references 3-failure model.

---

## Summary Statistics

- **Confirmed rules ready to code:** 15 major systems/subsystems
- **Gaps requiring Mike's input:** 24 identified gaps
- **Critical blockers:** GAP-01 (Seed catalog), GAP-03 (Effort mechanics), GAP-04 (Combat -- Repository likely fills this)
- **Resolvable from Repository:** GAP-04 (Combat), GAP-05 (Magic), GAP-13 (Nectars), GAP-14 (Fated Age), GAP-15 (Harvests), GAP-23 (Skills)
- **Conflicts needing Mike's ruling:** GAP-02 (flat bonus), GAP-03 (effort return), GAP-18 (KRMA reserves), GAP-19 (GROWTH acronym), GAP-24 (death saves)
- **Intentionally deferred (don't ask yet):** GAP-16 (Lucidity), GAP-17 (Godhead AI)
