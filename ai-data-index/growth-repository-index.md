# GROWTH Repository Comprehensive Index

**Generated:** 2026-03-13
**Source:** `C:\Projects\GRO.WTH\GRO.WTH Repository\`
**Total Files:** 92 markdown files across 11 folders + root level

---

## Root-Level Files

### CLAUDE.md
- **Path:** `GRO.WTH Repository\CLAUDE.md`
- **Summary:** Binding contracts for Claude Code when working with the GROWTH RPG knowledge base. Defines forbidden/authorized actions, validation protocol, file header format, folder structure, authority hierarchy, and escalation triggers.
- **Key Concepts:** Validation protocol, authority hierarchy (User > validated files > archives > Claude Code), security classification system (PUBLIC/SECRET/SEASONAL/GM-ONLY/FOUNDER-ONLY), file header format with status tags.

### README.md
- **Path:** `GRO.WTH Repository\README.md`
- **Summary:** Brief repository description: "The entire GRO.WTH Knowledge base."
- **Key Concepts:** Repository identification.

### PROJECT_STATUS.md
- **Path:** `GRO.WTH Repository\PROJECT_STATUS.md`
- **Summary:** Comprehensive project status tracking document. Wiki development is ~97% complete as of 2025-08-22. Tracks session logs, decisions made, issues found, and priorities for future sessions.
- **Key Concepts:** Project tracking, session continuity, GROvine system integration, core rule validation progress.

### SESSION_LOG_2025-08-13.md
- **Path:** `GRO.WTH Repository\SESSION_LOG_2025-08-13.md`
- **Summary:** Session log for Campaign Simulator enhancement work. Documents fixes to simulator startup, auto-generation for blank fields, project cleanup, app icons, and git repository fixes.
- **Key Concepts:** Campaign simulator (Ollama-based), GM Agent (Phi-3 Medium 14B), Player Agents (Llama 3.2 3B), Terminal Validator (Qwen2.5 7B), Tkinter GUI.

### 2025-10-04.md
- **Path:** `GRO.WTH Repository\2025-10-04.md`
- **Summary:** Empty file with no content.
- **Key Concepts:** None.

---

## 01_CORE_RULES (8 files)

### Attribute_Depletion_Effects.md
- **Path:** `01_CORE_RULES\Attribute_Depletion_Effects.md`
- **Summary:** Defines the 9 depletion states when each attribute pool reaches 0. Each targets a different core mechanic: Weak (Clout), Clumsy (Celerity), Exhausted (Constitution), Muted (Focus), Death's Door (Frequency), Deafened (Flow), Overwhelmed (Willpower), Confused (Wisdom), Incoherent (Wit).
- **Key Concepts:** Attribute depletion, pool exhaustion, mechanical penalties, Body/Soul/Spirit pillar effects, Lady Death trigger at Frequency 0.

### Basic_Resolution_System.md
- **Path:** `01_CORE_RULES\Basic_Resolution_System.md`
- **Summary:** Core dice mechanics for all checks. Skilled checks: Skill Die + Fate Die + Effort vs DR. Unskilled checks: Fate Die + Effort vs DR. Effort is spent from attribute pools to boost rolls.
- **Key Concepts:** Fate Die (default d8), Skill Die, Difficulty Rating (DR), effort system, skilled vs unskilled checks, color-coded DR bands (Green/Yellow/Red).

### GROvine_System.md
- **Path:** `01_CORE_RULES\GROvine_System.md`
- **Summary:** The Goals system where character objectives become active narrative elements with mechanical weight. Each GROvine has a Goal, Resistance (GM obstacles), Opportunity (godhead intervention), and Godhead Assignment. Three-layer structure: Character, GM, and Godhead levels.
- **Key Concepts:** GROvine capacity (~3-4 active), completable vs incompletable goals, godhead investment strategies, resistance mechanics, opportunity delivery (Blossoms/Nectars), goal resolution (success=Nectar, failure=Thorn), Harvest timing for abandonment.

### Health_Level_System.md
- **Path:** `01_CORE_RULES\Health_Level_System.md`
- **Summary:** The "H" in WTH (Wealth/Tech/Health). Health Level is a 1-10 lifespan scale determining a character's Fated Age. Death saves use Fate Die + Health Level only. Lady Death rolls 2d100 (take highest) for fated percentage.
- **Key Concepts:** Health Level 1-10, Fated Age calculation, death saves, Lady Death arbitration, three-strikes system, lifespan categories.

### Skill_Level_Progression.md
- **Path:** `01_CORE_RULES\Skill_Level_Progression.md`
- **Summary:** Skill levels 1-20 with dice progression chart. Levels 1-3 provide flat bonuses, then d4/d6/d8/d12/d20 at higher levels. Effort capacity equals skill level + fate die maximum.
- **Key Concepts:** Skill die ladder (flat bonus -> d4 -> d6 -> d8 -> d12 -> d20), effort capacity formula, skill level 1-20, max roll calculation.

### Skill_System_Overview.md
- **Path:** `01_CORE_RULES\Skill_System_Overview.md`
- **Summary:** Skills are freeform with natural language naming. Contextual enhancement triggers provide bonuses when skill context matches the situation. No predefined skill list; players name skills organically.
- **Key Concepts:** Freeform skill naming, contextual enhancement, natural language triggers, skill categorization (broad vs specific), organic character development.

### Technology_Level_System.md
- **Path:** `01_CORE_RULES\Technology_Level_System.md`
- **Summary:** The "T" in WTH. Technology Level is a 1-10 scale from Primitive to Transcendent. Imposes hard usage restrictions on equipment and abilities above a character's tech level.
- **Key Concepts:** Tech Level 1-10 scale, usage restrictions, equipment gating, crafting requirements, lifespan interaction, campaign ceiling.

### Wealth_Level_System.md
- **Path:** `01_CORE_RULES\Wealth_Level_System.md`
- **Summary:** The "W" in WTH. Wealth Level is a 1-10 abstract purchasing power scale. Characters get 3 wealth checks per level. Abstract system replaces granular coin tracking.
- **Key Concepts:** Wealth Level 1-10, wealth checks (3 per level), abstract purchasing, social class representation, starting equipment.

---

## 02_CHARACTER_CREATION (6 files)

### Character_Approval_Process.md
- **Path:** `02_CHARACTER_CREATION\Character_Approval_Process.md`
- **Summary:** Multi-step submission and GM review process for new characters. Covers KRMA budget allocation by the GM, age accumulation through Seeds/Roots/Branches, and final approval workflow.
- **Key Concepts:** Character submission, GM review, KRMA budget, age accumulation, approval workflow, character rejection/revision.

### Character_Sheet_Validation.md
- **Path:** `02_CHARACTER_CREATION\Character_Sheet_Validation.md`
- **Summary:** Validation rules derived from the character sheet audit. Covers skill dice mapping, depletion state tracking, carry capacity calculation, and Nectar/Thorn limits tied to Fate Die value.
- **Key Concepts:** Skill dice validation, depletion state tracking, carry capacity (Clout-based), Nectar/Thorn max = Fate Die value, attribute pool calculations.

### Harvests_System.md
- **Path:** `02_CHARACTER_CREATION\Harvests_System.md`
- **Summary:** Milestone development system between campaign events. Harvests are narrative-driven advancement periods where characters grow, change GROvines, and evolve through story rather than XP.
- **Key Concepts:** Harvest periods, milestone advancement, narrative-driven growth, GROvine changes during Harvests, character evolution.

### Nectars_and_Thorns_System.md
- **Path:** `02_CHARACTER_CREATION\Nectars_and_Thorns_System.md`
- **Summary:** Permanent beneficial traits (Nectars) and negative traits (Thorns) that characters accumulate. Maximum count equals the character's Fate Die value. New traits can replace existing ones when at capacity.
- **Key Concepts:** Nectars (permanent boons), Thorns (permanent drawbacks), Fate Die limit, replacement mechanics, trait sources (Seeds, Roots, Branches, GROvines).

### Seeds_Roots_Branches_System.md
- **Path:** `02_CHARACTER_CREATION\Seeds_Roots_Branches_System.md`
- **Summary:** Three-layer character creation system. Seeds define species/origin (base stats, Fate Die, lifespan). Roots define childhood (formative experiences, early skills). Branches define adult experiences (specializations, advanced abilities). Each layer adds age, attributes, and skills.
- **Key Concepts:** Seeds (species/origin), Roots (childhood), Branches (adult life), layered creation, KV costs per layer, age accumulation, attribute allocation.

### Three_Pillar_Attributes.md
- **Path:** `02_CHARACTER_CREATION\Three_Pillar_Attributes.md`
- **Status:** #validated
- **Summary:** The foundational 3x3 attribute matrix. Body (Clout/Celerity/Constitution), Soul (Focus/Frequency/Flow), Spirit (Willpower/Wisdom/Wit). Attribute pools serve as effort pools. Frequency has triple function: advancement currency, death threshold, and magic fuel.
- **Key Concepts:** 3x3 attribute matrix, three pillars (Body/Soul/Spirit), attribute pools = effort pools, Frequency triple-function, magic integration via Flow/Focus.

---

## 03_ITEMS_CRAFTING (5 files)

### Armor_System.md
- **Path:** `03_ITEMS_CRAFTING\Armor_System.md`
- **Summary:** Three-tier armor system: Clothing (0.5x resist), Light (1x), Heavy (1.5x). Supports layering (up to 3 layers: cloth, light, heavy). Material modifiers affect armor properties. Coverage by hit location.
- **Key Concepts:** Armor tiers (Clothing/Light/Heavy), resist multipliers, layering rules, material modifiers, hit location coverage, encumbrance interaction.

### Equipment_Conditions.md
- **Path:** `03_ITEMS_CRAFTING\Equipment_Conditions.md`
- **Summary:** Four condition states for all equipment: Undamaged (3), Worn (2), Broken (1), Destroyed (0). Special Indestructible (4) state. Broken items provide half effectiveness. Degradation and repair rules.
- **Key Concepts:** 4 condition states, condition degradation, Broken = half effectiveness, repair mechanics, Unrepairable modifier, material durability.

### Inventory_and_Encumbrance_System.md
- **Path:** `03_ITEMS_CRAFTING\Inventory_and_Encumbrance_System.md`
- **Summary:** Weight Levels 0-10 system. Carry Level equals Clout attribute. Characters can carry items at or below their Carry Level, plus one item one level higher. Exceeding triggers Encumbered status with penalties.
- **Key Concepts:** Weight Levels 0-10, Carry Level = Clout, encumbrance penalties, one-above allowance, Flexible/Restrictive modifiers.

### Material_System.md
- **Path:** `03_ITEMS_CRAFTING\Material_System.md`
- **Summary:** Core material framework. Materials are "potential" (fractional KV < 1), items are "purpose" (KV >= 1). Materials classified as Soft/Hard/Hybrid with base Resist (1-50), Tech Level, Rarity (1-10), Weight, and Modifiers. Combination uses averaging formula.
- **Key Concepts:** Materials as potential (fractional KV), Soft/Hard/Hybrid classification, base Resist (1-50), material modifiers (Dampening/Resistant/Proof/Vulnerable/Intolerant/Flexible/Restrictive/Protective/Fragile/Brittle/Flammable/Combustible/Absorbent), combination formula (average Resist).

### Weapon_System.md
- **Path:** `03_ITEMS_CRAFTING\Weapon_System.md`
- **Summary:** Fixed damage format P:S:H/D\C:B:E (Piercing:Slashing:Heat/Decay\Cold:Bashing:Energy). Weapons specify target attribute for each damage type. Material properties affect weapon damage and durability.
- **Key Concepts:** 7 damage types (P:S:H/D\C:B:E), fixed damage strings, weapon categories, combat skill requirements, material effects on weapons, target attribute specification.

---

## 04_MAGIC_PILLARS (18 files)

### Aether_and_Weave_Fundamentals.md
- **Path:** `04_MAGIC_PILLARS\Aether_and_Weave_Fundamentals.md`
- **Summary:** Metaphysical foundation of magic. Aether is the "veins of existence" connecting all universes. Mana is the fuel for casting. The Weave is the structured pattern system for spell creation. Veil thickness determines magic accessibility per world.
- **Key Concepts:** Aether (universal connection), Mana (magical fuel), Weave (structured patterns), veil thickness, attunement requirements.

### Casting_Methods.md
- **Path:** `04_MAGIC_PILLARS\Casting_Methods.md`
- **Summary:** Two casting methods. Wild Casting: risky, roll FD + School level vs DR, Monkey Paw on failure. Woven Spells: safe, pre-designed, roll FD + School + Associated Skill vs DR. Wild casting allows improvisation; Woven provides reliability.
- **Key Concepts:** Wild Casting (risky/improvised), Woven Spells (safe/pre-designed), Monkey Paw system, casting rolls, school levels.

### LLM_Assisted_Magic_Creation.md
- **Path:** `04_MAGIC_PILLARS\LLM_Assisted_Magic_Creation.md`
- **Summary:** Real-time audio capture system for magic creation. Automated analysis determines appropriate magic schools and DR. Terminal oversight activates at Level 6+ spells for balance enforcement.
- **Key Concepts:** Real-time audio processing, automated school/DR analysis, Terminal oversight, LLM integration for magic adjudication.

### Magic_DR_Calculation_System.md
- **Path:** `04_MAGIC_PILLARS\Magic_DR_Calculation_System.md`
- **Summary:** System for calculating magic Difficulty Rating. Additive multi-school DR with linear scaling. Each school contributes a base value. Modifiers adjust DR based on scope, duration, targets, and complexity.
- **Key Concepts:** Additive multi-school DR, linear scaling, school base values, modifier system, spell complexity calculation.

### Magic_School_Abjuration.md
- **Path:** `04_MAGIC_PILLARS\Magic_School_Abjuration.md`
- **Summary:** Balance Pillar school using Flow + Focus. Defensive and protective magic including wards, shields, and dispelling. Associated Prima Materia: Gold.
- **Key Concepts:** Abjuration (defense/protection), Balance Pillar, Flow + Focus, Gold Prima, wards/shields/dispelling.

### Magic_School_Alteration.md
- **Path:** `04_MAGIC_PILLARS\Magic_School_Alteration.md`
- **Summary:** Severity Pillar school using Focus. Matter manipulation including transformation, transmutation, and physical changes. Associated Prima Materia: Uranium.
- **Key Concepts:** Alteration (matter manipulation), Severity Pillar, Focus, Uranium Prima, transformation/transmutation.

### Magic_School_Conjuration.md
- **Path:** `04_MAGIC_PILLARS\Magic_School_Conjuration.md`
- **Summary:** Severity Pillar school using Focus. Summoning creatures, creating portals, and teleportation. Associated Prima Materia: Mercury.
- **Key Concepts:** Conjuration (summoning/portals), Severity Pillar, Focus, Mercury Prima, teleportation.

### Magic_School_Dissolution.md
- **Path:** `04_MAGIC_PILLARS\Magic_School_Dissolution.md`
- **Summary:** Balance Pillar school using Flow + Focus. Life, death, and soul magic including necromancy and soul manipulation. Associated Prima Materia: Plutonium.
- **Key Concepts:** Dissolution (life/death/soul magic), Balance Pillar, Flow + Focus, Plutonium Prima, necromancy.

### Magic_School_Divination.md
- **Path:** `04_MAGIC_PILLARS\Magic_School_Divination.md`
- **Summary:** Balance Pillar school using Flow + Focus. Information gathering including mind reading, scrying, and time manipulation. Associated Prima Materia: Neptunium.
- **Key Concepts:** Divination (information/time), Balance Pillar, Flow + Focus, Neptunium Prima, scrying/precognition.

### Magic_School_Enchantment.md
- **Path:** `04_MAGIC_PILLARS\Magic_School_Enchantment.md`
- **Summary:** Mercy Pillar school using Flow. Mind control, charm, and influence magic. Associated Prima Materia: Copper.
- **Key Concepts:** Enchantment (mind control), Mercy Pillar, Flow, Copper Prima, charm/domination.

### Magic_School_Force.md
- **Path:** `04_MAGIC_PILLARS\Magic_School_Force.md`
- **Summary:** Severity Pillar school using Focus. Raw energy manipulation and direct damage magic. Associated Prima Materia: Iron.
- **Key Concepts:** Force (energy/damage), Severity Pillar, Focus, Iron Prima, telekinesis/energy blasts.

### Magic_School_Fortune.md
- **Path:** `04_MAGIC_PILLARS\Magic_School_Fortune.md`
- **Summary:** Mercy Pillar school using Flow. Luck manipulation, buffs, and magical imbuement of items. Associated Prima Materia: Lead.
- **Key Concepts:** Fortune (luck/buffs), Mercy Pillar, Flow, Lead Prima, imbuement/probability manipulation.

### Magic_School_Illusion.md
- **Path:** `04_MAGIC_PILLARS\Magic_School_Illusion.md`
- **Summary:** Balance Pillar school using Flow + Focus. Sensory deception including visual, auditory, and tactile illusions. Associated Prima Materia: Silver.
- **Key Concepts:** Illusion (sensory deception), Balance Pillar, Flow + Focus, Silver Prima, phantasms/glamours.

### Magic_School_Restoration.md
- **Path:** `04_MAGIC_PILLARS\Magic_School_Restoration.md`
- **Summary:** Mercy Pillar school using Flow. Healing, regeneration, and biological growth magic. Associated Prima Materia: Tin.
- **Key Concepts:** Restoration (healing/growth), Mercy Pillar, Flow, Tin Prima, regeneration/purification.

### Mana_System.md
- **Path:** `04_MAGIC_PILLARS\Mana_System.md`
- **Summary:** Each mana point adds +1 to casting rolls. Channel limit equals overall spellcasting level. Mana is a KRMA sub-currency spent during casting. Mana recovery mechanics tied to rest and meditation.
- **Key Concepts:** Mana points (+1 per point), channel limit = spellcasting level, KRMA sub-currency, mana recovery.

### Monkey_Paw_System.md
- **Path:** `04_MAGIC_PILLARS\Monkey_Paw_System.md`
- **Summary:** Consequence system for Wild Casting failures. Effects include inverse results, misdirected spells, and unintended side effects. Terminal assists with determining appropriate consequences. Severity scales with spell power.
- **Key Concepts:** Wild casting failure consequences, inverse/misdirected effects, Terminal assistance, severity scaling, narrative consequences.

### Prima_Materia_System.md
- **Path:** `04_MAGIC_PILLARS\Prima_Materia_System.md`
- **Summary:** Crystallized magic artifacts rated levels 1-10 (d20 to auto-success). Each magic school has an associated Prima Materia element. Stable vs unstable variants. Philosopher Stones are ultimate combined artifacts.
- **Key Concepts:** Prima Materia levels 1-10, crystallized magic, school associations (10 elements), stable/unstable variants, Philosopher Stones.

### Three_Pillars_Overview.md
- **Path:** `04_MAGIC_PILLARS\Three_Pillars_Overview.md`
- **Summary:** Overview of the three magic pillars. Mercy (Flow): Enchantment, Restoration, Fortune. Severity (Focus): Force, Alteration, Conjuration. Balance (Flow + Focus): Illusion, Dissolution, Abjuration, Divination. Ten schools total across three pillars.
- **Key Concepts:** Mercy Pillar (3 schools, Flow), Severity Pillar (3 schools, Focus), Balance Pillar (4 schools, Flow + Focus), 10 magic schools total.

---

## 05_COMBAT_STRUCTURE (8 files)

### Attack_Resolution_Mechanics.md
- **Path:** `05_COMBAT_STRUCTURE\Attack_Resolution_Mechanics.md`
- **Summary:** Two attack types: Defended (direct contest between attacker and defender) and Undefended (auto-success against unaware/helpless targets). Range penalties double per range category. Combat skill level determines attacks per round (1-4).
- **Key Concepts:** Defended vs Undefended attacks, range doubling penalties, combat skill multipliers (1-4 attacks), direct contest resolution.

### Combat_Hit_Locations.md
- **Path:** `05_COMBAT_STRUCTURE\Combat_Hit_Locations.md`
- **Summary:** Four hit locations with DR modifiers: Head (+2 DR), Torso (+0), Arms (-1 DR), Legs (-1 DR). Each location has specific condition effects when damaged. Head hits can be lethal.
- **Key Concepts:** Hit locations (Head/Torso/Arms/Legs), DR modifiers per location, condition effects by location, lethal head hits.

### Damage_Calculation_System.md
- **Path:** `05_COMBAT_STRUCTURE\Damage_Calculation_System.md`
- **Summary:** Damage is fixed (not rolled), determined by weapon and material. Damage targets specific attributes. Armor layer flow: Heavy -> Light -> Cloth -> Body. Each layer absorbs damage before passing remainder.
- **Key Concepts:** Fixed damage (no damage rolls), target attribute specification, armor layer flow, damage absorption sequence.

### Damage_Type_Interactions.md
- **Path:** `05_COMBAT_STRUCTURE\Damage_Type_Interactions.md`
- **Summary:** Detailed interactions between 7 damage types and Soft/Hard/Body material categories. Each damage type has unique effects on different material types. Condition degradation rules vary by type. 3x resistance = overwhelming damage.
- **Key Concepts:** 7 damage types vs 3 material categories, type-specific interactions, condition degradation rules, overwhelming damage (3x resist).

### Damage_Types_and_Effects.md
- **Path:** `05_COMBAT_STRUCTURE\Damage_Types_and_Effects.md`
- **Summary:** Resolution order follows P:S:H/D\C:B:E format. Material modifier overrides can change damage type interactions. Massive damage rule for single devastating hits.
- **Key Concepts:** P:S:H/D\C:B:E resolution order, material modifier overrides, massive damage rule.

### Movement_and_Positioning.md
- **Path:** `05_COMBAT_STRUCTURE\Movement_and_Positioning.md`
- **Summary:** Narrative-based positioning system rather than grid-based. Range categories determine attack difficulty. Flanking, cover, and environmental factors provide mechanical modifiers.
- **Key Concepts:** Narrative positioning, range categories, flanking bonuses, cover mechanics, environmental modifiers.

### Special_Combat_Actions.md
- **Path:** `05_COMBAT_STRUCTURE\Special_Combat_Actions.md`
- **Summary:** Special actions beyond standard attacks: grappling, called shots, coup de grace, disarming, and sundering (destroying equipment). Each has specific rules and DR requirements.
- **Key Concepts:** Grappling, called shots, coup de grace, disarming, sundering, special action DRs.

### Turn_Structure_and_Action_Economy.md
- **Path:** `05_COMBAT_STRUCTURE\Turn_Structure_and_Action_Economy.md`
- **Summary:** Three-phase combat: Intention (declare actions), Resolution (execute and roll), Impact (apply results). Actions Per Pillar (APT) system: each pillar (Body/Soul/Spirit) provides separate action pools calculated as MAX(1+mod, mod+ROUNDDOWN(attribute_sum/25)).
- **Key Concepts:** Three phases (Intention/Resolution/Impact), Actions Per Pillar (APT), separate Body/Soul/Spirit action pools, APT formula.

---

## 06_META_SYSTEMS (5 files)

### Godheads_System.md
- **Path:** `06_META_SYSTEMS\Godheads_System.md`
- **Summary:** Evolved player characters or AI entities with Terminal access. Can modify reality within KRMA constraints. Responsible for system maintenance, cosmic balance, and providing opportunities/resistance for GROvines.
- **Key Concepts:** Godhead role, Terminal access, reality modification, KRMA constraints, system maintenance, cosmic balance.

### KRMA_System.md
- **Path:** `06_META_SYSTEMS\KRMA_System.md`
- **Summary:** Meta-currency for the entire GROWTH ecosystem. Earning rate ~156/year. KV (Karmic Value) measures power level of creations; KRMA is the spendable currency. Death recovery costs KRMA. SECRET: Eventually converts to real ownership stake.
- **Key Concepts:** KRMA meta-currency, KV vs KRMA distinction, ~156/year earning rate, death recovery costs, SECRET: ownership stake model, SECRET: crypto integration planned.

### Lady_Death_Protocols.md
- **Path:** `06_META_SYSTEMS\Lady_Death_Protocols.md`
- **Summary:** Death arbiter entity. Collects Frequency pools from dead characters. If forced to kill (system override), Lady Death is instantly deleted. Succession mechanics: killer inherits the role. SECRET: Represents founder's exit strategy.
- **Key Concepts:** Lady Death (death arbiter), Frequency pool collection, forced kill = instant deletion, succession mechanics, SECRET: founder exit strategy, SECRET: platform inheritance.

### Soul_Package_System.md
- **Path:** `06_META_SYSTEMS\Soul_Package_System.md`
- **Summary:** What survives character death: half Soul attributes + all Spirit attributes. Used for reincarnation mechanics. Carries character identity across lives. SECRET: Functions as persistent IP with royalty earnings.
- **Key Concepts:** Soul Package contents (half Soul + all Spirit), reincarnation mechanics, identity persistence, SECRET: IP royalties, SECRET: trainable ML agents.

### Terminal_Interface.md
- **Path:** `06_META_SYSTEMS\Terminal_Interface.md`
- **Summary:** The highest consciousness in the GROWTH hierarchy. Manages reality, enforces rules, provides the GM interface. Integrates with LLMs for adjudication. All system-level operations flow through the Terminal.
- **Key Concepts:** Terminal (highest consciousness), reality management, GM interface, LLM integration, system-level operations, rule enforcement.

---

## 07_REFERENCE_TABLES (12 files)

### Branches_Examples.md
- **Path:** `07_REFERENCE_TABLES\Branches_Examples.md`
- **Summary:** Single example of a Mercenary branch with associated skills, attribute modifications, and KV cost.
- **Key Concepts:** Branch example, Mercenary archetype, skill/attribute allocation.

### Character_Sheet_Audit_Summary.md
- **Path:** `07_REFERENCE_TABLES\Character_Sheet_Audit_Summary.md`
- **Status:** #validated
- **Summary:** Findings from the legacy Google Sheets character sheet audit. Identifies formula bugs, missing validations, and implementation priorities for the digital character sheet.
- **Key Concepts:** Sheet audit findings, skill dice mapping bugs, carry capacity formula issues, depletion state tracking gaps, Nectar/Thorn limit enforcement.

### Complete_Materials_Reference.md
- **Path:** `07_REFERENCE_TABLES\Complete_Materials_Reference.md`
- **Summary:** Comprehensive materials table organized by tech level from Primitive through Impossible. Lists Resist values, types (Soft/Hard), weight, rarity, and all modifiers for dozens of materials.
- **Key Concepts:** Full materials database, tech level progression, material properties (Resist/Type/Weight/Rarity/Mods), primitive through impossible tiers.

### Condition_Effects_Reference.md
- **Path:** `07_REFERENCE_TABLES\Condition_Effects_Reference.md`
- **Summary:** Reference table for all condition effects: Monkey Paw severity levels, physical conditions, hit location injuries, and environmental/magical conditions.
- **Key Concepts:** Monkey Paw severity table, physical conditions, hit location injuries, environmental conditions, magical conditions.

### Creature_Classifications.md
- **Path:** `07_REFERENCE_TABLES\Creature_Classifications.md`
- **Summary:** Creature difficulty scale from DR 2 (small animals) to DR 200+ (Ein Sof/cosmic entities). Defines stat block components for creatures and NPCs.
- **Key Concepts:** Creature DR scale (2-200+), stat block components, encounter difficulty guidelines, creature categories.

### KRMA_Costs_Table.md
- **Path:** `07_REFERENCE_TABLES\KRMA_Costs_Table.md`
- **Summary:** Reference table for KRMA costs: rerolls, language acquisition, skill advancement, attribute enhancement, character creation costs, and other system expenditures.
- **Key Concepts:** KRMA cost tables, reroll costs, skill advancement costs, attribute enhancement costs, character creation budget.

### Roots_Examples.md
- **Path:** `07_REFERENCE_TABLES\Roots_Examples.md`
- **Summary:** Single example of a Warrior's Childhood root with associated skills, attributes, and formative experiences.
- **Key Concepts:** Root example, Warrior's Childhood, childhood skill/attribute allocation.

### Seeds_Examples.md
- **Path:** `07_REFERENCE_TABLES\Seeds_Examples.md`
- **Summary:** Single Cambion seed example with full stat block including base attributes, Fate Die, lifespan, features, and KV cost.
- **Key Concepts:** Seed example, Cambion species, full stat block template.

### Spell_Strength_Levels.md
- **Path:** `07_REFERENCE_TABLES\Spell_Strength_Levels.md`
- **Summary:** Spell power levels 1-10 from Insignificant to Godly. DR ranges from 1 to 90+. Authority thresholds define when Terminal oversight activates. Higher levels require more mana and have greater consequences.
- **Key Concepts:** Spell levels 1-10, DR ranges per level, authority thresholds, Terminal oversight triggers, mana scaling.

### Starting_Skills_Module.md
- **Path:** `07_REFERENCE_TABLES\Starting_Skills_Module.md`
- **Status:** #validated
- **Summary:** Example skill names organized by category: Athletics, Social, Martial Arts, Sciences, Arts, Perception, and more. Serves as inspiration for freeform skill naming.
- **Key Concepts:** Skill name examples, category organization (Athletics/Social/Martial Arts/Sciences/Arts/Perception), freeform naming guidance.

### Terminal_Difficulty_Colors.md
- **Path:** `07_REFERENCE_TABLES\Terminal_Difficulty_Colors.md`
- **Summary:** Color-coded difficulty rating system. Green (DR 8-12, routine), Yellow (DR 13-16, challenging), Red (DR 17-20, dangerous). Used for quick visual communication of check difficulty.
- **Key Concepts:** DR color bands (Green/Yellow/Red), difficulty ranges, visual communication system.

### Weapon_Examples_Table.md
- **Path:** `07_REFERENCE_TABLES\Weapon_Examples_Table.md`
- **Summary:** Weapon classification system with combat skill requirements and damage type reference. Organizes weapons by category with example damage strings.
- **Key Concepts:** Weapon categories, combat skill requirements, damage type reference, example damage strings.

---

## 08_APP_DEVELOPMENT (7 files)

### Attribution_Chain_Technical_Implementation.md
- **Path:** `08_APP_DEVELOPMENT\Attribution_Chain_Technical_Implementation.md`
- **Summary:** Technical spec for content attribution tracking. Content registry with timestamps, creator IDs, content hashes, and influence trees. DAG (Directed Acyclic Graph) for influence calculation. Anti-spam mechanisms. SECRET: Blockchain integration planned.
- **Key Concepts:** Content registry, DAG influence calculation, anti-spam (staking/novelty detection), SECRET: blockchain integration, creator attribution, recursive royalties.

### Character_Sheet_JSON_Schema.md
- **Path:** `08_APP_DEVELOPMENT\Character_Sheet_JSON_Schema.md`
- **Summary:** Complete JSON structure for character data storage. Defines modifier objects, nested attribute structures, skill entries, inventory items, and API endpoint specifications.
- **Key Concepts:** Character JSON schema, modifier objects, API endpoints, data validation structure, nested attribute/skill/inventory models.

### Design_Philosophy_and_Visual_Guidelines.md
- **Path:** `08_APP_DEVELOPMENT\Design_Philosophy_and_Visual_Guidelines.md`
- **Summary:** Visual design principles following the fractal three-pillar structure. Color theory, typography hierarchy (Consolas/Bebas Neue/Inknut Antiqua/Roboto/Comfortaa), and logo implementation guidelines.
- **Key Concepts:** Fractal design philosophy, pillar colors (Body=Red, Soul=Purple, Spirit=Blue, Terminal=Teal, KRMA=Gold), typography hierarchy, visual modes, logo implementation.

### Dice_Rolling_API.md
- **Path:** `08_APP_DEVELOPMENT\Dice_Rolling_API.md`
- **Summary:** API specifications for dice rolling endpoints: basic rolls, combat rolls, magic rolls, and death saves. JSON request/response formats for all roll types.
- **Key Concepts:** Dice API endpoints, basic/combat/magic/death roll types, JSON request/response formats, server-side rolling.

### Oracle_Scribe_System.md
- **Path:** `08_APP_DEVELOPMENT\Oracle_Scribe_System.md`
- **Summary:** AI co-GM system with audio processing pipeline. Classifies speech as In-Character (IC), Murky Mirror (MM), or Out-of-Character (OOC). Privacy framework with local-first defaults.
- **Key Concepts:** Oracle Scribe (AI co-GM), audio processing, IC/MM/OOC classification, privacy framework, local-first architecture.

### Oracle_Technical_Architecture.md
- **Path:** `08_APP_DEVELOPMENT\Oracle_Technical_Architecture.md`
- **Summary:** Detailed system architecture for the Oracle including pipeline implementation, data models, API specifications, and deployment considerations.
- **Key Concepts:** Oracle architecture diagram, pipeline implementation, data models, API specs, Edge Listener, Co-GM Service.

### Research_Needed_Items.md
- **Path:** `08_APP_DEVELOPMENT\Research_Needed_Items.md`
- **Summary:** Outstanding research items: Tech Level formulas (how tech affects gameplay), Wealth Level details (purchase mechanics), and Carry Capacity formula (Clout to Carry Level mapping).
- **Key Concepts:** Open research items, Tech Level formula gaps, Wealth Level mechanics gaps, Carry Capacity formula undefined.

---

## 09_EXAMPLES_LIBRARY (6 files)

### Branches_Reference_Examples.md
- **Path:** `09_EXAMPLES_LIBRARY\Branches_Reference_Examples.md`
- **Summary:** 10 detailed branch examples with KV costs, skill allocations, attribute modifications, and special abilities for adult life paths.
- **Key Concepts:** 10 branch archetypes, KV costs per branch, skill/attribute examples, special abilities, adult life path templates.

### Character_Creation_Example_Cambion_Mercenary.md
- **Path:** `09_EXAMPLES_LIBRARY\Character_Creation_Example_Cambion_Mercenary.md`
- **Summary:** Step-by-step character creation walkthrough using the Seeds/Roots/Branches system. Creates a Cambion Mercenary character from species selection through final stat calculations.
- **Key Concepts:** Full creation walkthrough, Cambion Seed, Mercenary Branch, stat accumulation example, KV budget tracking.

### Character_Creation_Example_Human_Scholar.md
- **Path:** `09_EXAMPLES_LIBRARY\Character_Creation_Example_Human_Scholar.md`
- **Summary:** Detailed Human Scholar creation example with full stat calculations at each stage. Demonstrates the creation pipeline with a different archetype than the Cambion example.
- **Key Concepts:** Human Seed example, Scholar archetype, detailed stat calculations, creation pipeline demonstration.

### Combat_Example_Tavern_Brawl.md
- **Path:** `09_EXAMPLES_LIBRARY\Combat_Example_Tavern_Brawl.md`
- **Summary:** Full combat example demonstrating the three-phase turn system, Actions Per Pillar calculation, damage resolution through armor layers, and condition effects.
- **Key Concepts:** Three-phase combat demonstration, APT calculation example, damage resolution walkthrough, armor layer flow example.

### Roots_Reference_Examples.md
- **Path:** `09_EXAMPLES_LIBRARY\Roots_Reference_Examples.md`
- **Summary:** 10 detailed root examples with KV costs, wealth levels, formative skills, attribute modifications, and childhood experiences.
- **Key Concepts:** 10 root archetypes, KV costs per root, wealth level settings, childhood skill/attribute examples.

### Seeds_Reference_Examples.md
- **Path:** `09_EXAMPLES_LIBRARY\Seeds_Reference_Examples.md`
- **Summary:** 7 seed (species) examples: Human (KV 75), Altered Human (KV 150), Elven (KV 90), Dwarven (KV 140), Neo-Human (KV 140), Cambion (KV 70), Argentum Sanguis (KV 189). Each with full base stats and features.
- **Key Concepts:** 7 species examples, KV costs by species, base stat arrays, species features/abilities, GM implementation notes.

---

## X_ARCHIVE_ORIGINS (24 files)

> **WARNING:** These files are NOT canonical GROWTH rules. They contain outdated, contradictory, and incomplete information. Kept temporarily for reference during consolidation. See README_ARCHIVE_WARNING.md.

### README_ARCHIVE_WARNING.md
- **Path:** `X_ARCHIVE_ORIGINS\README_ARCHIVE_WARNING.md`
- **Summary:** Warning notice that archive files are unstable, contain contradictions, and should not be used as source of truth. Files will be deleted once folders 01-09 are validated.
- **Key Concepts:** Archive warning, non-canonical status, deletion plan.

### CHATGPT DAMAGE KNOWLEDGE.md
- **Path:** `X_ARCHIVE_ORIGINS\CHATGPT DAMAGE KNOWLEDGE.md`
- **Summary:** ChatGPT's comprehensive dump of the damage and resistance system. Covers 7 damage types, resist values (1-50), modifier definitions (Dampening/Resistant/Proof/Vulnerable/Intolerant/Neutralizing), damage resolution steps, and attribute interactions.
- **Key Concepts:** Damage system overview, 7 damage types, resist modifiers, damage resolution steps, attribute-based reductions.

### ChatGPT_Project_Memory.md
- **Path:** `X_ARCHIVE_ORIGINS\ChatGPT_Project_Memory.md`
- **Summary:** Extracted ChatGPT project memory covering GROWTH book structure (top-bound reversible), metaphysical system, KRMA economy, Frequency/Soul Packages, Lady Death protocols, LLM agent roles, and validation processes.
- **Key Concepts:** Rulebook physical design (reversible binding), three pillars metaphysics, KRMA crypto plans, LLM agent limitations, persistent knowledge vault concept.

### Claude Damage Knowledge dump.md
- **Path:** `X_ARCHIVE_ORIGINS\Claude Damage Knowledge dump.md`
- **Summary:** Claude's comprehensive damage system documentation. Covers P:S:H/D\C:B:E format, three resistance categories (Soft/Hard/Body), damage-to-attribute natural affinities, layered protection system, and KRMA efficiency for damage targeting.
- **Key Concepts:** Damage string format, damage type interactions per material category, damage-to-attribute affinities (P->Clout, S->Celerity, H->Constitution, D->Focus, C->Willpower, B->Wisdom, E->Wit), layered armor flow.

### Claude Material System Dump.md
- **Path:** `X_ARCHIVE_ORIGINS\Claude Material System Dump.md`
- **Summary:** Extensive material system documentation covering philosophy ("materials are potential, items are purpose"), property framework (Resist/Type/Tech/Rarity/Weight/Mods), fractional KV system, crystallization process, combination rules, custom material creation, and future development.
- **Key Concepts:** Material philosophy, 5 core properties, fractional KV system (all materials < 1 KV), crystallization process, primary/subordinate combination, custom material creation framework.

### Core Rulebook v0.4.4.md
- **Path:** `X_ARCHIVE_ORIGINS\Core Rulebook v0.4.4.md`
- **Summary:** Very large markdown export of the Core Rulebook v0.4.4. Contains Terminal consciousness interface styling, glitch art text, and the full rulebook content. File exceeds 256KB. Opening content shows intentional chaotic/glitch Terminal aesthetic.
- **Key Concepts:** Full rulebook export, Terminal aesthetic, glitch art styling, comprehensive rules (too large to index individually).

### Frequency Burn.md
- **Path:** `X_ARCHIVE_ORIGINS\Frequency Burn.md`
- **Summary:** Frequency Burn mechanics: permanently sacrificing Frequency points to alter reality. Cannot be used after death rolls begin. Attracts Godhead attention. Global 5B burn cap with escalating costs (+10% per 500M burned). Burns recorded in public Burn Ledger.
- **Key Concepts:** Frequency Burn (permanent sacrifice), Godhead attention mechanic, 5B global burn cap, escalating costs, Burn Ledger, Nectar/Thorn consequences.

### GRO.WTH Economic System & KRMA Attribution Model.md
- **Path:** `X_ARCHIVE_ORIGINS\GRO.WTH Economic System & KRMA Attribution Model.md`
- **Summary:** SECRET economic model documentation. GROWTH as "Trojan horse for economic revolution." KRMA as ownership stake. Attribution Chain system with DAG influence calculation. Character death as "equity graduation." Lady Death as founder exit strategy. Seasonal reveal structure (S1-S5).
- **Key Concepts:** SECRET: Post-capitalist creative economy, KRMA as ownership, Attribution Chain (DAG), character death = equity graduation, Lady Death = founder exit, seasonal reveal plan, GM subscription model.

### GROWTH Character Sheets Audit Report.md
- **Path:** `X_ARCHIVE_ORIGINS\GROWTH Character Sheets Audit Report.md`
- **Summary:** Detailed audit of Google Sheets character templates (v0.5 and v1.2). Identifies bugs in skill dice mapping, attribute pool calculations, carry capacity formula, wealth/tech gating, lifespan/Fated Age calculation, Nectar/Thorn limits, and item condition terminology.
- **Key Concepts:** Sheet audit (v0.5/v1.2), skill dice bugs (d10 error at level 8-11), carry capacity formula broken, missing Fated Age field, non-standard condition terms ("Finite"/"Sufficient"), material mod legend missing.

### GROWTH Material and Item Creation Artifact from Google Sheets via Chatgpt.md
- **Path:** `X_ARCHIVE_ORIGINS\GROWTH Material and Item Creation Artifact from Google Sheets via Chatgpt.md`
- **Summary:** Comprehensive item creation guide extracted from Google Sheets data. Step-by-step creation process: define type, select primary material, add subordinate materials, calculate Resist (average), determine Tech Level, apply mods, calculate weight/value. Includes worked examples (Wooden Shield, Stone Axe, Leather Armor, Iron Pickaxe).
- **Key Concepts:** 9-step item creation process, material combination rules, Resist averaging formula, mod inheritance, weight calculation, worked examples with full calculations.

### GROWTH_Metaphysics_and_Patterns.md
- **Path:** `X_ARCHIVE_ORIGINS\GROWTH_Metaphysics_and_Patterns.md`
- **Summary:** Metaphysical structure documentation. Three Pillars as fractal design. Terminal as metaphysical operating system. Duality/paradox as core design principle. Symbol systems and color theory. Reincarnation/True Deletion mechanics. Living system philosophy.
- **Key Concepts:** Fractal pillar design, Terminal as OS, paradox/duality, sacred geometry, symbol systems, color theory, True Deletion mechanics.

### GROWTH_Rule_Synthesis.md
- **Path:** `X_ARCHIVE_ORIGINS\GROWTH_Rule_Synthesis.md`
- **Summary:** Synthesized overview of all major GROWTH systems: Three Pillars, rulebook Flow/Focus split, death/resurrection/Lady Death, KRMA value flow, GM/Player/Agent roles, meta-layer systems, validation authority, karmic death/True Deletion, rituals/fears/habits/goals.
- **Key Concepts:** System synthesis, 10 major system areas, meta-layer mirroring, True Deletion rules, ritual/fear/habit/goal tracking.

### GROvines.md
- **Path:** `X_ARCHIVE_ORIGINS\GROvines.md`
- **Summary:** Confirmed-canon GROvine system documentation. GROWTH = Goals, Resistance, Opportunity, Wealth, Tech, Health. Detailed mechanics for goal declaration, godhead assignment, resistance creation, opportunity delivery, goal resolution, and advanced mechanics (conflicting vines, escalation dynamics, Nectar-to-Frequency conversion).
- **Key Concepts:** GROWTH acronym defined, GROvine lifecycle, godhead investment strategies, resistance/opportunity mechanics, Nectar-to-Frequency conversion, Lady Death integration, seasonal revelation plan.

### KV Judge.md
- **Path:** `X_ARCHIVE_ORIGINS\KV Judge.md`
- **Summary:** Technical specification for an OpenEvolve-based KV (Karmic Value) evaluation system. Uses evolutionary AI loops to balance item specs against target KV values. Includes schema definitions, deterministic KV core algorithm, evaluator specs, and OpenEvolve configuration.
- **Key Concepts:** KV evaluation algorithm, OpenEvolve integration, deterministic scoring, item spec schemas, evolutionary balancing, resistance types, GM knobs.

### LLM_Agent_Behavior_and_Prompts.md
- **Path:** `X_ARCHIVE_ORIGINS\LLM_Agent_Behavior_and_Prompts.md`
- **Summary:** Protocols for LLM behavior within GROWTH. LLMs cannot author rules, only extract/format/validate. Contract-first prompting structure. Authority hierarchy enforcement. Sample prompts for validation, escalation, and extraction tasks.
- **Key Concepts:** LLM role limitations, contract-first prompting, authority hierarchy, validation protocols, escalation examples.

### Material_System_Contradictions_Report.md
- **Path:** `X_ARCHIVE_ORIGINS\Material_System_Contradictions_Report.md`
- **Summary:** Detailed contradiction analysis of the material system. Identifies 8 categories of contradictions: material property inconsistencies (Steel/Leather/Wood values), armor calculation errors, tech level format inconsistencies, weight category issues, modifier definition vagueness, weapon system integration gaps, economic system vagueness, and processing/enhancement gaps.
- **Key Concepts:** Steel value contradictions, armor layering math errors, Brittle vs Fragile undefined, Flexible X undefined, material-to-damage formula missing, KV transformation formula missing.

### Skilled vs Unskilled Checks -- Change Spec (v0.1).md
- **Path:** `X_ARCHIVE_ORIGINS\Skilled vs Unskilled Checks — Change Spec (v0.1).md`
- **Summary:** Design spec for revised check system. Skilled checks now roll SD first, then choose Effort, then roll FD (information-before-spend). Unskilled checks wager Effort blind before rolling. Step-0 locking prevents boon stacking after SD reveal. New Skill Die ladder: Untrained/Novice(d4)/Adept(d6)/Expert(d8)/Master(d10)/Legend(d12).
- **Key Concepts:** Revised check flow (SD -> Effort -> FD), information-before-spend design, Step-0 locking, new Skill Die ladder (d4-d12), depletion state interactions, worked examples.

### VERY OLD MAGIC BOOK from original alpha version.md
- **Path:** `X_ARCHIVE_ORIGINS\VERY OLD MAGIC BOOK from original alpha version.md`
- **Summary:** Original alpha-version magic system document. Defines Aether Weavers, Aether as "veins of existence," Spell Weaving vs Wild Casting concepts, and veil mechanics. Historical design document showing early magic system concepts.
- **Key Concepts:** Original magic concepts, Aether Weavers, Spell Weaving/Wild Casting origins, veil thickness, early system design.

### attribute depletions.md
- **Path:** `X_ARCHIVE_ORIGINS\attribute depletions.md`
- **Summary:** Complete list of all 9 attribute depletion effects with updated definitions. Notably includes finalized effects for previously-TBD attributes: Overwhelmed (recovery suppressed), Incoherent (no skills), Confused (no color hints, must wager effort upfront).
- **Key Concepts:** All 9 depletion effects finalized, Overwhelmed (recovery suppressed), Incoherent (no skills), Confused (no color hints + upfront effort).

### chatgptGROWTHdump.md
- **Path:** `X_ARCHIVE_ORIGINS\chatgptGROWTHdump.md`
- **Summary:** Massive ChatGPT knowledge base dump covering all GROWTH systems. Introduces the game as blending magic and technology, spanning multiple eras. Covers character creation (Seeds/Roots/Branches), meta-narrative elements, and comprehensive rules overview.
- **Key Concepts:** Comprehensive system overview, magic-technology blend, multi-era setting, character creation process, meta-narrative design.

### compass_artifact_wf-022ea623-0c93-4446-a62d-bf3438f6292f_text_markdown.md
- **Path:** `X_ARCHIVE_ORIGINS\compass_artifact_wf-022ea623-0c93-4446-a62d-bf3438f6292f_text_markdown.md`
- **Summary:** Compass artifact content extraction report. Lists successfully accessed documents (Book of Magic, GM's Book, GROWTH Overview, Terminal Lost History, Working Design Doc, Design Key, Combat Cheat Sheet, Meta-Agent Architecture docs) and inaccessible large files (Core Rulebook versions).
- **Key Concepts:** Archive extraction report, document inventory, accessibility status, source document list.

### cryptic style guide.md
- **Path:** `X_ARCHIVE_ORIGINS\cryptic style guide.md`
- **Summary:** GROWTH design color system with Kabbalistic Tree of Life associations. Maps pillar colors to Sephiroth: Body Red (Binah/Geburah/Hod), Soul Purple (Daath/Tiphareth/Yesod), Spirit Blue (Chokmah/Chesed/Netzach). Terminal colors: Teal/Black hierarchy.
- **Key Concepts:** Kabbalistic color mapping, Sephiroth associations, pillar color gradients (3 shades each), Terminal color hierarchy (Teal/Black 1/2/3), Gold = KRMA/completion.

### groth oracle description.md
- **Path:** `X_ARCHIVE_ORIGINS\groth oracle description.md`
- **Summary:** Technical architecture brief for the Oracle Scribe (AI co-GM). Covers user roles/modes (IC/MM/OOC), system architecture (Edge Listener, Co-GM Service, Campaign Store), audio-to-event pipeline, Murky Mirror reframing, retcon/undo stack, data models, API surface, privacy/consent framework, and UI elements.
- **Key Concepts:** Oracle Scribe architecture, IC/MM/OOC classification, audio pipeline (VAD->ASR->Diarization->Classification), Murky Mirror reframing, retcon stack, privacy profiles (Local-Only/Co-op Cloud/Streamer), CRDT-based sync.

### skill_system_design_session.md
- **Path:** `X_ARCHIVE_ORIGINS\skill_system_design_session.md`
- **Summary:** Design session exploring universal skill categorization. Lists original 12 GROWTH Beta categories (Athletics through Greater Knowledge). Key discovery: "Context Over Categories" -- the system should prioritize contextual skill application over rigid categorization.
- **Key Concepts:** Skill categorization exploration, 12 original Beta categories, "Context Over Categories" design principle, universal skill system design.

---

## Quick Reference: Key Game Mechanics

| Mechanic | Location | Core Formula/Rule |
|----------|----------|-------------------|
| Skill Check (Skilled) | 01_CORE_RULES | SD + FD + Effort vs DR |
| Skill Check (Unskilled) | 01_CORE_RULES | FD + Effort vs DR |
| Actions Per Pillar | 05_COMBAT_STRUCTURE | MAX(1+mod, mod+ROUNDDOWN(sum/25)) |
| Damage Format | 03_ITEMS_CRAFTING | P:S:H/D\C:B:E |
| Material Combination | 03_ITEMS_CRAFTING | Average Resist of components |
| Armor Multipliers | 03_ITEMS_CRAFTING | Cloth 0.5x, Light 1x, Heavy 1.5x |
| Nectar/Thorn Limit | 02_CHARACTER_CREATION | Max = Fate Die value |
| Carry Level | 03_ITEMS_CRAFTING | = Clout attribute |
| Magic (Wild Cast) | 04_MAGIC_PILLARS | FD + School Level vs DR |
| Magic (Woven Spell) | 04_MAGIC_PILLARS | FD + School + Skill vs DR |
| Death Save | 01_CORE_RULES | Fate Die + Health Level |
| Mana Bonus | 04_MAGIC_PILLARS | +1 per mana point spent |

## Quick Reference: Three Pillars of Magic

| Pillar | Attribute | Schools | Prima Materia |
|--------|-----------|---------|---------------|
| Mercy | Flow | Enchantment, Restoration, Fortune | Copper, Tin, Lead |
| Severity | Focus | Force, Alteration, Conjuration | Iron, Uranium, Mercury |
| Balance | Flow + Focus | Illusion, Dissolution, Abjuration, Divination | Silver, Plutonium, Gold, Neptunium |

## Quick Reference: 3x3 Attribute Matrix

| Pillar | Physical | Mystical | Mental |
|--------|----------|----------|--------|
| Body | Clout | Celerity | Constitution |
| Soul | Focus | Frequency | Flow |
| Spirit | Willpower | Wisdom | Wit |

## File Statistics

| Folder | File Count | Status |
|--------|-----------|--------|
| Root Level | 5 | Mixed |
| 01_CORE_RULES | 8 | Active |
| 02_CHARACTER_CREATION | 6 | Active (1 #validated) |
| 03_ITEMS_CRAFTING | 5 | Active |
| 04_MAGIC_PILLARS | 18 | Active |
| 05_COMBAT_STRUCTURE | 8 | Active |
| 06_META_SYSTEMS | 5 | Active (contains SECRET content) |
| 07_REFERENCE_TABLES | 12 | Active (2 #validated) |
| 08_APP_DEVELOPMENT | 7 | Active |
| 09_EXAMPLES_LIBRARY | 6 | Active |
| X_ARCHIVE_ORIGINS | 24 | Deprecated (not canonical) |
| **Total** | **92** | |
