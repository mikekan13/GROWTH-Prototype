# Local AI Image Generation Toolchain Research (Early 2026)

Research date: 2026-03-15
Use case: Next.js web app calling local image generation, structured character prompts, async image return.
Host: Windows 11, NVIDIA GPU.

---

## 1. TOOLCHAIN / UI COMPARISON

### ComfyUI — RECOMMENDED

- **Status**: Dominant. 106k GitHub stars, 4,913 commits, very active (Comfy-Org). Now includes Comfy Cloud and Comfy Hub.
- **Architecture**: Node-based visual workflow editor. Workflows are JSON graphs. Backend is Python (aiohttp server).
- **API**: REST + WebSocket. POST workflow JSON to `/prompt`, get progress via WebSocket, retrieve outputs via `/history/{prompt_id}` and `/view` endpoints. Built-in queue management (FIFO). Supports `client_id` for multi-client tracking.
- **API Integration Pattern** (Next.js):
  1. Design workflow in ComfyUI GUI, export as JSON (API format via "Save (API Format)")
  2. Next.js backend substitutes prompt text, seed, reference images into the JSON template
  3. POST to `http://localhost:8188/prompt` with the workflow JSON
  4. Monitor progress via WebSocket at `ws://localhost:8188/ws?clientId={id}`
  5. Retrieve generated image from `/view?filename={name}&subfolder={folder}&type=output`
- **Model Support**: SD 1.5, SD 2.x, SDXL, SD 3.5, FLUX.1, FLUX.2, HunyuanDiT, Kolors, PixArt, and more. First-class Flux support.
- **Workflow Customization**: Unlimited. ControlNets, IP-Adapters, PuLID, InstantID, LoRAs, upscalers, inpainting, outpainting — all via custom nodes.
- **VRAM Management**: `--lowvram`, `--novram` (full CPU offload), `--cpu` flags. Automatic model management and caching.
- **Custom Nodes**: 3,400+ custom node packages (via ComfyUI Manager). Covers every use case.
- **Queue**: Built-in. Multiple prompts queued, processed sequentially. WebSocket reports progress per-prompt.
- **Verdict**: Best choice for production integration. The JSON workflow API is the cleanest way to programmatically drive image generation.

### SD WebUI Forge (lllyasviel)

- **Status**: Active but slower development. 12.3k stars. Based on A1111 WebUI 1.10.1, syncs every ~90 days.
- **Key Advantage**: Superior VRAM optimization over A1111. Uses Forge memory management (smarter model loading/unloading).
- **API**: Gradio-based REST API (`/sdapi/v1/txt2img`, `/sdapi/v1/img2img`, etc.). Functional but tied to Gradio framework.
- **Model Support**: SD 1.5, SDXL, Flux (basic). ControlNets, IP-Adapters, InstantID all working. Flux ControlNet/IP-Adapter support still pending (as of last status update Aug 2024).
- **Limitations**: Gradio API is clunkier than ComfyUI's native REST. Less flexible for complex multi-step pipelines. Flux support is second-class compared to ComfyUI.
- **Verdict**: Good for simple txt2img/img2img via API. Not ideal for complex character portrait pipelines.

### Automatic1111 (stable-diffusion-webui)

- **Status**: Largely superseded. 162k stars (legacy popularity) but development is "almost static." Last meaningful updates were incremental.
- **API**: Same Gradio `/sdapi/v1/*` endpoints as Forge.
- **Why It's Declining**: No VRAM optimizations (Forge does this better), no native Flux support, no DiT model support. The community has migrated to Forge or ComfyUI.
- **Verdict**: Legacy. Do not adopt for new projects. Use Forge if you want the A1111 UX, or ComfyUI for production.

### Fooocus

- **Status**: Active, 47.9k stars. Midjourney-like simplicity.
- **Philosophy**: "Focus on prompting" — minimal configuration, opinionated defaults. Built on SDXL.
- **API**: Gradio-based with `--listen` and `--share` flags. No clean REST API for programmatic use. Community forks (e.g., Fooocus-API) add REST endpoints but are third-party.
- **Model Support**: SDXL-focused. Not designed for Flux or DiT models.
- **VRAM**: Impressively low — runs on 4GB VRAM (RTX 4xxx) with system swap.
- **Limitations**: No node-based workflows, no complex pipelines. SDXL only. Not designed for API-driven production use.
- **Verdict**: Great for personal use. Not suitable for programmatic integration into a web app.

### InvokeAI

