# Audit 03 — Character Creator Fork Merge-Back Plan

**Fork:** `C:\Projects\GROWTH Character Creator\` (port 3001, name `growth-character-creator-standalone`)
**Main:** `C:\Projects\GRO.WTH\app\` (target)
**Date:** 2026-05-02

---

## TL;DR

The fork is a near-mirror of the main app, NOT a divergent codebase. `SYNC.md` confirms it was always meant to stay in lockstep via `sync-from-main.ps1` / `sync-to-main.ps1`. The DELTA from main is small and concentrated in **portrait pipeline (FLUX.2 migration)** + a few face-lock UI components. Main has actually moved AHEAD on the GodHead schema/agent infrastructure side (2 newer migrations). The fork is BEHIND on godhead.

**Migration count:**
- Fork: 13 migrations (last = `20260405020943_godhead_architecture_foundation`)
- Main: 15 migrations (adds `20260430202650_godhead_message_channel`, `20260501173633_godhead_default_model`)

**Fork is missing main's two newest schema changes.** Merge direction must be: main main → fork → reconcile portrait deltas into main → delete fork.

---

## 1. Diff Inventory

### 1A. Top-level files unique to fork
| Path | Keep? | Notes |
|---|---|---|
| `FLUX2-MIGRATION-PLAN.md` | MOVE to docs/ | Active migration plan, valuable context |
| `SYNC.md` | DELETE | Becomes irrelevant after merge |
| `README.md` | DELETE | Standalone-specific |
| `comfyui-nodes/comfyui-average-id-embedding/` | MOVE to repo root or `ai/portraits/comfy-nodes/` | Custom ComfyUI node, deploys to pod |
| `overnight-results/` | DELETE | Test output PNGs, ~MB of artifacts |
| `tmp/` | DELETE | 250+ comfy-submitted JSON dumps from runs |
| `docs/character-pipeline-roadmap.md` | MERGE into main `docs/` | Pipeline vision |
| `docs/cloud-dev.md`, `docs/cloud-vs-local-stack.md` | MERGE into main `docs/` | Pod/cloud setup |
| `docs/identity-lock-next-steps.md`, `NEXT-SESSION-PROMPT.md`, `research-dynamic-portraits.md` | MERGE selectively | In-flight notes |

### 1B. Routes unique to fork (page.tsx / route.ts / layout.tsx)
Only **2 API routes**:
- `src/app/api/portraits/edit/route.ts` — masked / reference image-edit endpoint (FLUX.2 edit workflows)
- `src/app/api/portraits/pod/route.ts` — RunPod pod control (start/stop/status from UI)

Plus the standalone landing pages (`src/app/page.tsx`, `src/app/character/...`, `src/app/layout.tsx`) — DO NOT MERGE; they are the standalone wrapper. Main has its own pages.

**Main has 30+ routes the fork lacks** (access-codes, contested-check, characters/*, dice/*, godhead/*, krma/*, references/*, regenerate-invite/*, requests/*, rest, terminal/*, etc.). Confirms main is the trunk.

### 1C. Services
**Fork-only:** NONE. (`comm` returned empty.)
**Main-only:** NONE. (`comm` returned empty.)
But MANY service files have content drift — same names, different bodies. Spot-check shows `character.ts` is byte-identical (108 lines both), but anything portrait-adjacent will differ. The diff-by-name shows the structure is the same — content reconciliation needed file-by-file.

### 1D. Lib
**Fork-only:** NONE.
**Main-only:** NONE.
Same situation as services — content drift only.

### 1E. AI files unique to fork (the meat of this merge)
```
src/ai/portraits/assets/front-face.png            <- reference asset
src/ai/portraits/color-utils.ts                   <- color helpers for prompts
src/ai/portraits/growth-style-prompts.ts          <- GROWTH style prompt fragments
src/ai/portraits/growth-style-recipe.json         <- locked recipe (face-lock golden recipe)
src/ai/portraits/pod-client.ts                    <- RunPod API client
src/ai/portraits/pod-keepalive.ts                 <- prevents pod hibernation mid-gen
src/ai/portraits/pose-generator.ts                <- 5-angle pose system
src/ai/portraits/ref-enhance.ts                   <- ref-image preprocessing (crop/upscale)
src/ai/portraits/rmbg.ts                          <- background removal
src/ai/portraits/workflow-catalog.ts              <- catalog/registry of workflow JSONs
src/ai/portraits/workflows/flux2-body-posed-multiref.json
src/ai/portraits/workflows/flux2-edit-masked.json
src/ai/portraits/workflows/flux2-edit-reference.json
src/ai/portraits/workflows/flux2-edit-with-refpull.json
src/ai/portraits/workflows/flux2-face-cloud.json
src/ai/portraits/workflows/flux2-face-klein.json
src/ai/portraits/workflows/flux2-face-multiref.json
src/ai/portraits/workflows/flux2-face-posed-multiref.json
src/ai/portraits/workflows/flux2-t2i.json
```

Main still ships FLUX.1 workflows (`character-portrait-pulid.json`, `character-portrait.json`, `character-face-controlnet*.json`, `hair-inpaint.json`). Per memory `flux2-dev-decision.md`, the FLUX.1 stack was abandoned — these can be deleted from main during merge.

Files **shared but content-drifted** (need diff-merge):
- `src/ai/portraits/portrait-service.ts` (DIFF)
- `src/ai/portraits/character-adapter.ts` (DIFF)
- `src/ai/portraits/prompt-builder.ts` (DIFF)
- `src/ai/portraits/style-config.ts` (DIFF)
- `src/ai/portraits/types.ts` (DIFF)
- `src/ai/portraits/providers/cloud.ts` (likely DIFF — runs FLUX.2 against pod)

### 1F. Components unique to fork
```
src/components/character/FaceCropModal.tsx     402 lines — ref photo crop UI
src/components/character/FaceRefinementPanel.tsx 137 lines — Stage 2 refine controls
src/components/character/FrontLockPanel.tsx    331 lines — Stage 1 front-lock UI
```
Plus content drift in:
- `IdentityLockWizard.tsx` (2826 LINES in fork — massive; the active wizard)
- `CharacterSheet.tsx` (DIFF)
- Likely others (`CharacterTab.tsx` is 1160 lines, `PortraitPanel.tsx` 337)

These three new face-lock components ARE the in-flight identity-lock work referenced in memory.

---

## 2. Schema Delta (Prisma)

### 2A. Fork is BEHIND main on:
- **`Campaign.aiSettings` field** (added in main's `20260430202650_godhead_message_channel`)
- **`GodHeadMemory`** model
- **`GodHeadInvocation`** model
- **`GodHeadActionLog`** model
- **`GodHeadTokenUsage`** model
- **`GodHeadMessage`** model (campaign↔godhead message channel)
- **`GodHead.active` column dropped** (table redefinition in main)
- **`GodHead.defaultModel`** column added (main's `20260501173633_godhead_default_model`)

### 2B. Fork-unique schema fields/models
**NONE.** The fork's `schema.prisma` is a strict subset of main's. The portrait migration (`PortraitGeneration`, `PersonaLock`) is **identical in both** (same migration ID `20260315210754_add_portrait_pipeline`).

### 2C. Migration history
| ID | Fork | Main |
|---|---|---|
| 20260307031845_init … 20260405020943_godhead_architecture_foundation | yes (13 migrations) | yes (same 13) |
| 20260430202650_godhead_message_channel | NO | yes |
| 20260501173633_godhead_default_model | NO | yes |

**No conflict.** The fork can pull main's migrations cleanly via `prisma migrate deploy` after merge. There are no fork-only migrations to back-port.

---

## 3. Portrait Pipeline Inventory (the real merge payload)

### Routes to ADD to main
| Path | Purpose |
|---|---|
| `src/app/api/portraits/edit/route.ts` | Image-edit endpoint (masked + reference) |
| `src/app/api/portraits/pod/route.ts` | RunPod pod start/stop/status from UI |

### AI files to ADD to main (`src/ai/portraits/`)
- `pod-client.ts`, `pod-keepalive.ts` — RunPod integration
- `pose-generator.ts` — 5-angle pose recipe
- `ref-enhance.ts`, `rmbg.ts` — pre-processing
- `growth-style-prompts.ts`, `growth-style-recipe.json` — locked prompt recipe
- `color-utils.ts`, `workflow-catalog.ts`
- `assets/front-face.png` — reference asset

### Workflows to REPLACE in main (FLUX.1 → FLUX.2)
DELETE main's: `character-face-controlnet-instantx.json`, `character-face-controlnet.json`, `character-portrait-pulid.json`, `character-portrait.json`, `hair-inpaint.json`
ADD fork's 9 `flux2-*.json` workflows.

### Components to ADD to main (`src/components/character/`)
- `FaceCropModal.tsx`, `FaceRefinementPanel.tsx`, `FrontLockPanel.tsx`

### Files to RECONCILE (3-way merge)
- `IdentityLockWizard.tsx` — fork is far ahead (2826 lines, active workspace)
- `CharacterSheet.tsx`, `CharacterTab.tsx`, `PortraitPanel.tsx`
- `portrait-service.ts`, `character-adapter.ts`, `prompt-builder.ts`, `style-config.ts`, `types.ts`, `providers/cloud.ts`

### Custom ComfyUI node
`comfyui-nodes/comfyui-average-id-embedding/` — Python module (a custom node deployed to the RunPod ComfyUI). Lives outside `src/`. Stash in main repo at `comfyui-nodes/` or `ai/portraits/comfy-nodes/`.

### Operational scripts (fork `scripts/` — 100+ files)
Most are throwaway diagnostics (`_pod-info.mjs`, `_test-outputs/`, `_research/`, etc.). Keep ONLY:
- `pod-ctl.mjs`, `cloud-up.mjs`, `cloud-down.mjs`, `cloud-status.mjs` — pod lifecycle
- `start-h100-comfy.mjs`, `pod-start-comfy.sh`, `pod-setup-comfy.sh` — pod bootstrap
- `runpod-api.mjs` — API wrapper
- `patch-pod-pulid-hair.mjs` — required PuLID patch (per memory `pulid-fixes.md`)
- `restart-pod-comfy.mjs`, `comfy-status.ps1`, `comfy-queue.ps1` — operator tools
- `setup-h100-pod.mjs`, `h100-full-setup.mjs` — pod provisioning
- `download-*.mjs/ps1/py` — model download helpers (curate to active models only)

LEAVE BEHIND: everything starting with `_`, all `test-kai-*`, `bench-*`, `_research/`, `_test-outputs/`.

---

## 4. Recommended Merge Sequence

1. **Snapshot fork branch** in main repo: `git checkout -b merge/character-creator-fork` from main `master`.
2. **Bring main's schema first** — fork has nothing main doesn't. Skip schema migration from fork entirely; main's two GodHead migrations stand.
3. **Drop main's FLUX.1 workflow JSONs** in the same commit they're replaced (clean break, per `flux2-dev-decision.md`).
4. **Port fork-only AI/portrait files** wholesale (no conflicts to resolve — files don't exist in main yet):
   - `src/ai/portraits/{pod-client,pod-keepalive,pose-generator,ref-enhance,rmbg,growth-style-prompts,growth-style-recipe.json,color-utils,workflow-catalog}.{ts,json}`
   - `src/ai/portraits/assets/front-face.png`
   - `src/ai/portraits/workflows/flux2-*.json` (9 files)
5. **Port fork-only components** (no conflicts):
   - `FaceCropModal.tsx`, `FaceRefinementPanel.tsx`, `FrontLockPanel.tsx`
6. **Port fork-only API routes** (no conflicts):
   - `api/portraits/edit/route.ts`, `api/portraits/pod/route.ts`
7. **3-way reconcile drifted files** (one PR each, in this order — leaf → root):
   1. `types.ts`, `style-config.ts` (foundational types)
   2. `prompt-builder.ts`, `character-adapter.ts`
   3. `providers/cloud.ts`
   4. `portrait-service.ts`
   5. `PortraitPanel.tsx`, `CharacterSheet.tsx`, `CharacterTab.tsx`
   6. `IdentityLockWizard.tsx` (last — it's the largest and most active)
8. **Stash `comfyui-nodes/comfyui-average-id-embedding/`** at repo root.
9. **Curate `scripts/`** — port the ~15 operator scripts, drop the rest.
10. **Migrate docs** — `FLUX2-MIGRATION-PLAN.md`, `character-pipeline-roadmap.md`, `cloud-dev.md`, `cloud-vs-local-stack.md`, `identity-lock-next-steps.md` into main `docs/`.
11. **Smoke test** — point dev (port 3000) at the merged code, verify `/character/...` flow works, run a portrait gen against the pod.
12. **Delete fork directory** `C:\Projects\GROWTH Character Creator\` and update `MEMORY.md` (`active-codebase-location.md` says fork is the active codebase — must flip to main on completion).

---

## 5. Things to LEAVE BEHIND

- `src/app/page.tsx`, `src/app/character/...`, `src/app/layout.tsx` (standalone wrappers — main has real versions)
- `package.json`, `package-lock.json`, `tsconfig.json`, `eslint.config.mjs`, `next.config.ts`, `postcss.config.mjs`, `next-env.d.ts` (main's are authoritative; only diff is name + port 3001 + `@huggingface/transformers` + `pngjs` devDeps — neither is used outside scripts)
- `.env`, `.env.local` (fork's `.env` points DATABASE_URL at main's `dev.db` — this stops mattering after merge)
- `prisma/migrations/` (main is ahead; do NOT copy fork migrations)
- `src/generated/prisma/` (regenerated by `prisma generate`)
- `scripts/_*.mjs`, `scripts/_research/`, `scripts/_test-outputs/`, `scripts/test-kai-*`, `scripts/bench-*` (throwaway research)
- `tmp/` (250+ comfy-submitted JSON dumps)
- `overnight-results/` (test PNGs)
- `node_modules/`, `.next/`, `tsconfig.tsbuildinfo`
- `SYNC.md`, `README.md` (standalone-specific docs)
- `scripts/sync-from-main.ps1`, `scripts/sync-to-main.ps1` (no longer needed)

---

## 6. Risk Callouts

1. **Fork DB points at main's `dev.db`** — both apps were already sharing the same SQLite file. So portrait records (`PortraitGeneration`, `PersonaLock`) created by the fork already live in main's DB. **Schema-wise the merge is risk-free** since both share the portrait migration. No data loss.
2. **Fork is BEHIND on GodHead schema** — anything in the fork that touches the `GodHead` model assumes the OLD shape (with `active` column, no `defaultModel`, no message channel). After merge, those code paths will need adjustment to main's current GodHead shape. Most likely affects nothing (fork's UI doesn't seem to manage godheads), but **grep for `godHead.active` and `godHead.create({` in fork before merge** to confirm.
3. **`IdentityLockWizard.tsx` is 2826 lines and actively edited** — the largest and riskiest file in the merge. It's the wizard memory has been iterating on (Kai 5-angle identity lock mission). Hand-merge required; likely needs Mike's eyes on conflicts.
4. **PuLID hair-fix patch** (memory `pulid-fixes.md`) is in `scripts/patch-pod-pulid-hair.mjs` AND in fork's pod state — but the FLUX.2 decision (`flux2-dev-decision.md`) drops the PuLID stack entirely. **Verify FLUX.2 path is fully wired before deleting PuLID workflows from main**, otherwise we lose the only working face-lock recipe (`portrait-face-lock-golden-recipe.md`).
5. **`growth-style-recipe.json`** and `assets/front-face.png` are reference data the recipe depends on — must move with the rest of the pipeline.
6. **Fork's `scripts/sync-*.ps1`** assumed paths into `../app/`. After merge, ensure no remaining code in main hard-codes references to `../GROWTH Character Creator/` or `standalone/`.
7. **Custom ComfyUI node** (`comfyui-average-id-embedding`) must be deployed to the RunPod ComfyUI instance — already is, but need to document the deploy step somewhere durable so a fresh pod knows to install it.
8. **Active autonomous mission** (`MEMORY.md` → `kai-autonomous-mission.md`, "iterate until Kai's 5 angles look 99% like refs") is currently running against the fork's IdentityLockWizard. Coordinate the merge with Mike — don't merge mid-iteration.

---

## 7. In-Flight Unfinished Work (gating the merge)

- **Kai 5-angle identity lock** — actively iterating per autonomous mission. PR-merge after the next stable lock is reached.
- **Body gen with FLUX.2** — `FLUX2-MIGRATION-PLAN.md` morning summary (2026-04-21) lists "Body gen next" as TODO. The body workflow JSON exists (`flux2-body-posed-multiref.json`) but `local.ts` apparently still has ~1000 lines of PuLID body-gen logic to rip and route to FLUX.2.
- **Native mask edit** — `flux2-edit-masked.json` written but untested end-to-end.
- **Style LoRA tuning** — Mike was tuning style combos when the migration plan was written.

None of these BLOCK the merge — they continue post-merge in main. But Mike should confirm checkpoint before pulling the trigger.
