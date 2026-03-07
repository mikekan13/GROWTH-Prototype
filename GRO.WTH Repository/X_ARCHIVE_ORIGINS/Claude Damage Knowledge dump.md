# GROWTH Damage System - Comprehensive Overview

## Core Damage Structure

Damage is expressed as: `P:S:H/D\C:B:E`

### The Seven Damage Types

- **P** = Piercing
- **S** = Slashing
- **H** = Heat
- **D** = Decay
- **C** = Cold
- **B** = Bashing
- **E** = Energy

## Resistance Types

### Three Categories

- **Soft**: Flexible materials (cloth, leather, etc.)
- **Hard**: Rigid materials (metal, stone, etc.)
- **Body**: Living entities (characters, creatures)

## Damage Type Interactions

### Piercing (P)

- Regular interaction with all resistance types
- Can only reduce condition of Body resistance
- Example: 15 Piercing vs. 12 Soft = 3 damage continues, no condition loss
- Overwhelming damage destroys Soft/Hard items completely

### Slashing (S)

- Reduces Soft item condition by 1 when damage meets/exceeds rating
- No condition effect on Hard items, just normal damage reduction
- Example: 10 Slashing vs. 10 Soft = condition reduced by 1, no damage passes

### Heat (H)

- Automatically reduces Soft materials by one condition state
- Damage is NOT reduced by Soft resistance (passes through)
- Acts like Piercing against Hard materials
- Any Heat damage reduces Soft item condition by 1

### Decay (D)

- Reduces both Hard and Soft materials by one condition state
- Damage IS still reduced by material resistance
- Example: Any Decay damage reduces item condition by 1, then remaining damage is reduced by resistance

### Cold (C)

- Automatically reduces Hard materials by one condition state
- Acts like Piercing against Soft materials
- Opposite effect of Heat damage

### Bashing (B)

- Reduces Hard item condition by 1 when damage meets/exceeds rating
- Works like Piercing against Soft resistance
- Example: 10 Bashing vs. 10 Hard = condition reduced by 1, no damage passes

### Energy (E)

- Bypasses all material resistances (Soft, Hard, Body)
- Damage isn't reduced by any resistance
- Doesn't reduce condition of materials
- Useful for directly targeting attribute pools

## Layered Protection System

### Three-Tier Armor System

1. **Heavy Layer** (Outermost)
2. **Light Layer** (Middle)
3. **Cloth Layer** (Innermost)

### Layer Compatibility

- **Heavy armor**: Only Heavy Layer
- **Light armor**: Light OR Heavy Layer
- **Cloth armor/clothing**: Any layer

### Damage Flow Process

1. Damage hits Heavy Layer first (if present)
2. Excess transfers to Light Layer (if present)
3. Remaining transfers to Cloth Layer (if present)
4. Final damage affects the body

## Item Condition States

- Items have condition levels (e.g., Undamaged, Worn, Broken)
- When condition drops below minimum, item is destroyed
- Reduced condition may affect item effectiveness

## Damage-to-Attribute Relationship

### Natural Affinities (ҜRMA Efficient)

- **Piercing (P)** → **Clout**
- **Slashing (S)** → **Celerity**
- **Heat (H)** → **Constitution**
- **Decay (D)** → **Focus**
- **Cold (C)** → **Willpower**
- **Bashing (B)** → **Wisdom**
- **Energy (E)** → **Wit**

### ҜRMA Efficiency System

- Following natural affinities = lower ҜRMA costs
- Targeting unaligned attributes = higher ҜRMA costs
- Acts as "guidepost" rather than hard restriction
- Encourages coherent patterns while maintaining creative freedom

## Combat Example

**Damage String**: `10:5:8/3\2:7:4`

Against Heavy Plate (8 Hard resist) + Chainmail + Padded Clothing:

1. **10 Piercing** vs. 8 Hard = 2 continues
2. **5 Slashing** vs. 8 Hard = 0 continues, no condition loss
3. **8 Heat** vs. 8 Hard = 0 continues (acts like Piercing vs Hard)
4. **3 Decay** vs. 8 Hard = 0 continues, condition reduced by 1
5. **2 Cold** vs. 8 Hard = 0 continues, condition reduced by 1
6. **7 Bashing** vs. 8 Hard = 0 continues, no condition loss
7. **4 Energy** = bypasses all, continues with full 4

Process repeats for each subsequent layer with any continuing damage.