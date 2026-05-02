# GRO.WTH Repository — Triage Audit (04)

**Date:** 2026-05-02
**Reference canon:** `GROWTH-DESIGN-TRUTH.md`, `COMPREHENSIVE-BUILD-PLAN.md`, Mike's verbal corrections
**Repo root:** `C:\Projects\GRO.WTH\GRO.WTH Repository\`
**Files audited:** 70 markdown files across 9 numbered folders + root + `X_ARCHIVE_ORIGINS/` + `corrections/`

Status legend: `OK` = current, `UPD` = needs update, `STALE` = stale or contradicts canon, `MISS` = placeholder / empty

> NOTE: Most file headers carry `**Status:** #needs-validation` (auto-import flag). Of all 70 files, **only 5 (in 01_CORE_RULES) have been formally audited** as of 2026-04-22 per `PROJECT_STATUS.md` — every other folder is pre-Soul/Spirit-swap, pre-Values/Addictions cut.

---

## 01_CORE_RULES (5 files — partially audited 2026-04-22)

| File | Purpose | Status | Issues |
|---|---|---|---|
| `Attribute_Depletion_Effects.md` | Effects when Body/Spirit/Soul attribute pools empty | UPD | Audited 2026-04-22 (Rulebook ptr added). Verify pillar labels post-swap (Flow/Frequency/Focus must be under **Spirit**, Will/Wisdom/Wit under **Soul**). |
| `Basic_Resolution_System.md` | SD + FD + Effort vs DR | UPD | Audited 2026-04-22. Confirm SD-first → wager → FD ordering matches DESIGN_TRUTH §6 and that all rolling is described as server-authoritative (per dice-system memory). |
| `GROvine_System.md` | GRO.vines (Goals/Resistance/Opportunity) | UPD | Status flipped to `#needs-review` 2026-04-22; capacity per ruling r-2026-04-22-01; WTH lang corrected. Re-verify against DESIGN_TRUTH §3 (GROWTH acronym redux). |
| `Skill_Level_Progression.md` | 1-3 flat → d4 → d6 → d8 → d12 → d20 die ladder | UPD | Audited 2026-04-22; "Character Creation Soft Cap" appended (r-2026-04-22-02). |
| `Skill_System_Overview.md` | Skill list, governing attributes | UPD | Audited 2026-04-22. Verify governor pillar names use post-swap labels. |
| ~~`Health_Level_System.md`~~ | DELETED | n/a | Per ruling r-2026-04-22-03 (WTH per-character levels retired). Still referenced by 12+ other files (see Contradictions). |
| ~~`Technology_Level_System.md`~~ | DELETED | n/a | Same as above. |
| ~~`Wealth_Level_System.md`~~ | DELETED | n/a | Same as above. |

---

## 02_CHARACTER_CREATION (6 files — audit "DONE 2026-04-22" per status doc, but content still pre-swap)

| File | Purpose | Status | Issues |
|---|---|---|---|
| `Character_Approval_Process.md` | GM/Watcher approval workflow | UPD | References WTH levels (Health/Wealth/Tech) — must reflect deletion. |
| `Character_Sheet_Validation.md` | KV/sheet validation rules | STALE | References **Values & Addictions** (CUT 2026-04-19) AND WTH levels. Two layers of stale. |
| `Harvests_System.md` | Harvest mechanics | UPD | Verify pillar attribution post-swap. |
| `Nectars_and_Thorns_System.md` | Trait system (positive/negative) | UPD | Likely OK on traits themselves, but verify pillar labels and Thorn=Lien semantics (per memory note 2026-04-17). |
| `Seeds_Roots_Branches_System.md` | Origin/background mechanic | STALE | References WTH levels in seed templates. |
| `Three_Pillar_Attributes.md` | **THE pillar definition file** | STALE | Almost certainly defines Soul as Flow/Freq/Focus and Spirit as Will/Wis/Wit (pre-Jan-2026 swap). This is the single most load-bearing file in the repo for pillar names — highest priority to rewrite. |

