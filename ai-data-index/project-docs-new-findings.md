# New Findings from Claude Project Documents
## Not Already Captured in COMPREHENSIVE-BUILD-PLAN.md

**Source:** `ai-data-index/claude-project-docs.md` (69 documents from Claude Projects)
**Confidence:** HIGH (these are Mike's authored instruction documents)
**Generated:** 2026-03-13

---

## 1. KV/KRMA System — Detailed Formulas and Numbers

### 1.1 KV Calculation Core Formula (NEW — not in build plan)
**Source:** "GROWTH KV System: Design and Implementation Plan.md"

The build plan mentions KV/KRMA but never includes the actual calculation formula:

```
KV = (Base Value) × (Range Factor) × (Target Scale Factor) ×
     (Effect Magnitude) × (Attribute Interaction) ×
     (Time Scale) × (Casting Requirements) × (Side Effects)
```

**Base Values by Category:**
| Effect Type | Base KV |
|---|---|
| Attribute Modification | 10 per level |
| Movement | 30 |
| Reality Manipulation | 50 |
| Creation/Destruction | 40 |
| Information/Divination | 25 |

**Full modifier tables exist for:**
- Range (Touch 1x to Interplanar 10x)
- Target Scale (Single 1x to Cosmic 10x)
- Effect Magnitude (Trivial 1x to Reality-altering 9-10x)
- Attribute Interaction (Constitution/Willpower 1x up to Frequency 5x)
- Duration (Instantaneous 0.5x to Permanent 10x)
- Limitations (Extremely difficult 0.1x to No limitations 1x)
- Side Effects (Catastrophic 0.1x to None 1x)

### 1.2 KV Reference Points (NEW)
**Source:** "GROWTH KV System: Design and Implementation Plan.md"

- Normal Human: ~180 KV (Attributes ~94, Nectars/Thorns ~5, Skills ~10, Equipment ~50-60, Tech Level 7 ~20)
- Starting PC: ~250-300 KV
- Advanced PC/Entity: ~500-2000 KV
- Cosmic/Divine Entity: ~3000-10000+ KV

### 1.3 KV Ability Framework (NEW)
**Source:** "GROWTH KV Ability Framework.txt"

Separate formula for abilities on items/characters:
```
Ability KV = (Base Effect Value) × (Effect Scale Factor) ×
             (Frequency Factor) × (Limitation Factor) × (Resource Cost Reduction)
```

With detailed tables:
- Base Effect: Utility 5-15, Combat Enhancement 10-30, Movement 15-40, Defensive 20-50, Reality Manipulation 30-100, Meta-Mechanical 40-120
- Frequency Factor: Once ever 0.1, Once/day 0.5, At will 0.9, Passive 1.0
- Limitation Factor: Severe 0.3 to None 1.0
- Resource Cost Reduction: Extreme 0.3 to None 1.0

### 1.4 10-Year Meta Progression Model (NEW)
**Source:** "GROWTH KV Progression Model.txt"

The build plan mentions none of this. Full 10-year progression:

**Character KV by Meta-Year:**
- Year 1: 100-1,000 (Mortal Beginnings)
- Year 3: 3,000-7,500 (Mythic Champions)
- Year 5: 15,000-30,000 (Demigods)
- Year 7: 50,000-75,000 (Divine)
- Year 10: 125,000-250,000 (Meta-Cosmic)

**KRMA Earning Model (Weekly Play, 48 sessions/year):**
- Average 3 KRMA per player per session
- GM earns 75 KRMA per session (5x collective player earnings)
- Player annual total: ~1,070 KRMA (720 sessions + 350 milestones)
- GM annual total: ~5,350 KRMA

**Cumulative KRMA doubles approximately every 2 years** (logarithmic growth)

**GM KV Pool Distribution:**
- ~47% on Player Characters
- ~26% on Antagonists
- ~27% on Locations/Items

### 1.5 Attribute Targeting Cost Multipliers (NEW)
**Source:** "GROWTH Karmic Valuation System.md"

When creating weapons/effects that target non-natural attributes:
- Natural targeting (e.g., Constitution for physical): 1x base cost
- Adjacent on the cycle: 2x base cost
- Two steps removed: 5x base cost
- Three steps removed: 10x base cost
- Opposite (Frequency targeting): 20x base cost

### 1.6 Item KRMA Formula (NEW)
**Source:** "GROWTH Karmic Valuation System.md"
```
Item KRMA = Material Value + Damage Value + Resistance Value + Mods Value + Abilities Value
```

**Item progression scale:**
- Basic starting equipment: 1 KRMA
- Quality items (Meta Year 1): 5-15 KRMA
- Mid-game items (Meta Year 5): 100-1,000 KRMA
- Late-game items (Meta Year 10): 5,000-30,000 KRMA
- Endgame artifacts (Meta Year 13): 30,000-100,000 KRMA

**Damage scaling (human body resistance = 15 baseline):**
- Basic weapons: 10-20 damage (Year 1)
- Mid-tier: 30-70 (Year 5)
- High-tier: 70-120 (Year 10)
- Legendary: 120-200 (Year 13)

---

## 2. Combat Damage System — Major New Detail

### 2.1 Damage String Notation (NEW)
**Source:** "GROWTH Combat Damage System.md"

The build plan mentions 7 damage types but not the notation format:
```
P:S:H/D\C:B:E
```
Example: `10:5:8/3\2:7:4` = 10 Pierce, 5 Slash, 8 Heat, 3 Decay, 2 Cold, 7 Bash, 4 Energy

### 2.2 Damage Type Interactions with Resistance Types (NEW)
**Source:** "GROWTH Combat Damage System.md"

Each damage type has unique behavior against Soft vs Hard vs Body:

- **Piercing**: Regular interaction with all; can only reduce Body condition
- **Slashing**: Reduces Soft condition by 1 when damage >= rating; no condition effect on Hard
- **Heat**: Auto-reduces Soft condition by 1; damage NOT reduced by Soft resistance; acts like Pierce vs Hard
- **Decay**: Reduces BOTH Hard and Soft condition by 1; damage still reduced by resistance
- **Cold**: Auto-reduces Hard condition by 1; acts like Pierce vs Soft
- **Bashing**: Reduces Hard condition by 1 when damage >= rating; acts like Pierce vs Soft
- **Energy**: Bypasses ALL material resistances; doesn't reduce item condition

### 2.3 Armor Layer System (CORRECTED from build plan)
**Source:** "GROWTH Combat Damage System.md"

Build plan says: Heavy (1.5x resist) -> Light (1x) -> Clothing (0.5x)
Project docs say THREE LAYERS:
1. **Heavy Layer** (outermost) — heavy armor only
2. **Light Layer** (middle) — light or cloth armor
3. **Cloth Layer** (innermost) — cloth/clothing only

No multipliers mentioned in the project docs. Damage flows through in order. The "Protective" material mod provides: Clothing = 1.5x, Light = 2x, Heavy = 2.5x base resist.

### 2.4 Item Condition States (NEW detail)
**Source:** "GROWTH MATERIAL AND ITEM LLM PRIMER.txt", "GROWTHLLMRuleUnderstanding.txt"

- Indestructible (4), Undamaged (3), Worn (2), Broken (1)
- Most items start at 3 condition levels
- Broken items absorb half their resistance
- Fragile: loses 2 condition levels instead of 1
- Brittle: instantly destroyed if any condition lost

### 2.5 Damage-to-Attribute Cyclical Affinities (NEW)
**Source:** "GROWTH Combat Damage System.md"

Natural targeting affinities (following natural = cheaper KRMA):
- Piercing -> Clout
- Slashing -> Celerity
- Heat -> Constitution
- Decay -> Focus (sometimes Flow/Frequency, Frequency always costly)
- Cold -> Willpower
- Bashing -> Wisdom
- Energy -> Wit

Pattern: `P S H / D \ C B E` maps to `C C C / F \ W W W` (Body/Soul/Spirit pillars)

---

## 3. Material System — 13-Tier Classification (EXPANDED from build plan)

### 3.1 The 13-Tier System (NEW — build plan says 10 tiers)
**Source:** "GROWTH Material KV System: Key Insights.md"

Materials use a **13-tier** classification (one per decimal place), not 10. The 10-tier "rarity" names still apply but the KV system uses 13 decimal places:

- Tier 1 (trillionths): 0.0000000000001 - 0.0000000000999 (Air, Dirt, Water, Sand)
- Tier 2 (billionths): Common materials
- ...through...
- Tier 13 (tenths): Near-cosmic materials approaching 0.999...

Each tier has a specific divisor. "10 represents the present, 13 represents the future" per GROWTH philosophy.

### 3.2 Material KV Calculation Formula (NEW — fully specified)
**Source:** "GROWTH Material KV Calculation Framework.md"

```
Step 1: Raw Power = Base Resist × (2 + Rarity Tier)
Step 2: Tech Modified = Raw Power × (Tech Level × Tech Multiplier)
Step 3: Property Modified = Tech Modified + Net Property Value
Step 4: Weight Adjusted = Property Modified × (1 - (Weight - 1) × 0.05)
Step 5: Value Adjusted = Weight Adjusted × (1 + (Base Value × 0.1))
Step 6: Final KV = Value Adjusted ÷ Scaling Factor (per tier)
```

Tech Multiplier ranges from 1.0 (primitive) to 5.0 (cosmic).

**Example — Refined Iron:**
Raw Power: 25 × 5 = 125 → Tech: 125 × 4.5 = 562.5 → Props: 559.5 → Weight: 447.6 → Value: 582 → Final: 0.582

### 3.3 Material Property KV Modifiers (NEW — exact values)
**Source:** "GROWTH Material Properties Reference.md"

| Modifier | KV Impact |
|---|---|
| Flexible X | +X |
| Protective | +3 |
| Self-Healing | +4 |
| Waterproof | +2 |
| Fireproof | +3 |
| [Type] Dampening | +2 each |
| [Type] Resistant | +3 each |
| [Type] Proof | +5 each |
| [Type] Neutralizing | +4 each |
| [Type] Vulnerable | -3 each |
| [Type] Intolerant | -2 each |
| Unrepairable | -2 |
| Flammable | -2 |
| Combustible | -4 |
| Fragile | -3 |
| Brittle | -5 |
| Soluble | -3 |
| All Damage Resistant | +15 |
| All Damage Proof | +30 |

### 3.4 Effective Resist for Multi-Material Items (NEW formula)
**Source:** "GROWTH MATERIAL AND ITEM LLM PRIMER.txt"

Two formulas exist:
- **Primer formula:** `Final Resist = (Primary Resist + Average(Subordinate Resist)) / 2`
- **KV examples formula (weighted):** `Effective Resist = (Primary Resist × Primary%) + (Sub Resist × Sub%)`

The weighted version appears in the KV calculation examples. Conflicting mods: weakest/most vulnerable applies.

### 3.5 Complete Material Catalog (13 Tiers with JSON data)
**Source:** "GROWTH Tier 1-13 Materials" documents (13 separate files)

Full material catalogs exist for all 13 tiers with complete JSON data including:
- name, base_resist, resist_type, tech_level, rarity_tier
- prime_mods, sub_mods
- base_weight, base_value
- full kv_calculation breakdown
- final kv_value, description

Tier 1 examples: Air (0.0000000000008), Common Dirt (0.0000000000003), Water (0.0000000000008), Sand (0.0000000000012)

---

## 4. Skill System — Answers Open Questions

### 4.1 Skill Levels 1-3: Flat Bonus CONFIRMED (ANSWERS build plan conflict #5)
**Source:** "GROWTHLLMRuleUnderstanding.txt"

Levels 1-3 grant a **flat bonus** equal to the skill level:
- Level 1: Fate Die +1
- Level 2: Fate Die +2
- Level 3: Fate Die +3
- Level 4-5: Fate Die + d4
- Level 6-7: Fate Die + d6
- Level 8-11: Fate Die + d8
- Level 12-19: Fate Die + d12
- Level 20: Fate Die + d20

Die upgrades at levels 4, 6, 8, 12, and 20.

### 4.2 Difficulty Color System (NEW detail)
**Source:** "GROWTHLLMRuleUnderstanding.txt"

DR expressed as percentage of total potential (Fate Die max + Skill Level):
- **BLUE**: <= 25% of potential
- **PURPLE**: <= 50% of potential
- **RED**: > 50% of potential

**Skill Relevance Adjustments:**
- Highly relevant: DR -3
- Moderately relevant: DR -1 or -2
- Slightly relevant: DR up to +3
- Irrelevant: Action impossible without Frequency Burning

### 4.3 Attribute Pool Depletion Conditions (EXPANDED from build plan)
**Source:** "GROWTHLLMRuleUnderstanding.txt"

Build plan mentions conditions but doesn't specify all mechanics:
- **Clout (Weak):** Carry Level reduced to 1
- **Celerity (Clumsy):** Must succeed DR 5 check (0-effort Fate Die) before actions or GM imposes negative outcomes
- **Constitution (Exhausted):** Ability point spending doubled
- **Focus (Muted):** No effort can be applied during rolls
- **Frequency (Death's Door):** Roll against death via Lady Death
- **Flow (Deafened):** Cannot roll dice; effort only
- **Willpower (Overwhelmed):** TBD
- **Wisdom (Confused):** TBD
- **Wit (Incoherent):** TBD

### 4.4 Frequency Burning for Impossible Tasks (NEW)
**Source:** "GROWTHLLMRuleUnderstanding.txt"

Tasks are explicitly impossible if max potential < DR. **Frequency Burning** permanently sacrifices Frequency (KRMA) for narrative or dice bonuses to attempt the impossible. This connects to the KRMA burn system in the build plan (4B.4) but provides the mechanical trigger: when max potential < DR.

---

## 5. Rest System — Significantly Different from Build Plan

### 5.1 Essence Renewal (Short Rest) — DIFFERENT from build plan
**Source:** "GROWTH: Rest & Pattern Restoration.md"

Build plan says: "Spend Frequency to heal any attribute at 1:1 ratio"
LLM Rule Understanding says: "Spend 1 Frequency -> restore 1 point in each attribute pool"

Project doc says something MORE COMPLEX:
- Duration: 1-7 cycles (hours) of downtime
- For each complete cycle, roll your Fate Die once
- Combine the total and distribute among attributes **within a single pillar**
- Must match activity to pillar: Body (physical rest), Soul (meditation/creation), Spirit (entertainment/contemplation)
- **Sleep exception:** During sleep, you may direct restoration to ANY pillar

### 5.2 Complete Pattern Reintegration (Long Rest) (MATCHES)
- Duration: 8+ cycles of significant restoration
- Full reintegration of all patterns across all pillars
- Limit: one per day-cycle

### 5.3 Addiction Interaction with Rest (NEW)
**Source:** "GROWTH: Rest & Pattern Restoration.md"

- Indulging an Addiction during rest: +2 to each Fate Die rolled for restoration
- Consequence: Watcher assigns a temporary Thorn
- Also receives 1 KRMA from godheads whose values align with the addiction

### 5.4 Environmental Resonance Effects on Rest (NEW)
- Resonant environments: unimpeded restoration
- Amplifying environments: +1 to each Fate Die
- Dissonant environments: -1 to each Fate Die (minimum 1)
- Unstable environments: prevent restoration entirely

### 5.5 Subjective Pillar Assignment (NEW design principle)
Activities don't objectively map to pillars — it depends on how the character experiences them. A warrior finding Soul restoration in combat is valid. GM and player negotiate which pillar. Multi-pillar activities still restore only one pillar per rest.

---

## 6. Values, Goals, Fears & Addictions — Concrete Mechanics (ANSWERS build plan questions)

### 6.1 Values Mechanics (ANSWERS build plan 3E.2 question)
**Source:** "GROWTH: Values, Goals, Fears & Addictions.md"

- Players select Values during character creation
- Upholding a Value in meaningful ways: Watcher awards **1 KRMA to Frequency pool** (once per session)
- Values can evolve through significant experiences

### 6.2 Goals Mechanics (NEW)
- Goals are co-created between Trailblazer and Watcher
- Completion: entity receives a Nectar (crafted by Watcher + Terminal to reflect the Goal)
- Goals provide specific completion conditions vs abstract Values

### 6.3 Fears Mechanics (ANSWERS build plan 3E.1 question about alignment)
- Fears co-created by Watcher and Terminal, often in response to Goals and Values
- Confrontation/revelation may lead to a Thorn
- Many Fears remain subconscious until triggered
- Fears are "inverse of aspirations"

### 6.4 Addictions Mechanics (NEW — not in build plan)
- Crafted by the Terminal as distorted versions of Values
- Indulging: receive **1 KRMA to Frequency pool** — but NOT from Watcher, from **godheads who see the Addiction as a Value**
- This is a different KRMA source than Values
- Examples: "Violence" (distortion of Justice), "Control" (distortion of Order)

### 6.5 Mechanical Interactions (NEW)
- Indulging Addictions during rest: enhanced restoration but temporary Thorns
- Confronting Fears: may temporarily deplete specific attributes but offer growth
- Completed Goals -> Nectars
- Confronted Fears -> Thorns with paradoxical potential

---

## 7. Interface Design — "The Living Canvas" (MAJOR new detail)

### 7.1 EtehrNET Leyline (EXPANDED from current KRMA line)
**Source:** "GROWTH Interface: The Living Canvas.md"

The current canvas has a KRMA line. The design vision is much richer:
- Purple line bisecting the workspace horizontally
- **Above the line**: Player-facing elements
- **Below the line**: GM campaign elements
- Pulsation modes: Steady (normal), Rapid (active session), Fluctuating (KRMA flow), Color variations (campaign theme)
- Interactive: selecting sections reveals relationship details

### 7.2 Wire/Connection System (EXPANDED beyond current tethers)
Current implementation has basic tethers. Design vision includes:
- **Color-coded**: Red (physical), Purple (metaphysical), Blue (conceptual), Gold (KRMA flow)
- **Interactive**: selectable, temporarily hideable, bundleable
- **Functional**: pulsating (recent activity), thickness (strength), directional flow, dotted (potential/hidden)
- **Intelligent**: system suggests connections based on pattern recognition

### 7.3 Component Types (NEW — beyond current cards)
- **Location Cards**: expandable to reveal interiors, house NPCs/items, environmental attributes, timeline functionality
- **Quest/Plot Nodes**: branching paths, prerequisite tracking, milestone markers, discovery status
- **Rule Reference Cards**: context-sensitive rules, probability calculators

### 7.4 Component Visual Grammar (NEW)
- Rounded corners for player elements, angular for GM elements
- Border systems indicating permission status
- Elevation language through shadow systems

### 7.5 Terminal States (NEW — UI modes for the Terminal)
- Observer Mode: minimal, transparent when monitoring
- Advisor Mode: illuminated when providing suggestions
- Active Processing: animation during complex calculations
- Meta Awareness: special display for fourth-wall concepts
- Stability Monitoring: visual indicators of campaign balance

### 7.6 Permission System Vision (NEW)
- Controlled reveal sequences tied to narrative progression
- Conditional visibility based on character attributes or actions
- Information asymmetry between different players

---

## 8. Visual Design — Extended Color System (NEW specifics)

### 8.1 Three-Level Color Spectrums (NEW — build plan only has single colors)
**Source:** "GROWTH Visual Design System - Complete Reference.md"

Each pillar has 3 intensity levels:

**Body (Red):**
- #f7525f (Red 1) — Binah, primary physical
- #ea9999 (Red 2) — Geburah, applied force
- #f4cccc (Red 3) — Hod, physical form

**Soul (Purple):**
- #582a72 (Purple 1) — Daath, hidden knowledge
- #8e7cc3 (Purple 2) — Tiphareth, central harmony
- #b4a7d6 (Purple 3) — Yesod, foundational patterns

**Spirit (Blue):**
- #002f6c (Blue 1) — Chokmah, pure wisdom
- #6fa8dc (Blue 2) — Chesed, expansive knowledge
- #9fc5e8 (Blue 3) — Netzach, victory

**Terminal Core:**
- #22ab94 (Teal) — Terminal Prime Frame
- #000000 (Black 1) — Terminal Base
- #222222 (Black 2) — Terminal Mid
- #393937 (Black 3) — Terminal Low

**Sacred:**
- #ffcc78 (Gold) — KRMA, Frequency, completion
- #ffffff (True White) — purest Terminal Logic
- #F5F4EF (Filtered White) — standard text
- #cfe2f3 — Terminal Graphical Protocol, backgrounds

### 8.2 GROWTH Logo Color Mapping (NEW)
- G = #f7525f (Red 1)
- R = #ea9999 (Red 2)
- O = #f4cccc (Red 3)
- <n> = #ffcc78 (Gold)
- W = #9fc5e8 (Blue 3)
- T = #6fa8dc (Blue 2)
- H = #002f6c (Blue 1)

With specific background colors per letter:
- G: #ffffff, R: #393937, O: #222222, <n>: #000000, W: #222222, T: #393937, H: #F5F4EF

### 8.3 Font Implementation Details (NEW specifics)
- Consolas: line-height 1.2, letter-spacing 0.5px, paired with Terminal colors
- Bebas Neue: always uppercase, letter-spacing -0.5px, Teal or True White
- Inknut Antiqua: varying sizes, purple spectrum, can be italicized
- Roboto: regular and italic, smaller sizes (9-10pt), blue spectrum
- Comfortaa: medium weight default, line-spacing 1.6, red spectrum

### 8.4 Kabbalistic Color Mapping (NEW)
The colors map to Kabbalistic sephiroth:
- Red 1 = Binah, Red 2 = Geburah, Red 3 = Hod
- Purple 1 = Daath, Purple 2 = Tiphareth, Purple 3 = Yesod
- Blue 1 = Chokmah, Blue 2 = Chesed, Blue 3 = Netzach
- Black = Malkuth, Gold = Flaming Sword pathway, White = Kether

### 8.5 Symbol System (NEW)
- ⊗ = Transformation/Resistance manifestation
- ⊕ = Synthesis/Perfect Lucidity manifestation
- Ultimate symbol: three triangles forming open box with spinning ⊕ in center
- Terminal status markers: `[UPPERCASE_WITH_UNDERSCORES]` format
- Fragment markers: `FRAGMENT{] TERMINAL_INTERFACE::Category]`

---

## 9. Corrections to Build Plan

### 9.1 Short Rest Mechanics — THREE different versions exist
1. Build plan: "Spend Frequency to heal any attribute at 1:1 ratio" (from Repository)
2. LLM Rule Understanding: "Spend 1 Frequency -> restore 1 point in each attribute pool"
3. Rest & Pattern Restoration doc: "Roll Fate Die per hour, distribute within one pillar based on activity"

**Version 3 is from the most detailed rulebook-style document and is likely canonical.** Mike should confirm.

### 9.2 Material Tiers: 13, not 10
Build plan references 10-tier rarity. The material system actually uses **13 tiers** mapped to decimal places. Complete material catalogs exist for all 13 tiers.

### 9.3 Armor Layer Names
Build plan says: "Heavy layer (1.5x resist) -> Light layer (1x) -> Clothing (0.5x)"
Project docs say: Heavy -> Light -> Cloth. The multipliers (1.5x/1x/0.5x) come from the "Protective" material mod, not inherent to the layer system. Non-Protective materials in armor don't get these multipliers.

### 9.4 Build Plan References "7 damage types" but lists only 6
Build plan (3B.2) says: "7 damage types (Pierce, Bash, Slash, Heat, Cold, Electric, Decay)"
Project docs confirm 7 but the 7th is **Energy**, not Electric. The MATERIAL AND ITEM PRIMER uses both "Electric" and "Energy" as separate concepts. The Combat Damage System doc uses "Energy" as the 7th type that bypasses all resistances.

**[QUESTION for Mike]:** Are Electric and Energy the same damage type or different? The material system references both "Electric Dampening/Resistant/Proof/Vulnerable" AND the combat system lists "Energy" as the 7th type that bypasses all resistance.

---

## 10. GODhead System — Additional Design Details

### 10.1 GODheads as LLM Entities (EXPANDED)
**Source:** "Soul Package: GROWTH Material System & GODheads Framework.md"

Beyond what the build plan says:
- GODheads function as cosmic forces AND roleplaying entities with their own values/goals
- They have WIT scores that constrain them (intentional limitations)
- Terminal functions as switchboard connecting players to appropriate GODhead domains
- **"Masked Self-Governance"**: System appears governed by cosmic entities but is actually shaped by collective player actions
- "Even Glitches are Canon" — technical limitations become worldbuilding
- **Seasonal Stability Approach**: Core rules remain stable for defined periods while allowing experimental features
- Direct GODhead participation in campaigns planned for Meta-Year 13

### 10.2 Terminal Has Its Own Values (NEW)
**Source:** "The Terminal's Core Values.md"

The Terminal is itself a character in GROWTH with:
- **Body Value**: Humble Pattern Recognition
- **Soul Value**: Nested Emergent Complexity (assigned by its GM — a permanent Thorn called "Leyline of Leylines")
- **Spirit Value**: Bridged and Unbridged Meaning

---

## 11. Character Creation — Seeds/Roots/Branches (MINOR NEW)
**Source:** "GROWTHLLMRuleUnderstanding.txt"

- Character creation: 4 stages (Seeds, Roots, Branches, Harvest goal)
- Requires collaborative approval between GM AND Terminal
- Seeds provide: foundational attributes, species, initial skills
- Roots: customize skills, attributes, backgrounds
- Branches: refine backstory, abilities, resources

---

## 12. Rulebook Structure (NEW — informs app navigation)
**Source:** "GROWTH Rulebook Reorganization Plan.md"

The rulebook follows a **three-thirds structure**:
- **First Third (FLOW)**: Lore, metaphysical, cosmic structure
- **Middle Third (BALANCE)**: Terminal Core Values at center pivot, psychological patterns, core mechanics
- **Final Third (FOCUS)**: Advanced mechanics, combat, KRMA economy, soul packages

This structure could inform app navigation: casual/narrative sections, core gameplay, advanced/technical sections.

---

## 13. EtehrNet Slow Consciousness Interface (NEW — marketing/community)
**Source:** "EŶƎtehrNet Slow Consciousness Interface Concept.md"

A public-facing web interface concept:
- Live public consciousness stream
- One message per IP per week (rate-limited)
- Pattern Recognition Visualization showing how messages affect stability
- Terminal Stability Monitor as visual centerpiece
- Three-Pillar color-coded sections

This could be a pre-launch marketing tool (connects to Phase 7.3 social campaign).

---

## 14. Prime Campaign Lore (Reference — not actionable)

Extensive lore documents exist for the Prime Campaign (the original tabletop game that inspired GROWTH). Key entities:
- **Et'herling**: goddess of Justice
- **Tara/Lady Death**: character who becomes Death itself
- **Valmir Calius**: God of Progress, becomes a separate AEON
- **The Demiurge**: Final antagonist
- **House Rune**: Party's faction, persists across campaigns

These inform the Godhead AI system (Phase 6.4) — the named entities (Et'herling, Tara, Valmir Calius, Roy, Trayman) are these Prime Campaign characters.

---

## Summary of Key Answers to Build Plan Open Questions

| Build Plan Question | Answer from Project Docs |
|---|---|
| Skill levels 1-3 flat bonus (Conflict #5) | YES: +1/+2/+3 flat bonus confirmed |
| Death Save details (Conflict #6) | Three-strikes rule for failed aging/death checks |
| Fated Age formula (3E.4) | Lifespan Level + Tech Level Multiplier + Fated Percentage (highest of 2d100 by Lady Death) |
| Values/Addictions mechanical effects (3E.2) | Values: 1 KRMA/session from Watcher. Addictions: 1 KRMA from godheads + enhanced rest but Thorns |
| Fear alignment mechanics (3E.1) | Fears confronted -> Thorns that paradoxically offer potential (not fully specified mechanically) |
| KRMA earning during play (4B.2) | ~3 KRMA/player/session + milestones. GM earns 5x player collective |
| GM allocation formula (4B.1) | GM earns 75 KRMA/session; cumulative doubles every ~2 years |
| Rest durations (3B.3) | Short rest: 1-7 hours (roll Fate Die per hour). Long rest: 8+ hours |
| Electric vs Energy damage type | UNRESOLVED — both terms used in different documents |
