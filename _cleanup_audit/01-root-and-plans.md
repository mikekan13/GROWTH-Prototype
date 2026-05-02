# Root + Plans Audit — GRO.WTH

**Generated:** 2026-05-02
**Scope:** Files at `C:\Projects\GRO.WTH\` root (NOT inside `app/`, `GRO.WTH Repository/`, `GRO.WTH Beta/`, `docs/`, `GROWTH Character Creator/`, `standalone/`, `_cleanup_audit/`). Plus a brief listing of `docs/`.

---

## 1. Root File Inventory

There are **12 content files** at root (md/pdf/csv/txt/json), plus ~30 PNG screenshots that should be moved into a `screenshots/` archive folder (out of root) — they are not part of this audit scope.

| File | Size | Modified | Type | One-line Stated Purpose |
|------|------|----------|------|-------------------------|
| `CLAUDE.md` | 9.4 KB | 2026-03-12 | OTHER (instructions) | "GRO.WTH Project — Claude Code Instructions" — authority hierarchy, critical design facts, tech stack, how to work. The "what to read first" file. |
| `GROWTH-DESIGN-TRUTH.md` | 21.7 KB | 2026-04-05 | DESIGN-TRUTH | "Canonical Design Truth" — synthesized from repo + beta + 512 source cards. Explicitly "DRAFT — needs Mike's review." |
| `VISUAL-DESIGN-SPEC.md` | 15.1 KB | 2026-03-07 | REFERENCE (visual) | Visual language extracted from Core Rulebook v0.4.5 — colors, typography, modes, CSS tokens. |
| `Core Rulebook v0.4.5.pdf` | 89.5 MB | 2026-03-06 | REFERENCE (visual) | The "Bible" — 369 pages, visual+tone source. NOT a rules authority by Mike's instruction. |
| `pages-1-50-summary.md` | 22.5 KB | 2026-03-07 | REFERENCE (visual) | Section-by-section structural map of rulebook pp. 1-50 (Genesis, Pillars, etc.). Companion to the PDF. |
| `pages-51-150-summary.md` | 21.1 KB | 2026-03-07 | REFERENCE (visual) | Same, for pp. 51-150 (Chapter III Playing GROWTH, Terminal Speak, etc.). |
| `PLAN.md` | 54.5 KB | 2026-04-05 | PLAN (forward) | "Build Plan" — append-only session log. "Current phase: Phase 5 (Entity Creation + Forge Authoring)." Most recent forward-looking doc. |
| `COMPREHENSIVE-BUILD-PLAN.md` | 69.3 KB | 2026-03-13 | PLAN (forward) | "v3 — Mike's answers integrated, all questions resolved." Master blueprint. Says app is "~79% complete for Phase 3 (Session Tools)." |
| `QUESTIONS-FOR-MIKE.md` | 35.1 KB | 2026-03-13 | QUESTIONS (resolved) | "Design Decisions Log" — all questions resolved 2026-03-13. Now a decisions archive. |
| `ENTITY-CREATION-PLAN.md` | 9.8 KB | 2026-04-04 | PLAN (forward) | "Entity Creation System — Build Plan." Tapestry tab + Kai evaluator + custodian flow. Sub-plan that overlaps PLAN.md Phase 5. |
| `GODHEAD-ARCHITECTURE-PLAN.md` | 17.4 KB | 2026-04-08 | PLAN (forward) | "God-Head Architecture Build Plan (v2)" — Anthropic Agent SDK substrate, "god-heads never sleep" principle, schema gaps. Most recent plan doc. |
| `PORTRAIT-PIPELINE.md` | 6.5 KB | 2026-03-07 | REFERENCE / PLAN | "Portrait Pipeline — Research & Design." Hardware baseline (RTX 4060 8GB), FLUX.2 stack. Stale — pipeline has moved to RunPod H100 + cloud (per memory). |

### `docs/` subfolder — 30 files (architecture + research, kept in sync with code)

| File | Size | Stated purpose |
|------|------|----------------|
| `system_map.md` | 14.8 KB | Architecture overview / data flow / key systems (referenced by CLAUDE.md as required reading) |
| `module_registry.md` | 23.0 KB | Index of services, components, API routes |
| `database_schema.md` | 18.0 KB | Prisma models + JSON schemas |
| `ai_systems.md` | 13.1 KB | AI system designs and status |
| `KRMA-SYSTEM-DESIGN.md` | 50.3 KB | KRMA ledger design (referenced as canonical) |
| `KRMA-ECONOMY-MATH-MODEL.md` | 11.5 KB | KRMA math model |
| `KRMA-ECONOMY-THEORY.md` | 16.7 KB | KRMA economy theory |
| `KV-PRICING-REFERENCE.md` | 4.4 KB | KV pricing reference table |
| `Character Creation Examples.csv` | 9.8 KB | 48 Seeds with stat blocks (referenced by COMPREHENSIVE-BUILD-PLAN) |
| `DICE-SYSTEM-PLAN.md` | 27.2 KB | Dice system spec (system built, see memory) |
| `PORTRAIT-ARCHITECTURE-PLAN.md` | 30.8 KB | Portrait architecture plan |
| `PRODUCTION-PLAN.md` | 20.3 KB | Production roadmap (overlaps with root PLAN.md) |
| `ECONOMY-DESIGN-SESSION-PLAN.md` | 6.3 KB | Economy session plan |
| `CHARACTER-GENERATION-PIPELINE.md` | 9.7 KB | Char-gen pipeline doc |
| `CHARACTER-GENERATION-UPGRADE-PLAN.md` | 7.0 KB | Char-gen upgrade plan |
| `CHARACTER-CONSISTENCY-RESEARCH.md` | 17.9 KB | Identity-consistency research |
| `3D-CHARACTER-RESEARCH.md` | 25.0 KB | 3D character research |
| `CONTROLNET-ALTERNATIVES-RESEARCH.md` | 10.0 KB | ControlNet research |
| `STYLE-CONSISTENCY-RESEARCH.md` | 15.7 KB | Style consistency research |
| `HAIR-CONTROL-RESEARCH.md` | 30.7 KB | PuLID hair masking research |
| `FLUX-OPTIMAL-SETTINGS.md` | 8.7 KB | FLUX settings reference |
| `FLUX-PROMPTING-REFERENCE.md` | 18.6 KB | FLUX prompting reference |
| `mask-cutoff-solutions.md` | 14.0 KB | Mask cutoff fixes |
| `research-flux-kontext-dev.md` | 23.5 KB | FLUX Kontext Dev research |
| `research-infiniteyou-controlnet.md` | 6.8 KB | InfiniteYou research |
| `research-local-image-gen-2026.md` | 19.5 KB | Local image-gen survey |
| `campaign-terminal-design.md` | 20.1 KB | Campaign terminal design |
| `skeleton-systems-report-2026-03-09.md` | 6.4 KB | Skeleton systems audit (snapshot, stale) |
| `NEXT-SESSION-PROMPT.md` | 4.4 KB | Tactical "what to do next session" prompt |
| `TONIGHT-SESSION-PLAN.md` | 4.5 KB | One-night plan (ephemeral) |

---

## 2. Per-File Recommendation

| File | Action | Rationale |
|------|--------|-----------|
| `CLAUDE.md` | **KEEP + UPDATE** | This is the entry-point file Claude Code reads. Must stay. Needs corrections: (a) "Mike (Godhead)" → "Mike (ADMIN); GODHEAD is the AI agent role" (per memory); (b) Spirit hex `#3EB89A` listed as Spirit but is actually Terminal teal — Spirit should be `#7050A8` per memory. (c) Active codebase note — should mention `GROWTH Character Creator/` is current dev. |
| `GROWTH-DESIGN-TRUTH.md` | **KEEP — promote to canonical** | Self-labeled DRAFT (2026-03-06 / updated 2026-04-05). Already reflects Soul/Spirit swap correctly. Should be locked as the rules-truth doc, with any rule override here trumping the repository. Add a "Cuts" section listing Values/Addictions, Threads (old), Health Level, Wealth Level, Tech Level as removed. |
| `VISUAL-DESIGN-SPEC.md` | **KEEP** | Still authoritative for visual identity. Stable since 2026-03-07. |
| `Core Rulebook v0.4.5.pdf` | **KEEP (move to `reference/`?)** | The Bible. 89.5 MB at root is fine but moving into a `reference/` folder alongside the page-summary mds would tidy root. |
| `pages-1-50-summary.md` | **KEEP (move with PDF)** | Companion to the rulebook. Group with PDF in `reference/`. |
| `pages-51-150-summary.md` | **KEEP (move with PDF)** | Same. Note: only pp. 1-150 are summarized — pp. 151-369 never were. Worth flagging but not blocking cleanup. |
| `PLAN.md` | **MERGE-INTO-ROADMAP** | Most recent forward doc (2026-04-05, "Phase 5"). Append-only session log format makes it the natural spine of a consolidated ROADMAP. |
| `COMPREHENSIVE-BUILD-PLAN.md` | **MERGE-INTO-ROADMAP, then KILL** | 2026-03-13 snapshot. Status table ("~79% Phase 3") is now stale — Phase 5 work has happened. The "REF-1" mechanics tables are valuable and should be moved into `GROWTH-DESIGN-TRUTH.md`. Then archive. |
| `QUESTIONS-FOR-MIKE.md` | **MERGE-INTO-DESIGN-TRUTH, then KILL** | All resolved 2026-03-13. Decisions are reference-level now — fold each resolved decision into `GROWTH-DESIGN-TRUTH.md` so there's one rules-truth file. Archive the original under `_cleanup_audit/archive/` for provenance. |
| `ENTITY-CREATION-PLAN.md` | **MERGE-INTO-ROADMAP** | Sub-plan duplicating PLAN.md Phase 5 work. Carry forward any unfinished items into the consolidated ROADMAP, archive. |
| `GODHEAD-ARCHITECTURE-PLAN.md` | **MERGE-INTO-ROADMAP** | Most recent (2026-04-08), defines the active god-head substrate work. Carry it forward as a phase in ROADMAP; the doc itself can stay as a deep design ref but should not be a separate "plan." |
| `PORTRAIT-PIPELINE.md` | **KILL (or replace)** | Stale — 2026-03-07, says target is "RTX 4060 (8GB VRAM) local during alpha/beta." Reality per memory: cloud H100 RunPod + FLUX.2 Dev FP16 + face-lock pipeline. `docs/PORTRAIT-ARCHITECTURE-PLAN.md` is the actual current portrait doc. Delete this root file or replace with a 5-line pointer to `docs/PORTRAIT-ARCHITECTURE-PLAN.md` + `memory/portrait-*` files. |
| **PNG screenshots (~30 files)** | **MOVE to `screenshots/` or KILL** | Out of scope per audit, but flagging: ~6 MB of dev screenshots from Mar 13 + Apr 19 sit at root. None referenced in any md. Move to `screenshots/_2026-03-13-folder-work/` and `screenshots/_2026-04-19-dice/` or delete. |

