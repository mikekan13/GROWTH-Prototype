# Character_Sheet_Validation.md

**Status:** #validated  
**Source:** GROWTH Character Sheets Audit Report.md, ruling 2026-04-22  
**Security:** PUBLIC  
**Rulebook:** `rulebook/rulebook.md` §2, §3, §7 (skills, attributes, nectars/thorns validation)  
**Last Updated:** 2026-04-22

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
**Standard Terms (ruling r-2026-04-22-12, see `rulebook/rulebook.md` §9.3):**
- **4 - Indestructible** (super rare — cannot be destroyed)
- **3 - Undamaged** (perfect, normal max)
- **2 - Worn**
- **1 - Broken**
- **0 - Destroyed** (item no longer exists)

**Quantity-Based Items (Ammo, etc.):**
- **2 - Sufficient** (equivalent to Worn)
- **1 - Finite** (equivalent to Broken)

**Broken Item Effects:** When Condition = 1, effective Resist is halved
**Destroyed Items:** When Condition = 0, the item is gone. Sheet should remove it from inventory entirely.

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
- **Clout-to-Carry Level:** Precise mapping formula
- **Material Mod Notations:** Legend for resistance column letters (R, P, V, D, etc.)
- **Age-to-KV rate:** Empirical validation — build Human-seed-at-age-18 reference character and re-derive per-year KV value (currently 2 KRMA/year placeholder, ruling r-2026-04-22-04)

*WTH-related research items (Tech Level Life Extension, Wealth Level Mechanics, Lifespan Level Base Values) were removed along with the WTH system 2026-04-05.*

---

## Links
- Related: [[Basic_Resolution_System]], [[Attribute_Depletion_Effects]]
- References: [[Skill_Level_Progression]], [[Nectars_and_Thorns_System]]
- Examples: [[Character_Sheet_Template_Analysis]]