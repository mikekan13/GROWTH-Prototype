# Consistent Art Style Research (March 2026)

**Target Style:** Painterly fantasy illustration — rich color, dramatic lighting, emotionally expressive faces. Not photorealistic, not anime.

---

## 1. Style LoRAs — Training & Best Practices

### Training Data
- **50–200 images** recommended for style LoRAs (vs 20–50 for character LoRAs)
- 20–30 well-chosen images often beat a larger inconsistent set
- Images should be high-quality, sharp, ideally 1024×1024
- Include variety (different compositions, lighting, subjects) but consistent STYLE

### Training Parameters
- Use `is_style: true` parameter — disables auto-captioning and segmentation masks
- Use unique trigger words like `gwthart` combined with descriptive terms (e.g., `gwthart painting`)
- FLUX LoRA training: 10–20 images, 15–30 minutes on modern platforms (fal.ai, Together AI)
- SDXL LoRA training: well-established tooling (kohya_ss, FluxGym)

### Interaction with Identity Preservation
- **Style LoRA + PuLID CAN be combined** — the recommended 2026 stack is:
  - Style LoRA at **low strength (0.6)** for general aesthetic, color palette, brushwork
  - PuLID adapter at **0.8 strength** for facial identity lock
  - ControlNet (OpenPose) for pose/posture consistency
- Convention: load style LoRA → character LoRA → object LoRA (in that order)
- Quality degradation is minimal when strengths are tuned properly; the key is not maxing out any single adapter

---

## 2. Style Prompting Techniques

### Prompt Structure for Consistency
Build a **"style bible" prompt block** — a reusable text prefix for ALL generations:
```
gwthart painting, painterly fantasy illustration, rich saturated color,
dramatic chiaroscuro lighting, emotionally expressive face, visible brushstrokes,
oil painting texture, fantasy art, detailed eyes, warm and cool color contrast
```

### Identity Anchors
- Create a **character bible** — a reusable text block describing all visual traits
- Combine style bible + character bible as prefix for every generation
- Use seed consistency where possible (same seed = same composition tendencies)

### Style Modifiers That Help
- "painterly", "oil painting", "fantasy illustration", "dramatic lighting"
- "visible brushstrokes", "rich color palette", "emotionally expressive"
- Artist references (when legally/ethically appropriate): style-of descriptions

---

## 3. Negative Prompts — Best Practices

### Structured Layering Approach
Build negative prompts in **categories**, not random keyword dumps:

**Anti-Photorealism Layer:**
```
photograph, photorealistic, photo, realistic skin texture, pores,
camera grain, lens flare, bokeh, DSLR
```

**Anti-Anime/Cartoon Layer:**
```
anime, cartoon, cel shading, flat color, manga, chibi,
line art, vector art, clip art
```

**Anti-AI-Artifacts Layer:**
```
deformed, disfigured, bad anatomy, extra fingers, mutated hands,
poorly drawn face, blurry, watermark, signature, text
```

**Style Purity Layer:**
```
3d render, CGI, digital art, smooth gradient, plastic skin,
oversaturated, neon colors, flat lighting
```

### Cautions
- **Don't overload** — too many negative terms causes blurry/incomplete output
- Test iteratively; start with quality layers, add specifics as needed
- Flux models handle negative prompts differently than SDXL — may need post-processing refinement

---

## 4. IP-Adapter for Style (Separate from Face Identity)

### How It Works
- IP-Adapter is like a "1-image LoRA" — conditions generation on a reference image
- Separate from PuLID/FaceID which targets facial identity specifically
- Can be used for **style transfer** by providing style reference images

### Style vs Identity Split
| Tool | Purpose | Strength Range |
|------|---------|---------------|
| IP-Adapter (style) | Transfer painting style, color palette, mood | 0.4–0.7 |
| IP-Adapter FaceID | Face identity from recognition model embeddings | 0.6–0.8 |
| PuLID | Pure identity preservation (facial features) | 0.7–0.9 |
| Style LoRA | Trained aesthetic (brushwork, palette, composition) | 0.5–0.7 |

