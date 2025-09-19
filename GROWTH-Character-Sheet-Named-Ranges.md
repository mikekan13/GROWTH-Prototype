# GROWTH Character Sheet Template - Named Ranges Documentation

**Template ID:** `1-4O9-hSkGf8J_Pp729fXaiyBdzTL-pG12t76XX0r1rQ`
**Template Name:** GROWTH CS Template v0.5 (Public)
**Total Named Ranges:** 91
**Generated:** 2025-09-18

## Template Overview

The GROWTH character sheet template contains 91 named ranges across 14 sheets:

### Sheets in Template:
1. **Main** (ID: 324729169) - Primary character sheet
2. **DiceRoller** (ID: 1787061219) - Dice rolling functionality
3. **Inventory** (ID: 1627338362) - Character inventory
4. **Possessions** (ID: 2088595133) - Character possessions
5. **Vitals** (ID: 866310515) - Health and vitals tracking
6. **Social** (ID: 734948689) - Social nectar abilities
7. **Learning** (ID: 1326617902) - Learning nectar abilities
8. **Supernatural** (ID: 568977913) - Supernatural nectar abilities
9. **Utility** (ID: 364335206) - Utility nectar abilities
10. **Combat** (ID: 804573011) - Combat nectar abilities
11. **Natural** (ID: 544684395) - Natural nectar abilities
12. **Magic** (ID: 2079912907) - Magic nectar abilities
13. **SuperTech** (ID: 1986560373) - SuperTech nectar abilities
14. **Sheet Settings** (ID: 268976113) - Sheet configuration

---

## Named Ranges by Category

### CHARACTER INFORMATION (13 ranges)

| Name | Sheet | Range | Purpose |
|------|--------|-------|---------|
| `CharacterName` | Main | B1:C2 | Character's name |
| `CharacterImage` | Main | A3:C32 | Character portrait area |
| `CloutLevel` | Main | _5:_6 | Clout attribute level |
| `CelerityLevel` | Main | _7:_8 | Celerity attribute level |
| `ConstitutionLevel` | Main | _9:_10 | Constitution attribute level |
| `FocusLevel` | Main | _14:_15 | Focus attribute level |
| `FlowLevel` | Main | _18:_19 | Flow attribute level |
| `WillpowerLevel` | Main | _23:_24 | Willpower attribute level |
| `WisdomLevel` | Main | _25:_26 | Wisdom attribute level |
| `WitLevel` | Main | _27:_28 | Wit attribute level |
| `HealthLevel` | Main | T1:V2 | Health/hit points |
| `TechLevel` | Main | O1:R2 | Technology level |
| `WealthLevel` | Main | I1:J2 | Wealth level |

### SKILLS (1 range)

| Name | Sheet | Range | Purpose |
|------|--------|-------|---------|
| `rollingSkill` | DiceRoller | D3:D3 | Current skill being rolled |

### INVENTORY & EQUIPMENT (2 ranges)

| Name | Sheet | Range | Purpose |
|------|--------|-------|---------|
| `'Inventory'!WEIGHT` | Inventory | b15:b15 | Total inventory weight |
| `'Possessions'!WEIGHT` | Possessions | b15:b15 | Total possessions weight |

### COMBAT & VITALS (3 ranges + Body Location ranges)

| Name | Sheet | Range | Purpose |
|------|--------|-------|---------|
| `HEAD` | Vitals | E3:G4 | Head body location |
| `LEFTUPPERARM` | Vitals | I8:I8 | Left upper arm location |
| `LEFTLOWERARM` | Vitals | I11:I11 | Left lower arm location |
| `RIGHTLOWERARM` | Vitals | C11:C11 | Right lower arm location |
| `LEFTUPPERLEG` | Vitals | G13:G14 | Left upper leg location |
| `RIGHTUPPERLEG` | Vitals | E13:E14 | Right upper leg location |
| `LEFTLOWERLEG` | Vitals | G18:G18 | Left lower leg location |
| `RIGHTLOWERLEG` | Vitals | E18:E18 | Right lower leg location |
| `restRate` | Vitals | G22:G22 | Rest/healing rate |

---

## Core Attribute System

### Attribute Levels (Base Values)
- `CloutLevel` → Main!_5:_6
- `CelerityLevel` → Main!_7:_8
- `ConstitutionLevel` → Main!_9:_10
- `FocusLevel` → Main!_14:_15
- `FlowLevel` → Main!_18:_19
- `WillpowerLevel` → Main!_23:_24
- `WisdomLevel` → Main!_25:_26
- `WitLevel` → Main!_27:_28

### Current Attribute Values
- `currentClout` → Main!c6:c6
- `currentCelerity` → Main!c8:c8
- `currentConstitution` → Main!c10:c10
- `currentFocus` → Main!c15:c15
- `currentFlow` → Main!c19:c19
- `currentWillpower` → Main!c24:c24
- `currentWisdom` → Main!c26:c26
- `currentWit` → Main!c28:c28

### Attribute Modifiers