- **Status**: Active, 26.9k stars. Professional-oriented with commercial products built on top.
- **Architecture**: Node-based workflow engine (similar philosophy to ComfyUI). Python backend with a polished React web UI.
- **API**: Built-in REST API (FastAPI-based). Well-documented endpoints for queuing, generation, and retrieval. Supports SD 1.5, SD 2.0, SDXL, and FLUX.
- **Strengths**: Clean architecture, good model management, training support (separate repo). Docker support.
- **Limitations**: Smaller custom node ecosystem than ComfyUI. Fewer community workflows. Flux support came later than ComfyUI.
- **Verdict**: Solid alternative to ComfyUI with a cleaner API. Worth considering if ComfyUI's node ecosystem isn't needed. However, the community momentum strongly favors ComfyUI.

---

## 2. MODEL COMPARISON

### FLUX.2 Dev (Black Forest Labs) — 32B params — RECOMMENDED

- **Released**: Late 2025
- **Quality**: State-of-the-art open text-to-image. Supports generation, single-reference editing, and multi-reference editing IN ONE MODEL.
- **Key Feature**: No finetuning needed for character/object/style reference. Built-in reference conditioning.
- **Text Encoder**: Mistral-Small-3.2-24B-Instruct (massive — this is a significant VRAM consideration).
- **Architecture**: Rectified flow transformer (DiT).
- **License**: Non-commercial (same as FLUX.1 Dev). Free for personal/scientific/commercial use per license terms.
- **VRAM Requirements** (GGUF quantizations, model weights only — add ~4-8GB for text encoder):

| Quantization | Model Size | Min VRAM (est. with text encoder GGUF) |
|---|---|---|
| Q2_K | 12.9 GB | ~20 GB (needs quantized text encoder too) |
| Q3_K_S | 15.8 GB | ~24 GB |
| Q4_0 / Q4_K_S | 19.3 GB | ~28 GB |
| Q5_K_S | 23.2 GB | ~32 GB |
| Q8_0 | 35 GB | ~44 GB |
| BF16 | 64.4 GB | ~90 GB |

- **Critical Note**: FLUX.2 is MUCH larger than FLUX.1 (32B vs 12B). The text encoder alone (Mistral-Small-3.2-24B) is 24B parameters. Even Q2_K quantization may not fit on 8GB or even 12GB cards when accounting for text encoder + VAE + working memory.
- **8GB Card Reality**: FLUX.2 is NOT practical on 8GB VRAM. Even with aggressive quantization, the combined model + text encoder + VAE + working memory exceeds 8GB.
- **16GB Card**: Possible with Q2_K model + heavily quantized text encoder + aggressive CPU offloading. Marginal.
- **24GB Card**: Comfortable with Q2_K or Q3_K. Usable with Q4_K_S if text encoder is quantized.
- **Generation Speed**: Not benchmarked widely yet due to recency. Expect slower than FLUX.1 due to 2.7x parameter count.

### FLUX.1 Dev (Black Forest Labs) — 12B params — BEST FOR 8-16GB VRAM

