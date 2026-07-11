# Damage_Type_Interactions.md

**Status:** #validated
**Source:** Claude Damage Knowledge dump.md, User clarification 2025-10-03, merged 2026-05-03 (absorbs former `Damage_Types_and_Effects.md`). Body-cascade routing added 2026-05-23 per [[Body_Composition_System]] canon. Damage→attribute structural map locked Mike 2026-06-09 (ruling r-2026-06-09-03).
**Security:** PUBLIC
**Last Updated:** 2026-06-09

---

> **Merged 2026-05-03:** This file is the **canonical** damage-type reference. The former `Damage_Types_and_Effects.md` (substantively duplicative — same 7 types, same vs-Soft/Hard/Body matrix) has been removed; its unique content (Damage Resolution Order, Massive Damage Rule, Ongoing Effects callout) has been folded in below.

# Damage Type Interactions and Material Modifiers

GROWTH's damage system uses **7 core damage types** with **specific material interaction rules** that determine both damage reduction and item condition degradation.

## Base Mechanics vs Material Modifiers

**This file documents hard-coded base mechanics** for how each damage type interacts with materials.

**Material Modifiers Can Override:** Items with modifiers like "Heat Resistant," "Electric Proof," "Flammable," etc. can change these base interactions. See [[Material_System]] and "Items - Material Mods.csv" for available modifiers.

**KRMA Cost Principle:** The more an item's behavior deviates from these base mechanics, the more [[KRMA_System|KRMA]] it costs to create.

## Damage Expression Format

**Damage String:** `P:S:H/D\C:B:E`
**Example:** `10:5:8/3\2:7:4` = 10 Piercing, 5 Slashing, 8 Heat, 3 Decay, 2 Cold, 7 Bashing, 4 Energy

## Damage Resolution Order

When multiple damage types apply in a single hit, they resolve in this fixed order regardless of the order they were applied or rolled:

**Piercing → Slashing → Heat → Decay → Cold → Bashing → Energy**

This guarantees consistent layer-by-layer math when armor and material modifiers are involved.

## Body Cascade Routing (locked 2026-05-19)

Damage that gets past outer armor enters the **body anatomy tree** ([[Body_Composition_System]]). Body parts ARE items in nested containers. The cascade is:

1. **Outer layer** (whatever was hit — armor or body part) absorbs damage up to its `baseResist`.
2. **Excess passes through** to the layer beneath in the container chain.
3. **Routing of the passthrough depends on damage type:**
   - **Piercing** — the attacker designates ONE internal to receive the FULL passthrough. The designated path can go multiple segments deep (e.g., Head → Brain).
   - **All other damage types** — passthrough splits EVENLY across all internals. Each child receives `Math.floor(passthrough / N)`. Remainders are absorbed by the bearer's mass (intentional design: half-points don't propagate).
4. Each child then runs the same step against its own resist + contents, recursively.
5. When damage to a part meets or exceeds its `baseResist`, the part drops one condition tier.

The **"Body" damage type was retired 2026-05-19** — it was redundant with the new material-based system. Every body part has a material (Hard/Soft); typed damage (P/S/H/D/C/B/E) resolves against that material. No more "Body" column.

See [[Body_Composition_System]] for the full cascade engine and `HUMAN_BASELINE_ANATOMY` template.

## Massive Damage Rule (Universal)

**Threshold:** Damage equal to **3× the target material's resistance value** causes **instant destruction** of that item or layer.

- Skips condition degradation entirely.
- Applies to **all damage types** — not just Piercing.
- Overflow continues: remaining damage = `Total Damage − Resistance Value` continues to the next layer (or to the body).

**Examples:**
- Steel armor (20 resist): 60+ damage → instant destruction.
- 75 damage vs 20 resist → destroyed; 55 damage continues to next layer.

## Ongoing Effects

GROWTH damage types have **no inherent ongoing damage** in the core rules. Persistent / over-time effects are created through:

- **Nectars / Thorns** — character abilities that apply persistent conditions.
- **Material modifiers** — items with "Flammable", "Self-Healing", "Combustible", etc.
- **Spells / magic** — custom magical effects that persist over time.
- **Environmental hazards** — campaign-specific (burning rooms, acid pools).