#### Trainable Flags
- `CloutTrainable` → Main!\\5:\\6
- `CelerityTrainable` → Main!\\7:\\8
- `ConstitutionTrainable` → Main!\\9:\\10
- `FocusTrainable` → Main!\\14:\\15
- `FlowTrainable` → Main!\\18:\\19
- `WillpowerTrainable` → Main!\\23:\\24
- `WisdomTrainable` → Main!\\25:\\26
- `WitTrainable` → Main!\\27:\\28

#### Positive Augments
- `CloutAugmentPositive` → Main!`5:`6
- `CelerityAugmentPositive` → Main!`7:`8
- `ConstitutionAugmentPositive` → Main!`9:`10
- `FocusAugmentPositive` → Main!`14:`15
- `FlowAugmentPositive` → Main!`18:`19
- `WillpowerAugmentPositive` → Main!`23:`24
- `WisdomAugmentPositive` → Main!`25:`26
- `WitAugmentPositive` → Main!`27:`28

#### Negative Augments
- `CloutAugmentNegative` → Main!a5:a6
- `CelerityAugmentNegative` → Main!a7:a8
- `ConstitutionAugmentNegative` → Main!a9:a10
- `FocusAugmentNegative` → Main!a14:a15
- `FlowAugmentNegative` → Main!a18:a19
- `WillpowerAugmentNegative` → Main!a23:a24
- `WisdomAugmentNegative` → Main!a25:a26
- `WitAugmentNegative` → Main!a27:a28

---

## Character Goals & Opportunities

### Goals (Character objectives)
- `Goal1` → Main!G18:N19
- `Goal2` → Main!G20:N21
- `Goal3` → Main!G22:N23
- `Goal4` → Main!G24:N25
- `Goal5` → Main!G26:N27

### Opportunities (Available actions)
- `Opportunity1` → Main!R18:R19
- `Opportunity2` → Main!R20:R21
- `Opportunity3` → Main!R22:R23
- `Opportunity4` → Main!R24:R25
- `Oportunity5` → Main!R26:R27 *(Note: Typo in original)*

### Opportunity Key Values
- `Opportunity1KV` → Main!P18:Q19
- `Opportunity2KV` → Main!P20:Q21
- `Opportunity3KV` → Main!P22:Q23
- `Opportunity4KV` → Main!P24:Q25
- `Opportunity5KV` → Main!P26:Q27

---

## Dice Rolling & Game Mechanics

### Dice Rolling
- `DiceRollInput` → DiceRoller!M2:M2
- `Effort` → DiceRoller!K2:K2
- `rollMana` → DiceRoller!K4:K4
- `rollFrequency` → DiceRoller!K6:K6

### Special Values
- `FateDie` → Main!E1:G2
- `Frequency` → Main!^16:^17
- `currentFrequency` → Main!c17:c17
- `TKV` → Main!H31:J32 (Total Key Value)
- `Root` → Main!G9:G10
- `Seed` → Main!G5:G6

---

## Nectar Abilities (Magic System)

The template includes separate sheets for different types of nectar abilities:

- `SocialNectars` → Social sheet (Column A)
- `LearningNectars` → Learning sheet (Column A)
- `SupernaturalNectars` → Supernatural sheet (Column A)
- `UtilityNectars` → Utility sheet (Column A)
- `CombatNectars` → Combat sheet (Column A)
- `NaturalNectars` → Natural sheet (Column A)
- `MagicNectars` → Magic sheet (Column A)
- `SuperTechNectars` → SuperTech sheet (Column A)

---

## Configuration

### Sheet Settings
- `PORTRAITURL` → Sheet Settings!D2:I2 (Character portrait URL)

---

## Database Mapping Strategy

For mapping database fields to Google Sheets named ranges:

### Core Character Data
```typescript
interface CharacterMapping {
  // Basic Info
  name: string → CharacterName
  portraitUrl?: string → PORTRAITURL

  // Core Attributes
  clout: number → CloutLevel
  celerity: number → CelerityLevel
  constitution: number → ConstitutionLevel
  focus: number → FocusLevel
  flow: number → FlowLevel
  willpower: number → WillpowerLevel
  wisdom: number → WisdomLevel
  wit: number → WitLevel

  // Secondary Stats
  health: number → HealthLevel
  tech: number → TechLevel
  wealth: number → WealthLevel

  // Goals (array of strings)
  goals: string[] → Goal1, Goal2, Goal3, Goal4, Goal5

  // Opportunities (array of objects)
  opportunities: OpportunityData[] → Opportunity1-5 + OpportunityKV ranges
}
```

### Range Access Pattern
```typescript
// Example: Setting character name
await updateNamedRange(spreadsheetId, 'CharacterName', characterData.name);

// Example: Setting clout level
await updateNamedRange(spreadsheetId, 'CloutLevel', characterData.clout);

// Example: Setting goals
await updateNamedRange(spreadsheetId, 'Goal1', characterData.goals[0] || '');
```

This comprehensive mapping provides the foundation for a complete database-to-sheets synchronization system in the GROWTH prototype.