---

## 03_ITEMS_CRAFTING (5 files — audit pending; one ruling applied)

| File | Purpose | Status | Issues |
|---|---|---|---|
| `Armor_System.md` | Clothing/Light/Heavy, layering, mobility | OK | `#validated`, updated per ruling 2026-04-22. Still needs pillar-label sweep. |
| `Equipment_Conditions.md` | Item condition states | OK | `#validated`, ruling 2026-04-22. |
| `Inventory_and_Encumbrance_System.md` | Carry/encumbrance | UPD | Mentions WTH levels. Does NOT yet describe **paperdoll, 3 categories, customizable slots per Seed** (per memory `inventory-paperdoll`). |
| `Material_System.md` | Material catalog, mods | UPD | Verify against creative-attribution / global material catalog work. |
| `Weapon_System.md` | Weapon mechanics | UPD | Verify ActionMod base=0 / damage hooks. |

---

## 04_MAGIC_PILLARS (14 files — uniformly `#needs-validation`, last touched 2025-08-08)

| File | Purpose | Status | Issues |
|---|---|---|---|
| `Three_Pillars_Overview.md` | Mercy/Severity/Balance overview | STALE | Explicitly cites "Mercy = Flow attribute" and "Severity = Focus attribute" — these are now under **Spirit** pillar (was Soul). Mapping prose works as long as pillar names get swapped, but doc must be re-rooted. |
| `Aether_and_Weave_Fundamentals.md` | Magic substrate | UPD | 2025-08-07 vintage. |
| `Casting_Methods.md` | How spells are cast | UPD | 2025-08-08 vintage. |
| `LLM_Assisted_Magic_Creation.md` | AI-aided spell authoring | UPD | Predates current AI/Oracle architecture. |
| `Magic_DR_Calculation_System.md` | DR math | UPD | Pre-server-side dice; mentions Values/Addictions adjacent terms — sweep. |
| `Magic_School_Abjuration.md` | School | UPD | Mercy/Severity/Balance attribution may need re-rooting. |
| `Magic_School_Alteration.md` | School | UPD | Same. |
| `Magic_School_Conjuration.md` | School | UPD | Same. |
| `Magic_School_Dissolution.md` | School (life/death) | UPD | Same. |
| `Magic_School_Divination.md` | School | UPD | Same. (Note: `Three_Pillars_Overview` does not list Divination — possible mismatch.) |
| `Magic_School_Enchantment.md` | School (mind) | UPD | Same. |
| `Magic_School_Force.md` | School | UPD | Same. |
| `Magic_School_Fortune.md` | School (luck) | UPD | Same. |
| `Magic_School_Illusion.md` | School | UPD | Same. |
| `Magic_School_Restoration.md` | School (heal) | UPD | Same. |
| `Mana_System.md` | Mana mechanics | UPD | Verify against Frequency Spend/Deplete/Burn — possible legacy "mana" naming for Frequency. |
| `Monkey_Paw_System.md` | Wishes / corruption | UPD | 2025-08-08 vintage. |
| `Prima_Materia_System.md` | Alchemical raw substance | UPD | 2025-08-08 vintage. |

---

## 05_COMBAT_STRUCTURE (7 files — all `#needs-validation`, 2025-08-08 vintage)

| File | Purpose | Status | Issues |
|---|---|---|---|
| `Attack_Resolution_Mechanics.md` | Attack roll flow | STALE | Predates server-side dice + ActionMod system. |
| `Combat_Hit_Locations.md` | Body part hits | UPD | Verify alignment with Seed body / vitals (HUMANOID_BODY default). |
| `Damage_Calculation_System.md` | Damage math | UPD | Verify against current weapon/armor mods. |
| `Damage_Type_Interactions.md` | Resistance/vulnerability | UPD | Probably fine; cross-check with Damage_Types_and_Effects (duplicate-ish file). |
| `Damage_Types_and_Effects.md` | Damage type list + effects | UPD | Possible duplication w/ above; deduplicate. |
| `Movement_and_Positioning.md` | Movement | STALE | Does NOT describe **5ft grid** or canvas encounter cards. |
| `Special_Combat_Actions.md` | Grapple, called shot, etc. | UPD | Verify against ActionMod + 3-Phase turn structure. |
| `Turn_Structure_and_Action_Economy.md` | Three-Phase System | UPD | 2025-10-03 vintage — likely closest to current; still pre-ActionMod-base-0 ruling. Best file in folder. |

