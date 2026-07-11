# CANON_INDEX.md

**Status:** #validated
**Source:** Master index of the GRO.WTH Repository. Generated 2026-05-23 after the full canon-finishing pass.
**Security:** PUBLIC
**Last Updated:** 2026-05-23

---

# GRO.WTH Repository — Canon Index

A one-line summary of every canonical document, grouped by section. Use this file as the entry point when navigating the repo. Each link goes to a `#validated` (or near-validated) source of truth.

When two files disagree, the **most recent `#validated` file wins**. If neither is validated, escalate to Mike.

## Locked canon dates (most recent first)

- **2026-05-23** — Repository completion pass: Death Engine, Spirit Package, Body Composition, Creature Size, GM Subscription, Burn formula, ActionMod, Combat Grid, Inventory Paperdoll, magic schools, Prima Materia, rulebook headers, this index, CANON_INDEX. Triggered by Mike's "finish it" directive.
- **2026-05-20** — Frequency excluded from Spirit action count. CharacterCard math.
- **2026-05-19** — Big resolution session: Burn formula locked; Death = transformation (GHOST status); Body composition (parts-as-items); Creature size (numeric); Subscription drip; Trait pillar tag required; Item quality tier names; Email provider Resend; Brevity-Thorn struck; no hard content counts.
- **2026-05-14** — Inventory canon corrections (Soft/Hard only, rarity 1-10, weight lbs, baseResist 1-50).
- **2026-05-08** — Seed KV formulas locked.
- **2026-05-06** — Frequency hoarding clarified (philosophical, not mechanical).
- **2026-05-04** — Beta scope locked; Fears removed from active scope.
- **2026-05-02** — Pillar colors canonical (Body=Red, Spirit=Purple, Soul=Blue).
- **2026-04-22** — Equipment Conditions, armor layering, age-to-KV at 5 KRMA/year.
- **2026-04-19** — Values/Addictions CUT.
- **2026-04-05** — Wealth/Tech/Health REMOVED.
- **2026-Jan** — Soul/Spirit pillar SWAP (Spirit = Flow/Frequency/Focus; Soul = Willpower/Wisdom/Wit).

---

## 01_CORE_RULES