**KRMA Cost Principle applies:** unusual or powerful ongoing effects cost more KRMA to create. The base 7-type damage system is the cheap default.

## Material Resistance Types

### Three Categories
**Soft:** Flexible materials (cloth, leather, fabric, rope)  
**Hard:** Rigid materials (metal, stone, bone, crystal)  
**Body:** Living entities (characters, creatures, biological tissue)

## Damage Type vs Material Interactions

### Piercing (P)
**vs Soft Materials:** Normal damage reduction, **cannot cause condition loss**  
**vs Hard Materials:** Normal damage reduction, **cannot cause condition loss**  
**vs Body:** Normal damage reduction, **can cause condition loss**  
**Overwhelming Damage:** 3x resistance destroys item completely

### Slashing (S)
**vs Soft Materials:** **Reduces condition by 1** when damage ≥ resistance rating  
**vs Hard Materials:** Normal damage reduction only, no condition loss  
**vs Body:** Normal damage reduction, can cause condition loss  
**Example:** 10 Slashing vs 10 Soft resistance = condition reduced by 1, no damage passes through

### Heat (H)
**vs Soft Materials:** **Automatically reduces condition by 1**, damage **NOT reduced** (passes through)  
**vs Hard Materials:** Acts like Piercing (normal damage reduction, no condition loss)  
**vs Body:** Normal damage reduction  
**Critical Rule:** ANY Heat damage reduces Soft item condition by 1 regardless of amount

### Decay (D)
**vs Soft Materials:** **Reduces condition by 1**, damage IS reduced by resistance  
**vs Hard Materials:** **Reduces condition by 1**, damage IS reduced by resistance  
**vs Body:** Normal damage reduction  
**Universal Effect:** Any Decay damage reduces item condition, then remaining damage is reduced normally

### Cold (C)
**vs Soft Materials:** Acts like Piercing (normal damage reduction, no condition loss)  
**vs Hard Materials:** **Automatically reduces condition by 1**, normal damage reduction  
**vs Body:** Normal damage reduction  
**Opposite Pattern:** Cold affects Hard materials the way Heat affects Soft materials

### Bashing (B)
**vs Soft Materials:** Acts like Piercing (normal damage reduction, no condition loss)  
**vs Hard Materials:** **Reduces condition by 1** when damage ≥ resistance rating  
**vs Body:** Normal damage reduction, can cause condition loss  
**Pattern:** Bashing to Hard materials works like Slashing to Soft materials

### Energy (E)
**vs All Materials:** **Bypasses ALL resistance** - damage not reduced by any material  
**Condition Effects:** Does NOT reduce condition of materials  
**Direct Application:** Goes straight to target, useful for directly targeting attribute pools  
**Universal Penetration:** Most reliable damage type for guaranteed effect

## Condition State System

### Condition Progression
**Indestructible:** Special state - cannot be destroyed by any means  
**Undamaged:** Starting condition for most items (full resistance value)  
**Worn:** First degradation level (full resistance value)  
**Broken:** Second degradation level (**half resistance value only**)  
**Destroyed:** Item is deleted/removed from game (no protection)

### Condition Degradation Rules
**Condition Loss Triggers:** Specific to each damage type and material combination  
**Automatic Effects:** Some damage types (Heat vs Soft, Cold vs Hard, Decay vs All) cause automatic condition loss  
**Threshold Effects:** Other types (Slashing vs Soft, Bashing vs Hard) require damage ≥ resistance  
**Broken Item Penalty:** Items at "Broken" condition provide only half normal resistance

### Overwhelming Damage System
**Damage Threshold:** When damage is **3x the resistance value** of the target item  
**Complete Destruction:** Overwhelming damage destroys the item instantly, skipping condition degradation  
**Universal Application:** Applies to **all damage types** - not just Piercing  
**Damage Flow:** After destruction, remaining damage = (Total Damage - Resistance Value) continues to next layer  
**Example:** 30 damage vs 10 resistance = item destroyed, 20 damage continues to next layer

## Layered Armor System

### Three-Layer Structure
1. **Heavy Layer (Outermost):** Heavy armor only
2. **Light Layer (Middle):** Light armor or heavy armor
3. **Cloth Layer (Innermost):** Any armor type can fit here

