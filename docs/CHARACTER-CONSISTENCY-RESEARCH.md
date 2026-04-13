# Character Identity Consistency — Deep Research (April 2026)

Research for GRO.WTH TTRPG portrait pipeline. Key constraint: RTX 4060 (8GB VRAM), local generation, same character across hundreds of portraits over years of play with varying equipment, wounds, mood, age, and body changes.

---

## 1. PuLID vs IP-Adapter vs InstantID vs PhotoMaker for FLUX

### PuLID-FLUX (RECOMMENDED)

**Status**: Native FLUX.1 Dev support. Best option for this use case.

- **PuLID-FLUX v0.9.1** (released 2024-10-31) — ~5% improvement in facial similarity metrics over v0.9.0
- Model file: `pulid_flux_v0.9.1.safetensors` from [guozinan/PuLID](https://huggingface.co/guozinan/PuLID)
- Architecture: Transformer-based ID encoder, inserts cross-attention blocks into FLUX DIT blocks (Flamingo-inspired)
- **Zero model pollution** — does not degrade base model style/composition
- **Single reference image** sufficient
- Tunable `id_weight` (identity strength) and `start_at` (insertion timing) parameters

**Why it wins for TTRPG portraits:**
- Tuning-free (no per-character LoRA training)
- Excellent balance of identity fidelity vs editability (change clothing, expression, wounds without losing face)
- Works with GGUF quantized FLUX models
- Supports both realistic and stylized outputs via parameter presets

### IP-Adapter (NOT recommended for identity)

- cubiq's ComfyUI_IPAdapter_plus is the reference implementation
- **April 2025: cubiq set the repo to "maintenance only"** — no new active development
- Designed for SD1.5/SDXL. FLUX support exists via community work but is less mature
- IP-Adapter transfers style/composition, not strict face identity — better for "transfer the vibe" than "keep this exact face"
- **Potential complementary use**: IP-Adapter for body/style alongside PuLID for face (future enhancement)

### InstantID (NO FLUX support)

- SDXL-only architecture (requires ControlNet + InsightFace pipeline)
- No FLUX port exists or is planned
- Higher VRAM usage than PuLID
- **Dead end for this project.**

### PhotoMaker (NO FLUX support)

- PhotoMaker V2 (July 2024) improved ID fidelity but is SDXL-only
- Uses "stacked ID embedding" — needs 4+ reference images (impractical for TTRPG characters)
- **Dead end for this project.**

### Verdict

**PuLID-FLUX v0.9.1 is the only viable option.** InstantID, PhotoMaker, and IP-Adapter FaceID are all SDXL-only. PuLID is the sole identity preservation method with native, tested FLUX support.

---

## 2. FLUX.1 Dev Best Practices for Character Consistency

### Model Selection

- **FLUX.1 Dev** (12B params) = correct choice. Guidance-distilled, needs 20-28 steps, good identity preservation with PuLID
- **FLUX.1 Schnell** = distilled for speed (4 steps) but WORSE with PuLID — identity needs more diffusion steps. Not suitable.
- **IMPORTANT CORRECTION**: "FLUX.2 Dev" referenced in PORTRAIT-PIPELINE.md does not exist. The model is FLUX.1 Dev (12B params, not 32B).

### Quantization: Q4_0 GGUF vs Higher

From PuLID-Flux README (balazik):
> "For better results I recommend the 16bit or 8bit GGUF model version of Flux1-dev (the 8e5m2 returns blurry backgrounds)"

| Quant | Size | VRAM | Quality Notes |
|-------|------|------|---------------|
| F16 | 23.8 GB | ~22 GB | Best quality. Won't fit 8GB. |
| Q8_0 | 12.7 GB | ~12 GB | Excellent. Won't fit 8GB alone. |
| Q5_K_S | 8.29 GB | ~9-10 GB | Very good. Tight on 8GB with PuLID overhead. |
| **Q4_K_S** | **6.81 GB** | **~8 GB** | **Good. Best option for 8GB VRAM.** |
| Q4_0 | 6.79 GB | ~8 GB | Slightly worse than Q4_K_S (less precision in attention). |

**Q4_K_S is the recommendation** (not Q4_0). K-quants preserve more detail in attention layers. Face identity is primarily driven by PuLID's cross-attention injection, not the base model's weight precision — so Q4 quantization affects backgrounds and fine textures more than facial identity.

**T5 text encoder**: Use `t5xxl_fp8_e4m3fn.safetensors` (not a GGUF T5). Simpler setup.

### Optimal Generation Settings

```
Steps:      20-28 (more steps = better identity; diminishing returns past 28)
Guidance:   3.5-4.0 (FLUX "fake CFG" — the guidance-distilled scale)
True CFG:   1.0-2.0 (optional — real CFG doubles inference time but better fidelity)
Sampler:    euler
Scheduler:  simple
Resolution: 768x1024 (portrait) or 1024x1024 (bust)
```

### PuLID-Specific Parameters (from official docs)

1. **`start_at` (timestep to start inserting ID)**:
   - **Realistic portraits**: `0.15-0.2` (i.e., step 4 of 28). Lower = higher fidelity, less editability.
   - **Stylized portraits**: `0.0-0.05` for maximum identity through style changes.
   - If identity isn't strong enough, lower this value.

2. **`weight` (id_weight)**:
   - **0.7-0.8**: Good balance — keeps identity while allowing equipment/expression variation
   - **1.0+**: Maximum lock. Can reduce editability. PuLID docs suggest staying at or below 1.0.
   - Start at 0.8, adjust based on results.

3. **`end_at`**: Leave at 1.0 (full denoising path).

4. **True CFG mode**: Uses actual classifier-free guidance (2x inference cost). Better identity in photorealistic scenarios. Worth enabling for "canonical" portrait generation; disable for rapid iteration.

---

## 3. Consistent Characters WITHOUT Reference Photos

For TTRPG characters created from text descriptions (no player selfie):

### Canonical Reference Workflow

1. **Generate candidate references** from the character's physical description:
   - Use species/seed, age, build, distinguishing marks as prompt
   - Generate 4-8 candidates at full quality (28 steps, guidance 4.0, no PuLID)
   - Neutral expression, clean background, no equipment
   - Player selects their favorite as "their face"

2. **Lock the identity** (Persona Lock):
   - Store the chosen reference image (512x512+ face crop)
   - Extract and store InsightFace embedding (backup/cache)
   - Store the exact prompt used
   - Store PuLID settings (weight, start_at, seed)

3. **All subsequent generations**:
   - Load stored reference image into PuLID node
   - Modify only the prompt (equipment, wounds, expression, composition)
   - PuLID maintains face identity from the reference

### Prompt Template for Initial Generation

```
[SUBJECT] A [age]-year-old [species] [gender] with [distinctive features],
[FACE] [face shape], [eye color] eyes, [nose type], [mouth], [facial hair],
[HAIR] [color] [length] [style] hair,
[BUILD] [body type], [height], [skin tone],
[MARKS] [scars], [tattoos], [birthmarks],
[STYLE] character portrait, neutral expression, soft lighting, clean background
```

**Tips:**
- Neutral expression + clean background for the canonical reference
- No equipment/armor in the reference (pure face)
- 1024x1024 minimum for face detail
- Use a fixed seed and store it with the persona lock

---

## 4. NSFW vs SFW Model Considerations

### FLUX.1 Dev Content Capabilities

FLUX.1 Dev has a built-in safety filter in the model weights:
- Generates mild artistic nudity but self-censors explicit content
- Handles violence, wounds, gore well (critical for TTRPG injury portraits)
- Battle damage showing skin/body works fine

**Vanilla FLUX.1 Dev is sufficient for GRO.WTH.** Character portraits with wounds, scars, exposed skin, diverse body types, and age changes all work without modification.

### If Full Nudity is Needed Later (not MVP)

- **Uncensored LoRAs**: Community LoRAs on CivitAI remove safety training. Loaded alongside base model as a separate file.
- **Separate workflows**: SFW (default) vs mature (opt-in per campaign with uncensored LoRA)
- **PuLID is unaffected**: Identity system operates on face embeddings independently of content filtering. Both SFW and NSFW use the same PuLID setup.

### Recommendation

Start with vanilla FLUX.1 Dev. Add uncensored LoRA later as opt-in campaign setting if needed.

---

## 5. InsightFace Compatibility with PuLID-Flux

### The `providers` Error

`FaceAnalysis.__init__() got an unexpected keyword argument 'providers'` means insightface is too OLD. The `providers` kwarg was added in version 0.7.

- **insightface 0.2.x**: Old API, does NOT accept `providers`. This causes the error.
- **insightface 0.7.3**: Current latest on PyPI (released 2023-04-02). DOES accept `providers`.

### Exact Fix

```bash
# Uninstall any existing version
pip uninstall insightface -y

# Install onnxruntime-gpu FIRST (required backend)
pip install onnxruntime-gpu

# Install correct version
pip install insightface==0.7.3

# Verify
python -c "import insightface; print(insightface.__version__)"
# Should print: 0.7.3
```

**Windows ComfyUI portable:**
```bash
.\python_embeded\python.exe -m pip uninstall insightface -y
.\python_embeded\python.exe -m pip install onnxruntime-gpu
.\python_embeded\python.exe -m pip install insightface==0.7.3
```

### Additional Required Models

1. **AntelopeV2** face detection: Download from [MonsterMMORPG/tools](https://huggingface.co/MonsterMMORPG/tools/tree/main), unzip to `ComfyUI/models/insightface/models/antelopev2/`
   - Files: `1k3d68.onnx`, `2d106det.onnx`, `genderage.onnx`, `glintr100.onnx`, `scrfd_10g_bnkps.onnx`

2. **EVA-CLIP**: `EVA02_CLIP_L_336_psz14_s6B.pt` — auto-downloads on first run. If it fails (assertion error about `'detection' in self.models`), manually download from [QuanSun/EVA-CLIP](https://huggingface.co/QuanSun/EVA-CLIP) to `ComfyUI/models/clip/`

3. **facexlib**: `pip install facexlib` (models download on first use)

### Common Gotchas

- **numpy incompatibility**: insightface 0.7.3 built against older numpy. Fix: `pip install numpy==1.26.4`
- **Visual C++ Build Tools**: Required on Windows for insightface compilation. Install "Build Tools for Visual Studio" if pip fails.
- **Python version**: insightface 0.7.3 has issues with Python 3.12+. Use **Python 3.10 or 3.11**.

---

## 6. Face Embedding vs Reference Image Storage

### Store Both, But Reference Image is Primary

| Storage Item | Purpose | Format |
|-------------|---------|--------|
| **Reference image** | PuLID input, visual record | PNG, 512x512+ face crop |
| **Face embedding** | Cache/backup, similarity search | 512-dim float32 (2KB binary blob) |
| **Generation prompt** | Reproducibility | Text |
| **PuLID settings** | Reproducibility | JSON (weight, start_at, seed) |

### Why the Image is Primary

1. **PuLID re-processes the image each time** — it runs InsightFace internally AND uses EVA-CLIP for additional features. A pre-extracted embedding skips the CLIP features.
2. **Portable across versions** — if PuLID upgrades, embedding format may change, but a face image always works.
3. **Human-verifiable** — players and GMs can see what the reference looks like.
4. **Multi-reference future** — can store 2-3 angle references (front, 3/4, profile).

### Embedding as Cache

- Re-extract embeddings when upgrading InsightFace or PuLID
- Reference images are the source of truth; embeddings are optimization
- Embeddings useful for similarity search (finding similar-looking NPCs, lineage detection)

---

## 7. Body Consistency Beyond Face

PuLID handles FACE only. Body consistency requires a separate approach.

### Primary Method: Structured Prompt Template

Store body description as structured data in PersonaLock:

```json
{
  "build": "muscular, broad shoulders, 6'2\"",
  "skinTone": "deep mahogany brown",
  "scars": ["diagonal scar left forearm", "burn mark right shoulder"],
  "tattoos": ["tribal sleeve left arm", "small rune right wrist"],
  "hair": "long black dreadlocks past shoulders",
  "distinguishingMarks": ["cleft chin", "heterochromia - left green, right brown"]
}
```

This gets injected into EVERY generation prompt, providing body consistency through identical textual description.

**Why this works:**
- FLUX.1 Dev has excellent prompt adherence for body descriptions
- Scars, tattoos, build, skin tone are well-understood concepts
- Consistency improves when you use identical descriptive phrases each time
- Body features don't need pixel-level precision the way faces do

### Known Limitations

- **Tattoo placement**: FLUX often confuses left/right. Use very specific descriptions + fixed seeds.
- **Scar consistency**: Small scars may appear/disappear. Use prominent descriptions, accept minor variation.
- **Build variation**: "Muscular" means different things. Use specific comparisons ("bodybuilder build" vs "swimmer's build").
- **Skin tone**: Use specific descriptors ("deep mahogany brown" not just "dark").

### Future Enhancements (Not MVP)

1. **ControlNet Pose**: Lock body proportions via OpenPose/DWPose. FLUX ControlNet exists but is less mature.
2. **IP-Adapter for body style**: Combine PuLID (face) + IP-Adapter (body reference) in same workflow.
3. **Inpainting for marks**: Generate base portrait, inpaint specific scars/tattoos with masks.
4. **Campaign LoRA**: For non-human species, a LoRA trained on that species' visual characteristics.

---

## 8. ComfyUI Workflow: FLUX + PuLID + GGUF

### Required Custom Nodes

```bash
cd ComfyUI/custom_nodes
git clone https://github.com/city96/ComfyUI-GGUF.git
git clone https://github.com/balazik/ComfyUI-PuLID-Flux.git
pip install -r ComfyUI-GGUF/requirements.txt
pip install -r ComfyUI-PuLID-Flux/requirements.txt
```

Alternative PuLID node (cubiq, more mature):
```bash
git clone https://github.com/cubiq/PuLID_ComfyUI.git
pip install -r PuLID_ComfyUI/requirements.txt
```

### Required Models

| Model | Path | Source |
|-------|------|--------|
| FLUX.1 Dev Q4_K_S | `models/unet/flux1-dev-Q4_K_S.gguf` | [city96/FLUX.1-dev-gguf](https://huggingface.co/city96/FLUX.1-dev-gguf) |
| T5 XXL FP8 | `models/clip/t5xxl_fp8_e4m3fn.safetensors` | [comfyanonymous/flux_text_encoders](https://huggingface.co/comfyanonymous/flux_text_encoders) |
| CLIP L | `models/clip/clip_l.safetensors` | [comfyanonymous/flux_text_encoders](https://huggingface.co/comfyanonymous/flux_text_encoders) |
| FLUX VAE | `models/vae/ae.safetensors` | [FLUX.1-schnell](https://huggingface.co/black-forest-labs/FLUX.1-schnell) |
| PuLID FLUX v0.9.1 | `models/pulid/pulid_flux_v0.9.1.safetensors` | [guozinan/PuLID](https://huggingface.co/guozinan/PuLID) |
| AntelopeV2 | `models/insightface/models/antelopev2/*.onnx` | [MonsterMMORPG/tools](https://huggingface.co/MonsterMMORPG/tools) |
| EVA-CLIP | `models/clip/EVA02_CLIP_L_336_psz14_s6B.pt` | [QuanSun/EVA-CLIP](https://huggingface.co/QuanSun/EVA-CLIP) |

### Workflow Node Graph

```
[UnetLoaderGGUF] ──────────────────────────────────────┐
  model: flux1-dev-Q4_K_S.gguf                         │
                                                        ▼
[DualCLIPLoader] ──────────► [CLIPTextEncode] ──► [KSampler]
  clip1: clip_l.safetensors    (positive prompt)       │
  clip2: t5xxl_fp8_e4m3fn     (negative: empty)       │
                                                        │
[PulidFluxModelLoader] ──┐                              │
  pulid: v0.9.1          │                              │
                         ▼                              │
[PulidFluxInsightFaceLoader] ──► [ApplyPulidFlux] ──────┘
  provider: CPU                    weight: 0.8
                                   start_at: 0.15
[LoadImage] ──────────────────►    end_at: 1.0
  (reference face)

[EmptyLatentImage] ────────────────────► [KSampler]
  width: 768, height: 1024                    │
                                              ▼
                                        [VAEDecode] ──► [SaveImage]
```

### Known Issues

1. **FP8 e5m2 = blurry backgrounds** — Use GGUF Q4_K_S or FP8 e4m3fn instead.
2. **attn_mask not working** in balazik's PuLID-Flux — known limitation.
3. **VRAM overflow**: PuLID loads InsightFace + EVA-CLIP alongside FLUX. On 8GB:
   - Use `--lowvram` ComfyUI flag
   - Set InsightFace provider to `CPU` (not CUDA)
   - Consider `--cpu-text-encoder` to offload T5 to RAM
4. **Speed**: Expect 30-60s per image on RTX 4060 with Q4_K_S + PuLID + lowvram.
5. **First-run downloads**: EVA-CLIP auto-downloads. If it fails, manually download (see section 5).

### ComfyUI API Integration (for GRO.WTH backend)

```javascript
// Queue a prompt
const resp = await fetch('http://127.0.0.1:8188/prompt', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ prompt: workflowJson })
});
const { prompt_id } = await resp.json();

// Poll for completion
const history = await fetch(`http://127.0.0.1:8188/history/${prompt_id}`);

// Retrieve generated image
const image = await fetch(`http://127.0.0.1:8188/view?filename=${filename}`);
```

Store a template workflow JSON. Programmatically modify prompt text and reference image path before queuing.

---

## Corrections to PORTRAIT-PIPELINE.md

| Current Text | Correction |
|-------------|------------|
| "FLUX.2 Dev" | FLUX.1 Dev (FLUX.2 does not exist) |
| "32B parameter" | 12B parameters |
| "PuLID Flux II" | PuLID-FLUX v0.9.1 (no "Flux II" product) |
| "Supports up to 10 reference images" | Single reference image per PuLID call |
| "Weight 1.0-1.5" | Weight 0.7-1.0 (above 1.0 over-constrains) |

---

## Final Recommended Stack

```
Base Model:      FLUX.1 Dev Q4_K_S GGUF (6.81 GB)
Identity:        PuLID-FLUX v0.9.1
Face Detection:  InsightFace 0.7.3 + AntelopeV2 models
Face Features:   EVA02-CLIP-L-14-336
Body Consistency: Structured prompt template (PersonaLock.bodyDescription)
Orchestration:   ComfyUI with REST API (port 8188)
Custom Nodes:    ComfyUI-GGUF + ComfyUI-PuLID-Flux
Python:          3.10 or 3.11 (NOT 3.12+)
VRAM Budget:     ~8 GB with --lowvram + CPU InsightFace
Generation Time: ~30-60s per portrait on RTX 4060
Content:         Vanilla FLUX.1 Dev (wounds/scars/bodies all work)
```
