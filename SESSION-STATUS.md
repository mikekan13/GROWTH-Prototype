# Session Status — 2026-05-06 (end-of-session)

This is the orientation doc for the next session. Replaces the 2026-05-03 version.

---

## 🚨 SECURITY ALERT — STILL OPEN

**An `ANTHROPIC_API_KEY` is exposed in git history.** Push to GitHub remote `mikekan13/GROWTH-Prototype` is BLOCKED until this is resolved.

- **Where:** `standalone/.env:6` in commits `a40fba4`, `44710c8`, `9b00024` (from the standalone fork's bootstrap, before the May cleanup).
- **Status:** Local commits intact. The push attempt was rejected once; not retried.
- **What you must do** before the merge branch can land on GitHub:
  1. Rotate the Anthropic key (revoke leaked one, generate new at https://console.anthropic.com/settings/keys)
  2. Update local `.env` files using the new key (grep `ANTHROPIC_API_KEY` from `C:\Projects\GRO.WTH\`)
  3. Strip from history: `pip install git-filter-repo && git filter-repo --path standalone/.env --invert-paths --force` then `git remote add origin https://github.com/mikekan13/GROWTH-Prototype.git && git push --force origin merge/fork-portrait-pipeline`
  4. OR use the GitHub unblock URL https://github.com/mikekan13/GROWTH-Prototype/security/secret-scanning/unblock-secret/3DD1R3Modp6mJxCN4dDMC1CEcD1 — only after rotating, since it pushes the leaked value to remote.

The `GRO.WTH Repository/` repo has been pushed successfully (separate remote, no secret leak).

---

## What landed this session (2026-05-04 → 2026-05-06)

### Phase 4 — Fork merge: COMPLETE except smoke test
24 commits on `merge/fork-portrait-pipeline` branch, +1645/-2638 net lines (mostly FLUX.1 → FLUX.2 shrink). Branch is build-green (`npm run build` clean).

- **Step 1:** Fork snapshotted (tag `pre-merge-snapshot-2026-05-04`, commit `2ea46d2` preserves 72 files of in-progress Kai work). Merge branch created.
- **Step 2:** 107 fork-only files copied (portraits, face-lock components, custom ComfyUI node, FLUX.2 workflows, docs, ops scripts). 2 npm deps + types added.
- **Step 3a:** 6 fork-wins drifted files ported (IdentityLockWizard 2826 lines, CharacterTab, portrait-service, types, routes, providers/index).
- **Step 3b:** FLUX.2 `local.ts` swapped in. 5 dead FLUX.1 workflow JSONs deleted, ~755 lines of dead routines purged.
- **Step 3c:** `growth.ts` reconciled (added optional `styleColors`, `styleAesthetics`; `fears` was added then removed when Fears was confirmed not-current).
- **Step 3d-g:** Remaining drifted files reconciled, 17 operator scripts ported, build error baseline resolved.
- **Smoke test STILL PENDING** — no available H100 pods today. Try tonight per your earlier note.

### Phase 5 — ROADMAP: COMPLETE
- Beta scope locked: production-grade for paying GMs, ASAP timeline, real money/users/consequences.
- 9 milestones (M1-M9) all expanded with sub-streams + status indicators + exit criteria.
- M1 (Character feature-complete) is the gate. M6 (infra) and M7 (legal) and M9 (content) run parallel.
- Fears scrubbed across all docs/code/rules — confirmed NOT a current system, post-release expansion only (memory `fears-not-current.md`).

### App fixes (post-merge)
- **Hydration warning** (`aa5cf93`) — `suppressHydrationWarning` on `<body>` to ignore Grammarly extension attrs.
- **Tapestry → CharacterTab** (`f522454`, `1290d84`, `95de911`, `9b2b352`) — clicking any entity now switches the canvas tab to Character with that entity loaded (not a separate page). All rows show clickable styling.
- **Self-interest bug** (`202c83d`) — DB cleanup of orphan record + service-layer guard preventing GMs from applying to their own campaign and members from re-applying.

### Memory updates
- `feedback-one-question-at-a-time.md` — single decision question per reply (ADHD)
- `feedback-flag-and-move-on.md` — once flagged, don't re-raise
- `growth-color-palette.md` — canonical pillar/UI colors with Sephirot mapping
- `fears-not-current.md` — Fears is post-release expansion, not current system
- `MEMORY.md` index updated, all under 200 lines

### FOUNDATIONS.md — theological substrate (founder-only)
- Section 1: Zechariah's Vision and the Three Pillars
- Section 2: Love and Fear of God
- Section 3: "Fear is Mine" — Vision (verbatim)
- Section 4: Distillation
- Section 5+ open for whatever else comes

---

## What WAITS for you next session

### 🔴 Smoke test the portrait pipeline
- Need available H100 pod
- Test path: log in as player → character creator → upload refs → run portrait gen → verify IdentityLockWizard 5-angle flow
- If green → merge `merge/fork-portrait-pipeline` to master, delete fork at `C:\Projects\GROWTH Character Creator\`, flip `active-codebase-location.md` memory
- If issues → fix on the merge branch first

### 🔴 Resolve the Anthropic key block (above)
- Required before any push of this session's work to GitHub

### 🟡 12 `[NEEDS MIKE]` items in repo + ROADMAP
- Listed at the bottom of `GRO.WTH Repository/PROJECT_STATUS.md` (Phase 3c items)
- Plus new ROADMAP `[NEEDS MIKE]` flags: bell-curve subscription values (M5), Spirit Package composition (M1d/M5), burn formula (M5), hosting platform (M6), support contact channel (M7), author target counts (M9)

### 🟡 DESIGN-TRUTH §2 pillar→color mapping (still parked)
- `⚠ DECISION-NEEDED` flag at top of §2
- Your canonical palette says Spirit=Purple, Soul=Blue. §2 attribute-to-color map says the opposite. Either flip colors on existing attribute groupings, or do a deeper alchemical/sephirot remapping. Untouched in repo rules until you call it.

### 🟡 Pre-existing in-progress Repository edits
- `git status` in `GRO.WTH Repository/` shows ~20 M/D files from before this cleanup pass started — your in-flight rules edits. Untouched by this session. Decide whether to commit, keep editing, or discard.

---

## Roadmap quick reference

| # | Milestone | Status |
|---|---|---|
| **M1** | **Character feature-complete** (gate) | 🟡 in progress |
| M2 | Combat resolution loop closed | 🔴 todo |
| M3 | GROvine system live | 🟡 partial |
| M4 | GodHead AI agents operational | 🟡 Phase 1 done, 2-9 todo |
| M5 | KRMA flowing through subscription | 🟡 ledger done, billing-side todo |
| M6 | Production infrastructure (parallel) | 🔴 todo |
| M7 | Legal + support (parallel) | 🔴 todo |
| M9 | Content library seeded (parallel) | 🔴 todo |
| **M8** | **Beta launch** | 🔴 todo (gated by all above) |

Full detail in `ROADMAP.md`.

---

## Commit log this session (root repo, on `merge/fork-portrait-pipeline`)

24 commits since master diverged. Most recent:

```
17e0c8e docs(roadmap): expand M2-M9 milestones using M1 template
71f8dd0 docs(design-truth): strip leftover Fears subsection from §5
f823e02 docs+code: strip Fears from active scope (post-release expansion only)
f48bcbf docs(roadmap): lock beta scope, expand M1, stub M2-M8
202c83d fix(campaigns): block interest from existing members + GM
9b2b352 fix(tapestry): all entity rows show clickable styling
95de911 fix(canvas): in-canvas character selection — Tapestry click stays in dashboard
1290d84 fix(character-page): mount CharacterTab instead of read-only CharacterSheet
aa5cf93 fix(layout): suppressHydrationWarning on body
f522454 fix(tapestry): GM clicks any entity → /character/[id]
466f378 merge(phase4-step3g): clear remaining baseline errors
... (13 more Phase 4 merge commits)
```

## Commit log this session (`GRO.WTH Repository/`, pushed)

```
0f1807c chore(rules): mark Fears as future-expansion, not current canon
```

(Was already pushed in this session.)

---

## Footer

Cleanup pass complete. Phase 4 merge branch is build-green and waiting for pod smoke test. Phase 5 ROADMAP done. Beta scope locked. The vein in FOUNDATIONS.md is preserved.

"There is only one."