### Recommended Stack for GRO.WTH
1. **Style LoRA** (trained on approved art corpus) → sets painterly baseline
2. **PuLID** → locks character face identity
3. **IP-Adapter (style mode)** → optional reinforcement from style reference image
4. **ControlNet** → composition/pose control

---

## 5. SDXL vs Flux for Painterly/Stylized Output

### SDXL Wins for This Use Case
- **Superior for non-photorealistic styles** — Flux tends toward photorealism and polish
- **Massive ecosystem**: thousands of fine-tuned checkpoints, tens of thousands of LoRAs
- **Better expressionist/painterly output** — Flux images often "too realistic and polished"
- **Lower VRAM** (8GB) — better for local generation
- **Full ControlNet support** with mature tooling

### Flux Strengths (Less Relevant Here)
- Better text rendering (not needed for portraits)
- Better photorealism (opposite of our goal)
- Better complex prompt following

### Recommended Checkpoints for Painterly Fantasy

| Model | Strengths | Notes |
|-------|-----------|-------|
| **Deliberate v3/XL** | Clean compositions, natural color grading, painterly textures, strong anatomy | Best for fantasy portraits, book covers, emotional depth |
| **DreamShaper XL** | Intricate details, textures, lighting, fantastical imagery | Good for complex armor, natural elements, painterly style |
| **SDXL Stylized Fantasy CinematicArt** | Purpose-built for painterly lighting aesthetic | LoRA on CivitAI specifically for this style |

### Verdict
**Use SDXL (Deliberate v3 or DreamShaper XL) as the base** for GRO.WTH portraits. Flux only if photorealistic output is ever needed (unlikely).

---

## 6. DPO / Aesthetic Fine-Tuning

### What It Is
Direct Preference Optimization (DPO) fine-tunes diffusion models using human preference pairs ("this image is better than that one") to steer aesthetic output.

### State of the Art (2025–2026)
- **SPO (Step-by-step Preference Optimization)** — CVPR 2025 paper. Fine-grained aesthetic assessment at each denoising step. Significant improvements over standard DPO on SDXL.
- **Personalized Preference Fine-tuning** — With as few as **4 preference examples**, achieves 76% win rate over Stable Cascade. Uses vision-language model to extract preference embeddings.
- **Iterative DPO** — Learns an improvement model from preference datasets, iteratively refining aesthetic quality.

### Relevance for GRO.WTH
- **High potential but high effort.** Could create a "GRO.WTH aesthetic judge" that scores generations against the approved style.
- **Practical approach:** Curate 50–100 preference pairs (good vs bad examples of the target style), fine-tune with SPO.
- **Defer to later** — style LoRA + prompt engineering is the faster path. DPO is the polish layer.

---

## 7. ControlNet for Composition Consistency

### Key Control Modes

| Mode | Use Case | Accuracy (2025 benchmarks) |
|------|----------|---------------------------|
| **OpenPose** | Character pose, gesture, stance | 88.5% pose matching |
| **Canny Edge** | Structural/architectural consistency | 94.2% structural accuracy |
| **Depth Map** | Foreground/background separation, spatial arrangement | 91.8% spatial consistency |
| **Composition** | Overall framing, subject placement | Good for serial art |

