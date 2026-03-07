# Material_System.md

**Status:** #needs-validation
**Source:** GROWTH Material and Item Creation Artifact, Claude Material System Dump.md, User clarification 2025-10-03
**Last Updated:** 2025-10-03

---

# Material System

The GROWTH material system operates on the principle: **materials are potential, items are purpose**. Raw materials exist as templates with fractional Karmic Value (KV < 1), representing pure potential waiting to be transformed into functional items.

## Design Philosophy: Base Properties + Material Modifiers

**Core Principle:**
Materials have **base properties** (Resist, Tech Level, Rarity, Weight) that interact with **global crafting rules**. Material **modifiers** (like Nectars/Thorns for characters) change or add rules for specific materials.

**KRMA Cost Principle:**
- **Base properties:** Standard behavior following global rules (cheap in KRMA)
- **Material mods:** Override or add special behaviors (cost more [[KRMA_System|KRMA]])
- **Example:** "Protective" mod changes armor multipliers from base 0.5×/1×/1.5× to 1.5×/2×/2.5×

**Think Magic: The Gathering Rules:**
Global crafting rules apply universally, but individual materials can have modifiers that override those rules for specific instances.

**Starter Kit Purpose:**
The materials listed here are **example baseline materials** for training KRMA evaluation systems and providing GMs with starting options. GMs and players will create countless additional materials with unique modifiers.

## Core Material Properties

**Base Resist (1-50):** The material's inherent durability and structural integrity, representing how much damage it can absorb before failing. Physics-based values for real materials, balanced scale for fictional ones.

**Resist Type Classification:**
- **Soft Materials:** Flexible, absorbent (fabric, leather, organic). Better at distributing damage, can be layered for cumulative protection, shaped without specialized tools
- **Hard Materials:** Rigid, dense (metals, stone, crystal). Excel at stopping direct impacts, cannot be meaningfully layered, require specialized tools
- **Hybrid Materials:** Advanced/magical materials exhibiting properties of both types

**Tech Level (1-10+):** Technological sophistication required to work with the material effectively

**Rarity Tier (1-10):** From Ubiquitous (dirt, air) to Impossible (materials transcending normal existence)

**Fractional KV:** All raw materials have KV values below 1 (0.0000000000001 to 0.9999999999999) to prevent inflation and maintain economic balance

## Material Properties Reference

### Soft Materials

| Material | Base Resist | Tech Level | Rarity | Weight Category | Key Modifiers |
|---|---|---|---|---|---|
| Cotton | 1 | 1 | 2 | Featherlight (1) | Absorbent, Flammable, Flexible 2 |
| Leather | 17 | 1 | 2 | Trivial (2) | Absorbent, Flammable, Flexible 2 |
| Kevlar | 25 | 4 | 5 | Light (3) | Heat Resistant, Flexible 1 |
| Graphene | 29 | 5 | 7 | Featherlight (1) | Electric Proof, Heat Resistant |
| Carbyne | 30 | 6 | 8 | Featherlight (1) | Electric Proof, Flexible 3 |

### Hard Materials

| Material | Base Resist | Tech Level | Rarity | Weight Category | Key Modifiers |
|---|---|---|---|---|---|
| Wood | 10 | 1 | 1 | Moderate (4) | Flammable, Absorbent, Heat Resistant |
| Stone | 16 | 1 | 1 | Heavy (5) | Fragile, Cold Resistant |
| Bronze | 28 | 2 | 3 | Moderate (4) | Heat Resistant, Electric Vulnerable |
| Cast Iron | 25 | 2 | 3 | Hefty (6) | Brittle, Heat Resistant, Electric Vulnerable |
| Steel (Wrought) | 30 | 3 | 3 | Heavy (5) | Heat Resistant, Electric Vulnerable |
| Diamond | 23 | 4 | 8 | Moderate (4) | Brittle, Sharp, Heat Resistant |
| Carbon Fiber | 26 | 5 | 6 | Light (3) | Featherlight, Brittle |
| Adamant | 32 | 6 | 9 | Heavy (5) | Heat Proof, Cold Proof |

## Material Modifier Categories

### Damage Resistance Modifiers
- **Dampening Mods:** Halve specific damage types (Pierce/Bash/Slash/Heat/Cold/Electric/Decay Dampening)
- **Resistant Mods:** Resist special effects, must overcome material Resist for effect to apply
- **Proof Mods:** Near-immunity to damage type's special nature (Heat/Cold/Electric/Decay Proof)

