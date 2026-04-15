---
name: Portrait Model Stack (Current)
description: Complete list of AI models installed for portrait generation as of 2026-04-14
type: reference
---

## Base Models (C:\AI\ComfyUI\models\)

| Model | Path | Size | Status |
|-------|------|------|--------|
| FLUX.1 Dev Q4_K_S GGUF | unet/flux1-dev-Q4_K_S.gguf | 6.81GB | Active |
| FLUX.1 Dev Q4_0 GGUF | unet/flux1-dev-Q4_0.gguf | 6.79GB | Fallback |
| t5xxl fp8 | clip/t5xxl_fp8_e4m3fn.safetensors | 4.89GB | Active |
| t5xxl Q4_K_M GGUF | clip/t5-v1_1-xxl-encoder-Q4_K_M.gguf | 2.9GB | Fallback |
| CLIP-L | clip/clip_l.safetensors | ~250MB | Active |
| VAE | vae/ae.safetensors | ~300MB | Active |
| PuLID Flux v0.9.1 | pulid/pulid_flux_v0.9.1.safetensors | ~1GB | Active (patched) |

## ControlNet (C:\AI\ComfyUI\models\controlnet\)

| Model | Size | Status |
|-------|------|--------|
| Union Pro 2.0 FP8 | 2.14GB | **Active** — fits in 16GB RAM |
| InstantX Union (full) | 6.6GB | Installed but too large for 16GB |
| XLabs Canny v3 | 1.49GB | Fallback (Canny only, no pose) |

## LoRAs (C:\AI\ComfyUI\models\loras\)

| LoRA | Size | Trigger | Default Strength |
|------|------|---------|-----------------|
| painterly-fantasy-ckpf | 77MB | `in the style of ckpf,` | 0.6 |
| extreme-detailer-flux | 77MB | none | 0.5 |
| hand-detail-flux | 90MB | none | 0.6 |
| flux-nsfw-unlock | 19MB | `aidmaNSFWunlock` | 0.0 (conditional) |
| dark-fantasy-v2-flux | 19MB | unknown | 0.4 (campaign slot) |

## Total RAM footprint (all loaded)
~15.3GB — fits in 16GB with --normalvram