- **Released**: Aug 2024
- **Quality**: Excellent. Second only to FLUX.1 Pro (closed) and FLUX.2. Superior prompt following compared to SDXL/SD3.5.
- **Architecture**: Rectified flow transformer, guidance-distilled.
- **Text Encoder**: T5-XXL + CLIP (standard, much lighter than FLUX.2's Mistral).
- **License**: Non-commercial (FLUX Dev license). Personal/scientific/commercial use allowed per terms.
- **VRAM Requirements** (GGUF quantizations):

| Quantization | Model Size | Estimated Total VRAM (with T5 + VAE) |
|---|---|---|
| Q2_K | 4.0 GB | ~8-10 GB |
| Q4_0 / Q4_K_S | 6.8 GB | ~10-12 GB |
| Q5_K_S | 8.3 GB | ~12-14 GB |
| Q8_0 | 12.7 GB | ~16-18 GB |
| F16 | 23.8 GB | ~28-30 GB |

- **8GB Card**: Works with Q2_K or Q4_0 + quantized T5 text encoder + `--lowvram` flag. 1024x1024 generation feasible.
- **12GB Card**: Comfortable with Q4_K_S. Good quality/performance balance.
- **16GB Card**: Q8_0 runs well. Near-full quality.
- **24GB Card**: F16 (full quality) with room to spare.
- **Generation Speed**: ~15-30 seconds at 1024x1024 on RTX 4060 (Q4, 20 steps). Faster with fewer steps or turbo schedulers.
- **Ecosystem**: Mature. PuLID, IP-Adapter, ControlNet, LoRA all available for FLUX.1.
- **Verdict**: Best model for 8-16GB GPUs. Production-proven ecosystem.

### FLUX.1 Kontext Dev

- **Released**: 2025
- **Purpose**: Image editing / context-aware generation. In-context editing without separate ControlNets.
- **Relevance**: Useful for portrait editing (style transfer, outfit changes) but not primary generation.

### SDXL (Stability AI) — 6.6B params

- **Released**: Jul 2023
- **Quality**: Good but noticeably below Flux in prompt adherence, text rendering, and composition.
- **VRAM**: ~6-8 GB for base generation. Very efficient.
- **Ecosystem**: Most mature. Thousands of LoRAs, ControlNets, and fine-tunes on CivitAI.
- **Advantages Over Flux**: Lower VRAM, faster generation (~5-10s at 1024x1024), massive fine-tune library.
- **Disadvantages**: Worse faces (without face-fix models), weaker prompt following, no built-in reference conditioning.
- **Verdict**: Still relevant for low-VRAM systems or when specific fine-tuned styles are needed. Use FLUX.1 if VRAM allows.

### SD 3.5 (Stability AI) — Multiple Variants

**SD 3.5 Large** — 8.1B params (MMDiT architecture)
- Superior quality and prompt adherence in the SD family.
- 1 megapixel (1024x1024) target resolution.
- Permissive license (Stability Community License — free for <$1M annual revenue).
- VRAM: ~16 GB for full inference.

**SD 3.5 Large Turbo** — Distilled version
- 4-step generation (fast).
- Slight quality reduction vs Large.
- Good for rapid iteration / preview.

**SD 3.5 Medium** — 2.5B params (MMDiT-X architecture)
- Only 9.9 GB VRAM (excluding text encoders).
- Competitive quality for its size.
- Good for 8-12 GB cards.

- **Overall SD 3.5 Assessment**: Quality is good but community adoption has been lukewarm compared to Flux. Fewer community fine-tunes and LoRAs. The Stability Community License is more permissive than FLUX Dev's license. Consider SD 3.5 Medium if licensing matters and VRAM is limited.

### HunyuanDiT (Tencent) — 1.5B params

- **Released**: Mid 2024
- **Strength**: Excellent Chinese text understanding. Multi-resolution support.
- **VRAM**: ~20 GB for full-parameter, ~16 GB with optimizations. Kohya fine-tuning at ~16 GB.
- **ComfyUI Support**: Yes (dedicated nodes).
- **Verdict**: Niche. Primarily relevant for Chinese-language prompts. Not competitive with Flux for English prompts.

---

## 3. IDENTITY PRESERVATION TOOLS (for Character Consistency)

### PuLID (Pure and Lightning ID Customization)

- **Status**: NeurIPS 2024 paper, actively maintained. 3.5k stars.
- **Supports**: SDXL (original) and **FLUX** (PuLID-FLUX, including FLUX.2 via community nodes).
- **ComfyUI Node**: `ComfyUI-PuLID-Flux` (balazik, 709 stars).
- **How It Works**: Contrastive alignment — injects identity features into the diffusion process without degrading model quality ("zero model pollution").
- **Requirements**: Single reference face image. No training needed.
- **VRAM Overhead**: ~1-2 GB additional on top of base model.
- **Verdict**: Best choice for GRO.WTH. Lightweight, no training, preserves base model quality.

### InstantID

- **Status**: 11.9k stars. Uses ControlNet + InsightFace for identity.
- **Supports**: SDXL primarily. No native Flux support.
- **VRAM**: Heavier than PuLID (ControlNet + IP-Adapter + InsightFace models loaded simultaneously).
- **Verdict**: Good quality but SDXL-only and VRAM-heavy. PuLID is better for Flux workflows.

### IP-Adapter (Plus)

- **Status**: 5.8k stars. Multiple model variants for SD 1.5, SDXL, Kolors.
- **Supports**: SD 1.5, SDXL. Flux IP-Adapter exists (InstantX/FLUX.1-dev-IP-Adapter).
- **ComfyUI Node**: `ComfyUI_IPAdapter_plus` (cubiq). Comprehensive unified loader.
- **Use Case**: Style transfer, composition reference. Less precise for face identity than PuLID.
- **Verdict**: Complementary to PuLID. Use IP-Adapter for style/composition, PuLID for face identity.

---

## 4. VRAM GUIDE BY GPU TIER

### 8 GB (RTX 4060, RTX 3060 8GB, RTX 4060 Laptop)

| Model | Quantization | Feasible? | Notes |
|---|---|---|---|
| FLUX.1 Dev | Q4_0 GGUF | Yes | With quantized T5, `--lowvram`. ~20-30s/image |
| FLUX.1 Dev | Q2_K GGUF | Yes | Lower quality but faster |
| FLUX.2 Dev | Any | No | Too large even at Q2_K |
| SDXL | FP16 | Yes | Comfortable, fastest option |
| SD 3.5 Medium | FP16 | Yes | With text encoder offloading |
| SD 3.5 Large | Any | Marginal | Needs aggressive offloading |

**Recommended for 8GB**: FLUX.1 Dev Q4_0 GGUF + PuLID + ComfyUI `--lowvram`

### 12 GB (RTX 4070, RTX 3060 12GB)

| Model | Quantization | Feasible? | Notes |
|---|---|---|---|
| FLUX.1 Dev | Q4_K_S GGUF | Yes | Good quality/perf balance |
| FLUX.1 Dev | Q8_0 GGUF | Tight | With T5 quantized |
| FLUX.2 Dev | Q2_K GGUF | No | Still too large with text encoder |
| SDXL | FP16 | Yes | Very comfortable |
| SD 3.5 Large | FP16 | Yes | Comfortable |

**Recommended for 12GB**: FLUX.1 Dev Q4_K_S + PuLID

### 16 GB (RTX 4070 Ti, RTX 5060)

| Model | Quantization | Feasible? | Notes |
|---|---|---|---|
| FLUX.1 Dev | Q8_0 GGUF | Yes | Near-full quality |
| FLUX.1 Dev | F16 | Tight | With T5 on CPU |
| FLUX.2 Dev | Q2_K GGUF | Marginal | Needs quantized Mistral text encoder + CPU offload |
| SD 3.5 Large | FP16 | Yes | Comfortable |

**Recommended for 16GB**: FLUX.1 Dev Q8_0 + PuLID

### 24 GB (RTX 4090, RTX 3090, RTX 5080)

| Model | Quantization | Feasible? | Notes |
|---|---|---|---|
| FLUX.1 Dev | F16 | Yes | Full quality, fast |
| FLUX.2 Dev | Q3_K_S GGUF | Yes | With quantized Mistral TE |
| FLUX.2 Dev | Q4_K_S GGUF | Tight | With quantized Mistral TE |
| SD 3.5 Large | FP16 | Yes | Comfortable |

**Recommended for 24GB**: FLUX.2 Dev Q3_K or FLUX.1 Dev F16 + PuLID

---

## 5. RECOMMENDATION FOR GRO.WTH

### Primary Stack: ComfyUI + FLUX.1 Dev (GGUF) + PuLID

**Why this combination:**
1. **ComfyUI** is the clear winner for API-driven integration. JSON workflow API, built-in queue, WebSocket progress reporting.
2. **FLUX.1 Dev** (not FLUX.2) is the right model given the RTX 4060 8GB constraint. Q4_0 GGUF fits in 8GB with `--lowvram`.
3. **PuLID** provides zero-training identity consistency from a single reference face — exactly what the portrait pipeline needs.

**FLUX.2 is aspirational but not practical yet** for 8GB VRAM. When Mike upgrades the GPU or adds a cloud option, FLUX.2 becomes the upgrade path (built-in reference conditioning would eliminate the need for PuLID).

### Integration Architecture

```
Next.js Backend
    |
    ├─ Portrait Service (services/portrait.ts)
    |   ├─ Assembles prompt from character data
    |   ├─ Loads workflow template JSON
    |   ├─ Substitutes prompt, reference image, seed
    |   └─ Calls ComfyUI API
    |
    ├─ ComfyUI Client (lib/comfyui.ts)
    |   ├─ POST /prompt — queue generation
    |   ├─ WS /ws — monitor progress
    |   ├─ GET /history/{id} — get results
    |   └─ GET /view — download image
    |
    └─ ComfyUI Server (localhost:8188)
        ├─ FLUX.1 Dev Q4_0 GGUF
        ├─ T5-XXL GGUF (quantized text encoder)
        ├─ PuLID-FLUX node
        └─ Workflow: txt2img + PuLID identity injection
```

### ComfyUI API Integration Code Pattern

```typescript
// lib/comfyui.ts — ComfyUI client for Next.js

const COMFYUI_URL = process.env.COMFYUI_URL || 'http://localhost:8188';

interface QueuePromptResponse {
  prompt_id: string;
  number: number;
}

// Queue a workflow for execution
async function queuePrompt(workflow: object, clientId: string): Promise<QueuePromptResponse> {
  const res = await fetch(`${COMFYUI_URL}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: workflow, client_id: clientId }),
  });
  return res.json();
}

