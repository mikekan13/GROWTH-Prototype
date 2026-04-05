# Entity Creation System — Build Plan

**Created:** 2026-04-04
**Driver:** Entity creation defines what needs KRMA evaluation. Each step produces blueprints that Kai prices.
**Scope:** Full creation flow for PCs, NPCs, Creatures, God-heads — all in Tapestry tab.

---

## Architecture Overview

```
Tapestry Tab
  └── Entities sub-tab (GM: full CRUD, Player: view own)
        ├── Entity List (all campaign entities by type)
        ├── Create Entity flow (stepped wizard)
        │     └── Each step → blueprint authored → Kai evaluates → KRMA locked
        └── Entity Detail (goals, resistance, custodians)

Canvas Toolbox
  └── "Place Entity" (picks from existing entities, not creation)

God-head Integration
  └── Kai evaluates each blueprint as it's authored
  └── Custodian assigned when goals are set
  └── Lady Death monitors fated age
```

### Entity Types
- **PLAYER_CHARACTER** — Created by player via application → approval → builder
- **NPC** — Created by GM in Tapestry (AI-assisted for speed)
- **CREATURE** — Created by GM (simplified: may skip backstory/skills)
- **GODHEAD** — Admin-only (seeded via script, not player-created)

### KRMA Flow During Creation
- GM has a campaign KRMA pool (funded from Terminal reserve)
- Each blueprint authored during creation costs KRMA from that pool
- Kai evaluates: Seed KV + Branch KV + Skill KV + Trait KV + WTH KV = Total Entity KV
- Entity KV is "locked" (crystallized) on the entity — this is what the entity is "worth"
- Higher-power entities cost more KRMA to create → GM pool constrains inflation
- The 48 reference Seeds have pre-calculated KV values (CSV) → baseline for Kai

---

## Build Sessions

### Session A: Seed Catalog + Tapestry Entities Tab
**Goal:** Seeds exist as a browsable/selectable catalog. Tapestry has an Entities sub-tab.

1. **Seed type definition** (`types/growth.ts`)
   - `GrowthSeed` interface: name, description, baseFateDie, baseAttributes (9 attrs), baseFrequency, healthLevel, baseResist, baseSkills, baseNectars, baseThorns, seedKV
   - Parse the 48-seed CSV into a typed catalog (`lib/seed-catalog.ts`)

2. **Tapestry Entities sub-tab** (`components/tapestry/EntitiesPanel.tsx`)
   - List all campaign entities grouped by type (PC / NPC / Creature)
   - Show: name, entityType, status, seed name, TKV, active goals count
   - GM: "Create Entity" button → opens creation wizard
   - Player: sees own character(s) only

3. **Wire into TapestryTab** — add 'entities' to sub-tabs

**Dependencies:** None — pure UI + data modeling
**KRMA integration:** None yet (just catalog)

---

### Session B: Creation Wizard Steps 1-3 (Identity + Seed + Root)
**Goal:** GM can start creating an entity with identity, seed selection, and root.

