
# GROWTH Damage & Resistance System

## 1. Overview

In GROWTH, damage is tracked both **numerically** (health values) and **conditionally** (Healthy → Wounded → Critical). Items also degrade in **condition levels** (typically 3, but can be 4 if _Indestructible_).  
Damage resolution considers:

- **Damage Type** (7 core types)
    
- **Item/Material Resist Value**
    
- **Material Mods** (Resistant, Dampening, Vulnerable, Proof, Neutralizing, Intolerant, Special)
    
- **Condition Level** changes
    
- **Character Attributes** that resist damage
    

---

## 2. Damage Types

|Type|Core Description|Base Special Properties|Notes|
|---|---|---|---|
|**Piercing**|Concentrated, point-based penetration|None by default|Affected heavily by _Pierce Dampening_, _Vulnerable_, or _Neutralizing_|
|**Bashing**|Impact, concussive force|None by default|Bashing damage halved if _Bash Dampening_|
|**Slashing**|Cutting edges, slicing|None by default|Hard materials may naturally increase Resist (GM discretion)|
|**Heat**|Fire, thermal energy|Some materials _Flammable_, _Combustible_, _Heat Resistant_|Heat can cause multi-level condition loss if _Flammable_|
|**Cold**|Low temperature, freezing|_Cold Resistant_, _Cold Intolerant_ affect outcome|Cold Intolerant halves Resist vs Cold|
|**Electric**|Shock, lightning|_Electric Resistant_ subtracts Resist value from damage|Vulnerability doubles Electric damage|
|**Decay**|Rot, corrosion, entropy|_Decay Resistant_, _Decay Proof_ exist|Can bypass some armor types without proper resistances|

---

## 3. Resistance & Vulnerability System

### 3.1 Resist Value

- **Numeric (1–50)**: The amount of incoming damage required to cause a **condition level loss**.
    
- When **damage ≥ Resist**, the item/armor loses **1 condition level**.
    
- **Condition Levels**:
    
    - **4:** Indestructible
        
    - **3:** Normal (Undamaged)
        
    - **2:** Worn
        
    - **1:** Broken (_absorbs only half its Resist value_)
        
    - **0:** Destroyed/Unusable
        

### 3.2 Modifiers

**Dampening** – Halves incoming damage of that type (rounded down)  
**Resistant** – Ignores _special properties_ of that damage type  
**Proof** – Treats damage as _Pierce_ instead of its type  
**Vulnerable** – Doubles damage of that type  
**Intolerant** – Halves Resist against that type  
**Neutralizing** – Reduces that damage type to 0  
**Special Effects** – e.g., Flammable, Absorbent, Brittle, Waterproof

---

## 4. Damage Resolution Steps

When a target (character or item) takes damage:

1. **Identify the Damage Type(s)**
    
    - Attacks can deal multiple types simultaneously (e.g., _Slash + Heat_).
        
2. **Apply Material Mods** (if item/armor involved)
    
    - Check for Dampening, Vulnerable, Neutralizing, Resistant, Proof, Intolerant.
        
    - Modify raw damage accordingly.
        
3. **Compare to Resist Value**
    
    - If _modified damage ≥ Resist_, reduce condition level by 1 (or more if _Fragile_, _Brittle_, or multi-level loss effects apply).
        
    - If armor is **Broken**, only half Resist value is used in comparison.
        
4. **Pass Remaining Damage to Target**
    
    - If armor stops less than the incoming damage, leftover damage affects the character’s **Health**.
        
    - Health is tracked by conditions: **Healthy → Wounded → Critical**.
        
5. **Apply Attribute-Based Reductions** (if applicable)
    
    - _Constitution_ may reduce physical damage.
        
    - _Willpower_ may reduce mental/spiritual equivalents.
        
    - _Focus/Flow_ may mitigate magical or environmental damage.
        

---

## 5. Attribute Interactions

From the core rulesGROWTHLLMRuleUnderstand…:

- **Constitution** – Enhances resistance to physical and environmental harm.
    
- **Focus/Flow** – Used in magical defense; one resists _Severity_ (offensive magic), the other _Mercy_ (harmonic magic).
    
- **Willpower** – Resists fear, mental intrusion, spiritual damage.
    
- **Celerity** – Can sometimes avoid damage entirely via evasion checks.
    

---

## 6. Example

**Scenario:**  
A character is wearing _Leather Armor_ (Resist 15, Soft) with _Heat Dampening_ and _Cold Vulnerable_.  
They are struck by a flaming arrow dealing **18 Heat damage**.

1. **Damage Type:** Heat
    
2. **Mods Applied:** Heat Dampening halves → 9 damage
    
3. **Compare to Resist:** 9 < 15 → No condition loss, no armor damage
    
4. **Result:** Armor fully protects, no health loss.
    

If the same armor was struck by **18 Cold damage**:

- Cold Vulnerable doubles → 36 damage
    
- 36 ≥ 15 → Armor loses 1 condition level, Cold damage penetrates to character’s health.