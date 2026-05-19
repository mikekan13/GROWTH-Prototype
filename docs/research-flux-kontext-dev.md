# FLUX Kontext Dev for ComfyUI — Exhaustive Technical Research

**Date:** 2026-04-20
**Purpose:** Production reference for GRO.WTH portrait pipeline

---

## 1. Masking / Region Control

### Native Kontext Behavior
Kontext is NOT a traditional inpainting model. It takes the **full image** and regenerates it based on your text instruction. Unlike FLUX Fill (which modifies only the masked region), Kontext processes the entire image contextually. There is **no built-in mask input** on the standard Kontext workflow.

### Third-Party Inpainting Nodes
Several community solutions exist:

**ComfyUI-Kontext-Inpainting (ZenAI-Vietnam)** — 394 stars on GitHub
- Custom node: `FluxKontextInpaintingConditioning`
- Takes: conditioning, VAE, pixels (IMAGE), mask (MASK), noise_mask (BOOLEAN)
- Internally: encodes the full image via VAE, then sets `reference_latents` on the conditioning. Creates a masked latent where sampling only occurs within the mask region.
- The `noise_mask` parameter tooltip literally says: "Add a noise mask to the latent so sampling will only happen within the mask. **Might improve results or completely break things** depending on the model."
- Source code approach: `_concat_conditioning_latent()` sets `{"reference_latents": [latent["samples"]]}` on the conditioning, then `_create_masked_latent()` creates a latent with noise only in the masked area.
- Install: download to `custom_nodes/` or via ComfyUI Manager.

**ComfyUI-YarvixPA** — `InpaintFluxKontextConditioning` node
- Similar approach: takes image + mask + conditioning + VAE
- Outputs enhanced positive/negative conditioning with `concat_latent_image` data
- More mature documentation, supports positive and negative conditioning separately

**GitHub Issue #8754 (Comfy-Org/ComfyUI)** — Open feature request
- "Need flux kontext mask inpaint support" — still open as of research date
- References diffusers PR #11820 for native implementation
- No official built-in support yet from Comfy-Org

### Practical Guidance for Targeted Editing
- **Prompt-only approach:** Use specific verbs and preservation phrases: "Change the color of the dress to red while maintaining the same facial features and background"
- **Red box marking:** Works better in Pro/Max API versions; Dev has less accurate recognition of drawn markers
- **Semi-transparent masks** can help the model understand original image features for redrawing
- **Best practice for Dev:** Use prompt specificity rather than masking. Name subjects directly ("the woman with short black hair" not "her").

---

## 2. Multi-Reference: FluxKontextMultiReferenceLatentMethod

### Node Description
This is a **built-in ComfyUI node** (marked as experimental). It modifies conditioning data by setting a specific `reference_latents_method`.

### Parameters

| Parameter | Values | Description |
|-----------|--------|-------------|
| `conditioning` | CONDITIONING | Input conditioning to modify |
| `reference_latents_method` | `"offset"`, `"index"`, `"uxo/uno"` | Method for processing reference latents |

### What Each Method Means (from source code analysis of `model.py`)

The methods control how **positional embeddings (RoPE IDs)** are assigned to reference image tokens:

**`offset` (default):**
- Reference image tokens get positional IDs offset spatially (h_offset, w_offset parameters)
- The `process_img()` function creates position IDs using `torch.linspace()` with the offset values
- Reference images are positioned "next to" the target in positional space
- This is the standard Kontext approach — reference tokens are spatially shifted so the model understands they're separate from the generation target
- Best for: single reference image editing (the default, most tested path)

**`index`:**
- Uses the `index` parameter of `process_img()` which maps to `img_ids[:, :, 0]` — the **temporal/frame dimension** of the positional embedding
- Each reference image gets a different index value (0, 1, 2...) in the "time" axis
- This tells the model "this is image 0, this is image 1" as distinct frames
- Best for: multiple reference images where you want the model to distinguish between them clearly

