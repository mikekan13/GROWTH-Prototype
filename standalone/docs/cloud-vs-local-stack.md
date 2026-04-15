# Cloud vs local stack — why they diverge on purpose

**Short version:** local is VRAM-constrained (8GB), cloud is compute-optimized (24GB 4090). Using the same models/settings in both leaves 50-70% of cloud performance unused. Outputs stay visually identical because the weight lineage is identical (Flux Dev) — only precision differs.

## The differences, per setting

| Setting | Local (8GB) | Cloud (24GB 4090) | Why different |
|---|---|---|---|
| UNet loader | `UnetLoaderGGUF` | `UNETLoader` | GGUF is a quantization wrapper. FP8 is native. |
| UNet weights | `flux1-dev-Q4_K_S.gguf` (~7GB) | `flux1-dev-fp8.safetensors` (~12GB) | Q4 dequant doubles per-step time; FP8 runs native on 4090 |
| VAE decoder | `VAEDecodeTiled` (512 px tiles) | `VAEDecode` (single pass) | Tiled = slower but lower VRAM peak; 24GB has no peak issue |
| InsightFace provider | `CPU` | `CUDA` | CPU face detection adds 3-5s per gen; CUDA is near-instant |
| KSampler steps | Respect workflow JSON | Respect workflow JSON | Hyper-FLUX is 8-step; provider must NOT override to 20 |
| Default resolution | 768×768 | 1024×1024 or 768 | VRAM headroom allows larger latents |
| ControlNet variant | Union Pro 2 FP8 | Union Pro 2 full | Cloud can afford the larger model |

## How it works in code

The standalone provider at `src/ai/portraits/providers/local.ts` auto-detects by the `COMFYUI_URL`:

```ts
const COMFYUI_REMOTE = !/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/i.test(COMFYUI_URL);
```

When `COMFYUI_REMOTE === true`, the workflow JSON is transformed before submission:
1. Swap `UnetLoaderGGUF` → `UNETLoader`, change `unet_name` to the FP8 file
2. Swap `VAEDecodeTiled` → `VAEDecode`
3. Swap `PulidFluxInsightFaceLoader.provider` from `"CPU"` to `"CUDA"`
4. Respect the workflow's `steps` field (do NOT force 20 when it says 8)

Workflow JSONs stay single-source. One set of files, two deployment targets.

## Output parity policy

Same prompt, same seed, same workflow logic on both machines → **visually identical outputs**. Pixel-level precision differences between FP8 and Q4 are sub-perceptual.

If strict bit-identity is ever needed (e.g., for an automated identity-similarity benchmark that compares cloud vs local outputs), both machines can be configured to use Q4 — cloud just loses ~30% speed. In the common case, accept the invisible difference and take the speed.

## Expected speeds

| Workflow | Local 8GB | Cloud 4090 24GB |
|---|---|---|
| `character-portrait` (20-step Flux Dev baseline) | 180s | 30-40s |
| `character-body-fast` (Hyper-FLUX 8-step + FBCache) | 76s | 15-25s |
| `character-face-controlnet-instantx` (PuLID + ControlNet + Hyper-FLUX) | — (OOM) | 20-30s |
| `character-face-ipadapter-fast` (IPA + Hyper-FLUX) | 120s | 25-35s |

Cloud isn't magic. It's ~3× faster GPU + removed 8GB workarounds. Not 10×. Schnell workhorse + Hyper-FLUX would push another 2× but we stay on Dev for quality during dev.

## What to do if cloud is slow

Check in order:
1. Workflow cascade: did the requested workflow actually run, or did it cascade through failures? Each failed workflow unloads models and pays cold-load tax on the next attempt. Look for `"Generation complete using workflow: X"` vs `"Workflow Y failed, trying next"` in the dev-server log.
2. Model load: is the log showing `loaded completely X MB, full load: True` on every gen? With `--highvram`, that should only fire on cold start. If it fires every gen, models are thrashing — probably cascade-induced.
3. Step count: is it sampling at 8 steps (Hyper-FLUX) or 20 (the provider's default)? If 20 and the workflow said 8, the provider is overriding — that's a bug.
4. Sampler speed itself: ~2s/step for Flux Dev FP8 on 4090 is normal. If higher, something is wrong with the pod (VRAM pressure, thermal throttle, model file corruption).