// Get generation results
async function getHistory(promptId: string): Promise<any> {
  const res = await fetch(`${COMFYUI_URL}/history/${promptId}`);
  return res.json();
}

// Download generated image
async function getImage(filename: string, subfolder: string, type: string): Promise<Buffer> {
  const params = new URLSearchParams({ filename, subfolder, type });
  const res = await fetch(`${COMFYUI_URL}/view?${params}`);
  return Buffer.from(await res.arrayBuffer());
}

// Monitor progress via WebSocket
function connectWebSocket(clientId: string, onProgress: (data: any) => void): WebSocket {
  const ws = new WebSocket(`ws://localhost:8188/ws?clientId=${clientId}`);
  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    onProgress(msg);
  });
  return ws;
}
```

### Key API Endpoints (ComfyUI)

| Endpoint | Method | Purpose |
|---|---|---|
| `/prompt` | POST | Queue a workflow for execution |
| `/queue` | GET | View current queue status |
| `/history` | GET | Get all completed prompt results |
| `/history/{prompt_id}` | GET | Get specific prompt results |
| `/view` | GET | Download an output image |
| `/upload/image` | POST | Upload reference image for PuLID |
| `/object_info` | GET | List all available nodes and their inputs |
| `/system_stats` | GET | GPU/CPU/memory stats |
| `/interrupt` | POST | Cancel current generation |
| `/free` | POST | Free VRAM (unload models) |

---

## 6. EXISTING PORTRAIT-PIPELINE.md CORRECTIONS

The existing `PORTRAIT-PIPELINE.md` references "FLUX.2 Dev" as the base model. Based on this research:

1. **FLUX.2 Dev IS real** (32B params, released late 2025) but is NOT practical for 8GB VRAM.
2. The document's claim of "FLUX.2 Dev is a 32B parameter model" is correct.
3. However, the "8GB VRAM Options" section is overly optimistic — FLUX.2's Q4_0 GGUF alone is 19.3 GB, plus the Mistral-Small-3.2-24B text encoder.
4. **Recommendation**: Change the base model to FLUX.1 Dev for the 8GB target, with FLUX.2 as a future upgrade path.
5. Nunchaku quantization may help but cannot overcome the fundamental size gap.

---

## 7. SOURCES

- ComfyUI GitHub: https://github.com/Comfy-Org/ComfyUI (106k stars)
- SD WebUI Forge: https://github.com/lllyasviel/stable-diffusion-webui-forge (12.3k stars)
- Automatic1111: https://github.com/AUTOMATIC1111/stable-diffusion-webui (162k stars, stale)
- Fooocus: https://github.com/lllyasviel/Fooocus (47.9k stars)
- InvokeAI: https://github.com/invoke-ai/InvokeAI (26.9k stars)
- FLUX.1 Dev: https://huggingface.co/black-forest-labs/FLUX.1-dev (12B params)
- FLUX.2 Dev: https://huggingface.co/black-forest-labs/FLUX.2-dev (32B params)
- FLUX.1 Dev GGUF: https://huggingface.co/city96/FLUX.1-dev-gguf
- FLUX.2 Dev GGUF: https://huggingface.co/city96/FLUX.2-dev-gguf
- SD 3.5 Large: https://huggingface.co/stabilityai/stable-diffusion-3.5-large (8.1B params)
- SD 3.5 Medium: https://huggingface.co/stabilityai/stable-diffusion-3.5-medium (2.5B params)
- ComfyUI-GGUF: https://github.com/city96/ComfyUI-GGUF
- PuLID: https://github.com/ToTheBeginning/PuLID (NeurIPS 2024)
- PuLID-Flux ComfyUI: https://github.com/balazik/ComfyUI-PuLID-Flux
- InstantID: https://github.com/instantX-research/InstantID
- IP-Adapter Plus: https://github.com/cubiq/ComfyUI_IPAdapter_plus
- HunyuanDiT: https://github.com/Tencent-Hunyuan/HunyuanDiT
