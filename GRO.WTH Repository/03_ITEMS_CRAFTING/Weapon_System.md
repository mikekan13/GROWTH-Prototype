# Weapon_System.md

**Status:** #needs-validation
**Source:** compass_artifact_wf-022ea623-0c93-4446-a62d-bf3438f6292f_text_markdown.md, User clarification 2025-10-03
**Last Updated:** 2025-10-03

---

# Weapon System

GROWTH weapons use **material-based construction** with **fixed damage values** and **damage type classification**.

## Weapon Damage Format

Weapons use the **standard damage string format:** `P:S:H/D\C:B:E`

**Damage Types:**
- **P** = Piercing (arrows, spears, stabs)
- **S** = Slashing (swords, axes, cuts)
- **H** = Heat (fire, thermal)
- **D** = Decay (acid, corrosion)
- **C** = Cold (ice, freezing)
- **B** = Bashing (clubs, hammers, blunt force)
- **E** = Energy (lightning, electrical)

**Example:** Arming Sword: `0:15:0/0\0:0:0` (15 Slashing damage)

### Weapon Properties
- **Fixed Damage:** Weapons deal set damage amounts (no dice rolls)
- **Target Attribute:** Weapons specify which [[Three_Pillar_Attributes|attribute]] they target
- **Material Modifiers:** Can add special damage types or properties
- **Scaling:** Some weapons add wielder's current attribute level to damage

See [[Damage_Type_Interactions]] for complete damage mechanics

## Weapon Categories

### Melee Weapons

#### Swords
- **Arming Sword:** `0:15:0/0\0:0:0` - 15 Slashing damage, targets Celerity
- **Long Sword:** `0:18:0/0\0:0:0` - 18 Slashing damage, targets Celerity
- **Rapier:** `12:3:0/0\0:0:0` - 12 Piercing + 3 Slashing, targets Celerity

#### Blunt Weapons
- **Club:** `0:0:0/0\0:8:0` - 8 Bashing damage, targets Constitution
- **Mace:** `0:0:0/0\0:12:0` - 12 Bashing damage, targets Constitution
- **Warhammer:** `0:0:0/0\0:15:0` - 15 Bashing damage, targets Constitution

#### Polearms
- **Spear:** `15:0:0/0\0:0:0` - 15 Piercing damage, reach, targets Clout
- **Halberd:** `8:10:0/0\0:0:0` - 8 Piercing + 10 Slashing, reach, targets Clout
- **Quarterstaff:** `0:0:0/0\0:6:0` - 6 Bashing damage, defensive, targets Constitution

### Ranged Weapons

#### Firearms
- **.38 Revolver:** `18:0:0/0\0:0:0` - 18 Piercing damage, 6 shots, 50ft range, targets Celerity
- **.45 Revolver:** `22:0:0/0\0:0:0` - 22 Piercing damage, 6 shots, 50ft range, targets Celerity

#### Bows and Crossbows
- **Shortbow:** `10:0:0/0\0:0:0` - 10 Piercing damage, quick draw, targets Celerity
- **Longbow:** `15:0:0/0\0:0:0` - 15 Piercing damage, long range, targets Celerity
- **Crossbow:** `18:0:0/0\0:0:0` - 18 Piercing damage, slow reload, targets Celerity

## Weapon Properties

### Special Modifiers
- **Unblockable:** Cannot be blocked normally
- **Brittle:** Breaks if condition drops one level
- **Strong:** +3 resistance to breaking
- **Regenerating (X):** Heals X condition levels per combat round

### Material Effects
- **Sharp:** Bonus against soft materials
- **Blunt:** Effective against armor
- **Flexible:** Difficult to break or parry

## Weapon Construction

### Base Material determines:
- **Durability:** How much damage before breaking
- **Weight:** Affects wielding and carrying
- **Special Properties:** Material-specific bonuses

### Crafting Quality
- **Poor:** Reduced effectiveness, breaks easily
- **Standard:** Normal weapon statistics
- **Superior:** Enhanced durability and damage
- **Masterwork:** Significant bonuses and special abilities

## Combat Integration

### Weapon Skills
Each weapon type requires appropriate [[Complete_Skill_List|Martial Arts]] specialization:
- **Swords:** Blade combat techniques
- **Polearms:** Long weapon mastery
- **Bows:** Ranged projectile accuracy
- **Firearms:** Modern weapon proficiency
- **Unarmed:** Hand-to-hand combat

### Damage Resolution
1. **Check Damage Type:** Determine P/S/H/D/C/B/E values from weapon
2. **Apply to Target:** Damage hits specified target attribute
3. **Armor Interaction:** Each damage type interacts differently with armor materials (see [[Damage_Type_Interactions]])
4. **Skill Bonus:** Combat skill level may add to attack roll (not damage)

---

## Links
- Related: [[Material_System]], [[Combat_Hit_Locations]], [[Starting_Skills_Module]]
- References: [[Weapon_Examples_Table]], [[Combat_Damage_Chart]]
- Examples: [[Weapon_Selection_Guide]], [[Combat_Scenarios]]