**`uxo/uno`:**
- Named after the UNO paper (Universal Rotary Position Embedding)
- UNO introduces **UnoPE** — unique positional offsets per reference image
- Modifies positional encodings by assigning unique spatial offsets to tokens from different reference images
- If "uxo" or "uso" is typed, it's auto-converted to "uxo"
- Best for: multi-reference scenarios requiring strong distinction between sources

**`index_timestep_zero`:**
- Not a direct option in this node but appears in the source code
- When active, reference latent tokens get a special modulation where they're treated as if timestep=0 (fully denoised)
- The code creates `modulation_dims` that split tokens into two groups: regular (modulated by timestep) and timestep-zero (treated as clean signal)
- This tells the model "these reference tokens are already clean images, don't denoise them"
- Fixes color breaking/hue drift and improves prompt adherence (per Japanese ComfyUI community reports)
- Applied via conditioning metadata, not this node directly

### Multi-Reference Workflows

**Method A: Chained Reference Latents**
1. Load Image A → FluxKontextImageScale → ReferenceLatent A (blends with text prompt)
2. Load Image B → FluxKontextImageScale → ReferenceLatent B (stacks onto conditioning stream)
3. FluxGuidance → KSampler → VAE Decode
- Each reference is independent — you can chain 3-4 by adding more ReferenceLatent nodes
- Trade-off: more encodes = more compute, linear scaling

**Method B: Stitched Canvas**
1. Load Image A + B → ImageStitch (side-by-side) → FluxKontextImageScale → VAE Encode → single ReferenceLatent
2. Faster (one encode), but less granular control
- Warning from MyAIForce: ImageStitch method "often just doesn't work as expected" — output identical to input or ignoring second image
- ComfyUI Wiki confirms: ReferenceLatent chaining "mixes features of different subjects" and "sometimes loses one or two characters"
- ComfyUI Wiki also says: **ImageStitch performs better** for multiple image input overall

**Practical consensus:** ImageStitch is simpler and more reliable for 2 images. For 3+, use chained ReferenceLatents. Resolution of all reference images must be **divisible by 64**.

---

## 3. Quality Preservation Across Iterative Edits

### From the Academic Paper (arxiv 2506.15742v2)
- Kontext was specifically designed for multi-turn editing with "minimal visual drift"
- The paper acknowledges: **"Excessive multi-turn editing can introduce visual artifacts that degrade image quality"** (Figure 15 in paper)
- The distillation process (Dev is distilled) can also introduce visual artifacts
- Dev model "occasionally fails to follow instructions accurately, ignoring specific prompt requirements"

### Practical Strategies
1. **Prompt preservation clauses:** Always include "while maintaining the same [facial features/composition/lighting/background]"
2. **One edit at a time:** Don't try 5 changes in one prompt. Do the most important edit first, verify, then do the next.
3. **Higher resolution helps:** Use FluxKontextImageScale to maintain proper resolution. Reference images at 1024x1024 minimum for quality work.
4. **Denoise parameter (when available via custom nodes):** Range 0.3-0.8. Lower = more original preservation, higher = more change.
5. **kontext_hires LoRA:** A dedicated LoRA by chflame163 specifically trained to enhance image details and resolution with Kontext-dev. Use to counteract quality loss.
6. **Don't re-feed Kontext outputs as references too many times.** Each generation is a lossy process. Keep the original high-quality image as your primary reference when possible.

### NVIDIA Optimization Data
- Transformer module consumes ~96% of total processing time
- FP8 quantization gives substantial speedup with minimal quality loss
- FP4 gives smaller additional gains (attention still runs FP8 for stability)
- Performance per diffusion step (1024x1024):
  - RTX 5090: FP4=273ms, FP8=~300ms (estimated), BF16=baseline
  - The 2x context window of Kontext vs regular FLUX makes FP4 gains smaller due to quadratic attention cost