1. **Step 1: Identity**
   - Name (required)
   - Entity type: NPC / Creature (PC comes from application flow)
   - Background description (text, AI-expandable)
   - Age, fated age (Lady Death's domain — optional, GM or AI sets)

2. **Step 2: Seed Selection**
   - Browse seed catalog (search, filter by fate die, sort by KV)
   - Select existing seed → base stats auto-populated
   - OR "Author New Seed" → Kai evaluates → added to global catalog
   - Display: seed KV cost, what attributes/skills it provides
   - AI assist: "Describe the entity concept" → AI suggests matching seeds

3. **Step 3: Root + Branches**
   - Root: name + description (narrative origin)
   - Branches: add 1-3, each with name + description
   - Each branch is a blueprint → Kai evaluates branch KV
   - AI assist: given seed + background, AI suggests roots/branches

**KRMA integration:** Seed KV shown (reference). Branch KV evaluated by Kai (first real evaluation point).

---

### Session C: Creation Wizard Steps 4-5 (Attributes + WTH)
**Goal:** Attribute allocation from seed budget, WTH level selection.

1. **Step 4: Attributes**
   - Seed provides base attribute levels (from catalog)
   - GM can adjust within budget (total attribute points = seed allocation)
   - Frequency set by seed (special, not player-allocated)
   - Live KV display updates as attributes change
   - Visual: 3-column pillar layout (Body/Spirit/Soul) matching canvas card

2. **Step 5: WTH Levels**
   - Wealth, Tech, Health — each 1-10
   - Seed provides base levels
   - GM can adjust (each level has escalating KRMA cost from WTH_COSTS table)
   - Live KV display

**KRMA integration:** Deterministic KV — existing evaluator handles this. No AI needed.

---

### Session D: Creation Wizard Steps 6-7 (Skills + Traits)
**Goal:** Skill and trait authorship with Kai evaluation.

1. **Step 6: Skills**
   - Seed provides base skills (from catalog)
   - GM can add/modify skills
   - Each skill is a ForgeItem blueprint → Kai evaluates
   - Skill governors (which attributes govern the skill) affect KV
   - AI assist: "This entity is a warrior" → AI suggests skill set
   - Skills pulled from global catalog OR authored new

2. **Step 7: Traits (Nectars + Thorns)**
   - Seed provides base nectars/thorns
   - GM can add/modify
   - Each trait is a ForgeItem blueprint → Kai evaluates
   - Thorns reduce KV (they're negative), nectars increase KV
   - Fate die determines max permanent traits (d4=4, d6=6, etc.)
   - Pulled from global catalog OR authored new

**KRMA integration:** Full Kai evaluation per skill/trait. This is where the council router starts to matter — skills/traits may need domain routing.

---

### Session E: Creation Wizard Steps 8-9 (Goals + Review/Crystallize)
**Goal:** Goal establishment and final entity crystallization.

1. **Step 8: Goals (GRO.vines)**
   - GM sets 1-5 initial goals for the entity
   - Each goal → custodian auto-assigned (existing service)
   - For PCs: player proposes goals, GM approves
   - AI assist: given backstory + seed + traits → AI suggests goals

2. **Step 9: Review + Crystallize**
   - Full entity summary with complete KV breakdown by pillar
   - Total KRMA cost shown (sum of all blueprint KVs)
   - GM confirms → KRMA deducted from campaign pool → entity crystallized
   - Entity appears in Entities list, available to "Place" on canvas
   - Changelog entry created
   - God-head custodians notified of new entity + goals

**KRMA integration:** Crystallization uses existing `krma/crystallization.ts`. Campaign wallet debited.

---

### Session F: AI-Assisted NPC Speed Creation
**Goal:** GM describes an NPC in natural language → AI fills in the whole sheet.

1. **"Quick Create" mode** in the wizard
   - GM types: "A grizzled dwarven blacksmith who secretly worships the old gods"
   - AI (Claude) generates: seed suggestion, attributes, skills, traits, goals, backstory
   - GM reviews each step (pre-filled, editable)
   - Kai evaluates the whole package
   - GM confirms → crystallized

2. **This reuses all the same steps** — just pre-fills them via AI

**KRMA integration:** Same as manual — AI suggestions still go through Kai.

---

### Session G: Canvas "Place Entity" + PC Application → Creation Bridge
**Goal:** Wire it all together.

1. **Canvas toolbox refactor**
   - "Add Character" → "Place Entity"
   - Opens picker: shows entities NOT yet on canvas
   - Select → entity appears on canvas at KRMA line

2. **PC creation bridge**
   - Application approved → player enters CharacterBuilder
   - CharacterBuilder refactored to use same Tapestry wizard steps
   - Player picks seed, allocates attributes, proposes goals
   - GM reviews → crystallizes

3. **Entity deletion/retirement**
   - Remove from canvas ≠ delete entity (just hides from spatial view)
   - Retire entity → Lady Death processes → KRMA split

---

## What Gets Built Per Session (Summary)

| Session | New Files | KRMA Wiring | AI Needed |
|---------|-----------|-------------|-----------|
| A | seed-catalog.ts, EntitiesPanel.tsx | None | No |
| B | EntityCreationWizard.tsx (steps 1-3), seed-browser UI | Seed KV display | Claude (suggestions) |
| C | Wizard steps 4-5 | Deterministic KV calc | No |
| D | Wizard steps 6-7, Kai blueprint eval | Kai evaluates skills/traits | Claude (Kai + suggestions) |
| E | Wizard steps 8-9, crystallization flow | Full crystallization | Claude (custodian assignment) |
| F | Quick create mode | Same as manual | Claude (full entity generation) |
| G | Canvas place-entity, PC bridge | Same | No |

---

## Key Decisions Needed From Mike

1. **Seed catalog source of truth:** Load 48 seeds from CSV into code as constants? Or into DB as ForgeItems (global, type: 'seed')? DB allows GM-authored seeds to join the catalog.

2. **Branch KV:** How much does a branch cost? Flat rate? Or does branch content affect KV? (e.g., a branch that grants a skill boost costs more)

3. **Creature simplification:** Creatures skip backstory/goals? Or do all entities go through the same steps? (Universal sheet says yes, but creatures might not need GRO.vines)

4. **PC creation authority:** Does the GM set the PC's seed, or does the player choose from the catalog? Who has final say on attribute allocation?

5. **Abandon KRMA cost:** What percentage of entity KV is lost when a goal is abandoned? Flat rate or proportional?

---

## Relationship to God-Head Architecture Plan

This entity creation plan replaces Sessions 3-4 of the original God-head build plan (Goal CRUD + Custodian + Opportunity). The goal system is built INTO entity creation rather than as a separate phase.

The remaining God-head phases (Blueprint Tagger → Kai Evaluator → Council Router → Lady Death) are built INTO the creation wizard sessions as needed:
- **Kai Evaluator** → built in Session D (skill/trait evaluation)
- **Blueprint Tagger** → built in Session D (relationship tagging during authorship)
- **Council Router** → built in Session D-E (routing requests to appropriate God-head)
- **Lady Death** → built in Session G (entity retirement/death processing)

This is more organic than building each God-head system in isolation.
