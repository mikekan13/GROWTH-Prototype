# Damage_Types_and_Effects.md

**Status:** #needs-validation
**Source:** GROWTH_System_Archive_Complete_Content_Extraction.md, User clarification 2025-10-03
**Last Updated:** 2025-10-03

---

# Damage Types & Effects

GROWTH uses a **hierarchical damage system** with specific **order of operations** and **unique effects** for each damage type.

## Base Rules vs Modifications

**Core Design Principle:**
Each damage type has **hard-coded base mechanics** that apply universally. However, items and materials can have **modifiers** that change how they interact with specific damage types.

**KRMA Cost Principle:**
- **Base mechanics:** "Cheap" default behavior (follows natural material properties)
- **Exceptions/Modifiers:** Cost more [[KRMA_System|KRMA]] to create (the more unusual, the more expensive)
- **Example:** Energy normally bypasses all armor, but "Electric Resistant" armor modifier allows resistance

**Think Magic: The Gathering Rules:**
Global rules apply universally, but individual items (like cards) can override or modify those rules for specific instances.

See [[Material_System]] for material modification options.

## Damage Resolution Order

**Standard Order:** Piercing → Slashing → Heat → Decay → Cold → Bashing → Energy
**Abbreviations:** P:S:H/D:C:B:E

**Rule:** Damage resolves in this specific sequence regardless of when it was applied
**Purpose:** Consistent resolution mechanics for complex damage interactions

## Physical Damage Types

### Piercing Damage (P)
**Sources:** Arrows, bullets, spears, thrusting weapons

**Base Mechanics:**
- **vs Soft Materials:** Damage reduced by material resist value, cannot cause condition loss
- **vs Hard Materials:** Damage reduced by material resist value, cannot cause condition loss
- **vs Body:** Damage reduced normally, can cause condition loss
- **Overwhelming Damage:** 3x resistance value destroys item completely

**Note:** Material modifiers like "Pierce Resistant" or "Pierce Proof" can change these interactions

### Bashing Damage (B)
**Sources:** Clubs, hammers, falling, crushing

**Base Mechanics:**
- **vs Soft Materials:** Damage reduced by material resist value, cannot cause condition loss
- **vs Hard Materials:** Damage reduced by resist, reduces condition by 1 if damage ≥ resistance rating
- **vs Body:** Damage reduced normally, can cause condition loss
- **Overwhelming Damage:** 3x resistance value destroys item completely

**Note:** Material modifiers like "Bash Resistant" or "Bash Proof" can change these interactions

### Slashing Damage (S)
**Sources:** Swords, axes, claws, cutting weapons

**Base Mechanics:**
- **vs Soft Materials:** Reduces condition by 1 when damage ≥ resistance rating, damage reduced normally
- **vs Hard Materials:** Damage reduced by material resist value, cannot cause condition loss
- **vs Body:** Damage reduced normally, can cause condition loss
- **Overwhelming Damage:** 3x resistance value destroys item completely

**Note:** Material modifiers like "Slash Resistant" or "Slash Proof" can change these interactions

## Elemental Damage Types

### Heat Damage (H)
**Sources:** Flames, fire, burning spells, thermal energy

**Base Mechanics:**
- **vs Soft Materials:** Automatically reduces condition by 1, damage NOT reduced (passes through fully)
- **vs Hard Materials:** Acts like Piercing (damage reduced by resist, no condition loss)
- **vs Body:** Damage reduced normally
- **Overwhelming Damage:** 3x resistance value destroys item completely

**Note:** Material modifiers like "Heat Resistant," "Heat Proof," or "Flammable" can change these interactions

### Cold Damage (C)
**Sources:** Ice, freezing spells, extreme cold

**Base Mechanics:**
- **vs Soft Materials:** Acts like Piercing (damage reduced by resist, no condition loss)
- **vs Hard Materials:** Automatically reduces condition by 1, damage reduced normally
- **vs Body:** Damage reduced normally
- **Overwhelming Damage:** 3x resistance value destroys item completely

**Note:** Material modifiers like "Cold Resistant" or "Cold Proof" can change these interactions

### Energy Damage (E)
**Sources:** Lightning, electrical energy, shock spells, energy weapons

**Base Mechanics:**
- **vs All Materials:** Bypasses ALL resistance - damage NOT reduced by any material type
- **Condition Effects:** Does NOT reduce condition of materials
- **Universal Penetration:** Goes straight through to target attribute pools

**Note:** Material modifiers like "Electric Resistant" or "Electric Proof" can change these interactions. This is the ONLY way to resist Energy damage.

### Decay Damage (D)
**Sources:** Acid, corrosive substances, decay spells, dissolving attacks

**Base Mechanics:**
- **vs Soft Materials:** Reduces condition by 1, damage IS reduced by resistance
- **vs Hard Materials:** Reduces condition by 1, damage IS reduced by resistance
- **vs Body:** Damage reduced normally
- **Universal Effect:** Any Decay damage reduces item condition, then remaining damage is reduced
- **Overwhelming Damage:** 3x resistance value destroys item completely

**Note:** Material modifiers like "Decay Resistant" or "Decay Proof" can change these interactions

## Armor Layering System

**Layer Processing:** Damage flows from outermost to innermost layer sequentially
**Independent Reactions:** Each layer applies its material resist and condition effects separately
**Overflow:** Remaining damage after each layer continues to next layer
**See:** [[Damage_Type_Interactions]] for detailed damage flow examples

## Massive Damage Rule

**Threshold:** Damage equal to **3x material resist** causes **instant destruction**
**Application:** Applies to all materials and equipment universally
**Bypass:** Skips condition degradation, destroys immediately
**Overflow:** After destruction, remaining damage = (Total Damage - Resistance Value) continues to next layer

**Examples:**
- Steel armor (20 resist): 60+ damage = instant destruction
- 75 damage vs 20 resist = destroyed, 55 damage continues to next layer

## Ongoing Effects and Modifiers

**Base System:** GROWTH damage types have no inherent "ongoing damage" in the core rules

**Created Effects:** GMs and players can create ongoing effects through:
- **Nectars/Thorns:** Character abilities that apply persistent conditions
- **Material Modifiers:** Items with "Flammable," "Self-Healing," "Combustible," etc.
- **Spells/Magic:** Custom magical effects that persist over time
- **Environmental Hazards:** Campaign-specific effects (burning rooms, acid pools, etc.)

**KRMA Cost Principle Applies:** Unusual or powerful ongoing effects cost more to create

---

## Links
- Related: [[Combat_Hit_Locations]], [[Material_System]], [[Armor_System]]
- References: [[Damage_Type_Chart]], [[Material_Vulnerability_Table]]
- Examples: [[Damage_Type_Scenarios]]