### Damage Flow Process
1. **Heavy Layer Processing:** All damage types processed against outermost layer
2. **Condition Effects Applied:** Layer degrades according to damage type rules
3. **Overflow Calculation:** Remaining damage continues to next layer
4. **Layer Repetition:** Process repeats for Light Layer, then Cloth Layer
5. **Body Impact:** Final remaining damage affects character body

## Natural Damage-Attribute Affinities (KRMA Efficient)

### The Structural Map (r-2026-06-09-03; targeting clarified r-2026-06-10-01)

The damage string `P:S:H/D\C:B:E` maps **positionally** onto the nine-attribute layout — the damage format mirrors the GRO•WTH 3/1/3 structure itself. This map defines each type's **most-aligned attribute**, NOT a forced target:

| Position | Damage Type | Most-Aligned Attribute |
|---|---|---|
| `P` | Piercing | **Clout** (Body) |
| `S` | Slashing | **Celerity** (Body) |
| `H` | Heat | **Constitution** (Body) |
| `D` | Decay | **Focus** (Spirit) — per the original archive mapping (`X_ARCHIVE_ORIGINS/Claude Damage Knowledge dump.md`); the attribute names were untouched by the Jan-2026 pillar-label swap |
| `C` | Cold | **Willpower** (Soul) |
| `B` | Bashing | **Wisdom** (Soul) |
| `E` | Energy | **Wit** (Soul) |

### Targeting Is Weapon-Declared; the AFFINITY CYCLE Prices the Drift

**Authoritative spec: [[Damage_Targeting_KV_Spec]]** (Mike-provided 2026-06-10, ruling r-2026-06-10-02).

The weapon declares which attribute its damage targets — any is legal. The 7 types + 7 cycle attributes form a **closed ring** (P→Clout … E→Wit, wrapping); the targeting multiplier on the item's **Damage Value KV component** is by ring distance: **0 = 1×, 1 = 2×, 2 = 5×, 3 = 10×**, with **Frequency off-ring at a flat 20×** and Flow unpriced pending Mike (spec §7.1). Wraparound counts — Energy→Clout is adjacent (2×).

Canonical example: identical spears, same 15 piercing — targeting **Clout** (natural) = 1×; targeting **Constitution** (two steps) = **5×** the damage KV component. Guidepost, never a gate: off-alignment is legitimate advanced strategy, priced.

## Combat Resolution Example

### Standard Damage String: `10:5:8/3\2:7:4`
**Against:** Heavy Plate Armor (8 Hard resistance) + Chainmail + Padded Clothing

#### Heavy Layer Processing (8 Hard Resistance):
1. **10 Piercing:** 10-8=2 continues, no condition loss
2. **5 Slashing:** 5-8=0 continues, no condition loss
3. **8 Heat:** 8-8=0 continues, no condition loss (acts like Piercing vs Hard)
4. **3 Decay:** 3-8=0 continues, **condition reduced by 1**
5. **2 Cold:** 2-8=0 continues, **condition reduced by 1**
6. **7 Bashing:** 7-8=0 continues, no condition loss
7. **4 Energy:** **4 continues** (bypasses resistance), no condition loss

#### Light Layer Processing:
Only **2 Piercing + 4 Energy** continue to chainmail layer

### Overwhelming Damage Example: `30:0:0/0\0:0:0`
**Against:** Heavy Plate Armor (10 Hard resistance) + Light Armor (6 resistance) + Clothing (3 resistance)

#### Heavy Layer Processing:
**30 Piercing vs 10 Hard resistance:** 30 ≥ 30 (3x10) = **OVERWHELMING DAMAGE**  
**Result:** Heavy armor **completely destroyed**, 20 damage (30-10) continues to Light Layer

#### Light Layer Processing:
**20 Piercing vs 6 resistance:** 20-6=14 continues, no condition loss (not overwhelming)

#### Cloth Layer Processing:  
**14 Piercing vs 3 resistance:** 14-3=11 continues to body, no condition loss

#### Body Processing:
**11 Piercing damage** affects character attributes

---

## Links
- Related: [[Damage_Calculation_System]], [[Equipment_Conditions]], [[Material_System]]
- References: [[KRMA_System]], [[Three_Pillar_Attributes]]
- Examples: [[Combat_Resolution_Walkthrough]], [[Material_Optimization_Guide]]