---

## 4. Modifying Existing Elements

### Verb Choice Matrix (from ComfyUI Wiki)

| Verb | Strength | Use Case | Example |
|------|----------|----------|---------|
| **"Transform"** | Complete change | Full style change | "Transform to oil painting style" |
| **"Change"** | Partial modification | Modify specific elements | "Change the clothing color to red" |
| **"Replace"** | Direct replacement | Swap objects/text | "Replace the background with forest" |
| **"Add"** | Add element | New elements | "Add a small bird on her shoulder" |
| **"Remove"** | Remove element | Delete content | "Remove the cars from background" |

### Best Practices for Fine Modifications
1. **Be hyper-specific:** "Shorten the woman's blue dress to knee length" not "make the dress shorter"
2. **Name the subject:** "The woman with short black hair" not "her" or "the person"
3. **Specify what stays:** "...while preserving her exact facial features, eye color, and expression"
4. **Color changes work well:** "Change the red car to metallic blue" — Kontext handles color swaps reliably
5. **Adding trim/details:** "Add gold trim along the neckline and hem of the dress" — be very specific about placement
6. **512 token limit:** Prompts cannot exceed 512 tokens. Plan accordingly for complex edits.
7. **Break complex edits into steps:** Change color first → verify → add trim → verify → adjust length

### Known Weaknesses
- Fine-grained spatial control is limited without masks
- Small details (buttons, patterns, specific trim) may not land exactly where you want
- Dev requires more prompt crafting than Pro/Max to achieve the same precision
- Pro/Max have better "recognition ability" for visual markers and spatial references

---

## 5. LoRA Interaction with Kontext Dev

### Confirmed Working LoRAs

**kontext_hires (chflame163)** — 133 GitHub stars
- Purpose: Enhance image details and high resolution specifically for Kontext-dev
- Available on HuggingFace: `chflame163/kontext_hires`
- File: `kontext_hires-25620.safetensors`
- Place in `ComfyUI/models/loras/kontext/`
- Workflow provided: `kontext_hires_example.json`

**OmniConsistency LoRA**
- 22 distinct artistic styles (Ghibli, pixel art, mech, traditional painting, etc.)
- Can combine multiple styles simultaneously with adjustable strengths
- Automatically optimizes input dimensions
- Respects image lighting, perspective, and subject matter

**Turbo LoRA** (for speed)
- Reduces step count to 4-8 steps for fast generation
- Significant speed improvement at some quality cost
- Useful for quick iterations before final quality pass

### LoRA Strength Guidelines
- Test at: 0.4, 0.6, 0.8, 1.0
- Well-trained LoRAs show **gradual strength scaling** (not all-or-nothing)
- For editing tasks, lower strengths (0.4-0.6) often preserve the original better
- Style LoRAs at higher strengths (0.7-1.0) for dramatic style transfer
- **Warning from your existing pipeline memory:** Style can drift if styled output is fed back as reference. Always use Stage 1 (bare) output as PuLID ref.

### Trigger Words
- Kontext understands natural language instructions, so trigger words from standard LoRAs may be less relevant
- Some style LoRAs still benefit from their trigger words in the prompt
- Experiment: try with and without trigger words; Kontext's instruction-following may override LoRA triggers

### Flux LoRA Training Notes
- Flux requires **higher network ranks** for quality results
- Trains faster overall than SD-based LoRAs
- Larger model captures complex concepts more readily
- Smaller datasets work well when properly prepared

---

## 6. Advanced Hybrid Workflows

