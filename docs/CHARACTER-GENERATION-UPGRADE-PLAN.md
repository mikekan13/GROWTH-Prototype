# Character Generation — Upgrade Plan

**Goal:** Consistent, high-quality character generation with locked identity, controlled pose, and unified art style across all GRO.WTH characters.

**Current status:** PuLID face identity works. ControlNet angle control works (XLabs, with quirks). Style is inconsistent across seeds and reference photos. Need Style LoRA + better models.

---

## Phase 1: Style LoRA (CRITICAL — #1 Priority)

**Problem:** Every generation has a different art style depending on seed and reference photo. GRO.WTH needs ONE cohesive visual style.

**Solution:** Train a Style LoRA on GRO.WTH's visual identity.

### Training Data Preparation
1. Extract 50-100 character illustrations from Core Rulebook v0.4.5 (PDF → images)
2. Crop to consistent sizes (1024x1024 faces, 1024x1024 full body)
3. Caption each image with descriptive prompts (use Claude Vision for auto-captioning)
4. Mix: ~60% face portraits, ~30% full body, ~10% action poses

### Training
- Use `kohya_ss` or `ai-toolkit` for FLUX LoRA training
- FLUX LoRA training requires ~16GB VRAM minimum (RTX 4060 has 8GB — need cloud or 48GB RAM upgrade)
- **Alternative:** Use a cloud training service (Replicate, CivitAI training, or rent A100 on RunPod for ~$2/hr)
- Training time: 1-2 hours on A100
- Output: `.safetensors` LoRA file (~50-200MB)

### Integration
- Place in `C:\AI\ComfyUI\models\loras\growth-style-v1.safetensors`
- Already supported in workflows via `LoraLoader` node
- `style-config.ts` already has `styleLora` and `loraStrength` fields
- Set `loraStrength: 0.6-0.8` — enforces style without overpowering identity

### Downloads Required
- `kohya_ss` or training toolkit (git clone, ~100MB)
- Or: cloud training service (no local download)

---

## Phase 2: InstantX ControlNet Union (Replaces XLabs)

**Problem:** XLabs ControlNet uses its own sampler (XlabsSampler) which affects style and has VRAM issues. Standard ControlNet pipeline is cleaner.

**Solution:** InstantX FLUX ControlNet Union — works with standard ComfyUI nodes.

