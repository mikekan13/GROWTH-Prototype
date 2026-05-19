# FLUX.1 Hair Control Research — Exhaustive Deep Dive

> Date: 2026-04-13
> Purpose: Character portrait pipeline — precise hairstyle control across multiple generations
> Base model: FLUX.1 Dev Q4_0 GGUF (12B) via ComfyUI

---

## Table of Contents
1. [Recommended Pipeline Strategy](#1-recommended-pipeline-strategy)
2. [CivitAI FLUX Hair LoRAs](#2-civitai-flux-hair-loras)
3. [HuggingFace FLUX Hair Models](#3-huggingface-flux-hair-models)
4. [Hair Segmentation & Masking (ComfyUI)](#4-hair-segmentation--masking-comfyui)
5. [IP-Adapter for Hair Style Transfer](#5-ip-adapter-for-hair-style-transfer)
6. [Regional Prompting for Hair Control](#6-regional-prompting-for-hair-control)
7. [PuLID + Hair: Limitations & Workarounds](#7-pulid--hair-limitations--workarounds)
8. [Flux Kontext — Text-Guided Hair Editing](#8-flux-kontext--text-guided-hair-editing)
9. [ACE++ — Zero-Training Character Consistency](#9-ace--zero-training-character-consistency)
10. [RF Inversion — Zero-Shot Hair Editing](#10-rf-inversion--zero-shot-hair-editing)
11. [Hair Turn LoRA — Multi-Angle Consistency](#11-hair-turn-lora--multi-angle-consistency)
12. [Concept Sliders for Hair Attributes](#12-concept-sliders-for-hair-attributes)
13. [ControlNet Approaches for Hair](#13-controlnet-approaches-for-hair)
14. [DWPose / OpenPose — No Hair Info](#14-dwpose--openpose--no-hair-info)
15. [Textual Inversion / Embeddings](#15-textual-inversion--embeddings)
16. [Training a Custom Hair LoRA](#16-training-a-custom-hair-lora)
17. [Prompt Engineering for Hair](#17-prompt-engineering-for-hair)
18. [Recommended Architecture for GRO.WTH Pipeline](#18-recommended-architecture-for-growth-pipeline)

---

## 1. Recommended Pipeline Strategy

**TL;DR — The winning approach is a multi-stage pipeline:**

1. **Face Lock (Identity):** PuLID for face identity, with hair masked OUT or explicitly prompted as "bald" / "hair pulled back tightly"
2. **Hair Application:** Inpaint the hair region using auto-segmentation mask + style-specific prompt (+ optional hair LoRA for tricky styles)
3. **Multi-Angle Consistency:** Hair Turn LoRA for turnaround sheets; Regional Prompting FLUX for face+hair zone separation
4. **Dynamic Changes:** Re-run hair inpainting step with new style prompt (character cuts hair → new mask → new inpaint)

This separates face identity from hair identity, giving independent control over both.

---

## 2. CivitAI FLUX Hair LoRAs

### Confirmed FLUX-Compatible

| Name | What It Does | Trigger Words | Size | Link |
|------|-------------|---------------|------|------|
| **Artistic Hairstyles** | Voluminous updos, sculpted long hair, formal/bridal looks | Varies by style | ~150MB | [civitai.com/models/1120624](https://civitai.com/models/1120624/artistic-hairstyles) |
| **Long Hair LoRA - Flux V3** | Long hair styles, caption-based (no trigger words) | None (prompt-driven) | ~150MB | [civitai.com/models/669029](https://civitai.com/models/669029/long-hair-lora-flux) |
| **Clean-shaved (FLUX)** | Suppresses facial hair AND head hair for clean bald look | "clean-shaved" | ~150MB | [civitai.com/models/1752566](https://civitai.com/models/1752566/clean-shaved) |
| **Hair Turn FLUX** | Multi-view hairstyle turnaround sheets (front/side/back) | Style-specific | ~150MB | [civitai.com/models/893165](https://civitai.com/models/893165/hair-turn-flux-a-character-hairstyle-design-tool) |
| **F1 CharTurn** | Full character turnaround (includes hair consistency) | "charturnv2" | ~150MB | [civitai.com/models/784830](https://civitai.com/models/784830/flux-charturn-multi-view-turnaround-model-sheet-character-design) |
| **Anime Model Turn (F1)** | Anime-style character turnaround with hair | Style-specific | ~150MB | [civitai.com/models/1002768](https://civitai.com/models/1002768/XL%20Anime%20Model%20Turn,%20Multi-View,%20Turnaround,%20Model%20Sheet,%20Character%20Design) |

### SDXL-Only (NOT directly FLUX-compatible, listed for reference)

| Name | Notes |
|------|-------|
| **Hairstyles Collection** (76937) | 20+ styles (dreads, updo, braid, ponytail, bald, pigtails). SD 1.5 only. |
| **Hairstyle Collection - Bald** (522838) | Designed for inpainting bald heads. SD 1.5 only. |
| **N15G All In One Hairstyles** (1068359) | Comprehensive collection. SD 1.5 only. |
| **BT 80s Hairstyle Collection** (330317) | Feathered, ponytail, etc. SDXL only. |
| **Hair Style SDXL** (134312) | SDXL only. |

### Hair Color LoRAs (FLUX-Compatible)

| Name | What It Does | Link |
|------|-------------|------|
| **Visceral (FLUX)** | Preserves facial bone structure across phenotypes (blonde, brunette, redhead, platinum). Allows radical hair color changes. | [civitai.com/models/2429595](https://civitai.com/models/2429595/visceral) |
| **Alt Style Bold Makeup and Hair (FLUX)** | Non-traditional colors, streaks, tips, multiple colors | [civitai.com/models/1174998](https://civitai.com/models/1174998/alt-style-bold-makeup-and-hair) |

### Key Insight
The FLUX LoRA ecosystem for hair is **thinner than SDXL**. Most comprehensive hairstyle collections are SD 1.5 or SDXL. For FLUX, you'll rely more on prompt engineering + inpainting rather than style-specific LoRAs.

---

## 3. HuggingFace FLUX Hair Models

| Name | What It Does | Link |
|------|-------------|------|
| **Flux-SuperPortrait-v2-LoRA** | High-quality portraits, ponytail examples in training data | [huggingface.co/strangerzonehf/Flux-SuperPortrait-v2-LoRA](https://huggingface.co/strangerzonehf/Flux-SuperPortrait-v2-LoRA) |
| **Flux-Fine-Detail-LoRA** | Enhanced fine detail (helps with hair strand rendering) | [huggingface.co/prithivMLmods/Flux-Fine-Detail-LoRA](https://huggingface.co/prithivMLmods/Flux-Fine-Detail-LoRA) |
| **SDXL-LoRA-slider.hair-up** | Hair-up slider LoRA (SDXL only, concept reference) | [huggingface.co/ntc-ai/SDXL-LoRA-slider.hair-up](https://huggingface.co/ntc-ai/SDXL-LoRA-slider.hair-up) |
| **SDXL-LoRA-slider.curly-hair** | Curly hair slider (SDXL only, concept reference) | [huggingface.co/ntc-ai/SDXL-LoRA-slider.curly-hair](https://huggingface.co/ntc-ai/SDXL-LoRA-slider.curly-hair) |
| **XLabs-AI/flux-ip-adapter** | IP-Adapter for FLUX (can transfer hair style from reference) | [huggingface.co/XLabs-AI/flux-ip-adapter](https://huggingface.co/XLabs-AI/flux-ip-adapter) |

### Key Insight
No dedicated FLUX hair LoRAs on HuggingFace. The slider concept from ntc-ai (SDXL) is worth replicating for FLUX — see Section 12 on Concept Sliders.

---

## 4. Hair Segmentation & Masking (ComfyUI)

This is the **most important technique** for our pipeline. Auto-masking hair lets us inpaint just the hair region.

### Nodes Available

| Node | Package | What It Does | Hair-Specific? | Link |
|------|---------|-------------|----------------|------|
| **APersonMaskGenerator** | a-person-mask-generator | Auto-masks: background, hair, body, face, clothes. Uses Google Multi-class Selfie Segmentation. | YES — "hair" is a mask target | [github.com/djbielejeski/a-person-mask-generator](https://github.com/djbielejeski/a-person-mask-generator) |
| **PersonMaskUltra** | ComfyUI_LayerStyle | Detailed masks for face, hair, body, clothes, accessories. Uses Mediapipe. Has `hair` boolean parameter. | YES — togglable hair inclusion | [runcomfy.com](https://www.runcomfy.com/comfyui-nodes/ComfyUI_LayerStyle/LayerMask--PersonMaskUltra) |
| **PersonMaskUltra V2** | ComfyUI_LayerStyle_Advance | Updated version with Mediapipe, more precise segmentation | YES | [runcomfy.com](https://www.runcomfy.com/comfyui-nodes/ComfyUI_LayerStyle/LayerMask--PersonMaskUltra-V2) |
| **Masquerade Nodes** | masquerade-nodes-comfyui | Powerful mask manipulation (combine, subtract, blur, dilate) | General-purpose | [github.com/BadCafeCode/masquerade-nodes-comfyui](https://github.com/BadCafeCode/masquerade-nodes-comfyui) |

### Recommended Hair Inpainting Workflow

```
1. Generate base portrait (PuLID face + "bald" or "hair pulled back" prompt)
2. APersonMaskGenerator → target: "hair" (or manually mask hair region)
3. GrowMask (expand 5-10px) → Feather mask (3-5px Gaussian blur, 20-40% hardness)
4. FLUX Fill inpainting with hair-specific prompt:
   "long flowing red hair, loose curls, shoulder length"
5. Composite back onto original
```

### Key Parameters
- **mask_dilation**: +5 to +10 for hair (soft edges needed)
- **Gaussian blur**: 3-5 pixels for natural blending
- **Denoise strength**: 0.7-0.9 for significant hair changes, 0.4-0.6 for color tweaks
- **Hair overlapping clothes**: Create clothing mask, subtract from hair mask to avoid artifacts

---

## 5. IP-Adapter for Hair Style Transfer

### FLUX-Compatible IP-Adapters

| Model | Source | What It Does | Link |
|-------|--------|-------------|------|
| **InstantX FLUX IP-Adapter** | InstantX Research | Official FLUX IP-Adapter. Transfers style/appearance from reference image. | [comfyui-wiki.com](https://comfyui-wiki.com/en/news/2024-11-22-instantx-flux-ipadapter-release) |
| **XLabs-AI FLUX IP-Adapter V2** | XLabs-AI | 150K steps @ 512, 350K steps @ 1024. More refined. | [huggingface.co/XLabs-AI/flux-ip-adapter](https://huggingface.co/XLabs-AI/flux-ip-adapter) |

### How to Use for Hair

**Concept: Provide a reference image of the desired hairstyle via IP-Adapter, combined with PuLID for face identity.**

```
Reference Image: Photo of desired hairstyle (from behind or side — no face needed)
IP-Adapter: weight 0.5-0.7 (style influence)
PuLID: weight 0.8-1.0 (face identity)
Prompt: "portrait of [character], [hair description from character data]"
```

### Limitations
- IP-Adapter transfers OVERALL style, not just hair. At high weights it affects clothing, background, skin tone.
- Works best when the reference image is mostly hair (crop tightly to hair region).
- Combining IP-Adapter + PuLID can cause conflicts at high weights. Balance carefully.

### Better Alternative: IP-Adapter on Hair Mask Only
Use regional IP-Adapter application:
1. Generate base image with PuLID (face locked)
2. Create hair mask (APersonMaskGenerator)
3. Apply IP-Adapter influence ONLY to the masked hair region
4. This gives hair style transfer without affecting face identity

---

## 6. Regional Prompting for Hair Control

### instantX Regional-Prompting-FLUX
- **What**: Training-free regional prompting for FLUX diffusion transformers
- **Key Feature**: Compatible with LoRA, ControlNet, AND multi-person PuLID
- **Repository**: [github.com/instantX-research/Regional-Prompting-FLUX](https://github.com/instantX-research/Regional-Prompting-FLUX)
- **ComfyUI Port**: ComfyUI-Fluxtapoz

### How It Works for Hair
Define regions with masks:
- **Region 1 (Face)**: PuLID identity + face prompt
- **Region 2 (Hair)**: Hair-specific prompt with style details
- **Region 3 (Body/Clothing)**: Separate prompt for outfit

### ComfyUI Nodes for Regional Prompting

| Node | Package | Notes |
|------|---------|-------|
| **FluxRegionalPrompt** | RES4LYF | Direct FLUX regional prompting | 
| **RegionalPromptSimple** | ComfyUI-Inspire-Pack | Simpler interface |
| **RegionalPromptColorMask** | ComfyUI-Inspire-Pack | Color-coded mask regions |
| **RegionalPrompt** | ComfyUI-Impact-Pack | Full-featured regional sampler |

### FLUX-Specific Tips
- FLUX responds MORE strongly to masks than SD models
- Use wider feather zones: 40-60px (vs 20-30px for SD)
- Works best with clear region boundaries

### Pipeline Fit: EXCELLENT
Regional prompting is the cleanest approach for separating face identity (PuLID) from hair styling (prompt). No extra models needed.

---

## 7. PuLID + Hair: Limitations & Workarounds

### The Problem
PuLID preserves face identity — but it ALSO tends to lock hairstyle from the reference image.

**Observed behavior:**
- PuLID "stuck rigidly to the original hairstyle"
- "Almost perfectly mirrors the hairstyle and face angle from the reference image"
- Adding accessories (hats) that conflict with reference hair produces artifacts

### Workarounds

1. **Use bald/minimal-hair reference images for PuLID**
   - If the face lock reference has no hair, PuLID can't enforce a hairstyle
   - Generate a "face only" reference or use Clean-shaved FLUX LoRA first

2. **Lower PuLID weight for hair region**
   - Regional application: high PuLID weight on face mask, zero on hair mask
   - Requires Regional-Prompting-FLUX integration

3. **Two-pass generation**
   - Pass 1: PuLID + prompt for face (accept whatever hair comes)
   - Pass 2: Mask hair region → inpaint with desired hairstyle

4. **PuLID + explicit hair override in prompt**
   - "portrait of [identity], SHORT PIXIE CUT, platinum blonde" 
   - Works partially — prompt can override PuLID hair tendency at lower PuLID weights (0.4-0.6)
   - Higher PuLID weights (0.8+) make hair override harder

### Recommended for GRO.WTH
**Use approach #1 (bald reference) + #3 (two-pass).** This is the most reliable.

---

## 8. Flux Kontext — Text-Guided Hair Editing

### What Is It
Flux Kontext is Black Forest Labs' image-to-image editing model with native text-guided editing. Excels at local edits while preserving the rest of the image.

### Hair Capabilities
- 70+ hairstyles and 25+ hair colors supported
- Independent control of hair style vs hair color
- Can select "No change" for style while changing color (or vice versa)
- Character remains consistent even after MULTIPLE sequential edits

### How It Would Fit Our Pipeline
```
1. Generate base portrait (PuLID face, any hair)
2. Flux Kontext edit: "Change hair to [specific style from character data]"
3. Flux Kontext edit: "Change hair color to [color from character data]"
```

### Prompting Best Practices
- Be explicit: "Change the woman's hair to a short pixie cut with platinum blonde color"
- Preserve identity: "Keep the same face and expression, only change the hairstyle"
- For complex changes, do one edit at a time (style first, then color)

### Availability
- Available on Replicate API
- Available via BFL API
- ComfyUI integration exists
- **Note**: Requires Flux Kontext model weights (separate from FLUX.1 Dev)

### Key Link
- [docs.bfl.ai/guides/prompting_guide_kontext_i2i](https://docs.bfl.ai/guides/prompting_guide_kontext_i2i)
- [replicate.com/flux-kontext-apps/change-haircut](https://replicate.com/flux-kontext-apps/change-haircut)

---

## 9. ACE++ — Zero-Training Character Consistency

### What Is It
Alibaba's ACE++ (Advanced Character Editor) — instruction-based image generation with zero-training character consistency. Open-sourced Feb 2025.

### Hair Capabilities
- "Refining hairstyles, adjusting poses, or perfecting skin details with unmatched accuracy"
- 99% face consistency in portrait edits
- Can maintain visual uniformity across different poses, expressions, lighting

### How It Works
1. Single reference image input
2. Text instruction: "Change hairstyle to long braids"
3. ACE++ generates edited image preserving identity

### Integration
- ComfyUI workflows available
- Works with FLUX.1-Fill models
- LoRA model workflow recommended (more stable than FFT)
- [github.com/ali-vilab/ACE_plus](https://github.com/ali-vilab/ACE_plus)

### Pipeline Fit
**Strong candidate for hair changes on existing portraits.** Could replace the mask+inpaint approach with a simpler instruction-based edit. Worth testing.

---

## 10. RF Inversion — Zero-Shot Hair Editing

### What Is It
"Taming Rectified Flow for Inversion and Editing" (ICML 2025). Zero-shot image editing for FLUX with no additional training, latent optimization, or prompt tuning.

### Hair Capabilities
- Can edit specific attributes (hair, accessories) while preserving identity
- State-of-the-art inversion quality
- Works with FLUX models natively

### Limitations
- More complex to set up than ACE++ or Kontext
- Best for targeted edits rather than full generation pipeline

### Link
- [github.com/wangjiangshan0725/RF-Solver-Edit](https://github.com/wangjiangshan0725/RF-Solver-Edit)
- [rf-inversion.github.io](https://rf-inversion.github.io/)

---

## 11. Hair Turn LoRA — Multi-Angle Consistency

### What Is It
Specialized LoRA for generating consistent hairstyle turnaround sheets (front, side, back, 3/4 views).

### FLUX Version
- **XL Hair Turn** with FLUX variant (F1 All, F1 Front, F1 Back versions)
- [civitai.com/models/893165](https://civitai.com/models/893165/hair-turn-flux-a-character-hairstyle-design-tool)

### How It Fits
After establishing a character's hairstyle:
1. Generate a Hair Turn sheet showing all angles
2. Use these as reference images for angle-specific portrait generation
3. Ensures back-of-head, profile, etc. stay consistent

### Related Turn LoRAs (FLUX)
| LoRA | Purpose |
|------|---------|
| Hair Turn F1 | Hairstyle turnaround |
| CharTurn F1 | Full character turnaround |
| Face Turn XL | Face angle turnaround |
| Mecha Turn F1 | Mechanical design turnaround |

---

## 12. Concept Sliders for Hair Attributes

### What Are They
LoRA-based sliders that control specific attributes on a continuous scale. Published at ECCV 2024.

### FLUX Support
**Experimental but functional.** Can train FLUX concept sliders.

### Hair-Relevant Sliders
- Hair length (short ↔ long)
- Hair volume (flat ↔ voluminous)
- Hair texture (straight ↔ curly)
- Hair up/down

### Training a Hair Slider
- Uses GPT-4 to generate text pairs: "person with hair pulled back tightly" vs "person with hair down loosely"
- Trains a small LoRA that moves between these concepts
- Slider weight: -2 to +2 (default 1)
- [github.com/rohitgandikota/sliders](https://github.com/rohitgandikota/sliders)

### Pipeline Fit
Could train a "hair visibility" slider: pulled-back-tightly (for face lock) ↔ natural-style. Apply during generation. Lightweight and elegant.

---

## 13. ControlNet Approaches for Hair

### Available FLUX ControlNets

| Model | What It Controls | Hair Relevance |
|-------|-----------------|----------------|
| **FLUX.1-dev-ControlNet-Depth** (Shakker-Labs) | 3D structure via depth map | Hair VOLUME/SHAPE — depth map captures hair silhouette |
| **FLUX.1-dev-ControlNet-Canny** | Edge detection | Hair OUTLINE — preserves hair shape boundaries |
| **FLUX.1-Depth-dev-lora** (BFL official) | Official depth conditioning | Same as above |

### How to Use for Hair
1. Generate a "perfect" hairstyle image once
2. Extract depth map (Depth-Anything-V2) — captures hair volume
3. Extract canny edges — captures hair outline/shape
4. Use as ControlNet conditioning for new generations
5. Combined with PuLID (face) → consistent hair shape + face identity

### Settings
- **controlnet_conditioning_scale**: 0.3-0.7 (lower = more freedom, higher = stricter match)
- **Depth-Anything-V2** recommended for depth extraction

### Limitation
- Controls hair SHAPE but not hair TEXTURE or COLOR
- Best used in combination with prompt or LoRA for texture/color

---

## 14. DWPose / OpenPose — No Hair Info

**DWPose and OpenPose do NOT provide hair information.** They detect body keypoints (head position, shoulders, hands, etc.) and are used for pose transfer only.

- OpenPose explicitly strips hairstyle information
- Canny edge detection is better for preserving hair outline (but it's a separate ControlNet, not pose)
- DWPose is the improved version of OpenPose but still no hair data

**Verdict: Not useful for hair control.**

---

## 15. Textual Inversion / Embeddings

### FLUX Compatibility
Textual inversion for FLUX is **less mature than for SDXL**. Key differences:
- FLUX uses T5 text encoder (not CLIP) — different embedding space
- Fewer community embeddings available
- Training process requires FLUX-specific adjustments

### Feasibility for Hair
- Could train a textual embedding for "hair pulled back tightly" concept
- Very small file size (few KB)
- Faster to train than LoRA
- But: weaker influence than LoRA — may not reliably override PuLID's hair tendency

### Verdict
**LoRA or Concept Sliders are more reliable for FLUX hair control.** Textual inversion is a lighter-weight option if LoRA is overkill.

---

## 16. Training a Custom Hair LoRA

### Feasibility: HIGH

Training a FLUX LoRA for "hair pulled back tightly" or specific hairstyles is very feasible with 10-20 reference images.

### Tools

| Tool | What It Does | Link |
|------|-------------|------|
| **Kohya SS GUI** | Full-featured LoRA trainer with GUI | [github.com/bmaltais/kohya_ss](https://github.com/bmaltais/kohya_ss) |
| **ai-toolkit** | Ostris's training toolkit (FLUX support) | [github.com/ostris/ai-toolkit](https://github.com/ostris/ai-toolkit) |
| **FLUX LoRA Trainer 2.0** | ComfyUI-based training workflow | [openart.ai](https://openart.ai/workflows/tenofas/flux-lora-trainer-20/VmxcKxjxRoN2Lrs9ESU7) |
| **Replicate Training** | Cloud-based FLUX LoRA training | [replicate.com](https://replicate.com) |

### Dataset Requirements
- **10-20 images** of the target hairstyle
- Resolution: 1024x1024 preferred (512x512 acceptable)
- Multiple angles, different people wearing the same style
- Varied lighting and backgrounds
- **For "hair pulled back"**: Collect 15-20 images of various people with tightly pulled-back hair, buns, slicked-back styles

### Training Parameters (Kohya)
- **Steps**: 1,500-2,000 for concept LoRAs
- **Repeats**: Use folder naming `5_hairpulledback` (5 repeats per image)
- **Resolution**: 1024x1024
- **Learning rate**: 1e-4 (FLUX standard)
- **Rank**: 16-32 (higher = more capacity)
- **Training time**: ~1-2 hours on a decent GPU
- **Captioning**: Use BLIP captioning, include trigger word in all captions

### Recommended Custom LoRAs to Train

| LoRA | Purpose | Training Images |
|------|---------|-----------------|
| **"hair_pulled_back"** | Face lock reference shots | 15-20 images of tightly pulled-back hair |
| **"growth_portrait_style"** | Consistent GRO.WTH aesthetic | 20-30 example portraits in desired style |

### Key Tips
- Don't overtrain — overtrained LoRAs recreate poses/clothes from training images
- Test at multiple epoch checkpoints (save every epoch)
- Caption precisely: "person with hair pulled back tightly in a bun, clean face visible"

---

## 17. Prompt Engineering for Hair

### FLUX.1 Hair Prompt Best Practices

FLUX understands natural language well. Be specific and descriptive:

**Good:**
```
"portrait of a woman, short pixie cut, chestnut brown hair, soft fringe, natural sheen, 
hair tucked behind ears, face clearly visible"
```

**Bad:**
```
"woman, short hair, brown"
```

### Prompt Templates for Our Use Cases

**Face Lock (hair away from face):**
```
"close-up portrait, [identity], completely bald head, smooth scalp, no hair visible, 
studio lighting, neutral background"
```
or
```
"close-up portrait, [identity], hair pulled back extremely tightly into a small bun 
at the nape of the neck, all hair away from face, forehead fully exposed, ears visible"
```

**Specific Hairstyle from Character Data:**
```
"portrait of [identity], [length] [color] hair, [texture], [style], 
[additional details like parting, accessories, etc.]"
```

Example:
```
"portrait of [identity], long flowing auburn hair, loose natural curls, 
center parting, hair cascading over shoulders, subtle highlights"
```

**Dynamic Hair Change (character cuts hair):**
```
"portrait of [identity], freshly cut short bob, [color] hair, 
blunt ends just below the ears, asymmetrical fringe"
```

### Key Principle
Describe cut, length, color, texture, and style as separate attributes. Language precision beats repetition.

---

## 18. Recommended Architecture for GRO.WTH Pipeline

### Phase 1: MVP (Now — Use What We Have)

```
STEP 1: FACE LOCK REFERENCE
├── Generate with PuLID (face identity)
├── Prompt: "bald" or "hair pulled back tightly"  
├── Optional: Clean-shaved FLUX LoRA (weight 0.3-0.5)
└── Result: Clean face reference, no hair interference

STEP 2: PORTRAIT WITH HAIRSTYLE
├── Start from face lock reference
├── APersonMaskGenerator → hair region mask
├── Expand mask (GrowMask +10px) + feather (5px)
├── FLUX inpaint hair region with style prompt:
│   "[length] [color] [texture] [style] hair, [details]"
├── Denoise: 0.7-0.9 for new hairstyle
└── Result: Character portrait with specific hairstyle

STEP 3: ANGLE VARIATIONS
├── Use portrait as IP-Adapter reference (weight 0.5)
├── PuLID for face (weight 0.8)
├── Prompt for desired angle: "3/4 view", "profile", "from behind"
├── Optional: ControlNet-Depth from reference for hair volume
└── Result: Multi-angle consistent portraits
```

### Phase 2: Enhanced (Future)

```
ADDITIONS:
├── Train custom "hair_pulled_back" LoRA (15-20 images)
├── Train Concept Sliders for hair length/volume/texture
├── Integrate Regional-Prompting-FLUX for face/hair zone separation
├── Hair Turn LoRA for official turnaround sheets
├── ACE++ for instruction-based hair edits (simpler workflow)
└── Flux Kontext for text-guided hair changes (if API available)
```

### Phase 3: Dynamic (Game-Time)

```
CHARACTER CHANGES HAIR:
├── Load existing portrait
├── Auto-mask hair region (APersonMaskGenerator)
├── New hair prompt from updated character data
├── Inpaint with new style
├── Save as new portrait version (keep history)
└── Notify player of updated portrait
```

### Character Data → Hair Prompt Mapping

The character's `PhysicalDescription.hair` field should map to prompt components:

```typescript
interface HairDescription {
  length: string;      // "short", "medium", "long", "very long"
  color: string;       // "black", "auburn", "platinum blonde", etc.
  texture: string;     // "straight", "wavy", "curly", "coily", "kinky"
  style: string;       // "pixie cut", "bob", "ponytail", "braids", "loose", "bun"
  parting?: string;    // "center", "left", "right", "none"
  accessories?: string; // "ribbon", "clips", "headband", etc.
  details?: string;    // "highlights", "ombre", "shaved sides", etc.
}

// Prompt builder:
function buildHairPrompt(hair: HairDescription): string {
  const parts = [
    hair.length,
    hair.color,
    hair.texture,
    hair.style,
    hair.parting ? `${hair.parting} parting` : '',
    hair.details || '',
    hair.accessories ? `wearing ${hair.accessories}` : '',
  ].filter(Boolean);
  return `${parts.join(', ')} hair`;
}
```

---

## Summary of Key Findings

| Technique | FLUX Compatible? | Effort | Hair Control Quality | Best For |
|-----------|-----------------|--------|---------------------|----------|
| **Prompt engineering** | YES | Low | Medium | Basic hair descriptions |
| **Hair mask + inpainting** | YES | Medium | HIGH | Changing hairstyle on existing portrait |
| **Regional Prompting FLUX** | YES | Medium | HIGH | Separating face identity from hair |
| **PuLID (bald ref)** | YES | Low | Medium | Face lock without hair interference |
| **IP-Adapter (hair ref)** | YES | Medium | Medium | Transferring style from reference |
| **Flux Kontext** | YES (separate model) | Low | HIGH | Text-guided hair edits |
| **ACE++** | YES (with FLUX Fill) | Low | HIGH | Instruction-based edits |
| **Hair Turn LoRA** | YES | Low | HIGH | Multi-angle consistency |
| **ControlNet Depth** | YES | Medium | Medium | Hair volume/shape preservation |
| **Concept Sliders** | Experimental | Medium | Medium | Continuous attribute control |
| **Custom LoRA training** | YES | High (one-time) | HIGH | "Hair pulled back" for face lock |
| **Clean-shaved LoRA** | YES | Low | HIGH | Bald head for face lock |
| **Textual Inversion** | Partial | Medium | Low-Medium | Lightweight concept injection |
| **DWPose/OpenPose** | N/A | N/A | NONE | Not useful for hair |
| **RF Inversion** | YES | High | HIGH | Zero-shot editing (research-grade) |

### Top 3 Recommendations for GRO.WTH

1. **Hair Mask + Inpainting** — Most reliable, works now, full control
2. **Regional Prompting FLUX** — Cleanest architecture, separates concerns
3. **Clean-shaved LoRA + Two-pass generation** — Best for face lock references

---

## Sources

- [CivitAI Artistic Hairstyles](https://civitai.com/models/1120624/artistic-hairstyles)
- [CivitAI Hair Turn FLUX](https://civitai.com/models/893165/hair-turn-flux-a-character-hairstyle-design-tool)
- [CivitAI Clean-shaved FLUX](https://civitai.com/models/1752566/clean-shaved)
- [CivitAI Long Hair LoRA Flux](https://civitai.com/models/669029/long-hair-lora-flux)
- [CivitAI Visceral FLUX](https://civitai.com/models/2429595/visceral)
- [CivitAI Alt Style Bold Makeup](https://civitai.com/models/1174998/alt-style-bold-makeup-and-hair)
- [CivitAI F1 CharTurn](https://civitai.com/models/784830/flux-charturn-multi-view-turnaround-model-sheet-character-design)
- [GitHub: Regional-Prompting-FLUX](https://github.com/instantX-research/Regional-Prompting-FLUX)
- [GitHub: a-person-mask-generator](https://github.com/djbielejeski/a-person-mask-generator)
- [GitHub: ACE++](https://github.com/ali-vilab/ACE_plus)
- [GitHub: RF-Solver-Edit](https://github.com/wangjiangshan0725/RF-Solver-Edit)
- [GitHub: Concept Sliders](https://github.com/rohitgandikota/sliders)
- [HuggingFace: XLabs-AI FLUX IP-Adapter](https://huggingface.co/XLabs-AI/flux-ip-adapter)
- [HuggingFace: FLUX.1-dev-ControlNet-Depth](https://huggingface.co/Shakker-Labs/FLUX.1-dev-ControlNet-Depth)
- [RunComfy: PersonMaskUltra](https://www.runcomfy.com/comfyui-nodes/ComfyUI_LayerStyle/LayerMask--PersonMaskUltra)
- [RunComfy: FluxRegionalPrompt](https://www.runcomfy.com/comfyui-nodes/RES4LYF/flux-regional-prompt)
- [BFL Kontext Prompting Guide](https://docs.bfl.ai/guides/prompting_guide_kontext_i2i)
- [Replicate: Flux Kontext Haircut Changer](https://replicate.com/flux-kontext-apps/change-haircut)
- [Kohya FLUX LoRA Training](https://learn.thinkdiffusion.com/flux-lora-training-with-kohya/)
- [FLUX LoRA Training 8GB GPU Guide](https://github.com/FurkanGozukara/Stable-Diffusion/wiki/FLUX-LoRA-Training-Simplified-From-Zero-to-Hero-with-Kohya-SS-GUI-8GB-GPU-Windows-Tutorial-Guide)
- [Apatero: Mask-Based Regional Prompting](https://apatero.com/blog/mask-based-regional-prompting-comfyui-complete-guide-2025)
- [Apatero: ComfyUI Inpainting Advanced 2026](https://apatero.com/blog/comfyui-inpainting-advanced-techniques-guide-2026)
- [MyAIForce: ACE Plus Redux](https://myaiforce.com/ace-plus-redux-portrait-bg-swap/)
- [MyAIForce: RF Inversion + PuLID](https://myaiforce.com/rf-inversion-pulid/)
- [MyAIForce: PuLID vs EcomID vs InstantID](https://myaiforce.com/flux-pulid-vs-ecomid-vs-instantid/)
- [DeepWiki: FLUX PuLID Identity Preservation](https://deepwiki.com/mit-han-lab/ComfyUI-nunchaku/4.1.6-flux-pulid-identity-preservation)
- [Flux Concept Sliders](https://flux1.cc/posts/flux-concept-sliders)
