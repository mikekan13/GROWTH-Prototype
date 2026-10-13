# Image model landscape — 13 Oct 2026

Context: GROWTH runs FLUX.2 [dev] (fp8) on a RunPod serverless ComfyUI worker (5.8.6) for face lock → bust → body.
Mike asked for a step back: "I think I even heard something about flux 3."

## What exists now

| Model | Date | Open weights | License (self-hosted commercial) | Reference / identity editing | Notes |
|---|---|---|---|---|---|
| **FLUX 3 Image** | 1 Oct 2026 | No (API only) | BFL API terms | Yes, bounding-box edits, 4K | Announced 23 Jul 2026 as multimodal (image/video/audio/action). |
| **FLUX 3 Action** | 23 Sep 2026 | Yes, 7B | "FLUX Kommunity License" | n/a (robotics) | The only FLUX 3 open weights. |
| **FLUX 3 Dev** | "later 2026" | Not yet | Unknown | — | No date, no license, no param count as of 8 Oct 2026. |
| **FLUX.2 [dev]** (ours) | Nov 2025 | Yes | Non-commercial; BFL licence required for production | Up to ~6 refs, multi-ref editing | Still #3 open-weight on Artificial Analysis (1000 Elo, 7 Oct 2026). |
| **FLUX.2 Klein 4B** | Nov 2025 | Yes | **Apache 2.0** | Up to 4 refs, 4-step distilled | Lower fidelity than dev. Klein 9B is NON-commercial. |
| **Qwen-Image-2.1** | 20 Sep 2026 | Yes, 7B DiT + Qwen3-VL 8B encoder | **Qwen Research License — NON-commercial**; commercial by request (model-business@notice.qwencloud.com) | **Up to 10 refs**, mask/circle local edits, identity preserved for people | #1 open-weight (1035 Elo). Native RGBA output. ComfyUI day-0. ~33 GB bf16; INT8 pack ~16 GB. Roundups wrongly call it Apache (that was the 2025 Qwen-Image line). |
| **Z-Image** (Turbo/Base) | Nov 2025 / Jan 2026 | Yes, 6B | **Apache 2.0** | **Z-Image-Edit still unreleased** (Sep 2026) | Great T2I, no reference path for us yet. |
| **HunyuanImage 3.0** | 2025 | Yes | Tencent community (limits large commercial) | — | Strong, but no edge over the two above for identity. |

## Research signal
arXiv 2609.04151 (Sep 2026, "Persistent Identity Preservation"): identity preservation is a distinct weakness of
every foundation model; it degrades with iterative edits, small subject scale and multi-subject scenes. A persistent
identity representation (LoRA / identity layer) beats context-only references across generation, editing and restoration.
→ confirms the 08-08 plan: per-character identity LoRA after lock.

## LoRA tooling
Ostris ai-toolkit trains FLUX.2, Z-Image and Qwen-Image-2.1 LoRAs. Style LoRA: 15–30 curated images, 800–2000 steps.
Character LoRA: 20–60 images, 1000–2500 steps. Qwen-2.1 has a 12 GB low-VRAM path. FLUX.2 LoRAs inherit multi-ref editing.

## Serverless worker
runpod-workers/worker-comfyui latest = 5.11.0 (21 Sep 2026); ours = 5.8.6. Qwen-Image-2.1 needs a ComfyUI build from
20 Sep 2026 or later — check the ComfyUI version pinned in 5.11.0 before any A/B.

## Assessment
1. **No FLUX 3 to move to.** Image is API-only; Dev is unscheduled. Don't wait on it.
2. **FLUX.2 [dev] is still a top-3 base** and our prose-driven style work transfers to any model. Keep it for now.
3. **Qwen-Image-2.1 is the one worth an A/B**, not for the leaderboard but for three concrete things we want:
   10 reference slots (identity photo + several old-gen style refs in ONE call = style transfer without a LoRA),
   native RGBA (tokens/cutouts for free), and mask-based local edits (a real Finetune). Same licence class as FLUX.2 dev
   (non-commercial, ask for commercial), so the licence debt is unchanged, not worsened.
4. **Apache-clean options can't do our identity work yet**: Z-Image has no Edit model; Klein 4B is a quality step down.
   Re-check when Z-Image-Edit ships.
5. **Licence debt is still real**: production needs either a BFL FLUX.2 dev licence or a Qwen commercial licence. Both are
   "email and negotiate". Budget it before launch.
6. **Start the LoRA dataset now**: approved lock/bust outputs → `style-refs/approved/`; 15–30 is enough for a style LoRA.

## Sources
- https://www.marktechpost.com/2026/09/24/black-forest-labs-releases-flux-3-action-a-7b-open-weights-world-action-model-that-tops-robolab-120/
- https://www.techtimes.com/articles/328502/20261002/black-forest-labs-launches-flux-3-image-json-bounding-boxes-lock-unchanged-pixels-numerically.htm
- https://www.digitalapplied.com/blog/flux-3-black-forest-labs-multimodal-launch
- https://wan27.org/blog/flux-3-huggingface
- https://pinggy.io/blog/best_free_open_source_ai_image_generators_to_self_host/
- https://github.com/QwenLM/Qwen-Image-2.1 (README + LICENSE, read directly)
- https://qwenimages.com/blog/qwen-image-2-1-release
- https://codersera.com/blog/how-to-run-qwen-image-2-1-locally-2026/
- https://www.runcomfy.com/trainer/ai-toolkit/qwen-image-2-1-lora-training
- https://www.runcomfy.com/trainer/ai-toolkit/flux-2-dev-lora-training
- https://localaimaster.com/blog/z-image-base-edit-guide
- https://github.com/Tongyi-MAI/Z-Image
- https://invideo.io/blog/open-source-image-models-licenses/
- https://huggingface.co/black-forest-labs/FLUX.2-klein-9B
- https://bfl.ai/blog/flux2-klein-towards-interactive-visual-intelligence
- https://arxiv.org/abs/2609.04151
- https://github.com/runpod-workers/worker-comfyui/releases