### Damage Vulnerability Modifiers
- **Vulnerable Mods:** Double damage from specified type (Heat/Cold/Electric/Decay Vulnerable)
- **Intolerance Mods:** Material's effective durability halved against certain damage
- **Flammable:** Ignites easily, loses extra condition level from fire damage
- **Combustible:** Extreme fire vulnerability, can be instantly destroyed

### Physical Property Modifiers
- **Flexible X:** Reduces encumbrance by X steps due to material give
- **Restrictive:** Doubles encumbrance due to unwieldy nature
- **Protective:** Increases base Resist in armor applications (1.5× cloth, 2× light armor, 2.5× heavy armor)
- **Brittle/Fragile:** Breaks easily under stress, may lose multiple condition levels
- **Sharp:** Bonus against soft materials
- **Absorbent:** Soaks liquids; when wet gains Heat Resistant but becomes Cold Intolerant
- **Unrepairable:** Cannot be repaired by non-magical means

### Soft vs Hard Material Mechanics

**Soft Materials:**
- Can be sewn, woven, shaped without specialized tools
- Multiple layers provide cumulative protection
- Better damage distribution against slashing/piercing
- Requires textile tools and techniques

**Hard Materials:**
- Requires specialized tools to shape
- Cannot be meaningfully layered
- Excellent protection against bashing damage
- Requires metalworking or stoneworking tools

## Item Creation and Material Combination

### Combination Formula

**Basic System (Current):**
```
Final Resist = (Primary Resist + Subordinate Resist) ÷ 2
Final Type = Primary Material's Type
Tech Level = Highest tech level among components
```

**Advanced System (Future with ML):**
```
Final Resist = (Primary Resist × Primary %) + (Subordinate Resist × Subordinate %)
```

### Material Property Inheritance

**Modifier Inheritance:** Items inherit modifiers from all component materials
- **Cancellation:** Opposing modifiers neutralize each other
- **Coexistence:** Both modifiers apply with situational triggers
- **Dominance:** One modifier overrides based on proportion or function

**Weight Calculation:** Item-specific rules determine if weights are added, averaged, or calculated through other functions

### Step-by-Step Item Creation

1. **Define Item Type:** Determine what the item is and its major components
2. **Select Primary Material:** Main material that dictates overall nature
3. **Add Subordinate Materials:** Supporting materials for specific properties
4. **Calculate Final Resist:** Apply combination formula
5. **Determine Tech Level:** Use highest tech requirement
6. **Apply Material Mods:** Combine all modifiers from components
7. **Calculate Weight:** Consider item design and material properties
8. **Determine Value:** Combine material values with craftsmanship
9. **Finalize Description:** Create complete item stat block

### Crafting Integration

Materials determine:
- **Tool Requirements:** Specialized tools needed for material type
- **Skill Checks:** Difficulty based on material properties and tech level
- **Time Investment:** Complex materials require longer crafting
- **Quality Outcomes:** Material properties affect final item effectiveness
- **KV Transformation:** Materials (fractional KV) become items (meaningful KV ≥1)

---

## Economic Integration

### Fractional KV System
- **Raw Materials:** All have KV < 1 (pure potential)
- **Prepared Materials:** Still fractional, modified through processing
- **Crafted Items:** Meaningful KV ≥ 1 (purpose-driven creations)
- **Value Emergence:** Transformation from material to item represents genuine value addition

### KRMA Economic Model
- **GM Freedom:** Fractional KV allows abundant resource description without economic disruption
- **Player Agency:** Materials provide concrete resources for character projects
- **Post-Scarcity Philosophy:** Basic materials abundant, value comes from transformation and purpose

## Material Processing and Enhancement

### Pre-Crafting Modification
- **Alchemical Treatment:** Chemical processes altering properties
- **Environmental Conditioning:** Tempering, weathering treatments
- **Magical Infusion:** Supernatural enhancement of characteristics
- **Technological Processing:** Advanced techniques improving base properties

### Advanced Material Concepts
- **Living Materials:** Self-modifying, consciousness-bearing, symbiotic
- **Impossible Materials:** Conceptual substances, paradox materials, meta-materials
- **Temporal Materials:** Exist across multiple timestreams
- **Narrative Materials:** Exist because the story requires them

---

## Links  
- Related: [[Equipment_Conditions]], [[Armor_System]], [[Weapon_System]], [[Prima_Materia_System]]
- References: [[KV_Economic_System]], [[Crafting_Tools_Table]], [[Tech_Level_Progression]]
- Examples: [[Material_Combination_Examples]], [[Custom_Material_Creation]]