| File | Purpose |
|---|---|
| [[ActionMod_System]] | Per-character timing modifier. Emergent from items + traits only. Stacks additively. |
| [[Attribute_Depletion_Effects]] | The 9 depletion states (Weak / Clumsy / Exhausted / Muted / Death's Door / Deafened / Overwhelmed / Confused / Incoherent). |
| [[Basic_Resolution_System]] | Core resolution — Skilled vs Unskilled, Effort wagering, DR ladder. |
| [[Body_Composition_System]] | Body parts ARE items in nested containers. Damage cascade (piercing→one, others→even split). Per-seed anatomy. |
| [[Combat_Grid_System]] | 5ft grid, Time Stack initiative, action pools per pillar, movement = Celerity/5 squares. |
| [[Creature_Size_System]] | width × length grid footprint + descriptive height. No categories. Reach + squeeze rules. |
| [[Death_Engine_System]] | Death is transformation to GHOST. Body→GM, Soul halves→Lady Death, max Freq→Lady Death, Spirit kept. |
| [[Frequency_Three_Operations]] | Spend (advancement) / Deplete (damage) / **Burn** (true permanent KRMA removal at 1 max Freq = 1 KRMA with anti-deflationary scaling). |
| [[GROvine_System]] | Goals / Resistance / Opportunity engine. Godhead-investor model; thorns as liens. |
| [[Skill_Level_Progression]] | Levels 1-20. Flat +1/+2/+3 at L1-3. d4 minimum at L4. |
| [[Skill_System_Overview]] | Freeform skill creation; universal dice progression. |

## 02_CHARACTER_CREATION

| File | Purpose |
|---|---|
| [[Character_Approval_Process]] | GM review workflow; fatedAge + baseResist from Seed; WTH retired. |
| [[Character_Sheet_Validation]] | Validation rules for skills, pools, depletion states, conditions, Fate Die trait limit. |
| [[Harvests_System]] | Milestone packages bought with time. Age-to-KV rate ~5 KRMA/year baseline. |
| [[Inventory_Paperdoll]] | 3-tier (Equipped/Carried/Possessions). Equipped IS the [[Body_Composition_System]] tree. No per-region weight caps. |
| [[Nectars_and_Thorns_System]] | Play-defining traits with required `pillar: body\|spirit\|soul` tag. Bearer-agnostic. Thorns are liens. |
| [[Seed_KV_Formulas]] | Per-component KRMA costs locked: aug 1, Freq 1, baseResist 2, Fate Die 5/10/20/40/80, fatedAge ceil(×0.5). |
| [[Seeds_Roots_Branches_System]] | Three-layer creation (Seed → Root → Branch). Levels vs augments distinction. |
| [[Three_Pillar_Attributes]] | The 3×3 matrix. Spirit = Flow/Frequency/Focus (purple). Soul = Willpower/Wisdom/Wit (blue). |

## 03_ITEMS_CRAFTING

| File | Purpose |
|---|---|
| [[Armor_System]] | Clothing / Light / Heavy. Layering 3/1/1 max. Material modifiers. ActionMod -1 on Heavy. |
| [[Equipment_Conditions]] | 5-tier (4 Indestructible → 0 Destroyed). Broken = halved resist. |
| [[Inventory_and_Encumbrance_System]] | Carry Level = Clout. Weight in lbs. Worn equipment exempt from encumbrance penalty. |
| [[Material_System]] | Soft / Hard only (no Hybrid). Base resist 1-50. Rarity 1-10. Material modifiers. |
| [[Weapon_System]] | Fixed damage P:S:H/D\C:B:E. No dice rolls for damage. Skill gating via Martial Arts specializations. |

## 04_MAGIC_PILLARS

| File | Purpose |
|---|---|
| [[Three_Pillars_Overview]] | 3 magic pillars (Mercy / Severity / Balance) holding 10 Schools. |
| [[Aether_and_Weave_Fundamentals]] | Foundational magic theory. |
| [[Casting_Methods]] | Wild Casting (`FD + School Skill` vs DR; fail → Monkey Paw + marks School trainable). Woven Spells (`FD + School + Associated non-magic skill`; no Monkey Paw, no trainable). |
| [[Mana_System]] | Separate pool. +1 per point to casting roll. Channel cap = sum of all 10 School levels. |
| [[Monkey_Paw_System]] | Triggered ONLY on Wild Casting failure. Opposite/corrupted effect on caster/allies/environment. |
| [[Magic_DR_Calculation_System]] | Linear DR scaling; pillar-specific base values. DR 1-9 (Insignificant) through 90+ (Godly). |
| [[LLM_Assisted_Magic_Creation]] | Tooling for spell authoring. |
| [[Prima_Materia_System]] | Artifact-mediated magic. `Nd20` power dice replace skill. No trainable on failure. |
| [[Magic_School_Abjuration]] | Balance pillar. Defensive magic. Gold Prima. |
| [[Magic_School_Alteration]] | Severity. Matter manipulation. Uranium Prima. |
| [[Magic_School_Conjuration]] | Severity. Summoning + portals. Mercury Prima. |
| [[Magic_School_Dissolution]] | Balance. Life/death manipulation. Plutonium Prima. |
| [[Magic_School_Divination]] | Balance. Time + mind-reading. Neptunium Prima. |
| [[Magic_School_Enchantment]] | Mercy. Mind-influence. Copper Prima. |
| [[Magic_School_Force]] | Severity. Energy manipulation. Iron Prima. |
| [[Magic_School_Fortune]] | Mercy. Luck manipulation. Lead Prima. |
| [[Magic_School_Illusion]] | Balance. Reality deception. Silver Prima. |
| [[Magic_School_Restoration]] | Mercy. Healing + growth. Tin Prima. |

## 05_COMBAT_STRUCTURE

| File | Purpose |
|---|---|
| [[Turn_Structure_and_Action_Economy]] | 3-phase combat (Intention / Resolution / Impact). Per-pillar action pools; Frequency EXCLUDED from Spirit. |
| [[Attack_Resolution_Mechanics]] | Attack roll resolution. |
| [[Damage_Calculation_System]] | Damage math + armor reduction. |
| [[Damage_Type_Interactions]] | 7 damage types. Resolution order. Body cascade routing (piercing-to-one vs even split). |
| [[Combat_Hit_Locations]] | Called-shot DR modifiers (+2 Head, +0 Torso, -1 limbs). Superseded for routing by [[Body_Composition_System]]. |
| [[Movement_and_Positioning]] | Movement rules; diagonal = 1; difficult terrain doubles cost. |
| [[Special_Combat_Actions]] | Reach, threatened squares, opportunity attacks. |

## 06_META_SYSTEMS

| File | Purpose |
|---|---|
| [[KRMA_System]] | 100B hard-cap supply. Terminal 75B / Balance 12.5B / Mercy 6.25B / Severity 6.25B reserves. Fluid/Locked/Lien/Burned states. |
| [[Godheads_System]] | 3 seeded Godheads — Kai (Severity, chaos & balance), Eth'erling (Justice, orchestrator), Lady Death/Tara (Mercy, death). |
| [[Lady_Death_Protocols]] | Tara Almswood = Lady Death. Death engine triggers; ghost handoff; Frequency capacity routing. |
| [[Spirit_Package_System]] | What survives a character after [[Death_Engine_System]] fires. The post-transformation character IS the package. |
| [[Spirit_Package_System]] (alias for ghost form) | — |
| [[GM_Subscription_KRMA]] | Lump 15k. Drip 2.5k m1 → 10k m12 peak → 3k m36+ steady. ACTIVE/PAST_DUE/CANCELED/FREE states. |
| [[GM_Flag_Mechanic]] | GM-flagged overpowered blocks trigger Godhead rebalance + KRMA reward to flagger. |
| [[Block_Grading_Principles]] | Kai's evaluator factors synergies + break-risks, not just isolated KV. |
| [[Terminal_Interface]] | The system enforcer / AI co-GM agent's surface area. |

## 07_REFERENCE_TABLES

| File | Purpose |
|---|---|
| [[KRMA_Costs_Table]] | Master KRMA-cost reference for attributes/skills/magic/items/traits. |
| [[Complete_Materials_Reference]] | Material catalog (25+ materials with resist, properties, rarity). |
| [[Branches_Examples]] | Branch authoring exemplars. |
| [[Condition_Effects_Reference]] | All non-depletion conditions. |
| [[Creature_Classifications]] | NPC stat block format. |
| [[Roots_Examples]] | Root authoring exemplars. |
| [[Seeds_Examples]] | Seed authoring exemplars. |
| [[Spell_Strength_Levels]] | 1-10 spell strength ladder. |
| [[Starting_Skills_Module]] | Starter skill library (pillar-tagged). |
| [[Terminal_Difficulty_Colors]] | DR color-code hints (Green/Yellow/Orange/Red/Purple). |
| [[Weapon_Examples_Table]] | Weapon catalog with P:S:H/D\C:B:E damage strings. |
| [[Character_Sheet_Audit_Summary]] | Archive-only — legacy beta sheets. |

## 09_EXAMPLES_LIBRARY

| File | Purpose |
|---|---|
| [[Branches_Reference_Examples]] | Branch design exemplars (extended). |
| [[Character_Creation_Example_Cambion_Mercenary]] | Walk-through: building a Cambion Mercenary. |
| [[Character_Creation_Example_Human_Scholar]] | Walk-through: building a Human Scholar. |
| [[Combat_Example_Tavern_Brawl]] | Combat scenario worked example. |
| [[Roots_Reference_Examples]] | Root design exemplars (extended). |
| [[Seeds_Reference_Examples]] | Seed design exemplars (48 seeds from paper, NOT all balanced for digital — use as inspiration, not import targets). |

## Root-level

| File | Purpose |
|---|---|
| `CLAUDE.md` | Repository contract for Claude Code. No-hallucination rule. Header format. Folder structure. |
| `PROJECT_STATUS.md` | Living project status tracker. |
| `CANON_INDEX.md` | This file. |
| `/rulebook/rulebook.md` | Player-facing distilled rulebook (v0.2.0). |
| `/rulebook/rulings.md` | Append-only log of Mike's design rulings. Source of truth for repo edits. |

---

## Cross-cutting design principles

These appear across many files and are worth knowing as you navigate:

1. **Body / Spirit / Soul** are pillars with destinations at death, not just labels. See [[Death_Engine_System]] for the why.
2. **Items are the universal primitive** — body parts, equipment, inventory items, possessions, body modifications all share one schema ([[Material_System]] + the [[Body_Composition_System]] container chain).
3. **KRMA conservation** — every transaction in GROWTH except Burn is a *transfer*. The KRMA always exists somewhere.
4. **Bearer-agnostic traits** — Nectars/Thorns/Blossoms never reference the bound seed in their mechanical text. They are portable identity, not stat tweaks.
5. **Levels are growth; current is play; augments are gear** — attributes have 3 numbers. Don't conflate them.
6. **Terminal contextual rulings > hard rules** — the engine guarantees deterministic minimums; the Terminal handles narrative geometry.
7. **The Forge chain (Selva → Creator → Kai → Et'herling) is the canonical authoring pipeline** for new content.
8. **Three Frequency operations are distinct** — Spend, Deplete, Burn. The most common bug.

---

## Memory cross-reference

Mike-locked memory entries that align with these files (see `~/.claude/projects/C--Projects-GRO-WTH/memory/`):

- `burn-mechanic-locked-2026-05-19` ↔ [[Frequency_Three_Operations]]
- `death-engine-transformation-2026-05-19` ↔ [[Death_Engine_System]]
- `trait-pillar-field-2026-05-19` ↔ [[Nectars_and_Thorns_System]]
- `body-composition-as-items-2026-05-19` ↔ [[Body_Composition_System]]
- `seed-kv-formulas-locked` ↔ [[Seed_KV_Formulas]]
- `frequency-three-operations` ↔ [[Frequency_Three_Operations]]
- `growth-color-palette` ↔ [[Three_Pillars_Overview]] (post-Jan-2026 swap)
- `non-humanoid-bodies-deferred` ↔ [[Body_Composition_System]] (now built)
- `weight-system-stripped-actual-lbs` ↔ [[Inventory_and_Encumbrance_System]]
- `nectars-thorns-are-play-defining-exploits` ↔ [[Nectars_and_Thorns_System]]
