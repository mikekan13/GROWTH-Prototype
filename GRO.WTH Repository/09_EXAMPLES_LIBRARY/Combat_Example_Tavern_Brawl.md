# Combat_Example_Tavern_Brawl.md

**Status:** #needs-validation
**Source:** Rewritten to match current combat mechanics 2025-10-03
**Security:** PUBLIC
**Last Updated:** 2025-10-03

---

# Combat Example: Tavern Brawl

This example demonstrates GROWTH's **Three Phase Combat System** with the **Actions Per Pillar** economy through a detailed tavern fight.

## Scenario Setup

**Location:** The Prancing Pony tavern - crowded common room
**Participants:**
- **Koragh** (Cambion Fighter) - Sword & shield specialist
- **Marcus** (Human Rogue) - Dual dagger wielder
- **Thug 1** - Human brawler, unarmed
- **Thug 2** - Human enforcer with club

**Trigger:** Card game dispute escalates to violence

## Character Stats

### Koragh (Cambion Fighter)
**Fate Die:** d12 (Cambion seed)
**Attributes:**
- **Body:** CLT 25, CEL 24, CON 26 = 75 total → **3 Body actions**
- **Soul:** FLW 8, FRQ 50, FOC 10 = 68 total → **2 Soul actions**
- **Spirit:** WIL 12, WIS 10, WIT 8 = 30 total → **1 Spirit action**

**Skills:**
- Sword Fighting: Level 12 (d12 skill die) - flagged as combat skill
- Shield Defense: Level 8 (d8 skill die)

**Equipment:**
- Arming Sword: `0:15:0/0\0:0:0` (15 Slashing, targets Celerity)
- Steel Shield: Resist 20 (Hard material)
- Leather Armor: Resist 17 (Soft material)

### Marcus (Human Rogue)
**Fate Die:** d6 (Human baseline)
**Attributes:**
- **Body:** CLT 18, CEL 22, CON 16 = 56 total → **2 Body actions**
- **Soul:** FLW 10, FRQ 40, FOC 12 = 62 total → **2 Soul actions**
- **Spirit:** WIL 14, WIS 16, WIT 18 = 48 total → **1 Spirit action**

**Skills:**
- Dual Wielding: Level 10 (d10 skill die) - flagged as combat skill, grants 2 attacks per action
- Acrobatics: Level 14 (d12 skill die)

**Equipment:**
- 2x Daggers: `0:8:0/0\0:0:0` each (8 Slashing, targets Celerity)
- Leather Vest: Resist 17 (Soft material)

### Thug 1 (Brawler)
**Fate Die:** d6
**Attributes:**
- **Body:** CLT 15, CEL 12, CON 18 = 45 total → **1 Body action**
- **Soul:** FLW 5, FRQ 30, FOC 5 = 40 total → **1 Soul action**
- **Spirit:** WIL 8, WIS 6, WIT 8 = 22 total → **1 Spirit action**

**Skills:**
- Brawling: Level 6 (d6 skill die) - grants 2 unarmed attacks per action
- Unarmed damage: `0:0:0/0\0:5:0` (5 Bashing, targets Constitution)

**Equipment:**
- Heavy cloth shirt: Resist 2 (Soft material)

### Thug 2 (Enforcer)
**Fate Die:** d6
**Attributes:**
- **Body:** CLT 16, CEL 10, CON 20 = 46 total → **1 Body action**
- **Soul:** FLW 6, FRQ 35, FOC 6 = 47 total → **1 Soul action**
- **Spirit:** WIL 10, WIS 8, WIT 6 = 24 total → **1 Spirit action**

**Skills:**
- Club Fighting: Level 8 (d8 skill die)

**Equipment:**
- Heavy Club: `0:0:0/0\0:12:0` (12 Bashing, targets Constitution)
- Leather Armor: Resist 17 (Soft material)

---

## Round 1: Initial Contact

### Phase 1 - INTENTION

**Koragh declares:**
- Body Action 1: Draw sword and attack Thug 1
- Body Action 2: Readied defense with shield (undefined - reactive)
- Body Action 3: Readied defense (undefined - reactive)

**Marcus declares:**
- Body Action 1: Draw daggers and attack Thug 2 (2 attacks via Dual Wielding Level 10)
- Body Action 2: Undefined (reactive positioning)