### For GRO.WTH Portraits
- **OpenPose** for consistent character framing (bust portrait, 3/4 view, action pose)
- **Depth Map** for consistent foreground/background separation
- Create a **pose library** of standard portrait compositions (front, 3/4, profile, action)
- Reference: [Pose Depot](https://github.com/a-lgil/pose-depot) — curated ControlNet pose collection

### ControlNet Reduces Generation Costs by ~40%
Fewer re-rolls needed when composition is constrained.

---

## 8. Consistent Backgrounds and Environments

### Techniques
- **Use the same base model** for character AND environment generation
- **Style LoRA applies to everything** — same LoRA for characters and backgrounds ensures visual cohesion
- **Maintain consistent color palette** across all generations
- **Inpainting workflow**: generate character on neutral background, then composite into environment (or vice versa)

### Environment Consistency Strategy
1. Define a **location bible** — describe each recurring location's visual traits
2. Generate **reference plates** for each location (2–3 angles)
3. Use IP-Adapter with location reference for scene-specific generations
4. ControlNet depth maps maintain spatial consistency across scenes

### Emerging Tech
- **World Labs** and **Meta WorldGen** — text-to-3D-world generators that maintain internal stylistic consistency
- Not production-ready for 2D illustration pipelines yet, but worth monitoring

---

## 9. Painterly/Fantasy Illustration Models

### SDXL Checkpoints (Recommended)
1. **Deliberate v3/XL** — Best overall for emotional, painterly fantasy
2. **DreamShaper XL** — Strong for fantastical imagery, armor, natural elements
3. **SDXL Stylized Fantasy CinematicArt LoRA** — Purpose-built for this exact aesthetic

### Style-Specific LoRAs (CivitAI)
- Search for: "painterly", "oil painting", "fantasy illustration", "dramatic lighting"
- Train a **custom GRO.WTH style LoRA** from curated reference art (best long-term solution)

### Quality Hierarchy
1. Custom style LoRA trained on approved GRO.WTH art (best)
2. Fine-tuned checkpoint (Deliberate/DreamShaper) + style prompt (good)
3. Base SDXL + extensive prompt engineering (acceptable starting point)

---

## 10. Style Anchoring Techniques

### Reference Corpus Approach
1. **Curate 50–200 "approved" images** that represent the target GRO.WTH style
2. **Train a style LoRA** on this corpus (primary anchoring method)
3. **Select 3–5 "hero" reference images** for IP-Adapter style conditioning
4. **Build a style prompt bible** extracted from what works

### Preventing Drift Over Hundreds of Generations
- **Always use the style LoRA** — never generate without it
- **Lock the checkpoint** — don't switch base models mid-project
- **Maintain the style prompt prefix** — identical across all generations
- **Periodic quality audit** — compare new generations against the reference corpus
- **Seed cataloging** — log seeds that produce good results for similar compositions
- **Version your LoRA** — if you retrain, keep previous versions for comparison

### Mathematical Fingerprinting
Modern systems create embeddings of approved style images. New generations are compared against this embedding space. Outliers (high distance from centroid) indicate style drift and can be flagged or rejected automatically.

---

## Recommended GRO.WTH Portrait Pipeline

### Phase 1 — Immediate (Prompt Engineering)
1. Choose **Deliberate v3/XL** or **DreamShaper XL** as base checkpoint
2. Build style bible prompt + negative prompt layers (see sections 2 & 3)
3. Use **PuLID** for character identity (already in PORTRAIT-PIPELINE.md)
4. Use **ControlNet OpenPose** for consistent portrait framing
5. Generate and curate 50+ approved-style images

### Phase 2 — Style Lock (LoRA Training)
1. Train a **GRO.WTH style LoRA** on curated approved images
2. Combine: Style LoRA (0.6) + PuLID (0.8) + ControlNet
3. Build pose library for standard portrait types
4. Create location reference plates for environment consistency

### Phase 3 — Quality Automation (DPO/Aesthetic)
1. Curate preference pairs from Phase 1–2 generations
2. Train aesthetic scoring model or apply SPO fine-tuning
3. Implement automated style drift detection via embedding distance
4. Build rejection/re-generation pipeline for off-style outputs

---

## Key Answers to Research Questions

**Can you combine style LoRA + PuLID without quality degradation?**
Yes. The proven stack is: Style LoRA at 0.6 strength + PuLID at 0.8 + ControlNet. Quality holds when you don't max out any single adapter.

**Recommended workflow for "same person, same style, different scene"?**
Style LoRA (constant) + PuLID from reference face (constant) + ControlNet pose (varies per scene) + scene-specific prompt (varies). The style and identity layers are fixed anchors; only composition and scene description change.

**How to prevent style drift over hundreds of generations?**
Lock checkpoint + always-on style LoRA + fixed style prompt prefix + periodic audit against reference corpus + embedding-based drift detection for automation.

**Are there checkpoints for painterly fantasy art?**
Yes: Deliberate v3/XL and DreamShaper XL are the top SDXL options. The "SDXL Stylized Fantasy CinematicArt" LoRA on CivitAI is purpose-built. For maximum control, train a custom LoRA.

---

## Sources

- [Anifusion LoRA Training](https://anifusion.ai/features/lora-training)
- [Together AI — Flux LoRAs](https://www.together.ai/blog/generate-images-with-specific-styles-using-flux-loras-on-together-ai)
- [FluxGym Style LoRA Training](https://learn.thinkdiffusion.com/make-your-character-style-lora-stand-out-easy-lora-training-with-fluxgym/)
- [Stable Diffusion Art — LoRA Training](https://stable-diffusion-art.com/train-lora/)
- [Stable Diffusion Art — IP-Adapters Guide](https://stable-diffusion-art.com/ip-adapter/)
- [Thinkpeak — Best LoRAs for Consistent Characters 2026](https://thinkpeak.ai/best-loras-consistent-characters-2026/)
- [DeepWiki — FLUX PuLID Identity Preservation](https://deepwiki.com/mit-han-lab/ComfyUI-nunchaku/4.1.6-flux-pulid-identity-preservation)
- [ComfyUI IPAdapter Plus](https://github.com/cubiq/ComfyUI_IPAdapter_plus)
- [Ultimate Combo: LoRA + ControlNet + IP-Adapter](https://shree6791.medium.com/part-6-the-ultimate-combo-lora-controlnet-ip-adapter-prompt-c938fcb43b27)
- [SDXL vs Flux Comparison (pxz.ai)](https://pxz.ai/blog/flux-vs-sdxl)
- [SDXL vs Flux (stable-diffusion-art.com)](https://stable-diffusion-art.com/sdxl-vs-flux/)
- [Best Stable Diffusion Models 2026](https://www.cubix.co/blog/best-model-for-stable-diffusion/)
- [DreamShaper XL (CivitAI)](https://civitai.com/models/112902/dreamshaper-xl)
- [Deliberate / Best SDXL Models (Segmind)](https://blog.segmind.com/best-stable-diffusion-xl-sdxl-models/)
- [SDXL Stylized Fantasy CinematicArt LoRA](https://civitai.com/models/1810502/sdxl-stylized-fantasy-cinematicart-style-painterly-lighting-aesthetic)
- [SPO — Aesthetic Post-Training (CVPR 2025)](https://arxiv.org/abs/2406.04314)
- [Personalized Preference Fine-tuning](https://arxiv.org/abs/2501.06655)
- [ControlNet Complete Guide](https://stable-diffusion-art.com/controlnet/)
- [Pose Depot (GitHub)](https://github.com/a-lgil/pose-depot)
- [Negative Prompts Guide (Shakker AI)](https://wiki.shakker.ai/en/negative-prompts-in-stable-diffusion)
- [120+ Negative Prompts (ClickUp)](https://clickup.com/blog/stable-diffusion-negative-prompts/)
- [LoRA Training Best Practices 2025 (Apatero)](https://apatero.com/blog/lora-training-best-practices-flux-stable-diffusion-2025)
- [Character Consistency Guide 2026 (GensGPT)](https://www.gensgpt.com/blog/character-consistency-ai-image-generation-2026-guide)
- [NowadAIs Character Consistency Guide](https://www.nowadais.com/ai-character-consistency-guide-consistent-visual/)
- [PuLID + FLUX-REDUX Workflow](https://comfyui.org/en/face-swap-pulid-flux-redux-workflow)
- [Multi-LoRA Workflows in ComfyUI](https://neurocanvas.net/blog/multi-lora-workflows-comfyui/)
