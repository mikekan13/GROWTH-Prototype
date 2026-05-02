# GRO.WTH Cleanup Audit — 2026-05-02

Synthesis of 5 parallel audits. Detail reports live in `_cleanup_audit/`. Read this top-to-bottom, mark decisions inline, then we execute Phase 3+.

---

## Headline Numbers

| Surface | Files | Healthy | Stale / Needs Work | Action |
|---|---|---|---|---|
| Root docs (md/pdf/csv) | 12 | 4 | 8 | Consolidate into 1 ROADMAP + 1 DESIGN-TRUTH |
| Root stray PNGs | ~30 | 0 | 30 | Move to `_screenshots/` or delete |
| `docs/` subfolder | 30 | most | 3 ephemeral | Light prune |
| `app/` (main Next.js) | 86 routes / 32 models / 28 services | most | 5 partial systems | Healthy. Finish gaps. |
| `GROWTH Character Creator/` (fork) | ~13 unique files | n/a | n/a | Merge back, then delete |
| `standalone/` (old fork) | ~50 files mid-delete | 0 | all | Finish deletion |
| `GRO.WTH Repository/` rules | 70 | 5 (~7%) | 65 | Major rewrite pass with verbal signoff |
| Memory store | 112 | 42 | 70 (41 kill / 18 merge / 11 update) | Prune to ~70, MEMORY.md under 200 lines |

**Bottom line:** The CODE is in much better shape than the DOCS. The repository rules and memory store are the biggest debt. The fork merge is smaller than feared.

---

## Section 1 — Root Docs (`01-root-and-plans.md`)

### KILL after content absorbed
- **`COMPREHENSIVE-BUILD-PLAN.md`** — 2026-03-13 snapshot, says "Phase 3 ~79%" while PLAN.md is in Phase 5. Two months stale. REF-1 mechanics tables → fold into DESIGN-TRUTH.
- **`QUESTIONS-FOR-MIKE.md`** — all 49 decisions resolved. Resolutions → DESIGN-TRUTH.
- **`PORTRAIT-PIPELINE.md`** (root) — assumes 8GB local RTX 4060. Reality is RunPod H100 + FLUX.2 Dev FP16. The current doc is `docs/PORTRAIT-ARCHITECTURE-PLAN.md`.
- **`ENTITY-CREATION-PLAN.md`** → becomes a Phase section in ROADMAP.
- **`GODHEAD-ARCHITECTURE-PLAN.md`** → becomes a Phase section in ROADMAP.
- **`docs/TONIGHT-SESSION-PLAN.md`**, **`docs/NEXT-SESSION-PROMPT.md`**, **`docs/skeleton-systems-report-2026-03-09.md`** — ephemeral, stale.

