# Damage_Calculation_System.md

**Status:** #needs-validation  
**Source:** User clarification 2025-08-08  
**Last Updated:** 2025-08-08

---

# Damage Calculation System

GROWTH uses a **fixed damage system** with **target attribute specification** and **damage type classification** for consistent, mechanical combat resolution.

## Core Damage Mechanics

### Weapon Damage Components
**Base Damage:** Fixed damage amount set by weapon (no damage rolls required)  
**Target Attribute:** Specifies which [[Three_Pillar_Attributes|attribute pool]] the weapon targets  
**Damage Type:** Classification affecting material interactions  
**Player Scaling:** Some weapons add current attribute levels to damage

### Damage Types
**Piercing:** Penetrating damage (arrows, spears, stabs)  
**Bashing:** Blunt force damage (clubs, hammers, falls)  
**Slashing:** Cutting damage (swords, claws, blades)  
**Heat:** Fire and thermal damage  
**Cold:** Ice and freezing damage  
**Energy:** Magical or electrical damage  
**Decay:** Corruption and degradation damage

### Player Scaling Weapons
**Scaling Tag:** Some weapons specify "add your current [attribute] level"  
**Example:** Strength-based sword: "Base damage 15 + current Clout level"  
**Growth Integration:** Weapon effectiveness scales with character development  
**Variable Damage:** Only occurs when weapon specifically states scaling or rolling

## Armor Layer System

### Armor Classifications
**Clothing:** Basic protection, fits in any armor slot  
**Light Armor:** Moderate protection, fits in light or heavy slots  
**Heavy Armor:** Maximum protection, only fits in heavy armor slots

### Layer Compatibility
**Clothing:** Can layer under light armor OR heavy armor OR worn alone  
**Light Armor:** Can layer under heavy armor OR worn alone (not over heavy)  
**Heavy Armor:** Outermost layer only, cannot layer over anything else

### Damage Flow Through Layers
**Sequential Absorption:** Damage flows from outermost to innermost layer  
**Layer Order:** Heavy Armor → Light Armor → Clothing → Body  
**Overflow System:** Remaining damage after each layer continues to next layer

## Resistance Mechanics

### Material Classifications
**Hard Materials:** Rigid substances (metal, stone, bone)  
**Soft Materials:** Flexible substances (leather, cloth, flesh)  
**Body:** Living tissue and natural biological material

### Damage Absorption
**Resistance Value:** Numerical damage reduction per material  
**Damage Soaking:** Resistance value subtracted from incoming damage  
**Example:** 20 damage vs 15 resistance = 5 damage continues to next layer  
**Complete Absorption:** If resistance ≥ damage, no damage passes through

### Degradation Triggers
**Damage Type Dependent:** Different damage types cause different degradation rates  
**Material Interaction:** Hard vs Soft materials react differently to damage types  
**Layer Effects:** Each armor layer degrades independently

## Hit Location and Targeting

### Target Selection
**Attacker Choice:** Attacking entity chooses target location  
**Default Target:** If no location specified, defaults to chest/core/heart area  
**Anatomical Variation:** Different creatures may have different vital areas  
**Custom Body Parts:** Creatures may have wings, tails, or unique anatomical features

### Vital Area Guidelines
**Humanoids:** Head and chest destruction typically causes death  
**Creature Variation:** Different species may have different vital areas  
**Weak Points:** Some creatures may have specific vulnerability locations  
**GM Determination:** Unusual anatomy requires GM interpretation

## Defensive Options

### Block Defense
**Interception Method:** Moving something into the attack's path  
**Available Tools:** Body parts, weapons, shields, improvised objects  
**Requirements:** Must have available action and logical interception method  
**Body Action:** Usually requires body action but may vary by situation

### Dodge/Miss Defense  
**Avoidance Method:** Completely avoiding the attack through movement  
**Skill Contest:** Direct skill vs skill opposed roll  
**Attribute Matching:** Defender's skill must use same attribute pool as attacker's skill  
**Flavoring Options:** Can be dodging, ducking, weaving, or other avoidance methods

### Defensive Skill Matching
**Governor Requirement:** Defensive skill must use same attribute as attacking skill  
**Example:** Sword attack governed by Clout requires Clout-based defensive skill  
**Unskilled Defense:** Can attempt defense without skill using raw attributes  
**Skill Synergy:** Appropriate defensive skills provide better chances than raw attributes

## Combat Resolution Example

### Attack Sequence
1. **Attacker declares target location** (e.g., "I'm attacking his arm")
2. **Defender chooses defense type** (block or dodge/miss)
3. **Skill contest resolution** using appropriate attributes and skills
4. **Damage application** if attack succeeds
5. **Armor layer processing** from outermost to innermost
6. **Degradation effects** applied based on damage type

### Damage Flow Example
**Attack:** Sword dealing 18 Slashing damage to chest  
**Heavy Armor:** 12 resistance absorbs 12 damage, 6 continues  
**Light Armor:** 8 resistance absorbs 6 damage, 0 continues  
**Result:** No damage reaches body, both armor layers may degrade

---

## Links
- Related: [[Combat_Hit_Locations]], [[Turn_Structure_and_Action_Economy]], [[Three_Pillar_Attributes]]
- References: [[Damage_Type_Interactions]], [[Armor_Classifications]], [[Weapon_Statistics]]
- Examples: [[Combat_Resolution_Scenarios]], [[Defensive_Options_Guide]]