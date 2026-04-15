# GROWTH character pipeline — production roadmap

What we're building, why each rung exists, where we are, what's next, and what's blocked.

## The product vision (one paragraph)

A GROWTH character is a **living visual identity that evolves with play**. Creation takes one session and produces a face bust, five canonical angles, a full body, all identity-locked. During play, the portrait updates in real-time: wounds appear on the right body parts, equipment is visible, expressions change on skill-check results, clothing swaps when gear changes, scenes composite around the character. Session end produces a 90-second cinematic recap. Five locked angles feed a 3D mesh viewable in the Relations Canvas. Premium tier gets a per-account LoRA that keeps identity razor-consistent across every future gen, across campaigns, forever.

This is the standout feature — the thing no other TTRPG product on shelf does.

## The 11-rung ladder

Each rung enables a specific player moment. None decorative. Rung order matters — downstream rungs depend on upstream validation.

| # | Rung | Player moment | Tech |
|---|---|---|---|
| 1 | Face lock (single view) | Identity anchor for every gen | PuLID on front ref |
| 2 | Face lock (5 angles) | 3D, LoRA training, animation feeds | PuLID + OpenPose ControlNet + identity scoring |
| 3 | Body lock | Full character render | Face-lock → body prompt chain |
| 4 | Hair | Swap hair without re-rendering face | `hair-inpaint.json` |
| 5 | Features | Change eye color / add scar / tweak mouth | Segformer-B5 19-label mask + region inpaint |
| 6 | Outfits | Change clothing, equip armor | CatVTON-FLUX |
| 7 | Expressions | Face reacts to skill check | LivePortrait retargeting |
| 8 | Poses | Combat stance, casting gesture | OpenPose + ControlNet Union Pro 2 |
| 9 | 3D | Rotatable avatar on canvas | Wonder3D / TripoSR, fed by rung 2 |
| 10 | Animated portraits | Idle / presence animation | LivePortrait + rung 2 + emotion driving |
| 11 | Video recaps | End-of-session cinematic | Wan 2.2 / Kling, fed by stitched key frames |

## Current state (2026-04-15)

### Done / Production
- **Rung 1** — PuLID golden recipe (front view) working
- **Rung 3** — body lock pipeline working
- **Rung 4** — hair inpaint (legacy)
- **Rung 5** — face-region inpaint with Segformer. `scripts/face_parse.py` produces 19-label masks in ~1s CPU. Eye-color change tested: 155s/region. Workflow: `face-region-inpaint.json`.

### Active critical path
- **Rung 2** — 5-angle face lock. Current state: angle-refs copied from main app, VAEDecodeTiled added to all workflows for 8GB fit, OpenPose ControlNet on top of PuLID. **Not yet validated** with identity-similarity metrics. This is the unblocker for 3D (rung 9), premium LoRA training, and animation (rung 10). **Don't move past this without measured 90%+ CLIP + ArcFace similarity across all 5 angles on Tara.**

### Scaffold / partial
- **Rung 7** on cloud — LivePortraitKJ installed, weights downloaded, smoke test authored. Runs on cloud pod (py3.11) but not local (py3.13 compat).
- **Rung 8** — `character-pose-controlnet.json` authored, untested end-to-end.

### Blocked
- **Rung 6 (Outfits)** — CatVTON wrapper cloned. Blocked on `black-forest-labs/FLUX.1-Fill-dev` being gated. Mike needs to accept the FLUX.1-Fill-dev license on HuggingFace and set `HF_TOKEN` in the pod env. 5-minute unblock.
- **Rung 7 (Expressions) on local** — py3.13 breaks mediapipe, insightface, and face_alignment. Cloud pod sidesteps it (py3.11). Fix on local = new py3.11 venv for ComfyUI; moderate effort, defer unless needed.

### Not started
- **Rung 9 (3D)** — Wonder3D install pending rung 2 validation.
- **Rung 10 (Animated)** — pending rungs 2 + 7.
- **Rung 11 (Video)** — pending research on Wan 2.2 / Kling deployment.

## Speed targets and current reality

| Workflow | Local 8GB | Cloud 4090 (expected) | Target for production |
|---|---|---|---|
| Baseline Flux Dev 20-step | 181s | ~60s | — (creation-tier only) |
| Body-fast (Hyper-FLUX 8-step + FBCache) | 76s | ~25s | ≤30s (in-play) ✓ |
| Face-region inpaint (20 steps, 0.65 denoise) | 155s | ~50s | ≤30s (in-play) — needs Hyper-FLUX variant |
| IPA identity-locked | 334s | ~110s | ≤30s — needs cached embedding + Hyper-FLUX |
| IPA + Hyper-FLUX 8-step combo | 120s | ~40s | ≤30s — close, cached embedding closes the gap |

The IPA embedding cache is the unshipped stretch goal that closes the last 10s on every identity-locked in-play regen.

## Cross-cutting sub-deliverables

- **Identity-scoring harness** — CLIP + ArcFace similarity measured against the golden reference. Required to validate rung 2 and any per-character LoRA. Not built yet.
- **Premium tier LoRA training pipeline** — $0.75/LoRA on RunPod A100 spot, triggered by the 5-angle set. Designed, not built.
- **Campaign style layer** — GM-selectable style LoRAs (painterly-fantasy, dark-fantasy, ...) applied globally to campaign gens. Partially implemented in `style-config.ts`; style LoRAs not on the cloud pod yet (need upload from local).
- **KRMA attribution layer** — mechanical fingerprinting + novelty scoring + royalty flow. Design exists in `memory/krma-economy-core.md`. Not wired into the portrait pipeline.
- **Workflow catalog** (`src/ai/portraits/workflow-catalog.ts`) — maps task+flags to workflow JSON. Enumerated, ready for integration.

## Pre-launch decisions pending

1. **FLUX commercial licensing** — stay on Dev (pay BFL $30-1000+/mo) vs migrate workhorse to Schnell (free Apache 2.0) vs hybrid. Every rung built on Dev is license debt if we stay. Hybrid (Schnell for in-play workhorse, Dev for creation-tier masterpieces) is probably the product answer. See `memory/project-commercial-context.md`.
2. **Resolution tier decision** — ship 1024×1024 (24GB GPU floor, better image) or 768×768 (fits 8GB, wider device support). Affects the consumer-facing minimum.
3. **HF_TOKEN setup** — unblocks rung 6 (outfits). Mike action, 5 minutes.
4. **Python 3.12 venv for local ComfyUI** — unblocks rung 7 (expressions) on local. Not needed if cloud pod stays the primary dev env.

## How to work on this

- **Don't skip rungs.** Downstream rungs break if upstream isn't measured-solid.
- **Measure, don't eyeball.** Identity preservation = similarity scores. Speed = wall-clock benchmarks. Save numbers in `tmp/`, not "looks good."
- **Cloud pod first** for iteration speed (see `cloud-dev.md`).
- **Surface licensing + cost up front** on every new model/node. See `memory/project-commercial-context.md`.