### Kontext + ControlNet
- **Known issue:** Shape mismatch between Kontext ReferenceLatent and ControlNet (PR #9180 fixed this)
- Kontext has a 2x context window compared to regular FLUX, which affects ControlNet compatibility
- FLUX.1-Canny-dev and FLUX.1-Depth-dev are separate 12B models, not directly Kontext-aware
- **Practical approach:** Use Kontext for identity/style, then use FLUX Fill + ControlNet for spatial refinement in a second pass

### Kontext + IP-Adapter
- XLabs-AI flux-ip-adapter works with FLUX but not specifically optimized for Kontext
- IP-Adapter trained at 512x512 (50k steps) and 1024x1024 (25k steps)
- Strength should not exceed 1.0
- **Better approach for identity:** Use Kontext's native character reference capability instead of IP-Adapter. Kontext was specifically trained for this.

### Kontext + Inpainting (Hybrid)
- Use Kontext for the broad edit → Use FLUX Fill for precise masked refinement
- Or use ZenAI's Kontext-Inpainting node for a single-pass masked Kontext edit
- The inpainting nodes work by: encoding the full image, creating masked latent, setting `reference_latents` on conditioning, then sampling only in the masked area

### Practical Multi-Pass Workflow
1. **Pass 1:** Kontext edit (broad changes, style, composition)
2. **Pass 2:** FLUX Fill inpainting (fix specific regions that need refinement)
3. **Pass 3:** kontext_hires LoRA pass (enhance detail/resolution)

---

## 7. Guidance and Steps

### Guidance Values
| Edit Type | Guidance | Rationale |
|-----------|----------|-----------|
| Subtle edits (color tweak, minor detail) | 1.5 - 2.5 | Preserves more of the original |
| Standard editing | 3.0 - 3.5 | Default balance |
| Strong adherence to prompt | 3.5 - 5.0 | More dramatic changes, may alter more of the image |
| Multi-image reference | 3.0 - 4.0 | Helps guide the prompt when competing with multiple references |

### Steps
- **Default:** 28 steps
- **With Turbo LoRA:** 4-8 steps (significant speedup, some quality loss)
- **Quality pass:** 28-50 steps (diminishing returns past 35)
- **More steps = crisper detail; fewer = faster** (no magic number — depends on the edit complexity)

### Sampler
- Standard: euler or dpmpp_2m
- Scheduler: simple or normal
- The paper uses guidance distillation, so Dev is already optimized for fewer steps than undistilled models

---

## 8. Dev vs Pro vs Max Limitations

### Architecture
- All three share the same 12B parameter base architecture
- **Dev:** Open-source weights (non-commercial license), guidance-distilled, can run locally
- **Pro:** API-only, more compute allocation, better prompt following with simple prompts
- **Max:** API-only, flagship, highest compute, optimized for maximum fidelity

### Key Differences

| Feature | Dev | Pro | Max |
|---------|-----|-----|-----|
| Access | Local weights | API only | API only |
| License | Non-commercial | Commercial | Commercial |
| Prompt Simplicity | Needs careful crafting | Works with simple prompts | Works with simple prompts |
| Red Box Marking | Less accurate | Better recognition | Best recognition |
| Speed (1024x1024) | Depends on hardware | 8-10s API | 10-12s API |
| Quality | Near-Pro in many scenarios | Production quality | Highest fidelity |
| LoRA support | Yes (local) | No | No |
| Multi-image | Via ComfyUI nodes | Via API parameters | Via API parameters |
| Fine spatial control | Limited | Better | Best |
| Price | Free (compute cost) | Per-image API | Higher per-image API |

### What Dev Cannot Do (or Does Worse)
1. Simple one-line prompts often produce inferior results vs Pro/Max
2. Spatial precision for small edits is lower
3. Red box/marker recognition less reliable
4. No commercial use without separate licensing
5. Distillation artifacts can appear (not present in Pro/Max)
6. The paper notes Dev is evaluated "exclusively on image-to-image tasks" — T2I comparison is Pro only

### What Dev Does Well
- Quality "almost the same as Pro and Max, and even better in some scenarios" (per multiple community reports)
- LoRA customization (Pro/Max cannot use LoRAs)
- Full local control and pipeline integration
- Iterative multi-turn editing with good consistency
- Character reference without finetuning

---

## 9. ImageStitch Node

### Purpose
ImageStitch glues images **side-by-side** (horizontal) or **top-bottom** (vertical) into a single canvas image. In single-image workflows, it may appear as a pass-through or optional node.

### Why the Official Workflow Uses It with One Image
The official ComfyUI Kontext workflow includes ImageStitch as a **standardized pipeline node** — it's there so the workflow can handle both single and multi-image cases without restructuring. With one input, it passes through. With two, it stitches.

### Multi-Image Purpose
When using two images:
1. ImageStitch creates a combined canvas (e.g., 2048x1024 for two 1024x1024 images side-by-side)
2. FluxKontextImageScale resizes the composite to a Kontext-friendly resolution
3. VAE Encode turns it into a single latent
4. ReferenceLatent attaches it as unified conditioning
5. The model "sees" both images simultaneously as one context

### Limitations
- Maximum width: 4096px (ComfyUI limitation for stitched canvas)
- No size-matching required between images
- MyAIForce warns the stitch method "often just doesn't work as expected" — output may ignore the second image
- **Better alternative for multi-image:** Use chained ReferenceLatent nodes (don't stitch, connect two ReferenceLatent nodes together)

---

## 10. ReferenceLatent Internals

### How It Actually Works (from source code analysis)

The mechanism is **latent sequence concatenation** — not attention modification, not latent blending. Here's the pipeline:

1. **Image → VAE Encode → Latent tensor** (standard VAE encoding)

2. **ReferenceLatent node** sets `reference_latents` on the conditioning dictionary:
   ```python
   conditioning_set_values(conditioning, {"reference_latents": [latent["samples"]]}, append=True)
   ```

3. **In `model_base.py`**, during sampling, `reference_latents` are retrieved from conditioning kwargs

4. **In `model.py` `_forward()`**, reference latents are processed via `process_img()`:
   - Pads to patch size (2x2 patches for FLUX)
   - Rearranges to patch token sequence: `"b c (h ph) (w pw) -> b (h w) (c ph pw)"`
   - Creates positional IDs (RoPE) with configurable offset/index
   - The `index` parameter maps to `img_ids[:, :, 0]` (temporal dimension)
   - The `h_offset`/`w_offset` parameters shift spatial position IDs

5. **Concatenation**: Reference image tokens are **prepended** to the generation target tokens in the sequence dimension. The model processes both as one long sequence through its transformer blocks.

6. **Attention mechanism**: Standard self-attention operates over the combined sequence (reference + target tokens). The model learns during training which tokens are "context" vs "generation target" through the positional encoding differences.

7. **ControlNet interaction**: After each transformer block, ControlNet additions are applied only to the image portion (`img[:, :add.shape[1]] += add`), not to reference tokens.

### Key Technical Details
- The context window is **2x longer** than standard FLUX due to reference tokens
- This 2x context is why FP4 quantization gains are smaller (quadratic attention cost)
- `timestep_zero_index` creates special modulation dims that treat reference tokens as fully denoised (timestep=0), improving color consistency
- RoPE (Rotary Position Embedding) scales are applied from `rope_options` in transformer_options, allowing dynamic spatial scaling

### The Three Positional Encoding Strategies
```
img_ids[:, :, 0] = index         # temporal/frame dimension
img_ids[:, :, 1] = h_positions   # height positions (with h_offset)  
img_ids[:, :, 2] = w_positions   # width positions (with w_offset)
```
- **offset method:** shifts h_offset/w_offset so reference appears spatially adjacent
- **index method:** increments index so reference appears as a different "frame"
- **uxo/uno method:** applies unique position offsets per reference (UNO paper approach)

---

## Summary of Key Findings for GRO.WTH Pipeline

### For Your Identity-Lock Face Pipeline
1. Kontext Dev is **not a drop-in replacement** for PuLID face-lock. It's an editing model, not a face-consistency model. Use it for **outfit changes, pose changes, scene changes** after face identity is locked.
2. For masked editing (e.g., hair only, clothing only), use ZenAI's ComfyUI-Kontext-Inpainting node, but expect inconsistent results — the tooltip literally warns it "might completely break things."
3. **Keep PuLID for identity lock, add Kontext for post-identity editing steps.**

### For Iterative Character Creation
1. Generate base with PuLID → Lock identity
2. Use Kontext for outfit/scene/pose changes with explicit preservation prompts
3. Use kontext_hires LoRA for final detail enhancement
4. Never exceed 3-4 iterative Kontext passes without going back to original reference

### VRAM Considerations (your 4060 8GB floor)
- Full BF16 model: 23.8 GB — NOT feasible
- GGUF Q8: 12.7 GB — still too large
- GGUF Q4: ~6.5 GB — feasible on 8GB with careful management
- FP8 checkpoint: available, good quality/size trade-off for cloud (H100)

### License Reminder
Kontext Dev uses the **FLUX.1 [dev] Non-Commercial License**. This is the same license concern already flagged in your `license-debt-identity-stack.md`. Resolution needed before commercial launch.

---

## Sources

- [ComfyUI Official Kontext Dev Tutorial](https://docs.comfy.org/tutorials/flux/flux-1-kontext-dev)
- [FluxKontextMultiReferenceLatentMethod Docs](https://docs.comfy.org/built-in-nodes/FluxKontextMultiReferenceLatentMethod)
- [ComfyUI-Kontext-Inpainting (ZenAI)](https://github.com/ZenAI-Vietnam/ComfyUI-Kontext-Inpainting)
- [ComfyUI Issue #8754 — Mask Inpaint Request](https://github.com/Comfy-Org/ComfyUI/issues/8754)
- [ComfyUI Wiki Complete Guide](https://comfyui-wiki.com/en/tutorial/advanced/image/flux/flux-1-kontext)
- [FLUX.1 Kontext Academic Paper](https://arxiv.org/html/2506.15742v2)
- [kontext_hires LoRA](https://github.com/chflame163/kontext_hires)
- [NextDiffusion Multi-Image Workflows](https://www.nextdiffusion.ai/tutorials/flux-kontext-dev-multi-image-workflows-comfyui)
- [NVIDIA Optimization Blog](https://developer.nvidia.com/blog/optimizing-flux-1-kontext-for-image-editing-with-low-precision-quantization/)
- [HuggingFace Model Card](https://huggingface.co/black-forest-labs/FLUX.1-Kontext-dev)
- [MyAIForce Master Guide](https://myaiforce.com/flux-kontext-dev/)
- [ComfyUI.org Multi-Image Breakthrough](https://comfyui.org/en/flux1-multi-image-editing-breakthrough)
- [InpaintFluxKontextConditioning Node Docs](https://comfyai.run/documentation/InpaintFluxKontextConditioning)
- [ComfyUI flux/model.py Source](https://github.com/comfyanonymous/ComfyUI/blob/master/comfy/ldm/flux/model.py)
- [ComfyUI model_base.py Source](https://github.com/comfyanonymous/ComfyUI/blob/master/comfy/model_base.py)
- [ControlNet Shape Fix PR #9180](https://github.com/comfyanonymous/ComfyUI/pull/9180)
- [Flux Kontext Prompt Guide](https://kontext-dev.com/posts/flux-kontext-prompt-guide-flux1-dev-image-editing)
- [Turbo LoRA Guide](https://www.nextdiffusion.ai/tutorials/fast-image-generation-with-flux1-kontext-dev-model-and-turbo-lora-in-comfyui)
- [FLUX Models Comparison](https://melies.co/compare/flux-models)
- [Fireworks AI Kontext Launch](https://fireworks.ai/blog/flux-kontext-launch)
