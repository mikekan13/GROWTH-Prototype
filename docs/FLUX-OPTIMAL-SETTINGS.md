# FLUX.1 Dev Optimal Settings for RTX 4060 8GB

Research compiled 2026-04-12. Hardware: RTX 4060 8GB VRAM, 48GB RAM (upgrading), ComfyUI + ComfyUI-GGUF.

---

## 1. Resolution

**Target: 1024x1024** -- fully achievable on 8GB VRAM with Q4_K_S or Q5_K_S GGUF.

| Quantization | Resolution  | Peak VRAM | Time (20 steps) |
|-------------|-------------|-----------|-----------------|
| Q4_K_S      | 768x1024    | ~5.8 GB   | ~31s             |
| Q4_K_S      | 1024x1024   | ~6.2 GB   | ~38s             |
| Q5_K_S      | 1024x1024   | ~7.4 GB   | ~42s             |
| Q4_K_S+LoRA | 1024x1024   | ~6.8 GB   | ~41s             |

- 1024x1024 is comfortable. 1280x1280 is possible with tiled VAE but risky.
- 1536x1536 will almost certainly OOM on 8GB.
- For larger outputs: generate at 1024x1024, then upscale with RealESRGAN 4x in a separate pass. Better results than generating at higher res directly.
- With 48GB RAM: no change to max resolution (VRAM is the bottleneck for attention), but model loading/offloading will be instant with no swapping.

## 2. Steps

**Recommended: 20-25 steps for production, 4 steps with Schnell for prototyping.**

- 20 steps: good quality, ~38-42s on RTX 4060
- 25 steps: marginal improvement, worth it for final renders
- 30 steps: diminishing returns, only for maximum quality
- 50+ steps: no meaningful improvement, wastes time
- Below 15: visible artifacts, grid patterns in smooth gradients

**Workflow tip:** Use FLUX Schnell at 4 steps (~10s) for composition/prompt iteration, then switch to Dev GGUF at 20-25 steps for final output.

## 3. GGUF Quantization Levels

**Current: Q4_0 (6.79 GB). Recommended upgrade: Q5_K_S (8.29 GB).**

| Quant   | File Size | Quality vs FP16 | Notes                                      |
|---------|-----------|-----------------|---------------------------------------------|
| Q4_0    | 6.79 GB   | ~90%            | Usable but loses fine detail, text, textures |
| Q4_K_S  | 6.81 GB   | ~92%            | Better than Q4_0 at same size (use K quants) |
| Q5_K_S  | 8.29 GB   | ~95%            | **Best for 8GB cards.** Minimal visible loss  |
| Q5_0    | 8.27 GB   | ~94%            | Slightly worse than Q5_K_S                   |
| Q6_K    | 9.86 GB   | ~97%            | Won't fit 8GB VRAM. Needs 12GB card.         |
| Q8_0    | 12.7 GB   | ~99%            | Nearly identical to FP16. Needs 12GB+ card.  |

Key findings:
- **Q4_0 to Q5_K_S is the single biggest quality jump you can make.** Q5_K_S preserves ~95% quality and fits in 8GB (7.4GB peak VRAM at 1024x1024).
- Q4_K_S (6.81 GB) is better than Q4_0 (6.79 GB) at essentially the same size -- always prefer K-quants over plain quants.
- Q3 surprisingly maintains reasonable quality (per HuggingFace comparison images).
- Q4 loses precision on complex prompts (may miss specific details like "gold embroidery").
- Community consensus from HF discussions: Q5_K_S and Q6_K are the "best compromise between performance and quality loss."

