# Audit 03b — Character Creator Fork Merge-Back (REFRESHED)

> **Supersedes:** `03-character-creator-fork.md` (2026-05-02)
> **Refreshed:** 2026-05-02 (this run)
> **Scope:** Pre-merge ground truth for moving the standalone fork back into main.
> **Read-only audit — nothing modified.**

---

## TL;DR (revised)

1. **No shared git history.** The fork is a separate `.git` repo with no `origin` remote and no common ancestor commit with main. Merge is **file-level copy + manual diff**, NOT a git 3-way merge. (Original audit didn't make this explicit — confirmed now.)
2. **Fork has been frozen since 2026-04-27.** Last commit: `84a29a8` 2026-04-22. Last working-tree edit: 2026-04-27. **Zero changes since the May 2 audit was written.** The Kai face-lock work the user remembers landed *before* the original audit, and was the trigger for it.
3. **All numbers from the May 2 audit still hold.** IdentityLockWizard is still 2826 lines (vs main 1571), 2-migration GodHead deficit unchanged, no new fork-side schema fields, no new components.
4. **Diff inventory (current, deduped):**
   - **Fork-only files (signal, scripts/_/test-outputs/comfyui-nodes excluded):** 107
   - **Drifted shared files (excl. `src/generated/`):** 37
   - **Identical shared files:** 134
   - **Main-only files:** 159 (the rest of the game — canvas, dice, godhead, forge, terminal — fork never had these)
5. **Merge direction stands:** main → fork-portrait-payload → reconcile into main → delete fork.

---

## 1. Git History Status — DEFINITIVE

```
Fork repo:    C:\Projects\GROWTH Character Creator\.git
  Initial commit:  45d6d41 "Initial: standalone character creator (pre-rebuild)"
  HEAD:            84a29a8 (2026-04-22) "feat(face-identity): wireframe pose-ref + matching prompt description"
  Branches:        master (only)
  Remote:          NONE  (git remote -v returns nothing)
  Total commits:   45
  Working-tree changes since HEAD: 18 modified, 9 untracked (none post-2026-04-27)
```

**Verdict: NO SHARED ANCESTOR.** The fork was created via file copy from main at some point in March 2026, then `git init`-ed fresh — the SHAs do not exist in main's history. There is no `git merge-base`, no `git merge`, no `git rebase` path possible.

**Implication:** Merge is purely file-level. We cannot lean on git to detect conflicts. Three-way reconciliation must be done by hand (or with `kdiff3`/`Beyond Compare`-style tooling) for each drifted file, against the main version as base.

---

## 2. Activity Since the May 2 Audit

```
=== Files modified since 2026-05-02 ===
0  (zero)

=== Files modified since last commit (Apr 22) ===
28  (all of which were finished by Apr 27 — uncommitted local edits)
```

The 18 "modified" files in `git status` are the same Kai face-lock work that produced the May 2 audit. **Nothing new has been authored in the fork since the audit.** This means:

- No new fork-only files since 2026-05-02
- No new drifted files since 2026-05-02
- No new schema/migration changes
- The audit's recommended merge sequence is still valid as a baseline

The user's recollection that "the Kai face-lock work has continued" is incorrect on the file system: those edits all predate the original audit. (The Kai mission per memory `kai-iteration-final.md` had concluded before May 2.)

---

## 3. Refreshed Diff Inventory

### 3A. Fork-only files (need to be COPIED into main)

**Top-level (5):**
| Path | Action |
|---|---|
| `FLUX2-MIGRATION-PLAN.md` | MOVE → main `docs/` |
| `SYNC.md` | DELETE (irrelevant post-merge) |
| `README.md` | DELETE (standalone-specific) |
| `.env.local` | DO NOT COPY (env-specific). Copy keys into main `.env` if missing |
| `tsconfig.tsbuildinfo` | IGNORE (build artifact) |

**docs/ (6 fork-only):**
- `docs/character-pipeline-roadmap.md` — MERGE (vision doc)
- `docs/cloud-dev.md` — MERGE (pod setup)
- `docs/cloud-vs-local-stack.md` — MERGE (architecture lesson)
- `docs/identity-lock-next-steps.md` — MERGE (in-flight notes)
- `docs/NEXT-SESSION-PROMPT.md` — REVIEW then DELETE (one-shot)
- `docs/research-dynamic-portraits.md` — MERGE (research)

**src/ai/portraits/ — THE MEAT OF THE MERGE (19 fork-only):**
```
assets/front-face.png                  reference asset
color-utils.ts                         color helpers
growth-style-prompts.ts                style prompt fragments
growth-style-recipe.json               face-lock golden recipe
pod-client.ts                          RunPod API
pod-keepalive.ts                       prevents hibernation mid-gen
pose-generator.ts                      5-angle pose system
ref-enhance.ts                         ref preprocessing
rmbg.ts                                background removal
workflow-catalog.ts                    workflow registry
workflows/flux2-body-posed-multiref.json
workflows/flux2-edit-masked.json
workflows/flux2-edit-reference.json
workflows/flux2-edit-with-refpull.json
workflows/flux2-face-cloud.json
workflows/flux2-face-klein.json
workflows/flux2-face-multiref.json
workflows/flux2-face-posed-multiref.json
workflows/flux2-t2i.json
```

**src/components/character/ (3 fork-only):**
- `FaceCropModal.tsx`
- `FaceRefinementPanel.tsx`
- `FrontLockPanel.tsx`

**src/app/api/portraits/ (2 fork-only routes):**
- `api/portraits/edit/route.ts`
- `api/portraits/pod/route.ts`

**Operational scripts (~95 in fork — most are throwaway diagnostics):**
- All `scripts/_*` files — gitignored in fork, DO NOT COPY (one-shot diagnostics, ~73 MB of `_test-outputs/`)
- Keep selectively: `scripts/sync-from-main.ps1` and `sync-to-main.ps1` (DELETE, no longer needed); `scripts/cloud-up.mjs`, `cloud-down.mjs`, `cloud-status.mjs`, `pod-ctl.mjs` (KEEP as ops tooling); `scripts/test-kai-*.mjs` (KEEP as regression harness, but rewrite port from 3001 → 3000)

**`comfyui-nodes/comfyui-average-id-embedding/` — KEEP** (custom ComfyUI node, deploys to pod). MOVE to repo root or `ai/portraits/comfy-nodes/`.

**`overnight-results/` (31 MB), `tmp/` (640 KB), `scripts/_test-outputs/` (73 MB) — DELETE.** Test artifacts, no value.

### 3B. Drifted shared files (need 3-way reconcile)

37 non-generated files have content drift. Top 12 by diff size (lines):

| Lines diff | File | Notes |
|---:|---|---|
| 4399 | `src/components/character/IdentityLockWizard.tsx` | Fork 2826 / Main 1571. **Hardest merge.** Fork is the truth — port wholesale, apply main's GodHead-related additions if any. |
| 2790 | `src/ai/portraits/providers/local.ts` | Fork 1412 / Main 2167. **Main is LARGER.** Main has GodHead-era additions fork is missing. Tricky 3-way. |
| 2289 | `src/components/character/CharacterTab.tsx` | Fork 1160 / Main 1127. Mostly portrait wiring. Fork wins for portrait sections; main wins for everything else. |
| 938 | `src/generated/prisma/models/GodHead.ts` | Generated — IGNORE; regenerated by `prisma generate` post-schema-merge. |
| 659 | `src/services/forge-authoring.ts` | Likely main-only addition. **Main wins.** |
| 496 | `src/components/tapestry/EntitiesPanel.tsx` | Wizard launcher. Reconcile carefully. |
| 372 | `src/app/page.tsx` | Fork has standalone landing; main has dashboard. **Main wins.** |
| 234 | `src/ai/portraits/prompt-builder.ts` | Portrait-domain. **Fork wins.** |
| 210 | `src/app/api/portraits/existing/route.ts` | **Fork wins** (has FLUX.2 awareness). |
| 193 | `src/app/api/references/route.ts` | **Fork wins** (verbose logging from `8ed9ea1`). |
| 175 | `src/app/api/portraits/generate/route.ts` | **Fork wins** (FLUX.2 routing). |
| 105 | `prisma/schema.prisma` | **Main wins** (has GodHeadActionLog/Invocation/Memory/Message/TokenUsage models). |

All other drifted files: `src/generated/*` (34 files — IGNORE, regenerated), plus a tail of small drifts in `src/lib/`, `src/services/`, `src/types/`. For these, **main wins by default unless the diff is explicitly portrait-related.**

### 3C. Fork-deleted files (exist in main, missing in fork)

159 files. Spot-checked by area:

- **`src/godhead/` (18 files)** — Fork never had godhead agent runtime. **KEEP IN MAIN, do nothing.**
- **`src/components/canvas/` (~15 files)** — Fork is a wizard, not a campaign canvas. **KEEP IN MAIN.**
- **`src/components/dice/` (~10 files)** — Same. **KEEP IN MAIN.**
- **`src/components/forge/`, `terminal/`, `tapestry/`, `hub/`, `profile/`** — All main-only. **KEEP IN MAIN.**
- **`prisma/migrations/20260430202650_godhead_message_channel/`** — main-only. **KEEP.**
- **`prisma/migrations/20260501173633_godhead_default_model/`** — main-only. **KEEP.**

**Verdict: nothing in the fork-missing set should be deleted from main.** The fork is a *subset* of main, not a divergent superset.

### 3D. Identical shared files (134) — leave as-is

134 files have byte-identical content. No action needed.

---

## 4. Schema Delta — UNCHANGED FROM MAY 2

```
Fork models (27):  ...AccessCode...Wallet  (no GodHead* sub-models)
Main models (32):  fork's 27 + GodHeadActionLog, GodHeadInvocation,
                   GodHeadMemory, GodHeadMessage, GodHeadTokenUsage

Fork migrations: 13   (last: 20260405020943_godhead_architecture_foundation)
Main migrations: 15   (adds godhead_message_channel + godhead_default_model)

Fork-unique schema fields/models: NONE
```

**Schema merge action: KEEP main's schema verbatim.** Fork has no schema additions to port. Just `prisma generate` after merge to refresh the client.

---

## 5. package.json Delta

```
Fork name:  growth-character-creator-standalone   (rename — drop after merge)
Main name:  app

Scripts:
  Fork has:  dev (port 3001), sync:from-main, sync:to-main
  Main has:  dev (default 3000)
  → Drop sync:* scripts. Use main's dev.

Dependencies (added by fork, missing in main):
  @huggingface/transformers ^4.2.0    → ADD if portrait pipeline uses it (check rmbg.ts)
  pngjs ^7.0.0                        → DEV dep, ADD (used by test scripts)

Dependencies (in main, missing in fork — DO NOT REMOVE):
  @anthropic-ai/sdk ^0.90.0           godhead agent runtime
  cannon-es ^0.20.0                   dice physics
  three ^0.183.2                      dice 3D
  @types/three ^0.183.1               same

Dev deps (other than above): identical sets.
```

**Action:** Cherry-pick `@huggingface/transformers` and `pngjs` into main's `package.json`. Verify `rmbg.ts` actually uses transformers; if not, skip. Run `npm install` post-merge.

---

## 6. Active In-Flight Work

**Per `git status` in fork (uncommitted, all dated 2026-04-27 or earlier):**

```
M  src/ai/portraits/character-adapter.ts
M  src/ai/portraits/growth-style-prompts.ts
M  src/ai/portraits/prompt-builder.ts
M  src/ai/portraits/providers/local.ts
M  src/ai/portraits/types.ts
M  src/ai/portraits/workflows/flux2-*.json   (5 files)
M  src/app/api/portraits/generate/route.ts
M  src/components/character/CharacterTab.tsx
M  src/components/character/IdentityLockWizard.tsx
M  src/types/growth.ts
?? src/ai/portraits/color-utils.ts            new
?? src/ai/portraits/rmbg.ts                   new
?? src/ai/portraits/workflows/flux2-face-cloud.json   new
?? scripts/_klein-*.sh, _stock-launcher.sh, _research/, _test-outputs/   diagnostics
```

**All of these ARE the merge payload.** Per the memory file `kai-iteration-final.md`, the Kai mission concluded before May 2. There is **no in-flight work blocking the merge.**

**Recommendation:** Before merge, commit the working tree to a fork-side `pre-merge-snapshot` branch so we have a recoverable point.

---

## 7. Top 5 Risk Callouts

1. **Hardcoded port `3001` in 14 files** (page.tsx + 13 test scripts) — must be rewritten to 3000 (or made env-driven) before scripts will work in main. `src/app/page.tsx` reference is in a comment/log; safe.
2. **Hardcoded `C:\Projects\GROWTH Character Creator\` paths in 20+ scripts** (all `_*.mjs` diagnostics) — these are gitignored anyway, won't be merged. **Risk only if someone copies them.** Safe if we follow rule "don't copy `scripts/_*`".
3. **`.env` and `.env.local` env vars** — fork has its own. **Do NOT copy verbatim.** Audit which keys the portrait pipeline expects (`RUNPOD_*`, `COMFY_URL`, etc.) and ensure main's `.env` has them. Fork `.env` is 540 bytes, `.env.local` is 247 bytes — small enough to do by hand.
4. **`local.ts` provider drift is BIDIRECTIONAL** — main grew it 1412→2167 (godhead-era additions); fork stayed 1412 with different changes. This is the single hardest merge, even harder than IdentityLockWizard, because both sides legitimately moved. Treat with `kdiff3` or equivalent.
5. **`SYNC.md`-listed paths drifted despite the sync script** — proves the sync workflow stopped being run. Don't trust file-mtime equality elsewhere; **always diff**.

Lower-priority risks: `prisma client path` (regenerate post-merge solves it); `DATABASE_URL` (fork points at main's `dev.db` per its own SYNC.md, so identical — verify); the 73 MB `scripts/_test-outputs/` accidentally getting committed (gitignored, safe).

---

## 8. Recommended Merge Sequence (concrete first 3 steps)

**Step 1 — Snapshot & branch.**
```
cd "C:\Projects\GROWTH Character Creator"
git checkout -b pre-merge-snapshot
git add -A && git commit -m "snapshot: pre-merge working tree"
git checkout master   # back to clean

cd "C:\Projects\GRO.WTH\app"
git checkout -b merge/fork-portrait-pipeline
```

**Step 2 — Copy fork-only files (additive, no conflict).**
- `src/ai/portraits/` 19 fork-only files → main `src/ai/portraits/`
- `src/components/character/Face*.tsx`, `FrontLockPanel.tsx` → main `src/components/character/`
- `src/app/api/portraits/edit/`, `pod/` → main `src/app/api/portraits/`
- `comfyui-nodes/` → main repo root (or `app/ai/portraits/comfy-nodes/`)
- `docs/` 6 fork-only files → main `docs/`
- `FLUX2-MIGRATION-PLAN.md` → main `docs/`
- Selected ops scripts (`cloud-*.mjs`, `pod-ctl.mjs`, `test-kai-*.mjs`) → main `scripts/`
- Add `@huggingface/transformers`, `pngjs` to `package.json`
- Run `npm install`
- `prisma generate`
- Commit: "merge(fork): copy fork-only portrait pipeline files"

**Step 3 — 3-way reconcile drifted files.** In priority order:
1. `IdentityLockWizard.tsx` — start with fork (2826 lines), apply main's small additions
2. `CharacterTab.tsx` — start with fork, apply main's GodHead/canvas hooks
3. `providers/local.ts` — true 3-way; consider asking Mike since both sides moved
4. `prompt-builder.ts`, `types.ts`, `character-adapter.ts`, `style-config.ts`, `growth-style-prompts.ts`, `growth-style-recipe.json` (already in fork-only) — fork wins
5. `api/portraits/generate/route.ts`, `existing/route.ts`, `references/route.ts` — fork wins (FLUX.2 paths)
6. Everything else — main wins
7. After each file: smoke-test compile + `npm run lint`
8. Commit per logical group

Then: rewrite port 3001 → 3000 in copied test scripts, verify `.env` keys, run portrait gen end-to-end, delete fork directory.

---

## 9. Things to LEAVE BEHIND (do not copy)

- `node_modules/`, `.next/`, `tsbuildinfo`, `dev.db*` — build/runtime artifacts
- `scripts/_*` (all underscore-prefixed scripts) — diagnostics, gitignored
- `scripts/_test-outputs/` (73 MB), `overnight-results/` (31 MB), `tmp/` (640 KB) — test artifacts
- `SYNC.md`, `README.md` — fork-specific
- `scripts/sync-from-main.ps1`, `scripts/sync-to-main.ps1` — obsolete
- `.env`, `.env.local` — env files (manually reconcile keys, don't copy)
- `.ssh/pod-id.txt` — credential, do not copy
