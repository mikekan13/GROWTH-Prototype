# Character_Sheet_Audit_Summary.md

**Status:** #validated  
**Source:** GROWTH Character Sheets Audit Report.md (ChatGPT Analysis)  
**Security:** PUBLIC  
**Last Updated:** 2025-08-11

---

> **Note:** This audit was performed against the **legacy Google Sheets-based character sheets** (beta v0.5 and v1.2). The current implementation uses Prisma/SQLite and is not subject to these findings.

# Character Sheet Audit Summary

## Audit Overview

This summary extracts validated findings from ChatGPT's audit of GROWTH beta character sheets (v0.5 and v1.2) against Core Rulebook v0.4.4. The audit identified implementation bugs, missing features, and validation requirements.

## ✅ Validated Fixes Applied

### Skill System
- **Confirmed:** Skill levels 1-20 with correct dice progression
- **Fixed:** Level 8-11 should use d8 (not d10 as found in v0.5 bug)
- **Updated:** New skilled vs unskilled check procedures implemented

### Depletion Effects  
- **Completed:** All 9 attribute depletion effects now defined
- **Status:** Ready for sheet implementation with proper warnings

### Item Conditions
- **Clarified:** "Finite/Sufficient" are valid terms for quantity-based items (ammo)
- **Standard:** Indestructible/Undamaged/Worn/Broken for equipment

## 🔧 Implementation Requirements

### Sheet Formulas to Fix
1. **Carry Level Calculation:** Currently shows #REF! error or static CL2
2. **Depletion State Detection:** Only Constitution depletion working, need other 8
3. **Encumbrance Logic:** Weight Status stuck on "Fine" regardless of load
4. **Nectars/Thorns Counter:** No limit checking against Fate Die value

### Display Improvements Needed
1. **Replace "Coin" terminology** with clearer "Fate Die" labels
2. **Add depletion state warnings** for all attributes at 0
3. **Show Skill Die + Fate Die** clearly for skilled checks
4. **Flag tech/wealth mismatches** where appropriate

## ⚠️ Research Required

**Tech Levels:**
- Life extension formula (how Tech Level affects lifespan)
- Full 1-10 scale descriptions and capabilities
- Item usage vs creation restrictions clarification

**Wealth Levels:**  
- Complete 1-10 scale descriptions and effects
- Acquisition difficulty mechanics (no usage restrictions confirmed)

**Carry System:**
- Exact Clout-to-Carry Level formula (known: ~Clout 80 = CL10 max)

**Material System:**
- Resistance column letter legend (R, P, V, D meanings)
- Material mod comprehensive documentation
- General materials system rules

## 📊 Character Sheet Template Status

### Working Features ✅
- Skill die progression formulas (after Level 8-11 fix)
- Max roll calculations (Fate Die max + Skill Level)
- Constitution depletion detection ("Exhausted" display)
- Item weight categories and basic inventory tracking
- Tech/Wealth Level display (numeric + descriptors)

### Broken Features ❌  
- Carry Level auto-calculation (shows #REF! or wrong values)
- Weight Status logic (always "Fine" regardless of encumbrance)
- 8 of 9 depletion state detections missing
- Nectars/Thorns limit validation absent

### Missing Features 📋
- Tech Level usage restriction warnings
- Material mod notation system
- Fated Age calculation and tracking
- Death save counter for characters past Fated Age

## 🎯 Priority Implementation Order

1. **High Priority (Breaks Core Mechanics):**
   - Fix Carry Level formula linking to Clout
   - Implement missing depletion state detection
   - Add Nectars/Thorns count validation

2. **Medium Priority (Quality of Life):**
   - Replace confusing "Coin" terminology  
   - Add encumbrance detection logic
   - Tech Level restriction warnings

3. **Low Priority (Enhancement):**
   - Fated Age calculation assistance
   - Material mod visual indicators
   - Advanced inventory management features

---

## Links
- Related: [[Character_Sheet_Validation]], [[Basic_Resolution_System]]
- References: [[Attribute_Depletion_Effects]], [[Skill_Level_Progression]]  
- Source: [[GROWTH Character Sheets Audit Report]] (10_ARCHIVE_ORIGINS)