**Thug 1 declares:**
- Body Action 1: Grab chair leg and swing at Koragh

**Thug 2 declares:**
- Body Action 1: Draw club and attack Marcus

**All intentions locked. Oracle/Terminal determines Time Stack order based on Flow alignment.**

### Phase 2 - RESOLUTION (Time Stack Order)

**Time Stack determined by GM/Terminal based on narrative flow and declared intentions.**

#### 1st Position: Koragh's Attack (Flowing with initiative)

**Attack Roll:**
- Fate Die (d12): Roll = 9
- Sword Fighting (d12): Roll = 7
- Effort from Clout: 4 points wagered
- **Total Attack: 9 + 7 + 4 = 20**

**Thug 1's Defense:**
- Has 1 Body action but already committed to attacking
- **No action available to defend**
- **Undefended Attack: Auto-success** (standing target at melee range)

**Hit Declared:** Koragh's sword strikes Thug 1's torso
- Damage: `0:15:0/0\0:0:0` (15 Slashing)
- Target: Celerity attribute
- Armor: Cloth shirt (Resist 2, Soft material)

**Damage Resolution:**
1. Slashing vs Soft material: Damage reduced by resist, can cause condition loss if damage ≥ resist
2. 15 Slashing - 2 resist = 13 damage continues to body
3. 15 ≥ 2 (resist rating) → Cloth shirt loses 1 condition level
4. **13 damage applies to Thug 1's Celerity** (marked for Impact Phase)

#### 2nd Position: Marcus's Attack

**Attack Roll (1st dagger):**
- Fate Die (d6): Roll = 4
- Dual Wielding (d10): Roll = 6
- Effort from Celerity: 3 points
- **Total: 4 + 6 + 3 = 13**

**Thug 2's Defense:**
- Has action available, chooses to defend
- No defensive skill, uses raw Celerity (22)
- Fate Die (d6): Roll = 3
- Effort from Celerity: 2 points
- **Defense Total: 3 + 22 + 2 = 27**

**Attack Fails:** 13 vs 27 (Thug 2 successfully dodges)

**Attack Roll (2nd dagger - same action, Dual Wielding grants 2 attacks):**
- Fate Die (d6): Roll = 5
- Dual Wielding (d10): Roll = 8
- Effort from Celerity: 3 points
- **Total: 5 + 8 + 3 = 16**

**Thug 2's Defense:**
- Already used action to defend against 1st attack
- **No action available for 2nd defense**
- **Undefended: Auto-hit**

**Hit Declared:** Marcus's second dagger strikes Thug 2
- Damage: `0:8:0/0\0:0:0` (8 Slashing)
- Target: Celerity
- Armor: Leather Armor (Resist 17, Soft)

**Damage Resolution:**
1. 8 Slashing vs Soft (Resist 17)
2. 8 < 17 → Damage fully absorbed
3. 8 ≥ resist (NO, 8 < 17) → **No damage, no condition loss**

#### 3rd Position: Thug 1's Attack

**Attack Roll:**
- Fate Die (d6): Roll = 2
- Brawling (d6): Roll = 4
- Improvised weapon (chair leg): -2 penalty
- Effort from Clout: 2 points
- **Total: 2 + 4 - 2 + 2 = 6**

**Koragh's Defense:**
- Has 2 undefined Body actions remaining
- Uses Shield Defense skill
- Fate Die (d12): Roll = 10
- Shield Defense (d8): Roll = 6
- Effort from Constitution: 3 points
- **Defense Total: 10 + 6 + 3 = 19**

**Attack Fails:** 6 vs 19 (shield easily blocks the wild swing)

#### 4th Position: Thug 2's Attack (targeting Marcus)

**Attack Roll:**
- Fate Die (d6): Roll = 5
- Club Fighting (d8): Roll = 6
- Effort from Clout: 2 points
- **Total: 5 + 6 + 2 = 13**

**Marcus's Defense:**
- Has 1 Body action remaining
- Uses Acrobatics skill (Celerity-based)
- Fate Die (d6): Roll = 4
- Acrobatics (d12): Roll = 9
- Effort from Celerity: 4 points
- **Defense Total: 4 + 9 + 4 = 17**

