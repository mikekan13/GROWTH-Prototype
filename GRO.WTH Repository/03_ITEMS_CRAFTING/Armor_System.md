# Armor_System.md

**Status:** #needs-validation
**Source:** GROWTH_System_Archive_Complete_Content_Extraction.md, User clarification 2025-10-03
**Last Updated:** 2025-10-03

---

# Armor System

The GROWTH armor system uses **material-based protection** with **layering rules** and **mobility penalties**.

## Base Rules vs Material Modifiers

**Core Design Principle:**
Armor has **base multiplier rules** that apply universally. However, materials can have **modifiers** (like Nectars/Thorns for characters) that change how they behave when crafted into armor.

**KRMA Cost Principle:**
- **Base multipliers:** Standard behavior (0.5× for Clothing, 1× for Light, 1.5× for Heavy)
- **Material Mods:** Change these multipliers or add special properties (cost more [[KRMA_System|KRMA]])
- **Example:** "Protective" mod changes multipliers to 1.5×/2×/2.5× instead of base values

**Think Magic: The Gathering Rules:**
Global base rules apply universally, but individual materials and items can have modifiers that override those rules.

See [[Material_System]] and "Items - Material Mods.csv" for available material modifiers.

## Armor Categories

### Clothing
**Protection:** Half base resistance of material  
**Layering:** Up to 3 layers maximum  
**Penalty:** No mobility penalties  
**Examples:** Robes, tunics, padded clothing

### Light Armor  
**Protection:** Full base resistance of material  
**Layering:** 1 layer only  
**Penalty:** No mobility penalties  
**Examples:** Leather armor, chain shirts, reinforced clothing

### Heavy Armor
**Protection:** 1.5x base resistance of material  
**Layering:** 1 layer only  
**Penalty:** -1 to Celerity (nimbleness)  
**Examples:** Plate mail, full chain, heavy scale

## Layering Mechanics

### Clothing Layers (Soft Materials Only)
- **Layer 1:** Half material resistance
- **Layer 2:** Additional half resistance  
- **Layer 3:** Additional half resistance
- **Maximum:** 3 layers total
- **Stacking:** Resistances add together

**Example:** 3 layers of Leather Clothing
- Layer 1: 9 resistance (17÷2, rounded up)  
- Layer 2: +9 resistance  
- Layer 3: +9 resistance  
- **Total:** 27 resistance

### Armor Combination Rules
- **Light + Clothing:** Light armor over clothing layers
- **Heavy Restriction:** Cannot wear clothing layers under heavy armor
- **Material Limits:** Cannot layer hard materials

## Armor Coverage

**Full Coverage:** Protection applies to all hit locations  
**Partial Coverage:** May specify protected areas  
**Layered Coverage:** Different layers may protect different areas

## Condition Effects

**Undamaged:** Full protection value  
**Worn:** Slight reduction in effectiveness  
**Broken:** Significant protection loss  
**Destroyed:** No protection, may hinder movement

## Mobility and Comfort

**Weight Factors:** Heavy materials reduce movement  
**Climate Effects:** Insulating materials affect temperature  
**Stealth Penalties:** Metal armor creates noise  
**Swimming:** Heavy armor imposes severe penalties

## Material-Specific Armor Properties

**Leather:** Flexible, quiet, moderate protection  
**Chain:** Good protection, moderate weight, some noise  
**Plate:** Maximum protection, heavy, loud  
**Magical Materials:** Special properties (mithril is lighter, etc.)

---

## Links
- Related: [[Material_System]], [[Equipment_Conditions]], [[Combat_Hit_Locations]]
- References: [[Armor_Examples_Table]], [[Material_Properties]]  
- Examples: [[Armor_Selection_Guide]], [[Layering_Examples]]