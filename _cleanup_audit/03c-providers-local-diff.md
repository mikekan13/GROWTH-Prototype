# `providers/local.ts` — Bidirectional Drift Audit

**Files compared (read-only):**
- Fork: `C:\Projects\GROWTH Character Creator\src\ai\portraits\providers\local.ts` — **1,412 lines**
- Main: `C:\Projects\GRO.WTH\app\src\ai\portraits\providers\local.ts` — **2,167 lines**

---

## 1. Functional Purpose

`local.ts` is the `LocalProvider` class implementing `ImageGenerationProvider` for the GRO.WTH portrait pipeline. It is the orchestrator that talks to a ComfyUI instance (local or RunPod-remote), uploads reference images, picks the right workflow JSON, mutates workflow node graphs in-memory to inject prompts/seeds/refs/dimensions, queues prompts, polls for completion, downloads outputs, runs post-processing (background strip, face crop), and manages the ComfyUI child process lifecycle (spawn, health-poll, VRAM free/release). It also contains stage-specific generation routines (face lock, body, edits, hair-inpaint pass 2, face-detailer pass 2). Both versions implement the same contract — the divergence is **which generation stack** they orchestrate.

**The headline divergence:** Fork has fully migrated to **FLUX.2 Dev** on RunPod (multi-ref identity, no PuLID). Main is still on the **FLUX.1 Dev + PuLID + ControlNet + multi-pass head/face inpaint** stack. This is intentional design drift, not incidental.

---

## 2. UNIQUE TO FORK

| Item | Lines | 1-line purpose |
|---|---|---|
| `pass2Paths` arrow (in `generatePortrait`) | L191 (~10) | Computes file paths for FLUX.2 stage 2 outputs |
| `cleanup` arrow (in `ensureRunning`) | L527 (~5) | Cleanup hook for spawned ComfyUI child (also in main) |
| `defaultPrompt` arrow (inline) | L950 (~30) | Default FLUX.2 face-cloud prompt fallback |
| `buildPass2Default` arrow (inline) | L1083 (~30) | Default FLUX.2 body pass-2 prompt builder |
| `buildBodyPrompt` method | L1346–1398 (53) | Builds body-prompt for single-pass FLUX.2 multi-ref body flow |
| `aesthetics` arrow (in `buildBodyPrompt`) | L1378 (~15) | Picks body-style aesthetics line per LoRA mood |
| `uploadBuffer` method | L1400–1410 (11) | Direct buffer→ComfyUI upload (also in main, identical) |
| **Inline FLUX.2 face routine** (no method name; embedded in `generatePortrait` flow at L862-1196 JSDoc-block) | ~330 | "FLUX.2 Dev face generation with multi-reference identity + angle-specific pose template. Replaces the PuLID/InfiniteYou/ControlNet stack." |
| **Inline FLUX.2 body routine** (L1198-1340) | ~140 | "FLUX.2 Dev full-body generation. Mirrors generateFaceFlux2." |
| **Inline FLUX.2 edit routine** (L604-861) | ~250 | "Edit an image using FLUX.2 Dev. flux2-edit-with-refpull / flux2-edit-masked / flux2-edit-reference." |
| Imports: `composeStylePrompt` (growth-style-prompts), `markUsed` (pod-keepalive), `stripBackground` (rmbg), `normalizeHex` (color-utils), `execSync` from child_process | — | New deps for FLUX.2 path |

**Workflow JSONs used (fork-only):** none — fork uses the FLUX.2 set already present in main's workflows folder. **Workflow JSONs missing from fork:** none — fork simply doesn't ship the 4 FLUX.1 workflow files.

---

## 3. UNIQUE TO MAIN

