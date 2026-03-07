# Material_System_Contradictions_Report.md

**Status:** #needs-validation  
**Source:** Comprehensive analysis of material and item files  
**Last Updated:** 2025-08-12

---

# Material System Contradictions and Vagueness Report

## Critical Contradictions Found

### 1. **Material Property Inconsistencies**

#### Steel Values Contradiction
- **Material_System.md Line 48:** Steel = 20 Resist, Tech III, Rarity 3, Heavy (5)
- **Complete_Materials_Reference.md Lines 55-57:** 
  - Low Carbon Steel = 35 Resist, Tech III, Rarity 4, Heavy (5)
  - High Carbon Steel = 38 Resist, Tech III, Rarity 4, Heavy (5)
- **Issue:** Basic "Steel" entry in Material_System.md is significantly weaker than detailed steel types

#### Leather Values Contradiction  
- **Material_System.md Line 35:** Leather = 17 Resist, Tech I, Rarity 2, Trivial (2)
- **Complete_Materials_Reference.md Line 22:** Leather (Common) = 17 Resist, Tech I, Rarity 2, Trivial (2)
- **Armor_System.md Lines 42-46:** Uses "Leather Clothing" with Resist 4 (17÷2) in example
- **Issue:** Inconsistent naming and no explanation of "Leather Clothing" vs base leather

#### Wood Classification Issues
- **Material_System.md Line 44:** Wood = 10 Resist (no type specified)
- **Complete_Materials_Reference.md Lines 29-30:**
  - Softwood = 8 Resist, Ubiquitous (1), Light (3)
  - Hardwood = 10 Resist, Common (2), Moderate (4)
- **Issue:** Generic "Wood" needs clarification of which type is being referenced

### 2. **Armor System Calculation Contradictions**

#### Layering Formula Inconsistency
- **Armor_System.md Lines 42-46:** States leather clothing example uses "4÷2" for first layer
- **Problem:** Base leather is 17 Resist, not 4. Should be 17÷2 = 8.5 ≈ 9 for first layer
- **Current example gives:** 2+2+2 = 6 total resistance
- **Correct calculation should be:** 9+9+9 = 27 total resistance (massively different)

#### Protection Multiplier Conflicts  
- **Material_System.md Line 69:** Protective mod gives "1.5× cloth, 2× light armor, 2.5× heavy armor"
- **Armor_System.md Lines 16-31:** States protection as "Half/Full/1.5×" for Clothing/Light/Heavy
- **Issue:** These systems conflict. Unclear if Protective mod stacks with armor category multipliers

### 3. **Tech Level Inconsistencies**

#### Roman Numeral vs Number Format
- **Material_System.md:** Uses Roman numerals (I, II, III, IV, V, VI)
- **Complete_Materials_Reference.md:** Uses mix of numbers and text ("Tech Level I", "Tech Level II", "Tech Level IV+")
- **Issue:** Inconsistent notation throughout system

#### Tech Level Progression Logic
- **Cast Iron:** Tech III, Resist 39, historically came BEFORE steel
- **Steel:** Tech III, Resist 20-38, historically came AFTER cast iron
- **Issue:** Historical progression doesn't match Resist values (cast iron stronger than steel)

### 4. **Weight Category Contradictions**

#### Carbon Fiber Properties
- **Material_System.md Line 50:** Carbon Fiber = Light (3), with "Featherlight" modifier
- **Complete_Materials_Reference.md Line 75:** Carbon Fiber = Light (3), "Featherlight, Brittle, Heat Resistant"
- **Issue:** If material has "Featherlight" modifier, why isn't base weight category 1-Featherlight?

#### Adamant Weight Inconsistency
- **Material_System.md Line 51:** Adamant = Heavy (5)
- **Complete_Materials_Reference.md Line 111:** Adamant = Heavy (5)
- **Issue:** Legendary material being "Heavy" seems inconsistent with other legendary materials being lighter

### 5. **Modifier Definition Vagueness**

#### Heat Resistant vs Heat Proof Confusion
- **Material_System.md Lines 57-58:** Distinguishes "Resistant" vs "Proof" but definitions overlap
- **Armor_System.md Line 72:** States wood can be wet to "gain heat resistance" 
- **Issue:** Unclear mechanical difference between Heat Resistant and Heat Proof in gameplay