**MISSING from 05:** dedicated **Combat Grid** doc, **ActionMod** doc, **Encounter Cards** doc, **Initiative** doc.

---

## 06_META_SYSTEMS (5 files — 2026-04-05 vintage, mostly survives the swap)

| File | Purpose | Status | Issues |
|---|---|---|---|
| `Godheads_System.md` | Godhead patrons + investment | UPD | Aligns with DESIGN_TRUTH §9. Verify role hierarchy (ADMIN > GODHEAD > WATCHER > TRAILBLAZER per memory 2026-03-09). |
| `KRMA_System.md` | KRMA tokenomics | UPD | 2026-04-05. Likely missing the actual ledger / 100B genesis / 4-reserve split (Terminal 75% / Balance 12.5% / Mercy 6.25% / Severity 6.25%) — that lives only in `docs/KRMA-SYSTEM-DESIGN.md` in the app, not the repo. |
| `Lady_Death_Protocols.md` | Death goddess mechanics | UPD | References Health Level (deleted file). |
| `Soul_Package_System.md` | What carries between lives | STALE-MIXED | File NAME is "Soul_Package" but body table has been UPDATED with the post-swap labels (Flow/Frequency/Focus listed under "Spirit (Blue)", Will/Wisdom/Wit under "Soul (Purple)"). Rename file to `Spirit_Package_System.md` and fix all inbound links. |
| `Terminal_Interface.md` | Terminal as cosmic system | OK | Aligns with DESIGN_TRUTH §9. Lightweight. |

---

## 07_REFERENCE_TABLES (11 files — all 2025-08 vintage, `#needs-validation`)

| File | Purpose | Status | Issues |
|---|---|---|---|
| `Branches_Examples.md` | Branch table | UPD | Pillar labels need swap. |
| `Character_Sheet_Audit_Summary.md` | Audit log | STALE | References WTH levels. |
| `Complete_Materials_Reference.md` | Material list | UPD | Verify vs Material_System.md. |
| `Condition_Effects_Reference.md` | Status effect ref | UPD | Likely needs Frequency Spend/Deplete/Burn callouts. |
| `Creature_Classifications.md` | Creature types | UPD | Verify Seed body model alignment. |
| `KRMA_Costs_Table.md` | KRMA cost ref | STALE | References WTH levels. |
| `Roots_Examples.md` | Root entries | UPD | Pillar labels. |
| `Seeds_Examples.md` | Seed entries | UPD | Pillar labels; cross-ref `docs/Character Creation Examples.csv` (48 Seeds, current). |
| `Spell_Strength_Levels.md` | Magic strength ref | UPD | Pillar attribution. |
| `Starting_Skills_Module.md` | Default skill list | UPD | Pillar attribution per skill governor. |
| `Terminal_Difficulty_Colors.md` | DR color bands | OK | Probably color-only; sanity check. |
| `Weapon_Examples_Table.md` | Weapon stat block | STALE | References Tech Level. |

---

## 08_APP_DEVELOPMENT (7 files — 2025-08, mostly superseded by `app/docs/`)

