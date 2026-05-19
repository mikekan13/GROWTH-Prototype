# Lightweight ControlNet Alternatives for FLUX.1 Dev — Pose Control Research

Last updated: 2026-04-13

## Problem Statement

The full FLUX portrait stack requires:
- FLUX.1 Dev Q4_K_S GGUF: **6.8 GB**
- t5xxl_fp8_e4m3fn: **4.9 GB**
- PuLID Flux II: **~1 GB**
- LoRAs (global + campaign): **~0.5 GB**
- **Subtotal: ~13.2 GB** (of 16 GB system RAM)

InstantX FLUX ControlNet Union (original): **6.6 GB** — DOES NOT FIT.

We need pose control that adds no more than **~2-2.5 GB** to the stack.

---

## 1. Shakker-Labs Union Pro 2.0 FP8 (BEST OPTION)

**Model:** `ABDALLALSWAITI/FLUX.1-dev-ControlNet-Union-Pro-2.0-fp8`
**URL:** https://huggingface.co/ABDALLALSWAITI/FLUX.1-dev-ControlNet-Union-Pro-2.0-fp8
**File:** `diffusion_pytorch_model.safetensors` — **2.14 GB**
**Format:** FP8 (E4M3FN) quantization of Shakker-Labs Union Pro 2.0

### Key Facts
- Architecture: 6 double blocks, 0 single blocks (smaller than original Union which had 19 double + 38 single)
- Mode embedding REMOVED (further size reduction vs v1)
- Supports: **canny, soft edge, depth, POSE, gray** — all 5 modes
- Trained from scratch on 20M high-quality general + human images at 512x512
- **Pose support is explicitly listed and showcased**
- ~50% size reduction from BF16 original (~4.28 GB → 2.14 GB)
- Community-made quantization, 3K+ downloads, well-tested

### Feasibility: HIGH
- 13.2 GB (base stack) + 2.14 GB = **15.34 GB** — fits in 16 GB system RAM
- Tight but workable. ComfyUI `--lowvram` flag helps manage GPU allocation.
- This is a direct drop-in replacement for the original Union model.

### Alternative FP8 repos (same model, different uploaders):
- `upsman/FLUX.1-dev-ControlNet-Union-Pro-2.0-fp8` (36 downloads)
- `Atxous/FLUX.1-dev-ControlNet-Union-Pro-fp8` (v1 FP8, 31 downloads)

---

## 2. XLabs ControlNet v3 Models (GOOD ALTERNATIVE)

**URL:** https://huggingface.co/XLabs-AI/flux-controlnet-collections

### Available Models (all ~1.49 GB each):
| Model | File | Size | Input Type |
|-------|------|------|------------|
| Canny v3 | `flux-canny-controlnet-v3.safetensors` | 1.49 GB | Edge maps (Canny) |
| Depth v3 | `flux-depth-controlnet-v3.safetensors` | 1.49 GB | Depth maps (Midas) |
| HED v3 | `flux-hed-controlnet-v3.safetensors` | 1.49 GB | Soft edge maps (HED) |

### Can XLabs Canny/HED Be Used for Pose?
**NO** — XLabs does NOT have a pose-specific model. Their models are:
- **Canny**: Hard edge detection only. Feeding DWPose skeleton images would not work well — it expects full edge outlines, not stick figures.
- **Depth**: Works with Midas depth maps. Could provide angle/pose guidance indirectly via depth.
- **HED**: Soft edge detection. Same issue as Canny for pose skeletons.

### XLabs Depth v3 as Indirect Pose Control
The **depth map approach** is actually promising for our use case:
- Render a 3D head/bust from target angle → extract depth map → feed to Depth ControlNet
- Controls head angle and body orientation without explicit pose skeletons
- 1.49 GB — very light, fits easily (13.2 + 1.49 = **14.69 GB**)
- Already have the Canny model downloaded; Depth is same architecture/size

### Feasibility: MEDIUM-HIGH
- Works well for head angle control (our primary need for portraits)
- Does NOT give fine-grained body pose (limb positions, hand gestures)
- Best for bust/portrait framing where angle is the main variable

---

## 3. XLabs FLUX IP-Adapter v2 (SUPPLEMENTARY)

**Model:** `XLabs-AI/flux-ip-adapter-v2`
**URL:** https://huggingface.co/XLabs-AI/flux-ip-adapter-v2
**File:** `ip_adapter.safetensors` — **1.06 GB**
**Requires:** CLIP-ViT-Large (`openai/clip-vit-large-patch14`) — ~600 MB

### What It Does
- Image-guided generation: feed a reference image, get stylistically similar output
- Transfers visual style, composition, and rough pose from reference
- NOT precise pose control — more like "generate something that looks like this"
- Can be combined with ControlNet for identity + pose

### Feasibility: LOW for pose control
- Does not provide precise angle/pose control
- Useful as identity transfer (alternative/complement to PuLID), not pose
- Total: 1.06 GB + 0.6 GB CLIP = **1.66 GB** — fits in RAM
- Already have PuLID for identity; IP-Adapter would be redundant for that purpose

---

## 4. InstantX FLUX IP-Adapter (TOO LARGE)

**Model:** `InstantX/FLUX.1-dev-IP-Adapter`
**File:** `ip-adapter.bin` — **5.29 GB**
**Requires:** SigLIP (`google/siglip-so400m-patch14-384`)

### Verdict: DOES NOT FIT
- 5.29 GB is nearly as bad as the original ControlNet Union
- Uses SigLIP instead of CLIP (better quality but larger)
- Not practical for 16 GB system RAM

---

## 5. GGUF ControlNets for FLUX

**Search result: 0 models found** on HuggingFace for "flux controlnet gguf"