**Action: Download `flux1-dev-Q5_K_S.gguf` from [city96/FLUX.1-dev-gguf](https://huggingface.co/city96/FLUX.1-dev-gguf). Also download Q4_K_S as fallback for LoRA stacking.**

## 4. T5 Text Encoder

**Current: t5-v1_1-xxl-encoder-Q4_K_M.gguf (2.9 GB). Consider upgrading to fp8 (4.89 GB).**

| Encoder                          | Size    | Quality  | Notes                                    |
|----------------------------------|---------|----------|-------------------------------------------|
| t5-v1_1-xxl-encoder-Q4_K_M.gguf | 2.9 GB  | Good     | May lose complex prompt details            |
| t5xxl_fp8_e4m3fn.safetensors     | 4.89 GB | Better   | Better prompt adherence, standard choice   |
| t5xxl_fp16.safetensors           | ~9.5 GB | Best     | Too large for 8GB setups                   |

- fp8 T5 is the community standard for 8GB setups -- most guides and benchmarks assume it.
- Q4_K_M GGUF T5 saves ~2GB but may reduce prompt adherence on complex prompts.
- With 48GB RAM: T5 can be offloaded to CPU after prompt encoding (it's only needed once at generation start), freeing 2-5GB VRAM during diffusion. This makes fp8 T5 viable even with Q5_K_S model.
- The full FP16 T5 produces the best prompt following but at 9.5GB is impractical for 8GB VRAM even with offloading.

**Action: Download `t5xxl_fp8_e4m3fn.safetensors` from [comfyanonymous/flux_text_encoders](https://huggingface.co/comfyanonymous/flux_text_encoders). 4.89 GB download.**

## 5. CFG, Sampler, and Scheduler

**Recommended settings for GGUF quantized FLUX Dev:**

| Setting    | Value               | Notes                                              |
|-----------|---------------------|-----------------------------------------------------|
| CFG       | 1.0                 | FLUX uses guidance embedding, not traditional CFG    |
| Guidance  | 3.0-3.5             | Via FluxGuidance node. Compensates for quant loss.   |
| Sampler   | **euler**            | Most forgiving with quantized models                 |
| Sampler   | dpmpp_2m             | Also works well                                     |
| Scheduler | **simple**           | Best with euler for quantized FLUX                  |
| Scheduler | discrete             | Alternative                                         |

- **Avoid:** dpm_fast, uni_pc -- these amplify quantization artifacts.
- FLUX is NOT like SD1.5/SDXL -- do not use high CFG values. CFG should stay at 1.0.
- The guidance value (3.0-3.5) in the FluxGuidance node is separate from CFG. This is the main quality knob.
- For short prompts: guidance 4.0 can work. For long/creative prompts: guidance 1.0-1.5.

## 6. Quality Tricks

### VAE Decode
- Use **VAEDecodeTiled** node instead of VAEDecode. Prevents VRAM spikes during decode.
- Tile size: 512 (max VRAM savings) or 768 (slightly faster).

### Upscaling Workflow
1. Generate at 1024x1024 with FLUX GGUF
2. Run output through RealESRGAN 4x in a separate ComfyUI workflow
3. Result: 4096x4096 output, better quality than generating at high res directly

### LoRA Stacking
- Q4_K_S leaves ~1.8 GB headroom for LoRAs at 1024x1024
- Q5_K_S leaves ~0.6 GB headroom -- tight but works for small LoRAs
- For LoRA work, keep Q4_K_S as your secondary model

### Prototyping Workflow
- FLUX Schnell at 4 steps (~10s) for composition iteration
- Switch to Dev Q5_K_S at 20-25 steps for final render (~42-52s)
- Cuts total iteration time by ~60%

## 7. Performance with 48GB RAM

With 48GB system RAM (your upcoming upgrade):
- **Model loading**: instant, no swap pressure
- **T5 offloading**: fp8 T5 (4.89 GB) offloads to CPU after encoding, freeing VRAM for diffusion
- **No Ollama conflicts**: with 48GB RAM, Ollama can stay loaded alongside ComfyUI
- **Expected times at 1024x1024**: same as benchmarks above (~38-42s) since VRAM is the compute bottleneck
- **CPU offloading penalty**: ~20-30% slower if parts of the model spill to CPU, but with Q5_K_S fitting in VRAM this shouldn't happen

The RAM upgrade primarily eliminates the contention problem you hit (Ollama eating 4.4GB). It won't speed up generation (GPU-bound) but will let you run ComfyUI + Ollama + browser simultaneously without issues.

## 8. ComfyUI-GGUF Status

- Repository: [city96/ComfyUI-GGUF](https://github.com/city96/ComfyUI-GGUF)
- Actively maintained as of April 2026
- Recent PR (#433): adding torch dequantization for IQ1/IQ2/IQ3 quant types (faster loading for ultra-low quants)
- Pending improvement: cublas_ops for 15-20% speedup on matmuls (in PR stage)
- Supports all standard quant types: Q2_K through Q8_0, F16
- Known issue: some newer models (Chroma) have GGML assertion failures during quantization

**Keep the custom node updated via ComfyUI Manager or `git pull` in the custom_nodes directory.**

---

## Recommended Setup (Final)

```
Model:          flux1-dev-Q5_K_S.gguf (8.29 GB)  -- UPGRADE from Q4_0
Fallback:       flux1-dev-Q4_K_S.gguf (6.81 GB)  -- for LoRA stacking
T5 Encoder:     t5xxl_fp8_e4m3fn.safetensors (4.89 GB)  -- UPGRADE from Q4_K_M GGUF
CLIP:           clip_l.safetensors (246 MB)  -- keep as-is
VAE:            ae.safetensors (335 MB)  -- keep as-is
Resolution:     1024x1024
Steps:          20-25
CFG:            1.0
Guidance:       3.5 (FluxGuidance node)
Sampler:        euler
Scheduler:      simple
VAE Decode:     VAEDecodeTiled (tile_size=512)
Upscaler:       RealESRGAN 4x (separate pass for >1024)
```

### Downloads Needed
1. `flux1-dev-Q5_K_S.gguf` -- https://huggingface.co/city96/FLUX.1-dev-gguf (8.29 GB)
2. `t5xxl_fp8_e4m3fn.safetensors` -- https://huggingface.co/comfyanonymous/flux_text_encoders (4.89 GB)
3. Optionally: `flux1-dev-Q4_K_S.gguf` for LoRA workflows (6.81 GB)

### Total new downloads: ~13.2 GB (or ~20 GB with Q4_K_S fallback)