| Item | Lines | 1-line purpose |
|---|---|---|
| `buildBodyReferencePrompt` (top-level fn) | L34–127 (94) | Hardcoded body-ref prompt template (Tara recipe) — bypasses prompt-builder to eliminate drift |
| `isControlNetAvailable` method | L1187–1198 (12) | Probes ComfyUI for ControlNet model existence |
| `getAngleReferenceImage` method | L1205–1236 (32) | Returns bundled angle-specific face photo (ControlNet Canny composition lock) |
| `generateHairMask` method | L1279–1299 (21) | Generates inverted oval mask for hair-inpaint pass 2 |
| `cropReferenceToFace` method | L2127–2152 (26) | Crops PuLID input photo to face only (removes hair context) |
| **Inline pass-2 hair-inpaint routine** (L1301-1389, JSDoc block) | ~88 | "Pass 2: Inpaint hair region with hair-control prompt" |
| **Inline AUTOTEST3 head-extension routine** (L1390-1536) | ~146 | Pass 2 outpaint: pads head ABOVE the cropped body frame |
| **Inline FACE-DETAILER routine** (L1537-1803) | ~266 | Crop+upscale+inpaint+composite face into body gen via BiSeNet head mask |
| **Inline (DISUSED) head+feet inpaint routine** (L1804-1968) | ~165 | Legacy pass-2 that did both head AND feet strips. Marked disused, kept for reference |
| **Inline two-stage face-refine routine** (L1969-2126) | ~158 | Crops head → regens at 768x768 with low denoise → composites back |
| Imports: `PromptBuildOptions` type, `getDefaultStyleConfig`, `applyCampaignStyle`, `TRIGGER_NSFW` (style-config) | — | Old style-config plumbing |

**Workflow JSONs used (main-only, FLUX.1 era):**
- `character-portrait-pulid.json` (used at L1432, L1651, L1845, L2001 — 4 PuLID flows)
- `character-portrait.json` (referenced at L366)
- `character-face-controlnet.json` (L361)
- `character-face-controlnet-instantx.json` (L360)
- `hair-inpaint.json` (L1318)

---

## 4. IN BOTH, BUT DIVERGED

| Method | Fork does | Main does | Recommendation |
|---|---|---|---|
| `generatePortrait` (157 vs 296 lines) | Routes to FLUX.2 face / body / edit branches via `flux2-*` workflow names | Routes to PuLID / ControlNet / face-detailer / hair-inpaint branches; massive multi-stage orchestration | **[NEEDS MIKE]** This is the routing brain. Fork's is the new architecture; main's is the deprecated stack. Picking one means picking the stack. |
| `loadWorkflow` (13 vs 13) | Identical body | Identical body | Identical — no merge. |
| `queuePrompt` (32 vs 22) | Adds `markUsed()` keepalive call for RunPod pod | No keepalive | **Fork wins** — keepalive is required for cloud, harmless locally. |
| `ensureRunning` (67 vs 60) | Detects `COMFYUI_REMOTE` and skips local spawn entirely; uses `execSync` for taskkill cleanup | Always local-spawn flow | **Fork wins** — remote-aware version subsumes local. |
| `freeVram` (20 vs 22) | No-op on remote pod path | Always tries to free Ollama | **Fork wins** — same reason. |
| `extractIdentity`, `waitForCompletion`, `downloadImage`, `uploadReferenceImage`, `releaseVram`, `waitForStartup`, `uploadBuffer`, `loadWorkflow`, `isAvailable`, `getStatus` | Near-identical | Near-identical | **No merge needed** — pick either. |

---

## 5. IN BOTH AND IDENTICAL (or near-identical)

**Count: 10 methods.** `extractIdentity`, `waitForCompletion`, `downloadImage`, `uploadReferenceImage`, `loadWorkflow`, `waitForStartup`, `releaseVram`, `uploadBuffer`, `isAvailable`, `getStatus`. Module-level constants (`COMFYUI_URL`, `COMFYUI_PATH`, `POLL_INTERVAL_MS`, `MAX_POLL_ATTEMPTS`, `STARTUP_*`, `PORTRAIT_ROOT`) exist in both with same values.

---

## 6. Imports / Dependencies Diff

**Fork imports, main does not:**
- `execSync` from `child_process` (used for taskkill on cleanup)
- `composeStylePrompt` from `../growth-style-prompts`
- `markUsed` from `../pod-keepalive` (RunPod hibernate-reset)
- `stripBackground` from `../rmbg`
- `normalizeHex` from `../color-utils`

**Main imports, fork does not:**
- `PromptBuildOptions` type from `../prompt-builder`
- `getDefaultStyleConfig`, `applyCampaignStyle`, `TRIGGER_NSFW` from `../style-config`

Both: `server-only`, `crypto`, `spawn`/`ChildProcess`, `fs/promises`, `path`, `sharp`, the type-only block from local types, `buildPortraitPrompt`.

