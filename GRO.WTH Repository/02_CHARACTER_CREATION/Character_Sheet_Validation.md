# Character_Sheet_Validation.md

**Status:** #needs-validation  
**Source:** GROWTH Character Sheets Audit Report.md  
**Security:** PUBLIC  
**Last Updated:** 2025-08-11

---

# Character Sheet Validation Rules

This file documents validation rules for GROWTH character sheets based on audit findings and core mechanics.

## Skill System Validation

### Skill Die Progression (Levels 1-20)
**Correct Mapping:**
- **Levels 1-3:** No extra die; add static +Level to Fate Die
- **Levels 4-5:** Add d4 Skill Die
- **Levels 6-7:** Add d6 Skill Die  
- **Levels 8-11:** Add d8 Skill Die
- **Levels 12-19:** Add d12 Skill Die
- **Level 20:** Add d20 Skill Die

**Validation Check:** Maximum potential = Fate Die max + Skill Level

### Display Format
- **Unskilled:** Show "Fate Die only" (not confusing "Coin" terminology)
- **Skilled:** Show both Skill Die and Fate Die clearly
- **Max Roll:** Always = Fate Die max + Skill Level

## Attribute Pool Validation

### Pool Size Formula
**Confirmed:** Pool Size = Effective Attribute Score (1:1 ratio)
- **Base Attribute + Augmentation = Pool Maximum**
- No special multipliers for specific attributes

### Depletion State Display
**Required Implementations:**
- **Clout 0:** Display "Weak" 
- **Celerity 0:** Display "Clumsy"
- **Constitution 0:** Display "Exhausted" ✓ (currently working)
- **Focus 0:** Display "Muted"
- **Frequency 0:** Display "Death's Door"
- **Flow 0:** Display "Deafened"
- **Willpower 0:** Display "Overwhelmed"
- **Wit 0:** Display "Incoherent"  
- **Wisdom 0:** Display "Confused"

**Visual Indicators:** Use conditional formatting (red background/bold text) when attribute = 0

## Carry Capacity System

### Carry Level Calculation
**Needs Research:** Exact Clout-to-Carry Level formula
- **Known:** ~Clout 80 = Carry Level 10 (max)
- **Bug Found:** Sheets showing CL2 for all characters regardless of Clout
- **Fix Required:** Link Carry Level calculation to actual Clout value

### Weight Status Logic
**Rule:** Can carry items up to Carry Level + **one item** one level higher
- **Encumbered:** Multiple items above CL or one item 2+ levels above
- **Current Issue:** Weight Status stuck on "Fine" - needs proper encumbrance detection

## Item System Validation

### Condition States
**Standard Terms:**
- **4 - Indestructible**
- **3 - Undamaged** 
- **2 - Worn**
- **1 - Broken**

**Quantity-Based Items (Ammo, etc.):**
- **2 - Sufficient** (equivalent to Worn)
- **1 - Finite** (equivalent to Broken)

**Broken Item Effects:** When Condition = 1, effective Resist is halved

### Tech Level Restrictions
**Usage vs Creation:**
- **Some items:** Require Tech Level to **use** 
- **Other items:** Only require Tech Level to **create** (can use if obtained)
- **Sheet Should:** Flag items requiring higher Tech Level than character has

### Wealth Level (No Usage Restrictions)
- **Rule:** No wealth restrictions on **using** items
- **Impact:** Can use high-wealth items if somehow obtained
- **Sheet Should:** Not block usage based on wealth disparity

## Nectars and Thorns Validation

### Count Limits
**Rule:** Maximum Nectars + Thorns = Fate Die value
- **d4 Fate Die:** Max 4 total traits
- **d6 Fate Die:** Max 6 total traits
- **d8 Fate Die:** Max 8 total traits
- **d12 Fate Die:** Max 12 total traits
- **d20 Fate Die:** Max 20 total traits

**Sheet Should Display:** "Used X of Y" counter and warn if over limit

## Research Needed Items

**Flag for Future Updates:**
- **Tech Level Life Extension:** Exact formula for lifespan modification
- **Wealth Level Mechanics:** Full 1-10 scale descriptions and effects  
- **Clout-to-Carry Level:** Precise mapping formula
- **Material Mod Notations:** Legend for resistance column letters (R, P, V, D, etc.)
- **Lifespan Level Base Values:** Years for each Lifespan Level 1-10

---

## Links
- Related: [[Basic_Resolution_System]], [[Attribute_Depletion_Effects]]
- References: [[Skill_Level_Progression]], [[Nectars_and_Thorns_System]]
- Examples: [[Character_Sheet_Template_Analysis]]