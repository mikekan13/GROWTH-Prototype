# GRO.WTH — Comprehensive Build Plan

**Generated:** 2026-03-13 (v3 — Mike's answers integrated, all questions resolved)
**Sources:** GROWTH Repository (70+ files), GROWTH-DESIGN-TRUTH.md, AI Data (378 MB across Claude + ChatGPT), Legacy Beta codebase, Source Card catalog (22 cards read), current app audit (43 API routes, 46 components, 19 services), Claude Project Documents (69 docs), ChatGPT design conversations (30+ sessions), **Mike's direct answers (2026-03-13)**

---

## Current State Summary

The app is **~79% complete for Phase 3 (Session Tools)**. Core infrastructure is solid:
- 43 API endpoints, all functional
- 23 Prisma models
- 46 React components
- Clean layered architecture (Interface → Service → Infrastructure → Data)

### What's DONE

| System | Status |
|--------|--------|
| Authentication (bcrypt, sessions, access codes) | COMPLETE |
| Campaign Management (CRUD, invites, 5-seat limits) | COMPLETE |
| Character System (full sheet, 4-step builder, lifecycle) | COMPLETE |
| Backstory System (structured prompts, GM review) | COMPLETE |
| Relations Canvas (SVG spatial, pan/zoom, cards, tethers, KRMA line) | COMPLETE |
| Dice Engine (server-side crypto RNG, skill/death/fear checks, Godhead injection) | COMPLETE |
| Changelog & Audit (diff, coalescence, revert, conflict detection) | COMPLETE |
| Campaign Terminal (unified feed, sessions, commands, filters) | COMPLETE |
| KRMA Ledger (append-only, SHA-256 chain, wallets, TKV evaluator, death split, reconciliation, crystallization) | COMPLETE |
| Material System (25+ materials, combine, armor layers, weapon damage grid) | COMPLETE |
| Forge System (CRUD, publish lifecycle, player requests, GM approve/deny) | COMPLETE |
| Inventory System (drag-drop, equip/unequip, carry levels) | COMPLETE |
| GROvine Panel (add/complete/fail/abandon, G/R/O detail, capacity) | SKELETON |
| Essence Tab (GROvine overview, traits summary, harvest log) | SKELETON |
| Locations (CRUD, 6 types) | SKELETON |
| World Items (CRUD, 8 types) | SKELETON |
| Encounters (CRUD, 5 types, phase tracking) | SKELETON |

### What's NOT DONE

Everything below this line. Organized into buildable phases.

---

## Canonical Reference: Core Mechanics

This section consolidates **all confirmed formulas, tables, and rules** from every source. Build phases reference these specifications.

### REF-1: Three Pillars & Nine Attributes

**3×3 attribute matrix** with post-Jan-2026 labels (Soul/Spirit SWAPPED):

| Pillar | Element | Color | Attribute 1 | Attribute 2 | Attribute 3 |
|--------|---------|-------|-------------|-------------|-------------|
| **Body** | Salt | Red (#E8585A / #f7525f) | Clout (strength) | Celerity (speed) | Constitution (endurance) |
| **Spirit** | Sulfur | Blue (#002f6c / #6fa8dc / #9fc5e8) | Flow (mercy magic) | Frequency (XP currency) | Focus (severity magic) |
| **Soul** | Mercury | Purple (#582a72 / #8e7cc3 / #b4a7d6) | Willpower (resilience) | Wisdom (intuition) | Wit (logic) |

**Pool Max formula:** `level + augPos - augNeg`
**Frequency exception:** Only has `level + current` (no augments)

**Depletion Conditions (attribute at 0) — ALL 9 CONFIRMED:**

| Attribute | Condition | Mechanical Effect |
|-----------|-----------|-------------------|
| Clout | Weak | Carry Level becomes 1 |
| Celerity | Clumsy | DR 5 Fate Die only check before ANY action; failure = action hesitates + GM negative outcome |
| Constitution | Exhausted | All ability point costs doubled |
| Flow | Deafened | Cannot roll dice for any checks |
| Frequency | Death's Door | FD + Health Level vs Lady Death |
| Focus | Muted | Cannot add Effort to rolls |
| Willpower | Overwhelmed | Cannot take Short Rest; all recovery effects restore half (round down, min 1) |
| Wisdom | Confused | No color code hints, no Oracle assistance; must wager Effort upfront (like unskilled flow) |
| Wit | Incoherent | Must use Unskilled checks only |

**Overflow rule:** When any attribute hits 0, remaining damage overflows to Frequency.

### REF-2: Skill System

**Skill Die Progression:**

| Skill Level | Die/Bonus | Notes |
|-------------|-----------|-------|
| 0 (unskilled) | No skill die | Fate Die + Effort only |
| 1 | Flat +1 | Confirmed via ChatGPT correction rounds |
| 2 | Flat +2 | |
| 3 | Flat +3 | |
| 4-5 | d4 | |
| 6-7 | d6 | |
| 8-11 | d8 | |
| 12-19 | d12 | |
| 20 | d20 | |

Die upgrades occur at levels 4, 6, 8, 12, and 20.

**Skilled Check Formula:** FD + Skill Die (CONFIRMED). Fate Die is always the base die for skilled checks.

**Total Max Potential** = Fate Die Max + Skill Level (not skill die max). This is the "wasted effort" cap — total cannot exceed this.

**Skilled Check Resolution Order (CRITICAL — drives UI flow):**
1. Roll Skill Die (SD) openly → everyone sees result
2. Player sees SD result + Terminal color hint about difficulty
3. Player wagers Effort from allowed pools (popup UI at this step)
4. Roll Fate Die (FD)
5. Total = SD + FD + flat modifiers + Effort vs DR
6. Meet or exceed DR = Success

**Unskilled Check Resolution:**
1. Wager Effort blind (before any dice)
2. Roll Fate Die (FD)
3. Total = FD + flat modifiers + Effort vs DR

**Effort Mechanics (CONFIRMED):**
- Effort is **ALWAYS spent** regardless of success/failure
- Effort comes from **governor attributes of the skill being used**, matching the action type (body action → body governors only)
- Can split effort across **multiple governors** in any amount
- Effort above Total Max Potential (FD Max + Skill Level) = "wasted effort"
- **Example:** FD d8, Skill level 14 (d12). Player wagers 5 effort from body governors. Rolls 8+12=20, adds 5 effort = 25. But max possible is 8+14=22, so 3 effort was "wasted" (only 2 actually contributed). All 5 still spent.
- Skills with multi-pillar governors CAN be used, but effort is limited to matching action type's pillar

**Skill Relevance Adjustments to DR:**
- Highly relevant: DR -3
- Moderately relevant: DR -1 or -2
- Slightly relevant: DR up to +3
- Irrelevant: Action impossible without Frequency Burning

**Contested Checks (CONFIRMED):**
- Ties: defensive side wins
- If both offensive: initiative decides (complex AI-driven system)
- No inherent massive margin bonuses (but traits/items could add them)

### REF-3: Terminal Difficulty Color System

DR expressed as percentage of character's Total Max Potential (Fate Die max + Skill Level):
- **BLUE**: DR ≤ 25% of potential
- **PURPLE**: DR ≤ 50% of potential
- **RED**: DR > 50% of potential

### REF-4: GROWTH Acronym & GRO.vines

**CRITICAL CORRECTION (2026-03-13):** The six-letter Thread model (G/R/O/W/T/H with KV counters, ritual effects, etc.) was ALL brainstorming and is **DISCARDED**. There are NO sub-letter mechanics.

**The actual GROWTH acronym meaning:**
- **GRO** = Goals / Resistance / Opportunity — these are the **GRO.vines** (character trait threads for growth and Frequency Max increases)
- **WTH** = Wealth / Tech / Health — these are the **meta-level character "levels"** (see REF-12)

**GRO.vine System (Simple Model):**
- Each GRO.vine has three aspects: a **Goal** (player-authored win clause), **Resistance** (obstacles/challenges), and **Opportunity** (what growth the vine offers)
- Completion spawns a Nectar. Failure spawns a Thorn.
- GRO.vine capacity: average 3 per character (Humans get 4 with "Ambitious" nectar). Capacity determined by Seed.
- Nectar/Thorn cap: limited by Fate Die value (d4 Seed = max 4, d20 Seed = max 20)
- Decline option: player can decline a Nectar and convert to raw KRMA (transferred to Frequency), but there's a tax — won't get full karmic value. [TBD: exact tax rate]

### REF-5: Frequency — Three Distinct Operations (CONFIRMED)

Frequency has **THREE** operations, not two:

1. **SPEND Frequency** (permanent investment):
   - Reduces **MAX** Frequency
   - Used to upgrade any aspect of the character (like currency for permanent improvements)
   - Example: Spend 3 Frequency Max to increase a skill level

2. **DEPLETE Frequency** (temporary damage):
   - Reduces **current pool** but NOT max
   - Used when taking damage (overflow from attributes hitting 0)
   - Refills on rest
   - If current pool hits 0 → Death's Door

3. **BURN Frequency** (permanent destruction):
   - Permanently destroys Frequency AND KRMA
   - Changes outcomes of dice rolls or alters consequences/events
   - **Hard limit on total burning across the entire metaverse**
   - Has meta-gameplay consequences — like burning cryptocurrency
   - This is what enables attempting "impossible" tasks (DR > Total Max Potential)

**Example flow:** Max F = 7, current = 7.
- Deplete 3 → current = 4, max still 7. After rest → current refills to 7.
- Spend 2 → max = 5, current adjusts accordingly. Max only recovers through special fiction.
- Burn 1 → permanent destruction from the metaverse supply. Gone forever.

### REF-6: Damage System

**Seven Damage Types (CONFIRMED — "Energy" not "Electric"):**
```
P:S:H/D\C:B:E
```
Pierce : Slash : Heat / Decay \ Cold : Bash : Energy

Example: `10:5:8/3\2:7:4` = 10 Pierce, 5 Slash, 8 Heat, 3 Decay, 2 Cold, 7 Bash, 4 Energy

**NOTE:** "Electric" is OLD wording. The correct term is **Energy**. Material system references to "Electric Dampening/Resistant/Proof/Vulnerable" should be updated to "Energy."

**Damage Type Behavior Against Resistance Types:**

| Damage Type | vs Soft Resist | vs Hard Resist | vs Body | Special |
|-------------|---------------|----------------|---------|---------|
| **Piercing** | Regular | Regular | Reduces body condition | Standard physical |
| **Slashing** | Reduces Soft condition by 1 (if dmg ≥ rating) | No condition effect | Regular | Degrades soft armor |
| **Heat** | Auto-reduces Soft condition by 1; NOT reduced by Soft resist | Acts like Pierce | Regular | Ignores soft armor |
| **Decay** | Reduces condition by 1 | Reduces condition by 1 | Regular | Degrades ALL armor |
| **Cold** | Acts like Pierce | Auto-reduces Hard condition by 1 | Regular | Degrades hard armor |
| **Bashing** | Acts like Pierce | Reduces Hard condition by 1 (if dmg ≥ rating) | Regular | Anti-hard armor |
| **Energy** | Bypasses ALL | Bypasses ALL | Regular | Bypasses all material resistance; doesn't reduce item condition |

**Damage-to-Attribute Cyclical Affinities (natural targeting = cheaper KRMA):**
- Piercing → Clout
- Slashing → Celerity
- Heat → Constitution
- Decay → Focus (sometimes Flow/Frequency; Frequency always costly)
- Cold → Willpower
- Bashing → Wisdom
- Energy → Wit

Pattern: `P S H / D \ C B E` maps to `C C C / F \ W W W` (Body/Spirit/Soul pillars)

**Attribute Targeting Cost Multipliers (for weapons/effects targeting non-natural attributes):**
- Natural targeting: 1× base cost
- Adjacent on the cycle: 2× base cost
- Two steps removed: 5× base cost
- Three steps removed: 10× base cost
- Opposite (Frequency targeting): 20× base cost

### REF-7: Armor Layer System

Three layers, damage flows through in order:
1. **Heavy Layer** (outermost) — heavy armor only
2. **Light Layer** (middle) — light or cloth armor
3. **Cloth Layer** (innermost) — cloth/clothing only

Each layer has independent armor coverage per hit location.

**Armor Multipliers (CONFIRMED — based on item type, not layer):**
- Clothing: 1.5× base resist of material
- Light Armor: 2× base resist of material
- Heavy Armor: 1.5× base resist of material (NOTE: this is the material cost multiplier — heavy armor uses 1.5x the material's base resist)

**Item Condition States:**
- Indestructible (4), Undamaged (3), Worn (2), Broken (1)
- Most items start at 3 condition levels
- Broken items absorb half their resistance
- Fragile: loses 2 condition levels instead of 1
- Brittle: instantly destroyed if any condition lost

### REF-8: Material System (Decimal Classification)

**CRITICAL CORRECTION (2026-03-13):** Materials are NOT "13 tiers." The decimal places (.0000000000001 to .9999999999999) represent the **KV cost of 1 unit of material** based on KRMA grading. This is a continuous spectrum, not discrete tiers.

- Lower decimal = more common, cheaper (Air, Dirt, Water, Sand at the bottom)
- Higher decimal = rarer, more expensive (near-cosmic materials approaching .999...)
- The 13 decimal places represent the granularity of the grading system

**Material KV Calculation Formula:**
```
Step 1: Raw Power = Base Resist × (2 + Rarity Position)
Step 2: Tech Modified = Raw Power × (Tech Level × Tech Multiplier)
Step 3: Property Modified = Tech Modified + Net Property Value
Step 4: Weight Adjusted = Property Modified × (1 - (Weight - 1) × 0.05)
Step 5: Value Adjusted = Weight Adjusted × (1 + (Base Value × 0.1))
Step 6: Final KV = Value Adjusted ÷ Scaling Factor
```

Tech Multiplier: 1.0 (primitive) to 5.0 (cosmic).

**Material Property KV Modifiers:**

| Modifier | KV Impact |
|----------|-----------|
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

**Multi-Material Effective Resist:**
- **Primer formula:** `Final Resist = (Primary Resist + Average(Subordinate Resist)) / 2`
- **Weighted formula:** `Effective Resist = (Primary Resist × Primary%) + (Sub Resist × Sub%)`
- Conflicting mods: weakest/most vulnerable applies

### REF-9: KV / KRMA Formulas

**KV Calculation Core Formula (for effects/abilities/spells):**
```
KV = (Base Value) × (Range Factor) × (Target Scale Factor) ×
     (Effect Magnitude) × (Attribute Interaction) ×
     (Time Scale) × (Casting Requirements) × (Side Effects)
```

**Base Values by Effect Category:**

| Effect Type | Base KV |
|-------------|---------|
| Attribute Modification | 10 per level |
| Movement | 30 |
| Reality Manipulation | 50 |
| Creation/Destruction | 40 |
| Information/Divination | 25 |

**Modifier Tables:**

| Factor | Min | Max | Examples |
|--------|-----|-----|----------|
| Range | 1× (Touch) | 10× (Interplanar) | Self=0.5, Short=2, Medium=4, Long=6, Extreme=8 |
| Target Scale | 1× (Single) | 10× (Cosmic) | Small group=2, Large group=4, Area=6, Regional=8 |
| Effect Magnitude | 1× (Trivial) | 9-10× (Reality-altering) | Minor=2, Moderate=4, Major=6, Extreme=8 |
| Attribute Interaction | 1× (Constitution/Willpower) | 5× (Frequency) | Adjacent=2, Two steps=3, Three steps=4 |
| Duration | 0.5× (Instantaneous) | 10× (Permanent) | Minutes=1, Hours=2, Days=4, Weeks=6, Months=8 |
| Limitations | 0.1× (Extremely difficult) | 1× (No limitations) | Very difficult=0.3, Difficult=0.5, Moderate=0.7 |
| Side Effects | 0.1× (Catastrophic) | 1× (None) | Severe=0.3, Moderate=0.5, Minor=0.7 |

**KV Ability Framework (for item/character abilities):**
```
Ability KV = (Base Effect Value) × (Effect Scale Factor) ×
             (Frequency Factor) × (Limitation Factor) × (Resource Cost Reduction)
```

- Base Effect: Utility 5-15, Combat Enhancement 10-30, Movement 15-40, Defensive 20-50, Reality Manipulation 30-100, Meta-Mechanical 40-120
- Frequency Factor: Once ever 0.1, Once/day 0.5, At will 0.9, Passive 1.0
- Limitation Factor: Severe 0.3 to None 1.0
- Resource Cost Reduction: Extreme 0.3 to None 1.0

**Item KRMA Formula:**
```
Item KRMA = Material Value + Damage Value + Resistance Value + Mods Value + Abilities Value
```

**CRITICAL: Attributes ARE crystallized KRMA. 1 attribute point = 1 KRMA.**

**KV Reference Points:**
- Normal Human: ~180 KV (Attributes ~94, Nectars/Thorns ~5, Skills ~10, Equipment ~50-60, Tech Level 7 ~20)
- Starting PC: ~250-300 KV (~350-400 KV per GM wallet economics)
- Advanced PC/Entity: ~500-2000 KV
- Cosmic/Divine Entity: ~3000-10000+ KV

**Item KRMA Progression Scale:**
- Basic starting equipment: 1 KRMA
- Quality items (Meta Year 1): 5-15 KRMA
- Mid-game items (Meta Year 5): 100-1,000 KRMA
- Late-game items (Meta Year 10): 5,000-30,000 KRMA
- Endgame artifacts (Meta Year 13): 30,000-100,000 KRMA

**Damage Scaling (human body resistance = 15 baseline):**
- Basic weapons: 10-20 damage (Year 1)
- Mid-tier: 30-70 (Year 5)
- High-tier: 70-120 (Year 10)
- Legendary: 120-200 (Year 13)

### REF-10: Death System — TWO SEPARATE SYSTEMS (CONFIRMED)

**System 1: Combat Deaths (Frequency hits 0)**

- **Trigger:** Current Frequency depleted to 0 = Death's Door. Lady Death comes.
- **Resolution:** FD + Health Level vs Lady Death's roll
- **Success:** Restore 1 Frequency + often get a **Death Blossom** (temporary penalties)
- **Failure:** Health-related Thorn added
- **Three Strikes Rule:** Three failed combat death saves = permanent death

**System 2: Fated Age Deaths (aging)**

- **Trigger:** Begin **yearly** background rolls starting at Fated Age
- **Resolution:** Health Level + modifiers vs Lady Death's roll
- **Failure:** Aging Thorn from Lady Death
- **Three Strikes Rule:** 3 failures = death of old age
- **Different from combat deaths** — these are background rolls, not triggered by combat

**Fated Age Calculation:** Lifespan Level × Tech Level multiplier × Fated Percentage (from 2d100 roll by Lady Death — highest of two d100s).

**Death/Spirit Package Split — DETAILED (CONFIRMED by Mike):**

| Pillar | On Death... |
|--------|-------------|
| **Body** pillar attributes | ALL points back to GM as KRMA |
| **Spirit** pillar: Frequency MAX (not current, which would be 0) | Goes to **Lady Death** |
| **Spirit** pillar: Flow and Focus | Remain in **Spirit Package** |
| **Soul** pillar | 50% to GM, 50% remains as attributes in **Spirit Package** |
| **Nectars** marked "lost on death" | Return as KRMA to the **Godheads who provided them**. Others kept in Spirit Package. |
| **Skill levels** | Divided by governor pillar — same movement as their governing attributes |

**KEY INSIGHT:** Attributes ARE crystallized KRMA. 1 attribute point = 1 KRMA. This is why the death split matters economically.

**Spirit Packages:** Persistent entities carrying character identity, history, and KRMA fingerprint. Can be reincarnated — even at other players' characters (not just the original player). "It is on character death that a player truly gains that KRMA as their own via soul package."

### REF-11: Rest & Recovery System (CONFIRMED — Simple Version)

**RESOLVED (2026-03-13):** Mike confirmed the **simple model**. The complex pillar-specific Fate Die rolling system may come later but is NOT for current build.

**Rest (Simple Version):**
- **Deplete 1 point from Frequency pool** → heals EVERY other attribute by 1 point each
- This depletes the pool (not the max) — Frequency refills on long rest
- May change in the future to the more complex pillar-specific system
- **Build the simple version first**

**Long Rest / Sleep:**
- Full refill of Frequency current pool to Max
- All attribute pools refill to their max values

**Environmental effects on rest:** NOT a formal system. Rest affected contextually by GM/conditions (narrative, not mechanical).

### REF-12: WTH Levels (Wealth / Tech / Health)

**WTH = the second half of the GROWTH acronym.** These are meta-level character "levels."

**1-10 Scales:**

| Level | Wealth Name | Tech Name | Health/Lifespan |
|-------|-------------|-----------|-----------------|
| 1 | Destitute | Primitive (Stone Age) | ~3 years lifespan |
| 2 | Impoverished | Basic (Bronze/Iron Age) | Short-lived |
| 3 | Poor | Simple (Medieval) | Below average |
| 4 | Modest (baseline) | Standard (baseline) | Average |
| 5 | Comfortable | Advanced | Above average |
| 6 | Affluent | High-tech | Extended |
| 7 | Wealthy | Near-future | Long-lived |
| 8 | Prosperous | Sci-fi | Very long-lived |
| 9 | Opulent | Far-future | Near-immortal |
| 10 | Magnate | Cosmic | Immortal (won't die of age) |

**KRMA Costs:** Below 4 = negative KRMA (reduces TKV). Above 5 = 10 KRMA per level. Health Level is the most significant KV cost.

**Persistence:** WTH sits above campaign-level; survives death and reincarnation.

**Wealth Level Purchase Mechanic (CONFIRMED — more nuanced than originally stated):**
- **Wealth > item value:** Purchase freely (within reason, GM/AI discretion)
- **Wealth = item value:** Remove 1 check from wealth (3 checks gone = drops a level). Checks restored through narrative.
- **1 level above wealth:** Essentially costs 3 checks (1 whole level down)
- **Wealth Levels gained via:** Big narrative moments (treasure, business deals). Also affected by traits, possessions, selling.
- GM monitors for abuse

### REF-13: Goals & Fears

**Goals:**
- Co-created between Trailblazer and Watcher
- Completion: entity receives a Nectar (crafted by Watcher + Terminal to reflect the Goal)
- Goals provide specific completion conditions

**Fears:**
- Assigned by GM, never chosen by player
- Co-created by Watcher and Terminal, often in response to Goals
- Resistance Levels 1-10
- Fear Check: Fate Die + attribute vs Resistance × 2
- Confrontation/revelation may lead to a Thorn
- Many Fears remain subconscious until triggered
- Fears never fully go away — can be "aligned" (paradoxical powers) or "removed" (extremely rare)

### REF-14: Blossoms — AI Godhead-Generated Live Buffs

Blossoms are NOT pre-written. They are **generated in real-time by Godhead LLM agents**.
- Each active GRO.vine is watched over by a specific Godhead
- Blossoms are bestowed at session start and can refresh mid-session when narrative shifts
- Potency rated 1-3, never alters KV or Frequency directly
- On GRO.vine completion/failure, the Blossom vanishes before the Nectar/Thorn appears
- Each Godhead has a "flavor sheet" (Domain, Tone, Boon style, Bane style) that constrains the LLM's improvisation
- Watcher can "nudge" the prompt if a Blossom would break balance

### REF-15: Magic System Structure

| Branch | Attribute | Schools |
|--------|-----------|---------|
| **Mercy** | Flow | Fortune, Restoration, Enchantment |
| **Severity** | Focus | Force, Alteration, Conjuration |
| **Balance** | Flow+Focus | Divination, Dissolution, Abjuration, Illusion |

**10 schools, same across ALL tables (CONFIRMED).** Woven spells allow contextual framing via governing skill.

**Casting Methods:**
- **Weaving:** Skilled, controlled casting using Skill Die. Roll: Fate Die + school skill + associated skill (3 dice total). No Monkey Paw on failure (just fails).
- **Wild Casting:** Raw, dangerous. Player describes intent → GM/system identifies school(s) → roll Fate Die + school skill vs DR. Multi-school uses lowest skill level. Failure triggers Monkey Paw.

**Magic is text-based initially** (player describes what they want to do). Move to always-on mic eventually. AI determines DR with GM input.

**Prima Materia Metal-to-School Associations (from Repository — needs Mike confirmation):**
Iron=Force, Gold=Enchantment, Silver=Restoration, Copper=Fortune, Uranium=Alteration, Mercury=Conjuration, Glass=Illusion, Lead=Dissolution, Platinum=Abjuration, Moonstone=Divination

**Spell Strength Levels:** 1-10 in power. Levels 6+ require Terminal oversight.

**Mana:** Separate resource. Each mana point = +1 to roll. Channel capacity = sum of all magic school skill levels. Mana is regained mechanically/narratively. Mana has its own KV value (TBD with balancing).

**Terminal Injection:** Not just spells — metaverse injection from Godheads and Terminal for high-level events.

### REF-16: Combat System (CONFIRMED)

- **Grid-based, 5ft squares** (CONFIRMED)
- Each **combat phase = 6 seconds** of narrative time
- **ActionMod** = items and traits modifier, base is 0
- **No cross-pillar action transfer.** Any action can be used as movement though.
- Per-pillar action economy: Each pillar (Body/Spirit/Soul) gets separate actions:
  - Formula: `MAX(1 + ActionMod, ActionMod + ROUNDDOWN(PillarSum / 25))`
  - Body actions = physical (attack, move, grapple)
  - Spirit actions = magical (cast, channel, sense)
  - Soul actions = social/mental (willpower, recovery, command)
- Skills with multi-pillar governors can be used but effort limited to matching action type's pillar
- Fixed damage: Weapons deal fixed damage (not rolled) modified by material multipliers
- Combat on canvas with special cards: AI-generated encounter maps, initiative order cards, etc.

### REF-17: GM Wallet Economics

- Starting characters: ~350-400 KV each
- Characters can grow to 600-800 total KV
- Party of 4 players + GM is the assumed standard
- Opposition should be **double or more** the heroes' total KV (narrative headroom)
- World infrastructure/NPCs roughly equal to or slightly less than opposition KV
- GM wallet covers: all characters + world + opposition + reserve

### REF-18: KRMA Earning Model (10-Year Progression)

**Weekly Play (48 sessions/year):**
- Average 3 KRMA per player per session
- GM earns 75 KRMA per session (5× collective player earnings of 15)
- Player annual total: ~1,070 KRMA (720 sessions + 350 milestones)
- GM annual total: ~5,350 KRMA

**Cumulative KRMA doubles approximately every 2 years** (logarithmic growth).

**GM KV Pool Distribution:**
- ~47% on Player Characters
- ~26% on Antagonists
- ~27% on Locations/Items

**Character KV by Meta-Year:**
- Year 1: 100-1,000 (Mortal Beginnings)
- Year 3: 3,000-7,500 (Mythic Champions)
- Year 5: 15,000-30,000 (Demigods)
- Year 7: 50,000-75,000 (Divine)
- Year 10: 125,000-250,000 (Meta-Cosmic)

**KRMA Reserves:** 100B total with current split confirmed (Terminal 75%, Balance 12.5%, Mercy 6.25%, Severity 6.25%). May change by release.

### REF-19: Godhead KV Grading System

Kai (Chaos and Order) and Et'herling (Justice) are the **KV evaluators** for all created content. Every modular element (woven spells, items, Blossoms, Thorns, Seeds, etc.) gets graded when created. The KV is assigned by the system, not the GM. GM can imagine anything but must have the KRMA budget to materialize it.

### REF-20: KRMA Multiplier System (Sector-Based)

KRMA earning has multipliers based on "sectors" — essentially popularity/adoption metrics.
- If a GM's creations (seeds, items, etc.) are widely used by other Watchers, their multiplier increases
- When KRMA comes in, it's multiplied by the sector multiplier
- A GM with multiplier 2 receiving 1 KRMA sees it as 2 KRMA
- Specific formulas not finalized — concept confirmed by Mike

### REF-21: Synchronicity (GM Alignment Metric)

- Secret GM metric (CONFIRMED), ranging from -100 to +100
- Zero = perfect alignment with The Terminal's narrative
- Positive = penchant for adding novel lore to the universe
- Negative = preference for existing tales
- Content creator/consumer balance
- Varying future effects (details TBD)
- GMs can choose "Disconnection" to craft stories outside GROWTH's AetherNet

### REF-22: Visual Design — Extended Color System

**Three-Level Color Spectrums per Pillar:**

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

**GROWTH Logo Color Mapping:**
- G = #f7525f (Red 1), background #ffffff
- R = #ea9999 (Red 2), background #393937
- O = #f4cccc (Red 3), background #222222
- . = #ffcc78 (Gold), background #000000
- W = #9fc5e8 (Blue 3), background #222222
- T = #6fa8dc (Blue 2), background #393937
- H = #002f6c (Blue 1), background #F5F4EF

**Font Implementation Details:**
- Consolas: line-height 1.2, letter-spacing 0.5px, paired with Terminal colors
- Bebas Neue: always uppercase, letter-spacing -0.5px, Teal or True White
- Inknut Antiqua: varying sizes, purple spectrum, can be italicized
- Roboto: regular and italic, smaller sizes (9-10pt), blue spectrum
- Comfortaa: medium weight default, line-spacing 1.6, red spectrum

**Kabbalistic Color Mapping:**
- Red 1 = Binah, Red 2 = Geburah, Red 3 = Hod
- Purple 1 = Daath, Purple 2 = Tiphareth, Purple 3 = Yesod
- Blue 1 = Chokmah, Blue 2 = Chesed, Blue 3 = Netzach
- Black = Malkuth, Gold = Flaming Sword pathway, White = Kether

**Symbol System:**
- ⊗ = Transformation/Resistance manifestation
- ⊕ = Synthesis/Perfect Lucidity manifestation
- Ultimate symbol: three triangles forming open box with spinning ⊕ in center
- Terminal status markers: `[UPPERCASE_WITH_UNDERSCORES]` format
- Fragment markers: `FRAGMENT{] TERMINAL_INTERFACE::Category]`

### REF-23: The Living Canvas (Interface Vision)

**NOTE (2026-03-13):** Mike confirmed there is NO formal "visual grammar" system. Different card types exist, but the visual language will develop organically — not the described rounded/angular corners system.

**EtehrNET Leyline (expanded from current KRMA line):**
- Purple line bisecting the workspace horizontally
- **Above the line**: Player-facing elements
- **Below the line**: GM campaign elements
- Pulsation modes: Steady (normal), Rapid (active session), Fluctuating (KRMA flow), Color variations (campaign theme)
- Interactive: selecting sections reveals relationship details

**Wire/Connection System (expanded beyond current tethers):**
- **Color-coded**: Red (physical), Purple (metaphysical), Blue (conceptual), Gold (KRMA flow)
- **Interactive**: selectable, temporarily hideable, bundleable
- **Functional**: pulsating (recent activity), thickness (strength), directional flow, dotted (potential/hidden)
- **Intelligent**: system suggests connections based on pattern recognition

**Terminal States (UI modes):**
- Observer Mode: minimal, transparent when monitoring
- Advisor Mode: illuminated when providing suggestions
- Active Processing: animation during complex calculations
- Meta Awareness: special display for fourth-wall concepts
- Stability Monitoring: visual indicators of campaign balance

**Permission System Vision:**
- Controlled reveal sequences tied to narrative progression
- Conditional visibility based on character attributes or actions
- Information asymmetry between different players

### REF-24: Seed Catalog (48 Seeds Exist)

**CONFIRMED (2026-03-13):** 48 Seeds exist in `C:\Projects\GRO.WTH\docs\Character Creation Examples.csv` with full stats.

**CSV Columns:**
Seed, Starting Fate Die, Frequency, Starting Health Lvl, Base Body Resist, 8 attribute augments, Skills, Nectars, Thorns, Description, Health KV, Tech KV, HT Total, Attributes/Freq/Resist KV, Manual KV, Fate Die KV, TOTAL SEED KV

**Fate Die Distribution:**
- d4: Elven, Fey-Touched, etc. (lower KV, higher growth potential)
- d6: Human, most common (standard)
- d8: Neo-Human, Psionic, etc. (higher KV, more powerful baseline)

**KV Range:** 135 (Goblinoid) to 3700 (Machine-Hybrid)

**Key Design Notes:**
- These are **unbalanced examples** — intentionally varied in power
- Basic/starter examples will be **AI-generated**
- Rest created by **GMs for their campaigns**
- This pattern applies to ALL aspects of GRO.WTH — basic templates AI-generated, rest community/GM-created

### REF-25: Inventory System (CONFIRMED)

**Three Categories:**
1. **Equipped** — body slots (currently worn/held)
2. **Inventory** — carried items, weight 1-10 system
3. **Possessions** — owned but not carried (houses, vehicles, land, etc.)

**Equipped Slots (Humanoid Default):**
Head, Body, Upper Left Arm, Lower Left Arm, Upper Right Arm, Lower Right Arm, Upper Left Leg, Lower Left Leg, Upper Right Leg, Lower Right Leg

**CUSTOMIZABLE per Seed** — tails, wings, extra limbs, etc. GM defines regions during Seed creation as a **paperdoll system**.

### REF-26: Onboarding Flow (CONFIRMED)

1. Simplified tutorial
2. Backstory prompts (structured, never a single open field)
3. GM creates/assigns Seed, Roots, Branches
4. Initial character sheet created from those
5. Player and GM discuss and agree
6. GM confirms and crystallizes into campaign
7. Player gets AI portrait generation

---

## Phase 3B: Complete Session Tools (Priority: CRITICAL)

These are the remaining items to make a session actually playable.

### 3B.1 — Skill Check Flow from UI
**What:** Players and GMs need to trigger skill checks directly from the character sheet/SkillsCard, not just via `/check` terminal commands.
**Build:**
- "Roll" button on each skill in SkillsCard
- **TWO-STEP FLOW (CRITICAL — matches REF-2 order):**
  1. Roll Skill Die (SD) openly — result shown to everyone
  2. **Effort wager popup** appears showing: SD result, Terminal color hint about difficulty, current governor attribute pools (filtered to matching action type's pillar)
  3. Player allocates effort from allowed governor pools (can split across multiple governors)
  4. Show "wasted effort" warning if effort would exceed Total Max Potential cap
  5. Roll Fate Die (FD) after wager confirmed
  6. Total = SD + FD + flat modifiers + Effort vs DR
- Wire to existing `/api/dice/check` endpoint (may need refactoring for two-step flow)
- Result appears in Campaign Terminal + triggers 3D dice visualization
- Auto-spend effort from attribute pools via existing `character-actions.ts`
- Display Terminal difficulty color (BLUE/PURPLE/RED) based on REF-3
- Implement skill relevance adjustments (±DR modifiers per REF-2)
**Dependencies:** Existing DiceService, dice event bus, 3D viz — all built
**Estimate:** Medium (larger than originally scoped due to two-step flow)

### 3B.2 — Damage Tracking & Hit Locations
**What:** Combat damage needs to reduce attribute pools and apply conditions. Full 7-type damage system per REF-6.
**Build:**
- Damage application service: input = damage string (P:S:H/D\C:B:E notation) + hit location + target character
- Parse damage string notation into 7-type vector
- Armor mitigation calculation per REF-7: damage flows Heavy → Light → Cloth → Body
- Apply damage-type-specific behavior per REF-6 table (e.g., Heat bypasses Soft resist, Energy bypasses all)
- Track item condition degradation: Undamaged(3) → Worn(2) → Broken(1) per damage-type rules
- Broken items absorb half resistance; Fragile loses 2 condition; Brittle = instant destroy
- Pool reduction: damage flows through Constitution → overflow to Frequency
- Auto-apply depletion conditions when attributes hit 0 (per REF-1 table — ALL 9 now confirmed)
- Hit location UI on VitalsSection (already has 9 body parts rendered)
- **Paperdoll system must support custom Seed slots** (extra limbs, tails, wings per REF-25)
- GM damage application panel (select target, enter damage string or individual values, choose location)
- Terminal command: `/damage <character> <damageString> <location>`
**Design source:** REF-6, REF-7, Repository `05_COMBAT_STRUCTURE/`
**Dependencies:** VitalsSection component exists, character-actions.ts has effort spending pattern
**Estimate:** Medium-Large

### 3B.3 — Rest & Recovery (Simple Model)
**What:** Attribute pools deplete during play and need recovery mechanics per REF-11.
**Build (SIMPLE VERSION — confirmed by Mike):**
- **Short rest:** Deplete 1 Frequency from current pool → restore 1 point in EVERY other attribute pool
- Simple, clean, one-button action
- Auto-clear depletion conditions when pool rises above 0
- **Cannot take Short Rest if Overwhelmed** (Willpower=0 depletion condition)
- **Long rest / Sleep:** Full refill of Frequency current pool to Max + all attribute pools to max
- Terminal commands: `/rest short`, `/rest long`
- Session event logging for rests
- **DO NOT BUILD** the complex pillar-specific Fate Die rolling system — that may come later
**Design source:** REF-11
**Estimate:** Small

### 3B.4 — Traits Modifying Rolls (Nectars, Blossoms, Thorns)
**What:** Nectars, Blossoms, and Thorns should mechanically affect skill checks.
**Build:**
- Trait effect schema: `{ trigger: string, modifier: number, condition?: string, potency: number, duration?: 'permanent'|'session'|'encounter' }`
- DiceService integration: before rolling, check active traits for applicable modifiers
- Blossom duration tracking: session-based, vanishes on GRO.vine completion/failure
- Blossom potency: 1-3 (never alters KV or Frequency directly per REF-14)
- Thorn penalty application (permanent unless removed)
- Display active modifiers in roll result
- Nectar/Thorn potency tied to GRO.vine resolution
**Design source:** REF-4, REF-14, DESIGN-TRUTH Section on Nectars/Thorns
**Estimate:** Medium

### 3B.5 — Editable Skills in SkillsCard
**What:** Currently skills display but can't be directly edited from the panel.
**Build:**
- Add skill form (name + governor attribute)
- Level +/- buttons
- Delete skill button
- All mutations through existing character update API
- Wire to PlayerRequest flow for player-initiated skills (GM approval)
**Status:** Partially built, needs completion
**Estimate:** Small

### 3B.6 — Wealth Level Purchase System (NEW)
**What:** Characters buy items based on Wealth Level per REF-12.
**Build:**
- Purchase check: compare item value vs character Wealth Level
- **Wealth > item value:** Purchase freely (GM/AI discretion for abuse)
- **Wealth = item value:** Remove 1 check. 3 checks gone = drops a level. Checks restored through narrative.
- **1 level above wealth:** Essentially costs 3 checks (1 whole level down)
- Track wealth checks (3 per level)
- Wealth Level gain triggers: big narrative moments, treasure, business deals, traits, possessions, selling
- GM abuse monitoring (flag excessive trivial purchases)
- UI: item shop with Wealth Level indicator, purchase confirmation modal
- Terminal command: `/purchase <character> <item>`
**Design source:** REF-12
**Estimate:** Small-Medium

---

## Phase 3C: Combat System (Priority: HIGH)

The Repository has a complete combat system across 8 files in `05_COMBAT_STRUCTURE/`. This is the **largest gap** between design docs and implementation.

### 3C.1 — Turn Structure & Action Economy
**What:** Repository defines phase-based combat per REF-16. Grid-based, 5ft squares.
**Build:**
- Combat mode toggle on encounters (PLANNED → ACTIVE)
- **Grid-based combat map** (5ft squares — CONFIRMED)
- Initiative system: based on Celerity attribute (+ modifiers)
- Turn order tracker component (canvas card or panel)
- **Per-pillar action economy:** Each pillar (Body/Spirit/Soul) gets separate actions:
  - Formula: `MAX(1 + ActionMod, ActionMod + ROUNDDOWN(PillarSum / 25))`
  - ActionMod = items and traits modifier, base is 0 (CONFIRMED)
  - Body actions = physical (attack, move, grapple)
  - Spirit actions = magical (cast, channel, sense)
  - Soul actions = social/mental (willpower, recovery, command)
- **No cross-pillar action transfer** (CONFIRMED). Any action can be used as movement though.
- Skills with multi-pillar governors can be used but effort limited to matching action type's pillar
- Phase = 6 seconds confirmed
- Fixed damage: Weapons deal fixed damage (not rolled) modified by material multipliers
- **Combat on canvas** with special cards: AI-generated encounter maps, initiative order cards, etc.
- Terminal commands: `/initiative`, `/nextturn`, `/endround`
**Design source:** REF-16, Repository `Turn_Structure_and_Action_Economy.md`, `Attack_Resolution_Mechanics.md`
**Estimate:** Large

### 3C.2 — Attack Resolution
**What:** Skilled/unskilled check formula applied to combat with weapon properties.
**Build:**
- **Undefended attack:** Fate Die + Skill Die + Effort vs static DR (set by GM based on difficulty)
- **Defended attack:** Attacker rolls vs Defender's roll (defender's total = DR). Both use Fate Die + Skill Die + Effort.
- **Contested checks:** Ties go to defensive side. Both offensive = initiative decides.
- **Fixed damage:** Weapons deal set damage values (not dice-rolled), in damage string notation (P:S:H/D\C:B:E per REF-6)
- **Armor sequential flow per REF-7:** Damage → Heavy layer → Light layer → Cloth layer → Body (Constitution pool)
- **Damage-type-specific interactions** per REF-6 table
- **Overflow:** Damage exceeding Constitution flows to Frequency
- Weapon property effects (Unblockable bypasses armor, Brittle degrades, Sharp increases slash, etc.)
- Hit location system: customizable body slots per Seed (paperdoll per REF-25)
**Design source:** REF-6, REF-7, Repository `Attack_Resolution_Mechanics.md`, `Damage_Calculation_System.md`, `Armor_and_Defense_Systems.md`
**Estimate:** Medium

### 3C.3 — Special Combat Actions
**What:** Beyond basic attack/defend — grapple, dodge, disengage, cast spell in combat, etc.
**Build:**
- Action type catalog with attribute requirements
- Contested rolls (attacker vs defender — DiceService already has `contestedRoll()`)
- Movement and positioning on grid (5ft squares)
- Any action can be used as movement (CONFIRMED)
**Design source:** Repository `Special_Combat_Actions.md`, `Movement_and_Positioning.md`
**Estimate:** Medium

---

## Phase 3D: Magic System (Priority: HIGH)

The Repository has 15+ files on magic. Well-designed but zero implemented.

### 3D.1 — Magic School Skills & Mana Pool
**What:** Characters need magic school skills (10 schools across 3 pillars per REF-15) and mana tracking.
**Build:**
- Magic schools as special skill entries following REF-15 table
- 10 schools, same across ALL tables (CONFIRMED)
- Mana pool: separate resource tracked on character (not an attribute pool)
- Mana has its own KV value (TBD with balancing)
- Mana is regained mechanically/narratively
- Channel capacity limit: max mana per cast = sum of all magic school skill levels
- Mana storage in body, catalysts, environmental sources
- MagicSection component already exists — wire to actual data
**Design source:** REF-15, Repository `Mana_System.md`, `Casting_Methods.md`
**Estimate:** Medium

### 3D.2 — Wild Casting
**What:** Improvisational magic per REF-15. Text-based initially (player describes what they want).
**Build:**
- Wild cast flow: player describes intent (text) → AI determines DR with GM input → roll Fate Die + school skill vs DR
- Multi-school penalty: uses lowest skill level among required schools
- Failure triggers Monkey Paw effect (spell backfires)
- Terminal command: `/wildcast <description>` or GM-initiated
- Monkey Paw resolution: GM describes consequence, logged as campaign event
**Design source:** REF-15, Repository `Casting_Methods.md`, `Monkey_Paw_System.md`
**Estimate:** Medium

### 3D.3 — Woven Spells
**What:** Pre-designed spells with defined parameters — safer but requires preparation.
**Build:**
- Spell design form: effect, range, duration, components, school(s), mana cost
- Roll: Fate Die + school skill + associated skill (3 dice total)
- No Monkey Paw on failure (just fails)
- Spell library per character (saved woven spells)
- **Woven spells allow contextual framing via governing skill** (CONFIRMED)
- Forge integration: spells could be ForgeItems of type "spell"
- KV assigned via REF-9 formula for spell effects
**Design source:** REF-15, Repository `Casting_Methods.md`
**Estimate:** Medium

### 3D.4 — Spell Strength & DR System
**What:** Spells rated 1-10 in power. Levels 6+ require Terminal oversight.
**Build:**
- DR lookup: spell strength → DR range
- Authority escalation flag: strength ≥ 6 triggers Terminal notification/log
- Mana investment: each mana point = +1 to roll
**Design source:** REF-15, Repository `Magic_DR_Calculation_System.md`, `Spell_Strength_Levels.md`
**Estimate:** Small

### 3D.5 — Prima Materia Integration
**What:** Crystallized magic artifacts (levels 1-10) that anyone can use.
**Build:**
- Already partially in Forge (prima_materia item type exists)
- Usage flow: activate Prima → substitutes its power dice for caster's skill
- Level 10 = auto-success up to DR 500
- Stable (multi-use) vs Unstable (single-use) tracking
- School associations per REF-15
**Design source:** REF-15, Repository `Prima_Materia_System.md`
**Estimate:** Small

---

## Phase 3E: Character Subsystems (Priority: MEDIUM-HIGH)

### 3E.1 — Fear System
**What:** Fears per REF-13 are GM-assigned, have resistance levels 1-10, hidden paradoxical powers.
**Build:**
- Fear data structure: `{ name, resistanceLevel (1-10), status: 'active'|'aligned'|'removed', hiddenPower?: string }`
- Fear check: Fate Die + attribute vs Resistance × 2 (DiceService already has `fearCheck()`)
- Fear confrontation tracking: each confrontation may reduce resistance or trigger alignment
- Confrontation/revelation may lead to a Thorn with paradoxical potential
- Many Fears remain subconscious until triggered
- GM assignment UI in character builder or canvas panel
- Terminal command: `/fear <character> <fearName>`
**Design source:** REF-13, DESIGN-TRUTH Section 5
**Estimate:** Medium

### 3E.2 — GROvine System (Simple G/R/O Model)
**What:** GRO.vine system per REF-4 — the simple Goal/Resistance/Opportunity model. NOT the six-letter GROWTH facet system (which was brainstorming and is DISCARDED).
**Build:**
- GRO.vine data model with three aspects: Goal (player win clause), Resistance (obstacles), Opportunity (growth offered)
- States: Active, Dormant, Completed (Nectar), Failed (Thorn)
- Nectar on completion, Thorn on failure
- Capacity per character (3 base, Humans 4)
- Nectar/Thorn cap = Fate Die value
- Decline option: convert Nectar to raw KRMA with tax
- Godhead assignment per GRO.vine (for Blossom generation)
- GROvine Panel UI: show G/R/O aspects, active/dormant/completed status
- **Currently has a SKELETON — needs full implementation**
**Design source:** REF-4
**Estimate:** Medium

### 3E.3 — Harvests (Between-Arc Advancement)
**What:** Downtime periods between story arcs where characters train, craft, research. Similar to Branches in character creation.
**Build:**
- Harvest initiation: GM triggers between arcs
- Activity menu: training (+attribute), research (new spells), crafting (new items), social (connections)
- Cost: in-game time (character ages) + GM planning time
- Mechanical results: attribute increases, new skills, new Nectars, wealth/tech changes
- Harvest log (already in Essence Tab skeleton)
**Design source:** Repository `Harvests_System.md`, AI Data
**Estimate:** Medium

### 3E.4 — Fated Age System
**What:** Per REF-10, a threshold when aging death saves begin.
**Build:**
- Fated Age calculation: Lifespan Level × Tech Level multiplier × Fated Percentage (highest of 2d100 by Lady Death)
- Age tracking: current age vs fated age
- When current age ≥ fated age: **yearly** death saves (Health Level + mods vs Lady Death's roll)
- Failed saves: aging Thorn from Lady Death (different from combat death Thorns)
- Three strikes = permanent death per REF-10 (separate counter from combat deaths)
**Design source:** REF-10, Repository `Health_Level_System.md`
**Estimate:** Small

### 3E.5 — Death System Implementation
**What:** Per REF-10, two separate death systems need implementation.
**Build:**
- **Combat Death:** FD + Health Level vs Lady Death's roll. Success = restore 1 Frequency + Death Blossom (temporary penalties). Failure = health Thorn. 3 failures = permanent death.
- **Fated Age Death:** Health Level + mods vs Lady Death's roll. Failure = aging Thorn. 3 failures = death of old age.
- **Spirit Package creation** on permanent death: attributes split per REF-10 table
- Spirit Package reincarnation flow (can go to any player's new character)
- KRMA redistribution per death split rules
- Nectar handling on death: "lost on death" nectars return KRMA to providing Godheads
**Design source:** REF-10
**Estimate:** Medium

---

## Phase 3F: NPC & World Systems (Priority: MEDIUM)

### 3F.1 — NPC System
**What:** NPCs need their own stats, GRO.vines, and potentially AI-driven behavior.
**Build:**
- NPC character type (simplified character sheet — GM creates, not player)
- NPC GRO.vines (same system as player GRO.vines — "NPCs and factions have their own GRO.vines, they are not static quest-givers" per SC-0485)
- **NPC cards: EXACTLY same design as player cards** (CONFIRMED — no visual grammar distinction)
- Faction system: groups of NPCs with shared goals
- NPC inventory and abilities
**Estimate:** Medium-Large

### 3F.2 — Location Builder Enhancement
**What:** Location CRUD exists but the GM builder UI is minimal.
**Build:**
- Rich location creation form (description, tech level, wealth level, danger level, features, ley lines, tags)
- Location connections/hierarchy (regions contain settlements contain buildings)
- Location-character assignment (who's where)
- Location-item assignment (items stored at locations)
- Canvas integration: location cards (expandable to reveal interiors, house NPCs/items, environmental attributes, timeline)
**Estimate:** Medium

### 3F.3 — Encounter Runner
**What:** Encounter CRUD and phase tracking skeleton exist. Need the actual running experience.
**Build:**
- Encounter activation: PLANNED → ACTIVE with participant roster
- Turn tracker with initiative order
- Round counter with phase indicators
- 6-second phase timer display
- Participant action log per round
- Encounter resolution: rewards, consequences, KRMA distribution
- Terminal integration: encounter commands
**Estimate:** Large

---

## Phase 4B: KRMA Economy Completion (Priority: MEDIUM)

### 4B.1 — GM Allocation Formula
**What:** How KRMA flows from Terminal reserve to GMs per REF-18.
**Build:**
- GM earns 75 KRMA per session (5× collective player earnings)
- Player earns average 3 KRMA per session
- Cumulative doubles approximately every 2 years
- Automated distribution (session-start trigger or cron)
- GM wallet replenishment
- **KV system must be fully functional for beta** (backbone of entire game, start of Godhead system)

### 4B.2 — Earning KRMA During Play
**What:** Per REF-18, ~3 KRMA per session baseline with bonuses.
**Build:**
- Session end → GM awards KRMA to each player (manual allocation with suggested amounts)
- GROvine completion → automatic Nectar + KRMA reward
- GROvine failure → Thorn (no KRMA penalty, just the Thorn)
- Milestone events → KRMA bonuses
- Terminal command: `/award <character> <amount> <reason>`
**Estimate:** Medium

### 4B.3 — Spending KRMA During Play
**What:** Players spend KRMA on rerolls, advancement, rare items.
**Build:**
- **Reroll system:** Escalating KRMA cost: 2, 5, 10 per successive reroll in a session
- **Death save rerolls:** Same escalation (2, 5, 10 KRMA)
- **Skill advancement:** KRMA cost table (exact values TBD from Repository)
- **Attribute enhancement:** KRMA cost per attribute point (graduated costs) — remember: 1 attribute point = 1 KRMA
- Character investment flow: GM spends campaign KRMA to improve character TKV
- **KRMA display for players:** Players see KV on things their character knows. GM balance = GM only. (CONFIRMED)
- **UI:** "Spend KRMA" button on roll results, confirmation modal with cost + remaining balance
**Estimate:** Medium

### 4B.4 — KRMA Burn System
**What:** Per REF-5, players permanently destroy KRMA for extraordinary actions. Triggered when max potential < DR (impossible tasks).
**Build:**
- Burn request flow: player declares intent → system calculates cost → confirmation → permanent destruction
- Burns permanently destroy Frequency AND KRMA from the metaverse supply
- **Hard limit on total burning across the entire metaverse** (CONFIRMED)
- Changes outcomes of dice rolls or alters consequences/events
- Has meta-gameplay consequences (like burning cryptocurrency)
- "Scars" in meta-campaign ledger (permanent record of burns)
- UI: dramatic burn confirmation with consequences explained
- Trigger: automatically suggested when a check's DR exceeds character's Total Max Potential
**Estimate:** Medium

### 4B.5 — Attribution Chain (Future)
**What:** Every creative element is a tagged training datum. Creativity genealogy tracked as DAG. Per REF-20, KRMA flows through attribution chain with sector multipliers.
**Build:**
- Attribution model: creator, creation date, parent elements, novelty score
- DAG tracking: who created what, derived from what
- Royalty flow: 40/30/30 split on derivative works
- Novelty scoring: mechanical fingerprint distance from existing entities
- Sector multiplier integration per REF-20
**Note:** This is a future-phase system. The global material catalog (server) is done; campaign-scoped pull is TODO.
**Estimate:** Large (defer to post-beta)

---

## Phase 5B: Canvas & UI Polish (Priority: MEDIUM)

### 5B.1 — Trailblazer (Player) Experience
**What:** Currently the player experience is functional but minimal.
**Build:**
- Player dashboard: my characters, my campaigns, my backstories, my KRMA
- **Canvas with fog-of-war style progressive reveal** (CONFIRMED): NPC starts as portrait, then name, then possessions, etc. — information revealed as character learns it
- Player action panel: roll skills, cast spells, spend effort, view GRO.vines
- **Terminal for players: Filtered feed** (their rolls, party rolls, character-relevant) (CONFIRMED)
- Backstory collaboration view (already built, may need polish)
- Information asymmetry: players should see different things than GMs
- **Dice visualization toggle:** Player chooses party+theirs, just theirs, or none (CONFIRMED)
**Estimate:** Medium-Large

### 5B.2 — Visual Identity Implementation
**What:** Apply the full extended color system per REF-22.
**Build:**
- Audit current UI against REF-22 three-level color spectrums
- Apply pillar colors consistently with 3-level intensity: Body(Red 1-3), Spirit(Blue 1-3), Soul(Purple 1-3)
- Font system per REF-22: Consolas (Terminal, 1.2 line-height, 0.5px letter-spacing), Bebas Neue (headers, uppercase, -0.5px), Inknut Antiqua (soul/creator, purple spectrum, italic ok), Roboto (sub-terminal, 9-10pt, blue spectrum), Comfortaa (mechanics, medium weight, 1.6 line-spacing, red spectrum)
- Black highlight bars behind text
- Centered, meditative layout with generous whitespace
- Left ornamental border with alchemical sigils (subtle)
- Surface colors: Powder blue (#CBD9E8 / #cfe2f3) for rules/calm, black void for combat, amber for Terminal sections
- GROWTH logo with per-letter color mapping per REF-22
- Symbol system: ⊗, ⊕, Terminal markers per REF-22
**Estimate:** Medium

### 5B.3 — Living Canvas Enhancement
**What:** Upgrade current canvas toward REF-23 vision (organic development, no formal grammar).
**Build:**
- Enhanced wire/tether system: color-coded (Red/Purple/Blue/Gold), interactive, bundleable
- Wire thickness for strength, pulsation for recent activity, dotted for potential/hidden
- Directional flow indicators on wires
- EtehrNET leyline pulsation modes (steady/rapid/fluctuating/color variations)
- Location cards: expandable to reveal interiors
- Terminal state indicators (Observer/Advisor/Processing/Meta/Stability)
- **GM creation: Canvas + community templates (via server) + AI-assisted, all at once** (CONFIRMED)
**Estimate:** Large

### 5B.4 — Glitch Effects & Reality Transitions
**What:** The rulebook features chaotic cosmic-glitch effects for consciousness/reality layer transitions.
**Build:**
- CSS/WebGL glitch effect library
- Trigger on: session start/end, death, GROvine completion, Lucidity events (hidden)
- Visual modes: calm (powder blue), combat (black void), terminal (amber), transcendent (glitch)
**Estimate:** Small-Medium

### 5B.5 — Session Start Flow
**What:** Active indicator, system records, GM tools for session start.
**Build:**
- Active session indicator
- System records session start/end
- GM recap/listen tools
- Player presence tracking
**Estimate:** Small

### 5B.6 — Mobile Responsiveness
**What:** Not currently addressed. Desktop-first, post-beta mobile (CONFIRMED).
**Build:**
- Responsive layouts for character sheet, backstory, player portal
- Canvas may need a simplified mobile view (list-based vs spatial)
- Touch-friendly controls
**Estimate:** Large
**Timeline:** Post-beta

---

## Phase 5C: Real-Time Communication (Priority: MEDIUM)

### 5C.1 — WebSocket Integration
**What:** Real-time updates for canvas, dice, terminal, character changes.
**Build:**
- WebSocket server (for beta — CONFIRMED)
- Real-time dice roll broadcasting
- Canvas state synchronization
- Terminal feed updates
- Character change notifications
- Session presence (who's online)
**Estimate:** Large

### 5C.2 — Audio System
**What:** Simple audio for beta, AI audio eventually.
**Build (Beta):**
- Basic voice chat integration (simple, off-the-shelf)
- Dice roll sound effects
- UI interaction sounds
**Build (Post-Beta):**
- AI audio processing (speech-to-text for Terminal commands)
- Always-on mic with spell/command detection
**Estimate:** Medium (beta), Very Large (AI audio)

---

## Phase 6: AI Systems (Priority: LOW — Post-Beta)

### 6.1 — AI Portrait Pipeline
**What:** ComfyUI + FLUX.2 Dev (quantized) + PuLID for identity-consistent character portraits.
**Status:** Design complete in PORTRAIT-PIPELINE.md, nothing built.
**Included in onboarding flow** (REF-26)
**Estimate:** Large

### 6.2 — Backstory AI Assistant
**What:** AI helps players develop backstory responses with prompts and suggestions.
**Status:** Planned, not built.
**Estimate:** Medium

### 6.3 — Rule Arbiter (The Oracle)
**What:** AI that references the rulebook to adjudicate ambiguous situations.
**Status:** Architecture designed in AI Data (Always-On AI Plan), nothing built.
**Estimate:** Very Large

### 6.4 — Godhead AI Agents
**What:** LLM-based entities with personalities that govern GRO.vines and bestow Blossoms per REF-14 and REF-19.
**Build:**
- Named entities: Tara/Lady Death, Et'herling (Justice), Valmir Calius (Progress), Roy (observer/Lucidity), Trayman (pattern/history)
- Investment strategies: Conservative, Aggressive, Reactive, Gambling, Patient
- Each Godhead has a "flavor sheet" (Domain, Tone, Boon style, Bane style)
- Assigned to GRO.vines based on thematic alignment
- Real-time Blossom generation: LLM-constrained by flavor sheet, potency 1-3
- Bestow Nectars on GRO.vine completion
- Compete over character goals (cosmic arms races)
- Kai + Et'herling are the KV evaluators for all created content per REF-19
- GODheads have WIT scores that constrain them (intentional limitations)
- Terminal functions as switchboard connecting players to appropriate GODhead domains
- **"Masked Self-Governance"**: System appears governed by cosmic entities but actually shaped by collective player actions
- **"Even Glitches are Canon"** — technical limitations become worldbuilding
- **Seasonal Stability Approach:** Core rules stable for defined periods, experimental features allowed
- Direct GODhead participation in campaigns planned for Meta-Year 13
- **Godhead dummy system needed for beta** (backbone of GRO.vines and Blossoms) (CONFIRMED)
**Status:** Conceptual. Dummy system needed for beta.
**Estimate:** Very Large

### 6.5 — Terminal as Character
**What:** The Terminal itself has values and personality per project docs.
**Build:**
- Body Value: Humble Pattern Recognition
- Soul Value: Nested Emergent Complexity (permanent Thorn: "Leyline of Leylines")
- Spirit Value: Bridged and Unbridged Meaning
- Terminal's values influence its grading, suggestions, and narrative interventions
**Status:** Conceptual. Deferred.
**Estimate:** Medium

### 6.6 — Oracle Scribe (Voice Pipeline)
**What:** Always-on audio → ASR → speaker diarization → IC/MM/OOC classification → rule adjudication.
**Status:** Architecture fully designed in AI Data. Deferred indefinitely.
**Estimate:** Enormous

### 6.7 — Lucidity System (Hidden)
**What:** "The realization that all beings are one" — tracked secretly by AI, never shown to players, triggered by conditions of self-discovery. Intended to remain undiscovered for months after release (SC-0405).
**Build:** Do NOT build now. Architecture must not preclude it. The Godhead AI system is where this would live. Roy's backstory (achieved ultimate Lucidity, can "become anyone") is the canonical example.
**Estimate:** N/A (future)

### 6.8 — Character Retirement → AI Agent
**What:** End-game final: retired characters become permanent AI LLM agents in the system. After a certain amount of time playing a character, enough data exists to train a persistent AI version.
**Connects to:** Godhead AI system — player characters can become Godhead-class entities through retirement.
**Status:** Far-future vision. Not for current implementation. (CONFIRMED)
**Estimate:** Very Large

---

## Phase 7: Platform & Business (Priority: LOW — Post-Beta)

### 7.1 — Subscription System
- Watcher subscription: 5 seats per GM
- Payment processing (Stripe or similar)
- KRMA allocation tied to subscription tier with diminishing curve per REF-20
- Longer subscription = more KRMA initially, eventually evens off → social/creative contributions take over
- **KRMA subscription curve: post-beta** (CONFIRMED)

### 7.2 — QR Code Access System
- Physical rulebook contains QR codes
- QR generation in Terminal admin (API exists for code generation)
- QR scanning on registration page
- Access code redemption (already built)

### 7.3 — Social Campaign Launch & EtehrNet
- Social media strategy documented in AI Data (`growth_social_campaign_report.md`)
- 8-10 month pre-launch window
- Platforms: X, Instagram, TikTok, YouTube, Discord, Reddit
- Theme: cryptic/mysterious Terminal communications
- **EtehrNet** = launch marketing tool (CONFIRMED)
- **EtehrNet Slow Consciousness Interface** (pre-launch marketing tool):
  - Live public consciousness stream
  - One message per IP per week (rate-limited)
  - Pattern Recognition Visualization showing how messages affect stability
  - Terminal Stability Monitor as visual centerpiece
  - Three-Pillar color-coded sections

### 7.4 — Deployment
- PostgreSQL migration from SQLite
- Hosting setup (Vercel or similar)
- Domain and SSL
- Performance optimization

### 7.5 — Dark Souls Invasions (Post-Launch Update)
- Cross-campaign invasion events (like Dark Souls)
- Godhead entities can intrude on campaigns
- Planned as "one of the first updates to the game" per Mike
- Requires Godhead AI system (Phase 6.4) to be functional
- Post-launch, maybe GM shared simulation space near launch (CONFIRMED)

---

## Forge: Player-Facing View (CONFIRMED)

Players see in the Forge:
- Their own requests to the GM
- Known elements (materials, etc. that their character has encountered)
- Revealed traits (Nectars/Thorns that have been discovered)
- Primarily a **player request interface to the GM** (CONFIRMED)
- Full creation tools remain GM-only

---

## Far-Future Ideas (NOT for active development)

### Values & Addictions System
**Status:** Far-future idea ONLY. Does NOT exist in the current system. (CONFIRMED 2026-03-13)
**Concept:** Values and addictions as two sides of the same coin with distinct KRMA sources.
- Values: Upholding = 1 KRMA to Frequency from Watcher
- Addictions: Indulging = 1 KRMA from godheads + rest bonuses but temporary Thorn
- Terminal creates addictions as distorted versions of player's values
**Note:** Do NOT build this. Move to active development only when Mike explicitly requests it.

### Character Retirement → AI
See Phase 6.8. Far-future vision.

### Dark Souls Invasions
See Phase 7.5. Post-launch.

### Synchronicity Effects
See REF-21. Secret GM metric with varying future effects — specifics TBD.

### Environmental Resonance for Rest
NOT a formal system (CONFIRMED 2026-03-13). Rest is affected contextually by GM/conditions — purely narrative, not mechanical.

### Canvas Visual Grammar
NOT the described formal system (CONFIRMED 2026-03-13). Different card types exist, but visual language develops organically.

---

## Data Conflicts & Resolutions

### ALL RESOLVED (as of 2026-03-13)

**1. Skill Levels 1-3 Flat Bonus**
- **RESOLVED:** Levels 1-3 = flat +1/+2/+3. No Skill Die.

**2. Death Save Details**
- **RESOLVED:** TWO separate systems. Combat: FD + Health Level vs Lady Death. Fated Age: Health Level + mods vs Lady Death. Both use 3-strike rule independently.

**3. Soul/Spirit Attribute Mapping**
- **RESOLVED:** Jan 2026 swap is canonical. Spirit=Blue(Flow/Frequency/Focus), Soul=Purple(Willpower/Wisdom/Wit). App is updated.

**4. Pillar Colors**
- **RESOLVED:** Body=Red, Spirit=Blue, Soul=Purple, Terminal=Teal, KRMA=Gold. Full hex spectrums in REF-22.

**5. Effort Return on Success**
- **RESOLVED:** Effort ALWAYS spent regardless of success/failure.

**6. KRMA Reserve Totals**
- **RESOLVED:** 100B total with current split (Terminal 75%, Balance 12.5%, Mercy 6.25%, Severity 6.25%). May change by release.

**7. GROWTH Acronym — Thread Model Status**
- **RESOLVED:** Six-letter Thread facet model is DISCARDED (was brainstorming). GROWTH = GRO (Goals/Resistance/Opportunity = GRO.vines) + WTH (Wealth/Tech/Health = meta-levels). No sub-letter mechanics.

**8. Skilled Roll Base Die**
- **RESOLVED:** FD + Skill Die for skilled checks. Fate Die is the base.

**9. Short Rest Mechanics**
- **RESOLVED:** Simple model. Deplete 1 Frequency → restore 1 point in every other attribute. Complex model may come later.

**10. Electric vs Energy Damage Types**
- **RESOLVED:** "Energy" is correct. "Electric" is old wording. Same damage type. Update material system references.

**11. Death Split Fractions**
- **RESOLVED:** Pillar-based split per REF-10 detailed table. Body→GM, Spirit Frequency→Lady Death, Spirit Flow/Focus→Spirit Package, Soul→50/50 GM/Package.

**12. Depletion Conditions (Overwhelmed/Confused/Incoherent)**
- **RESOLVED:** All 9 conditions confirmed. See REF-1 table.

**13. ActionMod & Cross-Pillar Transfer**
- **RESOLVED:** ActionMod = items and traits modifier, base 0. No cross-pillar transfer. Any action usable as movement.

**14. Combat Style**
- **RESOLVED:** Grid-based, 5ft squares.

**15. Effort Funding**
- **RESOLVED:** Governor attributes of the skill being used, matching the action type's pillar. Can split across multiple governors.

---

## Remaining Open Questions (Reduced)

### Important but Not Blocking
1. **Fear Check Attribute:** Which attribute — Willpower? Context-dependent?
2. **Prima Materia metal-school mapping** — confirm canonical version?
3. **Lady Death's exact roll** — what die and modifiers for both death systems?
4. **Reroll escalation** — confirm 2/5/10 KRMA costs
5. **Skill advancement KRMA costs** per level?

### Deferrable
6. **KRMA tax rate** for declining Nectars?
7. **Burn cost formula** — exact scaling?
8. **Reincarnation KRMA cost?**
9. **Harvest activity costs and yields?**

---

## Priority Order for Next Sessions

### Immediate (makes a session playable):
1. **3B.1** — Skill check flow from UI (TWO-STEP: SD roll → effort wager popup → FD roll)
2. **3B.3** — Rest & recovery (simple model: 1 Frequency → heal all attributes by 1)
3. **3B.2** — Damage tracking & hit locations (7-type damage string, armor layers, all 9 conditions)
4. **3B.5** — Editable skills in SkillsCard
5. **3B.6** — Wealth Level purchase system (check-based, narrative restoration)
6. **3C.1** — Turn structure & action economy (grid-based, 5ft squares, per-pillar actions)

### Near-term (makes combat/magic work):
7. **3C.2** — Attack resolution (damage strings, armor flow, fixed damage, contested checks)
8. **3D.1** — Magic school skills & mana pool (10 schools, separate mana resource)
9. **3D.2** — Wild casting (text-based, AI determines DR)
10. **3D.3** — Woven spells (contextual framing via governing skill)
11. **3B.4** — Traits modifying rolls (Nectars/Blossoms/Thorns)

### Medium-term (deepens the experience):
12. **3E.2** — GROvine system (simple G/R/O model — NOT six-letter)
13. **3E.1** — Fear system
14. **3E.5** — Death system (two separate systems: combat + fated age)
15. **3F.1** — NPC system (same card design as players)
16. **3F.3** — Encounter runner
17. **4B.2** — Earning KRMA during play
18. **4B.3** — Spending KRMA during play

### Beta-critical (must have for beta):
19. **KV system fully functional** (backbone of entire game)
20. **Godhead dummy system** (backbone of GRO.vines and Blossoms)
21. **5C.1** — WebSocket for real-time
22. **5B.1** — Trailblazer experience (fog-of-war, filtered terminal, dice toggle)

### Polish (demo-ready):
23. **5B.2** — Visual identity audit (full REF-22 implementation)
24. **5B.3** — Living Canvas enhancement (organic, no formal grammar)
25. **3E.3** — Harvests (similar to branches)
26. **3E.4** — Fated age system
27. **4B.4** — KRMA Burn system (metaverse-wide hard limit)

### Post-beta:
28. **6.1-6.8** — All AI systems (portraits, Godhead agents, Terminal character, retirement→AI)
29. **7.1-7.5** — Platform & business (subscription, QR codes, EtehrNet, deployment, invasions)
30. **4B.5** — Attribution chain
31. **Values & Addictions** — far-future only