### Download
- `InstantX/FLUX.1-dev-Controlnet-Union` — **6.6GB**
- URL: `https://huggingface.co/InstantX/FLUX.1-dev-Controlnet-Union/resolve/main/diffusion_pytorch_model.safetensors`
- Place in: `C:\AI\ComfyUI\models\controlnet\`

### Benefits
- Uses standard `ControlNetLoader` + `ControlNetApplyAdvanced` nodes
- Patches conditioning only — does NOT affect model or style
- Supports multiple control types: canny, depth, pose, tile, etc.
- Works with KSampler (no XlabsSampler needed)
- Compatible with GGUF model pipeline

### Integration
- New workflow: `character-face-controlnet-instantx.json`
- Replaces XLabs workflow as primary, XLabs becomes fallback
- Update `injectWorkflowParams` for standard ControlNet nodes
- Remove XlabsSampler dependency

---

## Phase 3: Better FLUX Models

### 3a: Better Quality GGUF — `flux1-dev-Q4_K_S.gguf`
- **Size:** 6.81GB (same as current Q4_0 — direct swap)
- **Benefit:** Better quality at same VRAM usage. K-quant preserves more detail than standard Q4.
- URL: `https://huggingface.co/city96/FLUX.1-dev-gguf/resolve/main/flux1-dev-Q4_K_S.gguf`
- Place in: `C:\AI\ComfyUI\models\unet\` (replace flux1-dev-Q4_0.gguf)
- Update workflow JSONs: `"unet_name": "flux1-dev-Q4_K_S.gguf"`

### 3b: Better Text Encoder — `t5xxl_fp8_e4m3fn.safetensors`
- **Size:** 4.89GB
- **Benefit:** MUCH better prompt adherence. Current Q4_K_M text encoder loses nuance.
- URL: `https://huggingface.co/comfyanonymous/flux_text_encoders/resolve/main/t5xxl_fp8_e4m3fn.safetensors`
- Place in: `C:\AI\ComfyUI\models\clip\`
- Update workflow JSONs: `"clip_name1": "t5xxl_fp8_e4m3fn.safetensors"` (replaces Q4_K_M GGUF)
- Need to switch from `DualCLIPLoaderGGUF` to `DualCLIPLoader` for the fp8 encoder

### 3c: Native fp8 Model (After 48GB RAM) — `flux1-dev-fp8.safetensors`
- **Size:** 17.2GB
- **Benefit:** Fastest option, native GPU fp8 on Ada Lovelace, no GGUF overhead
- Requires 48GB RAM (model offloads between VRAM and RAM)
- Replaces GGUF entirely — use standard `CheckpointLoaderSimple`

---

## Phase 4: 48GB RAM Upgrade

**Benefits:**
- 1024x1024 generation (currently 768x768)
- PuLID works reliably (no memory pressure, no fallbacks)
- ControlNet + PuLID simultaneously without swapping
- fp8 native model viable (fastest generation)
- ComfyUI `--normalvram` or no flags needed (vs current `--normalvram` with GGUF)

---

## Phase 5: DWPose for Body Control

**Problem:** Canny ControlNet controls composition but requires a reference image at each angle. For body poses (T-pose, action, sitting), we need skeleton-based control.

### Downloads
- DWPose model: auto-downloads on first use via `comfyui_controlnet_aux` (~300MB)
- Or with InstantX Union: just use pose mode (built into the Union model)

### Integration
- Replace `CannyEdgePreprocessor` with `DWPosePreprocessor` for body poses
- Canny for face angles, DWPose for full body poses
- Create body pose reference skeletons (T-pose, action, sitting, etc.)

---

## Download Summary

| Item | Size | Priority |
|------|------|----------|
| Style LoRA training (cloud) | ~$5 | 1 — CRITICAL |
| InstantX ControlNet Union | 6.6GB | 2 — clean pipeline |
| flux1-dev-Q4_K_S.gguf | 6.81GB | 3 — quality |
| t5xxl_fp8_e4m3fn.safetensors | 4.89GB | 3 — prompt adherence |
| flux1-dev-fp8.safetensors | 17.2GB | 5 — after RAM upgrade |
| DWPose model | ~300MB | 4 — body poses |

**Total download (phases 1-3):** ~18.3GB + cloud training
**Total download (everything):** ~35.5GB + cloud training

---

## Execution Order (When Internet Available)

### Session A: Style + Quality (most impactful)
1. Download `flux1-dev-Q4_K_S.gguf` (6.81GB) — swap for Q4_0
2. Download `t5xxl_fp8_e4m3fn.safetensors` (4.89GB) — better text encoder
3. Extract training data from Core Rulebook PDF
4. Train Style LoRA (cloud or local)
5. Test: generate faces with Style LoRA — should be consistent style across seeds

### Session B: ControlNet Upgrade
1. Download InstantX ControlNet Union (6.6GB)
2. Create new workflow with standard ControlNet nodes
3. Test angle control without style interference
4. Remove XLabs dependency (keep as fallback)

### Session C: RAM Upgrade + fp8
1. Install 48GB RAM
2. Download `flux1-dev-fp8.safetensors` (17.2GB)
3. Switch to fp8 workflow — faster generation
4. Enable 1024x1024 resolution
5. Test full pipeline at high res

---

## End State

With all upgrades:
- **Style LoRA** enforces GRO.WTH visual identity on every generation
- **InstantX ControlNet** controls pose/angle without affecting style
- **PuLID** maintains face identity across all compositions
- **fp8 + 48GB RAM** enables fast, high-res generation
- **DWPose** enables full body pose control

Result: consistent character generation from any angle, in any outfit, at any age — all looking like the same person in the same art style. Ready for dynamic portrait updates and 3D model generation.