#### Brittle vs Fragile Distinction  
- **Material_System.md Line 70:** Lists "Brittle/Fragile" as if they're the same
- **Complete_Materials_Reference.md:** Uses both terms for different materials
- **Issue:** No clear mechanical distinction provided between these modifiers

#### Flexible X Value Inconsistencies
- **Cotton:** Flexible 2 in both files
- **Leather:** Flexible 2 in both files  
- **Carbyne:** Flexible 3 in both files
- **Issue:** No explanation of what Flexible X values actually mean in encumbrance reduction

### 6. **Weapon System Integration Problems**

#### Material-to-Damage Conversion Missing
- **Weapon_System.md:** Shows specific damage values (Arming Sword: "0/0/16 : 0/0/0 + 13/0/0 : 0/0/0")
- **Material_System.md:** No formula for converting material Resist to weapon damage
- **Issue:** No clear connection between material properties and weapon statistics

#### Weapon Material Examples Lacking
- **Weapon_System.md:** Lists weapon categories but no material construction examples
- **Material_System.md:** Has creation formulas but no weapon-specific applications
- **Issue:** Gap between material system and actual weapon creation

### 7. **Economic System Vagueness**

#### Fractional KV Implementation Unclear
- **Material_System.md Lines 139-143:** States materials have "fractional KV < 1"
- **Complete_Materials_Reference.md:** Shows specific fractional values (0.1, 0.15, etc.)
- **Issue:** No explanation of how these KV values translate to actual costs or availability

#### Value Transformation Formula Missing
- **Material_System.md Line 133:** States "KV Transformation: Materials (fractional KV) become items (meaningful KV ≥1)"
- **Issue:** No actual formula provided for this transformation

### 8. **Processing and Enhancement Gaps**

#### Processing Examples Incomplete  
- **Complete_Materials_Reference.md Lines 125-141:** Lists processing examples
- **Issue:** No mechanical rules for how to achieve these enhancements

#### Enhancement Costs Missing
- **Material_System.md Lines 153-156:** Lists processing types
- **Issue:** No costs, difficulty, or time requirements provided

## Major Vagueness Issues

### 1. **Combination Formula Limitations**
- Basic averaging formula too simple for complex items
- No guidance on how to handle 3+ materials
- No weighting system for material proportions

### 2. **Modifier Stacking Rules Unclear**
- How do contradictory modifiers resolve?
- What happens when same modifier appears multiple times?
- Priority rules for modifier conflicts not specified

### 3. **Condition System Integration Missing**
- How do material modifiers change as items degrade?
- Do Broken items lose certain material properties?
- Repair difficulty based on material properties undefined

### 4. **Scale Issues**
- Resist 1-50 scale but many materials cluster in 15-30 range
- Weight categories 1-6 but actual encumbrance rules missing
- Rarity 1-10 but availability guidelines not provided

## Critical Missing Information

### 1. **Tool Requirements Specification**
- Which tools needed for each Tech Level?
- How do tool quality affect crafting outcomes?
- Can higher-tech tools work lower-tech materials?

### 2. **Skill Integration Details**
- Which skills needed for material working?
- How does skill level affect success rates?
- Failure consequences for material processing

### 3. **Environmental Effects**
- How do climate/weather affect materials?
- Storage requirements for different materials
- Degradation rates in different environments

### 4. **Magic Integration Rules**
- How do materials interact with spells?
- Magical enhancement procedures
- Compatibility between material types and magic schools

## Recommendations for Resolution

### Immediate Fixes Needed
1. **Standardize Steel entries** - Clarify which steel type is "default"
2. **Fix Armor layering math** - Recalculate example with correct values
3. **Standardize Tech Level notation** - Choose Roman numerals OR numbers consistently
4. **Define modifier mechanics** - Specify exact mechanical effects of each modifier

### System Expansions Required  
1. **Complete material-to-item formulas** for weapons, armor, tools
2. **Detailed processing rules** with costs and requirements
3. **Modifier interaction matrices** for conflict resolution
4. **Encumbrance calculation system** using weight categories

### Documentation Improvements
1. **Consolidate material listings** into single authoritative source
2. **Add worked examples** of item creation process
3. **Create material selection guides** for different item types
4. **Develop troubleshooting guide** for edge cases

---

## Links
- Source Files: [[Material_System]], [[Complete_Materials_Reference]], [[Armor_System]], [[Weapon_System]]
- Related Issues: [[Equipment_Conditions]], [[Prima_Materia_System]]
- Resolution Tracking: [[Material_System_Updates_Needed]]