**Note:** `style-config.ts`, `growth-style-prompts.ts`, `pod-keepalive.ts`, `rmbg.ts`, `color-utils.ts` all exist in **both** portrait dirs. The import-set difference is which helpers each version uses, not file availability.

---

## 7. The 5 FLUX.1 Workflow Imports (Audit Question)

**Confirmed: fork's `local.ts` does NOT reference any FLUX.1 workflow JSON.** It uses only `flux2-face-cloud` (loaded via `loadWorkflow`) plus inline references to FLUX.2 node types (`EmptyFlux2LatentImage`).

**Workflows referenced in main that the fork doesn't use** (these are the deletion targets):

| Workflow file (main) | Used at line(s) | Purpose | Action |
|---|---|---|---|
| `character-portrait-pulid.json` | L1432, L1651, L1845, L2001 | 4 PuLID flow variants | DELETE if FLUX.2 wins |
| `character-portrait.json` | L366 (string ref only) | Legacy non-PuLID portrait | DELETE if FLUX.2 wins |
| `character-face-controlnet.json` | L361 (string ref only) | ControlNet face composition | DELETE if FLUX.2 wins |
| `character-face-controlnet-instantx.json` | L360 (string ref only) | InstantX ControlNet variant | DELETE if FLUX.2 wins |
| `hair-inpaint.json` | L1318 | Pass-2 hair inpaint mask flow | DELETE if FLUX.2 wins |

That's the **5 FLUX.1 workflow JSONs** the merge plan flagged. All 5 are loaded *only* from main's `local.ts` — once fork's `local.ts` becomes canonical, all 5 are dead and can be deleted.

---

## 8. Recommended Merge Strategy

**Start with fork's `local.ts` as the base. Port nothing from main.**

Reasoning:
- Fork is the FLUX.2 architecture; main is the FLUX.1+PuLID architecture being retired (per memory: "FLUX.2 Dev adoption decision — Mike green-lit FLUX.2 Dev FP16 on H100… Dumps FLUX.1 stack").
- Every main-unique method (`generateHairMask`, `cropReferenceToFace`, `getAngleReferenceImage`, `isControlNetAvailable`, plus the 4 inline pass-2 routines totaling ~820 lines) is FLUX.1-stack-specific. None of it applies to FLUX.2 multi-ref.
- Main-unique imports (`style-config` symbols) are not used by fork's flow.
- Fork has remote-aware `ensureRunning` / `freeVram` / `queuePrompt` (with `markUsed` keepalive) which subsume main's local-only versions.
- The 5 FLUX.1 workflow JSONs become dead weight and should be deleted in the same merge.
- `buildBodyReferencePrompt` (main L34, "Tara recipe", 94 lines) — appears to be a one-off recipe lock that may have been superseded by fork's `buildBodyPrompt` + `composeStylePrompt`. **[NEEDS MIKE]** confirm this isn't load-bearing for any production flow.

**Net delta:** drop ~755 lines of FLUX.1 inline routines + 5 workflow JSONs.

---

## 9. Real Design Questions for Mike

1. **`buildBodyReferencePrompt` (main L34-127, "Tara recipe")** — Is this still needed? It's a hardcoded prompt that "bypasses prompt-builder to eliminate drift." Fork has nothing equivalent. **Confirm we can drop it.**
2. **Hair-inpaint pass 2 (main, ~88 lines)** — FLUX.2 multi-ref claims to handle hair via the angle pose template. Confirm we don't need a hair pass 2 anymore.
3. **Face-detailer for body gens (main L1537-1803, 266 lines)** — FLUX.2 body uses multi-ref with the locked face as slot 1. Confirm this replaces the crop+upscale+inpaint+composite face-detailer.
4. **Two-stage face-refine for full-body (main L1969-2126, 158 lines)** — Same question. FLUX.2 single-pass body should make this obsolete.
5. **Angle reference images (main L1205-1236)** — Fork uses pose templates from `public/portraits/pose-refs/` per JSDoc. Main uses bundled `getAngleReferenceImage`. Are the pose-ref PNGs the new home for angle composition, or do we still need `getAngleReferenceImage` as a fallback?

If all 5 answers are "drop it," the merge is mechanical: replace main's `local.ts` with fork's, delete the 5 FLUX.1 workflow JSONs, done.