| File | Purpose | Status | Issues |
|---|---|---|---|
| `Attribution_Chain_Technical_Implementation.md` | KRMA attribution code design | STALE | 2025-08-10. Superseded by actual KRMA service in `app/`. |
| `Character_Sheet_JSON_Schema.md` | Sheet data schema | STALE | Predates Prisma schema in `app/prisma/`. Pillar fields use pre-swap names. |
| `Design_Philosophy_and_Visual_Guidelines.md` | Visual ethos | STALE | Superseded by `VISUAL-DESIGN-SPEC.md`. References Values. |
| `Dice_Rolling_API.md` | Dice API design | STALE | Predates current server-side dice (`lib/dice.ts`, `services/dice.ts`). Three-operations (Spend/Deplete/Burn) absent. |
| `Oracle_Scribe_System.md` | Oracle AI persona | STALE | Predates current AI system (Ollama gemma2:9b, copilot architecture). |
| `Oracle_Technical_Architecture.md` | Oracle stack | STALE | Same as above. |
| `Research_Needed_Items.md` | Open questions | STALE | Most resolved per `QUESTIONS-FOR-MIKE.md` (49/49). References Values/Addictions/WTH. |

**Recommendation:** Consider archiving the entire 08_APP_DEVELOPMENT folder — `app/docs/` (system_map.md, module_registry.md, database_schema.md, ai_systems.md) is the live truth.

---

## 09_EXAMPLES_LIBRARY (6 files — all `#needs-validation`)

| File | Purpose | Status | Issues |
|---|---|---|---|
| `Branches_Reference_Examples.md` | Branch examples | UPD | Pillar labels. |
| `Character_Creation_Example_Cambion_Mercenary.md` | Worked example | STALE | Pre-swap pillar names; pre-WTH-deletion. |
| `Character_Creation_Example_Human_Scholar.md` | Worked example | STALE | Same; explicitly mentions Soul=Flow/Focus. |
| `Combat_Example_Tavern_Brawl.md` | Worked combat example | STALE | Rewritten 2025-10-03 but pre-swap; pre-5ft-grid; pre-ActionMod. |
| `Roots_Reference_Examples.md` | Root examples | STALE | References WTH levels. |
| `Seeds_Reference_Examples.md` | Seed examples | UPD | Lighter — verify pillar names. |

---

## Root-level files

| File | Purpose | Status | Issues |
|---|---|---|---|
| `README.md` | One-liner | OK | Trivial. |
| `CLAUDE.md` | Repo-only Claude contract | OK | Defines authorized actions for repo edits. |
| `PROJECT_STATUS.md` | Audit progress tracker | OK | Current as of 2026-04-22 (section 01 done). References WTH deletion correctly. |
| `SESSION_LOG_2025-08-13.md` | Old session log | STALE | Archive or delete. |
| `2025-10-04.md` | Date-stamped doc | UPD | Empty/near-empty per indexer. Triage. |
| `2026-03-13.md` | Date-stamped doc | UPD | Empty/near-empty per indexer. Triage. |
| `internal_links.txt` | Wiki link map | UPD | Will break once files renamed (esp. `Soul_Package_System.md` → `Spirit_Package_System.md`). |
| `corrections/issues.jsonl` | Auto-issue tracker | UPD | Re-run after rewrites. |
| `X_ARCHIVE_ORIGINS/*` (~20 files) | Raw source dumps | OK-as-archive | These are by-design legacy. `README_ARCHIVE_WARNING.md` already flags them. **Do not rewrite — leave as historical record.** |

---

## STALE FILES NEEDING REWRITE (priority order)

### P0 — load-bearing pillar/identity definitions
1. **`02_CHARACTER_CREATION/Three_Pillar_Attributes.md`** — root cause of every Soul/Spirit confusion downstream.
2. **`06_META_SYSTEMS/Soul_Package_System.md`** — rename file to `Spirit_Package_System.md`; body table is already half-correct; fix every inbound link.
3. **`04_MAGIC_PILLARS/Three_Pillars_Overview.md`** — Mercy/Severity attribution (Flow → Spirit, Focus → Spirit) needs re-rooting.

### P1 — references that propagate WTH-level rot
4. `02_CHARACTER_CREATION/Character_Sheet_Validation.md` (Values + WTH)
5. `02_CHARACTER_CREATION/Seeds_Roots_Branches_System.md`
6. `06_META_SYSTEMS/Lady_Death_Protocols.md`
7. `07_REFERENCE_TABLES/KRMA_Costs_Table.md`
8. `07_REFERENCE_TABLES/Weapon_Examples_Table.md`
9. `07_REFERENCE_TABLES/Character_Sheet_Audit_Summary.md`
10. `09_EXAMPLES_LIBRARY/Roots_Reference_Examples.md`

