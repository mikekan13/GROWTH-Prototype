# Weapon_System.md

**Status:** #validated
**Source:** compass_artifact_wf-022ea623-0c93-4446-a62d-bf3438f6292f_text_markdown.md, User clarification 2025-10-03, ruling 2026-04-22
**Security:** PUBLIC
**Rulebook:** `rulebook/rulebook.md` §9.2 (Weapons)
**Last Updated:** 2026-04-22

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
- **Target Attribute:** Each damage entry declares which [[Three_Pillar_Attributes|attribute]] it targets — ANY is legal; the **Affinity Cycle prices the drift** per [[Damage_Targeting_KV_Spec]] (ring distance 1×/2×/5×/10× on the damage KV component; Frequency flat 20×; Flow prices as Focus, r-2026-06-10-04). Identical 15-piercing spears: →Clout 1×, →Constitution 5×.
- **Attacks (r-2026-06-10-04):** Weapons can carry multiple named ATTACKS, each with its own damage string — a sword might have a Slash attack `0:45:0/0\0:0:0` and a Stab attack `30:0:0/0\0:0:0`. [[Nectar]]s can bestow additional attacks onto weapons or onto unarmed combat.
- **Material Modifiers:** Can add special damage types or properties
- **Scaling:** Some weapons add wielder's current attribute level to damage

> **Note (r-2026-06-11-01):** the example targets below were corrected to natural-alignment defaults — the old listed targets (Bashing → Constitution, Piercing → Celerity) predated the Affinity Cycle and are not canon. Examples show the 1× baseline; off-alignment variants are legal at priced KV.

See [[Damage_Type_Interactions]] for complete damage mechanics

## Weapon Categories

### Melee Weapons

#### Swords
- **Arming Sword:** `0:15:0/0\0:0:0` - 15 Slashing damage, targets Celerity
- **Long Sword:** `0:18:0/0\0:0:0` - 18 Slashing damage, targets Celerity
- **Rapier:** `12:3:0/0\0:0:0` - 12 Piercing (targets Clout) + 3 Slashing (targets Celerity)

#### Blunt Weapons
- **Club:** `0:0:0/0\0:8:0` - 8 Bashing damage, targets Wisdom
- **Mace:** `0:0:0/0\0:12:0` - 12 Bashing damage, targets Wisdom
- **Warhammer:** `0:0:0/0\0:15:0` - 15 Bashing damage, targets Wisdom

#### Polearms
- **Spear:** `15:0:0/0\0:0:0` - 15 Piercing damage, reach, targets Clout
- **Halberd:** `8:10:0/0\0:0:0` - 8 Piercing (targets Clout) + 10 Slashing (targets Celerity), reach
- **Quarterstaff:** `0:0:0/0\0:6:0` - 6 Bashing damage, defensive, targets Wisdom

### Ranged Weapons

#### Firearms
- **.38 Revolver:** `18:0:0/0\0:0:0` - 18 Piercing damage, 6 shots, 50ft range, targets Clout
- **.45 Revolver:** `22:0:0/0\0:0:0` - 22 Piercing damage, 6 shots, 50ft range, targets Clout

#### Bows and Crossbows
- **Shortbow:** `10:0:0/0\0:0:0` - 10 Piercing damage, quick draw, targets Clout
- **Longbow:** `15:0:0/0\0:0:0` - 15 Piercing damage, long range, targets Clout
- **Crossbow:** `18:0:0/0\0:0:0` - 18 Piercing damage, slow reload, targets Clout

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