### Verdict: DOES NOT EXIST
- GGUF quantization has only been applied to the base FLUX diffusion model
- No one has created GGUF-quantized ControlNet models for FLUX
- The GGUF ecosystem (llama.cpp-based) doesn't support ControlNet architectures
- FP8 is the best available quantization for FLUX ControlNets

---

## 6. Img2Img with Low Denoise (NO EXTRA MODEL)

### Approach
- Generate a base portrait normally (no ControlNet)
- Create a pose reference image (photograph, 3D render, or AI-generated from a different angle)
- Use img2img with low denoise strength (0.3-0.5) to "re-paint" while preserving pose

### Pros
- **Zero additional model weight** — uses the same FLUX GGUF already loaded
- Simple workflow: just add a KSampler with latent image input
- PuLID still provides face identity

### Cons
- Low denoise = keeps too much of reference (artifacts, style bleed)
- High denoise = loses the pose guidance
- Not reliable for consistent angle control across multiple generations
- Requires a good reference image for each angle (chicken-and-egg problem)

### Feasibility: LOW
- Fine for one-off experiments, not reliable for a production pipeline
- Cannot guarantee consistent results across the 7 angle presets

---

## 7. 3D Mesh Approach (PROMISING BUT COMPLEX)

### Concept
1. Generate one high-quality front-facing portrait
2. Create a 3D head mesh from it (TripoSR, Hunyuan3D, or similar)
3. Render the mesh from any target angle
4. Use the render as depth map input for ControlNet, or as img2img reference

### Available Tools in ComfyUI
- **TripoSR**: Single-image 3D reconstruction. ComfyUI node exists (`ComfyUI-TripoSR`). Model is ~1.5 GB.
- **Hunyuan3D**: Tencent's 3D generation model. Very new, ComfyUI support unclear. Much larger.
- **Era3D**: Multi-view generation from single image. Not yet in ComfyUI.
- **Instant3D / Zero123++**: Older single-to-multi-view. ComfyUI nodes exist.

### Memory Impact
- TripoSR would need to be loaded SEPARATELY from the portrait generation pipeline
- Could run as a one-time preprocessing step, then unload before portrait generation
- Adds complexity: two-stage pipeline (3D reconstruction → render → portrait generation)

### Feasibility: MEDIUM (future phase)
- Interesting for Phase B/C when we want full turnaround consistency
- Too complex for initial pose control needs
- ComfyUI CAN load/unload models between workflow stages (see section 8)

---

## 8. ComfyUI Memory Management

### Key Flags
- `--lowvram`: Aggressive memory management. Keeps minimum in VRAM, swaps to system RAM. ~20-30% slower.
- `--novram`: Offloads everything to CPU, only moves active computation to GPU. Very slow.
- `--cpu`: Run entirely on CPU (unusably slow for FLUX).

### Model Loading/Unloading
- ComfyUI automatically manages model loading. When a new model is needed and there's not enough memory, it unloads the least recently used model.
- **ControlNet models ARE unloaded when not in use** — they don't stay in memory permanently.
- The concern is PEAK memory during generation, when FLUX + T5 + ControlNet + PuLID all need to be partially loaded.
- With `--lowvram`, ComfyUI will stream model chunks in/out of VRAM as needed.

### Tiled VAE
- Enable tiled VAE decoding to reduce peak VRAM during the decode step
- This is independent of ControlNet and helps in all cases

---

## Recommendation: Tiered Approach

### Tier 1 — Immediate (use now)
**Shakker-Labs Union Pro 2.0 FP8** (2.14 GB)
- Download from: `ABDALLALSWAITI/FLUX.1-dev-ControlNet-Union-Pro-2.0-fp8`
- File: `diffusion_pytorch_model.safetensors`
- Supports pose directly — this is the answer to "lightweight ControlNet with pose"
- Total stack: ~15.3 GB — tight but fits with `--lowvram`
- Drop-in replacement, works with standard ComfyUI ControlNet nodes

### Tier 2 — Fallback (if FP8 Union causes OOM)
**XLabs Depth v3** (1.49 GB) + rendered depth maps from target angles
- Less precise than pose skeleton, but 650 MB lighter
- Good enough for head angle control in portrait/bust framing
- Total stack: ~14.7 GB — more comfortable margin

### Tier 3 — Future (Phase B+)
**3D mesh pipeline** (TripoSR → render → depth/img2img)
- Run 3D reconstruction as preprocessing, unload before generation
- Gives unlimited angle control from a single image
- Worth exploring when the base pipeline is stable

### NOT Recommended
- InstantX IP-Adapter (5.29 GB — too large)
- XLabs IP-Adapter (doesn't provide pose control)
- GGUF ControlNet (doesn't exist)
- Img2img low denoise (unreliable)
- XLabs Canny/HED for pose (wrong input type)

---

## RAM Budget Summary

| Component | Size | Cumulative |
|-----------|------|------------|
| FLUX.1 Dev Q4_K_S GGUF | 6.8 GB | 6.8 GB |
| t5xxl_fp8_e4m3fn | 4.9 GB | 11.7 GB |
| PuLID Flux II | ~1.0 GB | 12.7 GB |
| LoRAs (2x) | ~0.5 GB | 13.2 GB |
| **Union Pro 2.0 FP8** | **2.14 GB** | **15.34 GB** |
| ComfyUI + OS overhead | ~1-2 GB | 16-17 GB |

This is tight at 16 GB system RAM. Mitigations:
1. ComfyUI `--lowvram` flag (streams models in/out)
2. Close all other applications during generation
3. T5 encoder can be unloaded after text encoding (before diffusion starts)
4. ControlNet is only loaded during the diffusion steps where it's active
5. Consider 32 GB RAM upgrade as the real long-term fix