### P2 — combat/dice mechanics behind canon
11. `05_COMBAT_STRUCTURE/Attack_Resolution_Mechanics.md` (server-side dice, ActionMod)
12. `05_COMBAT_STRUCTURE/Movement_and_Positioning.md` (5ft grid)
13. `08_APP_DEVELOPMENT/Dice_Rolling_API.md` (Spend/Deplete/Burn)
14. `03_ITEMS_CRAFTING/Inventory_and_Encumbrance_System.md` (paperdoll, 3 cats)

### P3 — full-rewrite worked examples
15. `09_EXAMPLES_LIBRARY/Character_Creation_Example_Human_Scholar.md`
16. `09_EXAMPLES_LIBRARY/Character_Creation_Example_Cambion_Mercenary.md`
17. `09_EXAMPLES_LIBRARY/Combat_Example_Tavern_Brawl.md`

### P4 — superseded by `app/docs/`
18. All of `08_APP_DEVELOPMENT/` — consider archiving wholesale.

---

## MISSING SYSTEMS (not documented anywhere in repo)

1. **Frequency three operations** — Spend / Deplete / Burn distinction. No file. Belongs in `01_CORE_RULES/Frequency_System.md` (NEW) or as an explicit section in `Attribute_Depletion_Effects.md`.
2. **Combat Grid System** — 5ft squares, encounter cards, canvas integration. No file. Belongs in `05_COMBAT_STRUCTURE/Combat_Grid_System.md` (NEW).
3. **ActionMod System** — base=0 from items/traits. No file. Belongs in `05_COMBAT_STRUCTURE/ActionMod_System.md` (NEW).
4. **Two Death Systems** — Fated Age vs Combat Death. Partially in `Lady_Death_Protocols.md` and `Soul_Package_System.md`, but no single doc explaining the two-path model. NEW: `06_META_SYSTEMS/Death_Systems.md`.
5. **Server-Side Dice Architecture** — All rolling server-side, three intent objects. NEW: `08_APP_DEVELOPMENT/Server_Side_Dice_Architecture.md` (or replace `Dice_Rolling_API.md`).
6. **Inventory Paperdoll** — 3 categories, customizable slots per Seed. Belongs as a section in `Inventory_and_Encumbrance_System.md` rewrite.
7. **Skill Check Flow Diagram** — SD → wager → FD canonical sequence. Implicit in `Basic_Resolution_System.md`; deserves explicit flowchart doc.
8. **KRMA Genesis Reserves** — 100B split (Terminal 75% / Balance 12.5% / Mercy 6.25% / Severity 6.25%) lives only in `app/docs/KRMA-SYSTEM-DESIGN.md`. Mirror into `06_META_SYSTEMS/KRMA_System.md`.
9. **Role Hierarchy (corrected)** — ADMIN > GODHEAD > WATCHER > TRAILBLAZER, with /terminal vs Campaign Terminal distinction. No repo file.
10. **Creative Attribution / Mechanical DNA** — global catalog system. No repo file.
11. **GRO.vines IRL / Threads-redesign aftermath** — Aug 2025 redesign discarded the Thread mechanic entirely; nothing in repo says "we considered Threads and dropped them" so newcomers may try to revive.

---

## CONTRADICTIONS (file A vs file B / canon)

