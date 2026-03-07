# Attack_Resolution_Mechanics.md

**Status:** #needs-validation  
**Source:** User clarification 2025-08-08  
**Last Updated:** 2025-08-08

---

# Attack Resolution Mechanics

GROWTH uses **dynamic difficulty resolution** where attack success depends on whether the defender has available actions to contest the attack.

## Core Attack Resolution

### Combat Skill System
**Combat Skills:** Flagged skills that can be used for attacking (swords, bows, unarmed, etc.)  
**Standard Resolution:** Uses normal [[Basic_Resolution_System|skill check mechanics]] (Fate Die + Skill Die + Effort vs DR)  
**Attribute Governors:** Combat skills use appropriate [[Three_Pillar_Attributes|attributes]] as effort pools

### Combat Skill Attack Multipliers
**Higher skill levels grant multiple attacks per action:**

| Skill Level | Attacks Per Action |
|---|---|
| 1-5 | 1 attack |
| 6-10 | 2 attacks |
| 11-15 | 3 attacks |
| 16-20 | 4 attacks |

## Defended vs Undefended Attacks

### Direct Contest (Defended Attack)
**Trigger:** Defender has available action and chooses to actively defend  
**Mechanic:** **Direct skill contest** - no fixed DR  
**Resolution:** Attacker's total roll vs Defender's total roll  
**Defender Becomes DR:** The defender's roll result IS the difficulty rating  
**Example:** Sword attack (Fate + Sword skill + effort) vs Dodge (Fate + Dodge skill + effort)

### Uncontested Attack (Undefended)
**Trigger:** Defender has no available actions OR chooses not to defend  
**Mechanic:** **Self-determined difficulty** - attacker sets their own challenge level  
**Success Rate:** Almost always successful unless environmental factors interfere  
**GM Override Examples:** Heavy cover, illusion spells causing partial concealment, environmental hazards  
**Standard Result:** Standing target at close range = automatic hit in most circumstances

## Action Availability for Defense

### Defensive Action Requirements
**Action Economy:** Must have available action to attempt defense  
**Reaction Timing:** Defense must be declared when attack is announced  
**Action Types:** Any appropriate action can be used for defense (not just "dodge" actions)  
**Resource Cost:** Defensive actions consume the same resources as offensive actions

### No Action Available
**Out of Actions:** Used all actions for the turn/round  
**Surprised:** Target wasn't aware of incoming attack  
**Incapacitated:** Unconscious, paralyzed, or otherwise unable to act  
**Committed:** Already performing action that can't be interrupted

## Range Attack Mechanics

### Range-Based Difficulty Increase
**Inherent DR:** Ranged attacks have automatic DR increases based on distance  
**Calculation Factors:**
- **Target Distance:** How far the target is from the attacker
- **Weapon Range:** The effective/optimal range of the ranged weapon  
- **Range Penalties:** DR increases as distance exceeds weapon's effective range

### Range DR Calculation
**Formula:** DR penalty doubles for each range increment beyond effective range  
**Progression:** +2, +4, +8, +16, +32 DR for each additional range segment  
**Range Segments:** Each segment equals the weapon's base effective range

**Example - Bow with 20ft effective range:**
- **0-20 feet:** No penalty (within effective range)
- **21-40 feet:** +2 DR penalty  
- **41-60 feet:** +4 DR penalty (total +6 DR)
- **61-80 feet:** +8 DR penalty (total +14 DR)
- **81-100 feet:** +16 DR penalty (total +30 DR)

**Extreme Range:** Penalties can quickly make distant shots nearly impossible

## Attribute Pool Matching

### Governor Requirements
**Same Pool Rule:** Defensive skill must use same attribute pool as attacking skill  
**Example:** Clout-based sword attack requires Clout-based defensive skill  
**Skill Flexibility:** Any skill using the required attribute can be used for defense  
**Unskilled Defense:** Can use raw attributes if no appropriate skill available

### Mixed Attribute Attacks
**Multi-Attribute Weapons:** Some weapons may use multiple attributes  
**Defender Choice:** Defender can choose which matching attribute pool to use  
**Strategic Consideration:** Choose attribute pool based on highest values

## Circumstantial Modifiers

### Environmental Factors
**Cover:** Provides DR bonuses against ranged attacks  
**Concealment:** May prevent attacks entirely or increase DR significantly  
**Terrain:** Difficult terrain may affect attack accuracy  
**Lighting:** Poor visibility increases attack difficulty

### Tactical Modifiers
**Flanking:** Attacks from sides/rear may reduce defensive options  
**Surprise:** Prevents defensive actions entirely  
**Multiple Attackers:** May overwhelm defensive capabilities  
**Positioning:** High ground, enclosed spaces, etc. affect combat

## Combat Skill Examples

### Melee Combat Skills
**Swords:** Blade-based combat using Clout or Celerity  
**Unarmed:** Hand-to-hand combat, typically Clout-based  
**Polearms:** Long weapons, often Clout or Celerity  
**Shields:** Defensive combat skill, usually Clout-based

### Ranged Combat Skills
**Bows:** Projectile weapons using Celerity  
**Firearms:** Modern ranged weapons, typically Celerity  
**Thrown Weapons:** Hurled objects, often Clout-based

### Defensive Skills
**Dodge:** Evasive movement, typically Celerity  
**Block:** Using weapons/shields to intercept, usually Clout  
**Acrobatics:** Athletic evasion, Celerity-based  
**Any Combat Skill:** Weapons can be used defensively (parrying)

## Resolution Examples

### Contested Melee Attack
1. **Attacker:** "I attack with my sword" (Fate + Sword + Clout effort)
2. **Defender:** "I dodge" (Fate + Dodge + Celerity effort) 
3. **Problem:** Attribute mismatch - Sword uses Clout, Dodge uses Celerity
4. **Solution:** Defender must use Clout-based skill or raw Clout
5. **Resolution:** Direct contest of final totals

### Uncontested Ranged Attack
1. **Target:** Unconscious enemy at 50 feet
2. **Weapon:** Bow with 100ft effective range
3. **DR:** Self-determined (attacker chooses difficulty) + no range penalty
4. **Roll:** Fate + Bow skill + Celerity effort vs chosen DR
5. **Success:** Attack automatically hits if roll succeeds

### Range Penalty Example
1. **Target:** Enemy at 300 feet  
2. **Weapon:** Bow with 150ft effective range (2x over effective range)
3. **Penalty:** +10 DR for extreme range (example calculation)
4. **Resolution:** Normal attack roll vs (base DR + range penalty)

---

## Links
- Related: [[Basic_Resolution_System]], [[Turn_Structure_and_Action_Economy]], [[Three_Pillar_Attributes]]
- References: [[Combat_Skills_List]], [[Range_Calculation_Chart]]
- Examples: [[Combat_Resolution_Scenarios]], [[Defensive_Options_Guide]]