**Attack Fails:** 13 vs 17 (Marcus tumbles away from the club swing)

### Phase 3 - IMPACT

**All damage and effects apply simultaneously:**

**Thug 1:**
- Takes 13 Slashing damage to Celerity
- Current Celerity: 12 → **0 Celerity** (12 - 13 = -1, treated as 0)
- **Depletion Effect (Celerity 0 - Paralyzed):** Cannot use any actions (Body, Soul, or Spirit)
- Cloth shirt reduced to lower condition

**Thug 1 Status:** Paralyzed, effectively out of combat

**Round 1 Complete**

---

## Round 2: Decisive Action

### Phase 1 - INTENTION

**Koragh declares:**
- Body Action 1: Move to engage Thug 2
- Body Action 2: Attack Thug 2 with sword
- Body Action 3: Undefined (reactive defense)

**Marcus declares:**
- Body Action 1: Attack paralyzed Thug 1 (coup de grâce attempt)
- Body Action 2: Undefined

**Thug 1 declares:**
- **Cannot act** (Paralyzed from Celerity depletion)

**Thug 2 declares:**
- Body Action 1: Full defensive stance (all effort to defense)

### Phase 2 - RESOLUTION

#### 1st Position: Koragh's Attack on Thug 2

**Attack Roll:**
- Fate Die (d12): Roll = 11
- Sword Fighting (d12): Roll = 10
- Effort from Clout: 5 points
- **Total: 11 + 10 + 5 = 26**

**Thug 2's Defense (Full Defensive Stance):**
- Fate Die (d6): Roll = 5
- Using raw Constitution (20) for defense
- Effort from Constitution: 6 points (maximum defensive effort)
- **Defense Total: 5 + 20 + 6 = 31**

**Attack Fails:** 26 vs 31 (Thug 2 barely evades the powerful sword strike)

#### 2nd Position: Marcus's Coup de Grâce

**Against Paralyzed Opponent:**
- Thug 1 cannot defend (paralyzed, no actions)
- **Automatic hit** to called location

**Marcus targets:** Head (vital area, +2 DR normally, but undefended)
- Damage: `0:8:0/0\0:0:0` (8 Slashing to head)
- Armor: Cloth (Resist 2)
- 8 - 2 = 6 damage to body
- **Head hit + attribute damage:** Thug 1's Frequency drops by 6

**If Frequency reaches 0:** Death save required

### Phase 3 - IMPACT

**Thug 1:**
- Frequency: 30 → 24 (still conscious but critically wounded)

**Combat continues...**

---

## Key Mechanics Demonstrated

### 1. Actions Per Pillar System
- Characters have separate action pools for Body/Soul/Spirit
- Formula: (Sum of 3 attributes / 25), minimum 1
- Higher attribute totals = more actions

### 2. Three Phase Combat
- **Intention:** All actions declared in secret
- **Resolution:** Time Stack determines order (not fixed initiative)
- **Impact:** All damage applies simultaneously

### 3. Defended vs Undefended Attacks
- **Defended:** Direct skill contest, defender's roll = DR
- **Undefended:** Auto-success for reasonable attacks
- Must have available action to defend

### 4. Damage Format: P:S:H/D\C:B:E
- Fixed weapon damage (no rolls)
- Each type interacts differently with armor materials
- Damage targets specific attributes

### 5. Attribute Depletion Effects
- Celerity 0 = Paralyzed (no actions possible)
- Frequency 0 = Death save required
- Different attributes have different depletion effects

### 6. Skill Level Attack Multipliers
- Level 1-5: 1 attack per action
- Level 6-10: 2 attacks per action (Marcus's Dual Wielding)
- Level 11-15: 3 attacks per action
- Level 16-20: 4 attacks per action

### 7. Material Damage Interactions
- Soft materials: Different vulnerability to Slashing vs Bashing
- Hard materials: Different damage absorption patterns
- See [[Damage_Type_Interactions]] for complete mechanics

---

## Links
- Related: [[Turn_Structure_and_Action_Economy]], [[Attack_Resolution_Mechanics]], [[Damage_Type_Interactions]]
- References: [[Three_Pillar_Attributes]], [[Attribute_Depletion_Effects]], [[Weapon_System]]
- Examples: [[Basic_Resolution_System]]