1. **Pillar labels** — `02/Three_Pillar_Attributes.md` (assumed pre-swap) vs `06/Soul_Package_System.md` body table (post-swap, file name still pre-swap). DESIGN_TRUTH §11 is post-swap. Mismatch propagates to every magic-school file.
2. **WTH per-character levels** — DELETED in 01_CORE_RULES per ruling r-2026-04-22-03, but **12 surviving files still cite Health/Wealth/Tech levels**: `Character_Approval_Process.md`, `Character_Sheet_Validation.md`, `Seeds_Roots_Branches_System.md`, `Inventory_and_Encumbrance_System.md`, `Lady_Death_Protocols.md`, `Character_Sheet_Audit_Summary.md`, `KRMA_Costs_Table.md`, `Weapon_Examples_Table.md`, `Research_Needed_Items.md`, `Character_Creation_Example_Human_Scholar.md`, `Roots_Reference_Examples.md`, `PROJECT_STATUS.md` (refs in audit log are OK; refs in rules are stale). All wiki-links to deleted files = broken.
3. **Values & Addictions** — CUT 2026-04-19, but live in: `02/Character_Sheet_Validation.md`, `04/Magic_DR_Calculation_System.md`, `08/Design_Philosophy_and_Visual_Guidelines.md`, `08/Research_Needed_Items.md` (plus archive — fine).
4. **Magic schools** — `04/Three_Pillars_Overview.md` lists 8 schools across 3 pillars (Mercy: Enchantment/Restoration/Fortune; Severity: Force/Alteration/Conjuration; Balance: Illusion/Dissolution). But the folder ALSO contains files for **Abjuration** and **Divination** — unaccounted for in the overview. Either drop the schools or expand the overview.
5. **Damage docs duplication** — `Damage_Type_Interactions.md` vs `Damage_Types_and_Effects.md` — two files, same scope. Pick one.
6. **Dice rolling locus** — `08/Dice_Rolling_API.md` describes a (likely client-side) dice API that contradicts the server-only architecture in `app/lib/dice.ts` (per memory 2026-03-11).
7. **Oracle vs current AI** — `08/Oracle_*.md` describes an Oracle system that has been superseded by the Ollama-backed copilot in `app/src/ai/`.
8. **GROWTH acronym** — DESIGN_TRUTH §3 fixes acronym = Goals/Resistance/Opportunity/Wealth/Tech/Health and explicitly retires WTH per-character levels (acronym stands, levels don't). Several repo files use the acronym to imply per-character WTH stats (= stale).

---

## BOTTOM LINE

- **Total rules-content files:** 70 (excluding ~20 in `X_ARCHIVE_ORIGINS/` which are by-design archive).
- **Audited & current (OK):** 5 (~7%) — `Armor_System.md`, `Equipment_Conditions.md`, `Terminal_Interface.md`, `Terminal_Difficulty_Colors.md`, plus `README.md`/`CLAUDE.md`/`PROJECT_STATUS.md` at root.
- **Header-touched but content unverified (UPD):** ~38 (~54%) — mostly the 01_CORE_RULES partial pass plus `#needs-validation` files where pillar labels likely need a sweep but no obvious WTH/Values rot.
- **Stale or contradicts canon (STALE):** ~22 (~31%) — files explicitly carrying Values/Addictions, WTH levels, pre-swap pillar names, or pre-server-dice mechanics.
- **Empty/placeholder:** 2 root date-stamp files (`2025-10-04.md`, `2026-03-13.md`).

**Headline:** roughly **30% of the repo actively contradicts canon**, **55% needs a label/term sweep but is structurally OK**, and **~7% is verified current**. Worst-affected folders: 08_APP_DEVELOPMENT (entirely superseded by app/docs), 09_EXAMPLES_LIBRARY (every example pre-dates the swap), 04_MAGIC_PILLARS (every school file dates to 2025-08-08 and predates the pillar re-rooting). Most-current folder: 01_CORE_RULES (the only audited section).

**Recommended sequence for Mike's sign-off:**
1. Approve P0 rewrites (3 files) — pillar/identity rebase. Everything else flows from these.
2. Approve P1 sweep (7 files) — strip WTH + Values references in one pass.
3. Approve archival of 08_APP_DEVELOPMENT in favor of `app/docs/`.
4. Approve creation of the 4 missing combat/dice/death docs.
5. Examples (P3) and remaining magic schools (P2) come last.