---

## 3. Overlap & Contradiction Map

### Overlaps (same content described in multiple files)

| Content | Where it lives | Resolution |
|---------|----------------|------------|
| **Three Pillars + 9 Attributes** | CLAUDE.md (with wrong Spirit hex), GROWTH-DESIGN-TRUTH.md, COMPREHENSIVE-BUILD-PLAN.md REF-1 | Source-of-truth: GROWTH-DESIGN-TRUTH.md. CLAUDE.md should reference, not restate. |
| **Soul/Spirit swap** | CLAUDE.md, GROWTH-DESIGN-TRUTH.md, COMPREHENSIVE-BUILD-PLAN.md | Stated correctly in all three. No contradiction. |
| **Authority hierarchy** | CLAUDE.md ("Mike is Godhead") + memory ("Mike is ADMIN, GODHEAD is AI") | **CONTRADICTION.** Memory note already flags this. Fix in CLAUDE.md. |
| **Pillar colors hex codes** | CLAUDE.md (Spirit=#3EB89A teal), VISUAL-DESIGN-SPEC.md, GROWTH-DESIGN-TRUTH.md (Spirit=blue, Soul=purple) | **CONTRADICTION.** CLAUDE.md has Spirit=teal (wrong — that's Terminal); per memory + DESIGN-TRUTH, Spirit=Blue, Soul=Purple. Fix CLAUDE.md. |
| **What's done / phase status** | PLAN.md ("Phase 5"), COMPREHENSIVE-BUILD-PLAN.md ("Phase 3 ~79%"), `docs/PRODUCTION-PLAN.md` | **CONTRADICTION (stale).** COMPREHENSIVE-BUILD-PLAN snapshot is two months behind. PLAN.md is the latest. ROADMAP must reset the status table from current code reality. |
| **Portrait pipeline** | root PORTRAIT-PIPELINE.md (8GB local), `docs/PORTRAIT-ARCHITECTURE-PLAN.md`, memory cloud pipeline | **CONTRADICTION.** Root file is stale; cloud is real path. Kill the root file. |
| **Active codebase** | CLAUDE.md ("`app/`"), memory ("`GROWTH Character Creator/` port 3001 is active") | **CONTRADICTION.** Memory says merge back to `app/` after cleanup. CLAUDE.md needs an "Active dev" note. |

### Staleness Signals Found

- **PORTRAIT-PIPELINE.md** — assumes RTX 4060/8GB local-only path; memory shows H100 RunPod cloud is the real pipeline (2026-04 onward).
- **COMPREHENSIVE-BUILD-PLAN.md** — "~79% complete for Phase 3"; PLAN.md says we're in Phase 5.
- **QUESTIONS-FOR-MIKE.md** — explicit "all resolved 2026-03-13," kept as a log for 7 weeks.
- **`docs/skeleton-systems-report-2026-03-09.md`** — date in filename; snapshot, almost certainly stale.
- **`docs/TONIGHT-SESSION-PLAN.md` / `docs/NEXT-SESSION-PROMPT.md`** — ephemeral one-night docs (Apr 20) still sitting in `docs/`.
- **GROWTH-DESIGN-TRUTH.md** — labeled "Last updated: 2026-03-06" in body but file mtime is 2026-04-05. The body header is stale; content seems current.
- No file at root mentions Values/Addictions, Threads (old design), Google Sheets, MCP, Health Level, Wealth Level, or Technology Level — those purges are clean at root. (CLAUDE.md correctly lists them as DEAD.)

---

## 4. Synthesis — Where the One Plan Should Live and What It Must Absorb

### Recommendation: create `ROADMAP.md` at root as the single forward-looking plan

**Structure:**

```
ROADMAP.md
├── 0. Reading order (CLAUDE.md → GROWTH-DESIGN-TRUTH.md → ROADMAP.md → docs/system_map.md)
├── 1. Where we are RIGHT NOW (regenerated from code, not from old status tables)
│     - Active codebase: GROWTH Character Creator/ (port 3001), merging back to app/
│     - Active environment: RunPod H100 cloud + local
│     - In-flight: Phase 5 Entity Creation + Forge Authoring + God-Head substrate
├── 2. Phases (consolidated)
│     - Phase 5a: Entity Creation (from ENTITY-CREATION-PLAN.md)
│     - Phase 5b: Forge Authoring Pipeline (from PLAN.md 2026-04-05 entry)
│     - Phase 5c: God-Head Architecture v2 (from GODHEAD-ARCHITECTURE-PLAN.md)
│     - Phase 6: <next, per Mike>
├── 3. Backlog / parking lot
└── 4. Done log (append from PLAN.md sessions)
```

### What ROADMAP.md must absorb (3-5 docs to fold)

1. **PLAN.md** — entire content; this is the spine.
2. **COMPREHENSIVE-BUILD-PLAN.md** — phase breakdown + REF-1 mechanics tables. Mechanics tables go to `GROWTH-DESIGN-TRUTH.md`; phase plans to ROADMAP.
3. **ENTITY-CREATION-PLAN.md** — becomes Phase 5a section.
4. **GODHEAD-ARCHITECTURE-PLAN.md** — becomes Phase 5c section (or stays as deep-design ref doc with ROADMAP linking to it).
5. **`docs/PRODUCTION-PLAN.md`** — overlaps PLAN/Comprehensive. Reconcile and absorb relevant items.

### What `GROWTH-DESIGN-TRUTH.md` must absorb (to be the single rules-truth file)

1. **QUESTIONS-FOR-MIKE.md** — every resolved decision becomes a section in DESIGN-TRUTH (or its appendix).
2. **COMPREHENSIVE-BUILD-PLAN.md "REF-1" mechanics tables** — Three Pillars matrix, formulas.
3. **CLAUDE.md "Critical Design Facts"** — DESIGN-TRUTH should be the source; CLAUDE.md links there.

### Files that stay independent (no merging)

- `CLAUDE.md` — entry-point instructions (but fix the role + hex contradictions).
- `VISUAL-DESIGN-SPEC.md` — visual identity is its own concern.
- `Core Rulebook v0.4.5.pdf` + `pages-*-summary.md` — visual reference bundle (move to `reference/`).
- `docs/system_map.md`, `docs/module_registry.md`, `docs/database_schema.md`, `docs/ai_systems.md` — kept in sync with code, stay where they are.
- `docs/KRMA-*` (3 files) + `docs/KV-PRICING-REFERENCE.md` + `docs/Character Creation Examples.csv` — deep system specs / data files referenced by ROADMAP and DESIGN-TRUTH.

### Files to KILL (after content absorbed)

- `PORTRAIT-PIPELINE.md` (root) — superseded by `docs/PORTRAIT-ARCHITECTURE-PLAN.md` + memory.
- `COMPREHENSIVE-BUILD-PLAN.md` — once REF-1 → DESIGN-TRUTH and phases → ROADMAP.
- `QUESTIONS-FOR-MIKE.md` — once decisions → DESIGN-TRUTH.
- `ENTITY-CREATION-PLAN.md`, `GODHEAD-ARCHITECTURE-PLAN.md` — once they become ROADMAP sections (or kept as design refs and removed from "plan" status).
- `docs/TONIGHT-SESSION-PLAN.md`, `docs/NEXT-SESSION-PROMPT.md`, `docs/skeleton-systems-report-2026-03-09.md` — ephemeral / stale.

### Items to FLAG-FOR-MIKE

1. CLAUDE.md says "Mike (Godhead)" — should be "Mike (ADMIN), GODHEAD is the AI agent role." Confirm the rewrite.
2. CLAUDE.md hex codes for pillars are wrong (Spirit=#3EB89A is actually Terminal). Confirm correct hex per memory: Body=#E8585A, Spirit=#7050A8, Soul=Blue (no hex on file?), Terminal=#3EB89A, KRMA=#D0A030.
3. `pages-151-369` of the Core Rulebook were never summarized — do you want that finished?
4. `docs/PRODUCTION-PLAN.md` (20 KB) overlaps the plans at root. Should it move out of `docs/` into ROADMAP, or be killed?
5. ~30 PNG screenshots at root — keep in `screenshots/` archive folder, or delete?
6. Active codebase merge: when `GROWTH Character Creator/` folds back into `app/`, should ROADMAP track that explicitly as a phase 0 cleanup task?