### KEEP and consolidate
- **`PLAN.md`** → rename to **`ROADMAP.md`**, becomes the One Plan. Absorb the killed plans above.
- **`GROWTH-DESIGN-TRUTH.md`** → stays. Absorb QUESTIONS resolutions + REF-1 mechanics + CLAUDE.md "Critical Design Facts." Fix the lying "Last updated: 2026-03-06" header.
- **`VISUAL-DESIGN-SPEC.md`** → stays. Fix Spirit hex (currently #3EB89A is wrong; should be Purple #7050A8).
- **`CLAUDE.md`** → stays. Fix: pillar hex codes (Spirit purple not teal), "Mike is Godhead" (Mike is ADMIN), MCP claim ("no MCP" but Playwright + SQLite ARE installed), active codebase pointer.
- **`Core Rulebook v0.4.5.pdf`** → stays. Aesthetic reference only.
- **`docs/Character Creation Examples.csv`** → stays. 48 Seeds with stat blocks.

### Contradictions to resolve
1. Pillar hex codes (3 places disagree)
2. "Mike is Godhead" vs "Mike is ADMIN, Godhead is AI agent"
3. Phase status — COMPREHENSIVE says 3, PLAN says 5
4. Active codebase — `app/` vs `GROWTH Character Creator/`
5. Portrait stack — local 4060 vs cloud H100
6. CLAUDE.md "no MCP" vs reality (MCP servers installed)

---

## Section 2 — App Implementation (`02-app-implementation.md`)

### Confirmed complete (✅)
1. **KRMA** — 5 services, 10 routes incl. audit/economy
2. **Server-side dice** — 4 routes + lib/services + 9 client viz components
3. **Auth + access codes** — bcrypt, 7-day sessions, role-based, QR redeem flow
4. **Canvas / Relations Canvas** — 16 components, full card library
5. **Forge with 3-stage authoring chain** — service + 5 routes (per recent commits)

### Partial / blocking beta (🟡 / 🔴)
1. **GodHead agent infrastructure** — 5 models + 3 fresh migrations but only 1 invoke route. Schema-heavy, surface-light. Mid-build.
2. **CharacterTab "submit to Watcher"** — no-op button. Breaks player→GM handoff. **🔴 beta blocker.**
3. **Tapestry / EntityCreationWizard** — 3 TODOs (PC backstory import, campaign context, multi-step generation) + player messaging "coming soon."
4. **Character creation wizard** — primarily lives in the fork. Maturity gap until merge is the biggest unknown.
5. **Combat resolution** — encounter tracker exists, but `types/encounter.ts` has explicit PLACEHOLDERs (Time Stack, environmental effects). Loop not closed.
6. **Goal abandonment KRMA cost loop** — TODO in `services/goal.ts`. `goal-custodian.ts` and `goal-resistance.ts` may be dead code — verify.
7. **Portrait persona-lock** in main app has "stub" comment; real work is in the fork.

### Easy wins
- Drop legacy `Campaign.customPrompts` JSON field after migration
- 0 `.bak`/`.disabled` files. 10 TODO/PLACEHOLDER markers in 7 files. Auth coverage 79/86 routes.

---

## Section 3 — Character Creator Fork (`03-character-creator-fork.md`)

### Smaller than feared — fork is ~90% mirror of main
**Fork-only content (port these):**
- 2 API routes (`portraits/edit`, `portraits/pod`)
- 10 portrait pipeline files in `src/ai/portraits/` (pod-client, pose-generator, ref-enhance, rmbg, growth-style-prompts, growth-style-recipe.json, color-utils, workflow-catalog, assets/front-face.png)
- 9 FLUX.2 ComfyUI workflows (replace main's 5 dead FLUX.1 workflows)
- 3 face-lock components (`FaceCropModal`, `FaceRefinementPanel`, `FrontLockPanel`)
- 1 custom ComfyUI node (`comfyui-average-id-embedding`)
- Docs (`FLUX2-MIGRATION-PLAN.md`, pipeline roadmap, cloud-dev notes)

### Schema delta: ZERO new fork models
Fork is BEHIND main by 2 GodHead migrations. Merge direction is one-way: portrait code into main; do not bring fork's schema. Both apps already share `dev.db`.

### Drifted shared files (3-way merge required)
~10 files including `portrait-service.ts`, `IdentityLockWizard.tsx` (2826 lines, under active edit for Kai mission), `CharacterSheet.tsx`. Save `IdentityLockWizard.tsx` for last.

### Risks
- Don't delete main's PuLID workflows until FLUX.2 face-lock recipe is verified working in main
- Fork code touching `GodHead` model assumes old shape (no `defaultModel`, has `active`) — grep before merge
- MEMORY.md "active codebase" pointer must flip after merge
- Coordinate timing with Kai 5-angle autonomous mission

### Leave behind
Standalone app shells, fork's `package.json`, all `tmp/`, `overnight-results/`, `scripts/_*`, `scripts/test-kai-*`, `scripts/_research/` (~85+ research/test files).

---

## Section 4 — Repository Rules (`04-repository-rules.md`)

**70 markdown files. ~7% current. ~31% actively contradict canon.**

### Top 10 most-broken (priority order)
1. `02_CHARACTER_CREATION/Three_Pillar_Attributes.md` — root cause of every Soul/Spirit confusion
2. `06_META_SYSTEMS/Soul_Package_System.md` — needs rename → Spirit_Package + link fixes
3. `04_MAGIC_PILLARS/Three_Pillars_Overview.md` — Mercy/Severity attribution stale
4. `02_CHARACTER_CREATION/Character_Sheet_Validation.md` — Values + WTH double-stale
5. `02_CHARACTER_CREATION/Seeds_Roots_Branches_System.md` — WTH refs
6. `06_META_SYSTEMS/Lady_Death_Protocols.md` — references deleted Health Level
7. `07_REFERENCE_TABLES/KRMA_Costs_Table.md` — WTH refs
8. `07_REFERENCE_TABLES/Weapon_Examples_Table.md` — Tech Level refs
9. `09_EXAMPLES_LIBRARY/Character_Creation_Example_Human_Scholar.md` — pre-swap example
10. `08_APP_DEVELOPMENT/Dice_Rolling_API.md` — contradicts server-only dice

### Missing systems (must be created)
1. Frequency three-operations (Spend / Deplete / Burn)
2. Combat Grid (5ft squares + encounter cards)
3. ActionMod system (base=0 from items/traits)
4. Two Death Systems (Fated Age vs Combat) — partial
5. Inventory Paperdoll (3 categories, customizable Seed slots)

### Other contradictions
- 12 files reference deleted Health/Wealth/Tech levels (broken wiki-links)
- 4 files reference cut Values/Addictions
- `Three_Pillars_Overview.md` lists 8 magic schools, folder has 10 (Abjuration + Divination unaccounted)
- `Damage_Type_Interactions.md` and `Damage_Types_and_Effects.md` are duplicates
- Entire `08_APP_DEVELOPMENT/` folder superseded by `app/docs/` — archive it

### Recommended sequence (each step needs your verbal signoff per file)
P0: Pillar rebase (3 files)
P1: WTH/Values sweep (7 files)
P2: Archive `08_APP_DEVELOPMENT/`
P3: Create 4 missing-system docs
P4: Examples + magic schools

---

## Section 5 — Memory Store (`memory/_AUDIT.md`)

**112 memory files. Recommended: KILL 41, MERGE 18→7, UPDATE 11, KEEP 42.**

### Kill categories
- All `session-end-*`, `overnight-log-*`, `next-session-*`, `kai-iteration-log` (one-shot context, gone stale)
- All "X COMPLETE" project memories (state now lives in code/git)
- `autonomous-work-mission`, `git-push-blocked`, `identity-lock-session`, `portrait-style-session`, `cloud-speed-fix`

### Merge dupes
- Two `feedback-dont-*-working-code.md` → one
- Two godhead-2026-04-04 files → one
- Two krma-economy index files → one
- All `kai-*` → keep only `kai-iteration-final`

### Keep (durable)
All feedback rules, license-debt knowledge, pillar colors, role hierarchy, dice/KRMA/canvas architecture, portrait recipes (face-lock, PuLID-uploads-only, identity-capture-real-person), UI standards.

### CLAUDE.md fixes triggered by this audit
1. Pillar hex codes (Spirit teal → purple)
2. "Mike is Godhead" → "Mike is ADMIN"
3. "No MCP servers" → list installed (Playwright, SQLite, context-mode)
4. Active codebase pointer (after fork merge)
5. Internal Soul/Spirit inconsistency (text vs hex table)

---

## Decision points (need your input before Phase 3)

### D1 — Order of operations
Default: `3a docs → 3b memory → 3c repo rules → 4 fork merge → 5 ROADMAP`. Object?

### D2 — Repo rules signoff cadence
Two options:
- **(a)** I draft a rewrite of all P0+P1 files (10 files), you review as a batch
- **(b)** One file at a time, verbal signoff per file (slower, safer)

### D3 — Stray PNGs at root
Delete or archive to `_screenshots/`?

### D4 — `standalone/` deletion
Currently 50 files mid-delete in git status. Finish committing the deletion now, or wait until end?

### D5 — Beta scope
You said you'd discuss after I had context. Now I have it. My read of "minimum viable beta":
- Player onboarding (interest → backstory → character → active) — fork merge required
- Character creation wizard — fork merge + finish "submit to Watcher"
- Campaign canvas with KRMA, dice, cards, folders — ✅ done
- Combat resolution — close the Time Stack / environmental loop
- Portrait pipeline — at least Stage 1 face-lock reliable on cloud
- Auth + access codes — ✅ done
- GodHead AI agent — minimal viable (basic invoke, no advanced features)
- Tapestry — Trailblazers tab functional, player messaging working

Does that match your beta line, or are you including more (forge published items, multi-campaign, payment, etc.)?

---

## Files written this audit
- `_cleanup_audit/01-root-and-plans.md`
- `_cleanup_audit/02-app-implementation.md`
- `_cleanup_audit/03-character-creator-fork.md`
- `_cleanup_audit/04-repository-rules.md`
- `~/.claude/projects/C--Projects-GRO-WTH/memory/_AUDIT.md`
- `CLEANUP-AUDIT.md` (this file)

Nothing else has been changed. Awaiting your D1-D5 answers.
