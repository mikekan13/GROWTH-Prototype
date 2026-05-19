# FLUX.1 Dev — Prompting Reference

Comprehensive guide for prompting FLUX.1 Dev, compiled from community research, practitioner testing, and official documentation. Focused on our use case: painterly fantasy character portraits via ComfyUI with PuLID identity preservation.

---

## 1. Natural Language vs Tags

FLUX.1 Dev fundamentally differs from SD1.5/SDXL in prompt interpretation:

- **Natural language is native.** FLUX was trained on natural language captions, not booru-style tags. Write prompts as if describing an image to a person.
- **No weight syntax.** Parentheses `(word:1.5)`, brackets `[word]`, and other SD-style emphasis syntax are **not supported** and will confuse the model. Use natural language emphasis instead: "with emphasis on", "with a focus on", "prominently featuring".
- **Prompt length sweet spot: 20-60 words.** Very short prompts (<10 words) get internally expanded. Very long prompts (200+ words) get internally summarized, meaning parts of your description may be compressed or dropped. The T5 encoder supports up to 512 tokens, but concise is better.
- **Earlier tokens matter more.** FLUX weighs earlier tokens more heavily. Put the most important information first. Recommended structure: **Subject → Action → Environment → Lighting → Style/Modifiers**.
- **Foreground-to-background layering works well.** "In the foreground, a large oak tree with golden autumn leaves. Behind it, a flowing river, and in the background, a mist-covered mountain range."

### Good vs Bad Prompt Examples

**Bad (SD-style tags):**
```
1girl, fantasy, elf, pointy ears, green eyes, (masterpiece:1.3), (best quality:1.4),
detailed face, upper body, dark background, dramatic lighting, oil painting
```

**Good (FLUX natural language):**
```
A painterly fantasy portrait of a female elf with sharp angular features,
pointed ears, and luminous green eyes. She gazes slightly off-camera with
a contemplative expression. Dark atmospheric background with warm key light
from the upper left. Rich oil painting texture with visible brushstrokes.
```

---

## 2. Dual CLIP Encoding (clip_l + t5xxl) — CRITICAL

This is the single most impactful optimization for FLUX quality. **Using the same text for both encoders drops quality by 50-75%.** This was conclusively demonstrated by QuintessentialForms on the Forge GitHub (Discussion #1182) and is the primary reason Forge initially produced worse results than ComfyUI.

### How the Encoders Work

| Encoder | Token Limit | Expects | Good At |
|---------|-------------|---------|---------|
| **clip_l** (CLIP-L) | 77 tokens | Comma-separated descriptors/tags | Style, theme, mood, keyword features |
| **t5xxl** (T5-XXL) | 512 tokens | Full English sentences | Complex scene descriptions, spatial relationships, narrative details |

### Best Practice: Feed Different Content

**clip_l** — Concise, tag-like descriptors:
```
painterly fantasy portrait, female elf, pointed ears, green eyes,
dark background, warm lighting, oil painting, visible brushstrokes,
emotionally expressive, detailed eyes, rich color
```

**t5xxl** — Natural language sentences:
```
A painterly fantasy portrait of a female elf with sharp angular features
and luminous green eyes. She has pointed ears that extend past her temples.
Her expression is contemplative, gazing slightly off-camera. The background
is dark and atmospheric with warm key light from the upper left illuminating
her face. The painting style features rich saturated colors with visible
brushstrokes and oil painting texture.
```

### Key Rules

1. **clip_l gets tags, t5xxl gets sentences.** Never the reverse.
2. **Both should describe the same scene** — they're complementary encoders, not separate prompts for different aspects.
3. **clip_l fails badly with full sentences.** T5xxl fails badly with comma-separated tags.
4. **The guidance parameter in CLIPTextEncodeFlux** controls how strongly the combined text conditioning influences generation. Range 1.0-5.0, default 3.5.

### Impact on Our Pipeline

Our `local.ts` currently feeds the same prompt to both encoders in many code paths (line 476: `inputs.clip_l = nsfwPrefix + params.prompt`). The identity lock path adds extra sentences to t5xxl (line 480), which is closer to correct but still not properly split. **This is our biggest opportunity for quality improvement.**

---

## 3. Negative Prompts in FLUX

**FLUX does not natively support negative prompts.** The architecture is "guidance-distilled" — classifier-free guidance behavior is baked into the model during distillation.

### What This Means

- Setting CFG to 1.0 and using no negative prompt is the **official recommended approach**.
- The "Distilled CFG Scale" (the `guidance` parameter in CLIPTextEncodeFlux, default 3.5) replaces traditional CFG. It was baked in during training.
- **Standard negative prompts connected to the sampler are largely ignored** with CFG 1.0.
- Negative prompts in our workflows (`CLIPTextEncode` node for negative) only have effect if CFG > 1.0.

### Workarounds That Exist

- **Positive-only prompting:** Instead of negating what you don't want, describe what you DO want more precisely. "Natural skin with fine detail" instead of trying to negate "plastic skin".
- **Dynamic Thresholding:** A community technique that enables negative prompts by rescaling latent values. Requires CFG > 1.0 and careful tuning to avoid artifacts.
- **Style LoRAs:** More reliable than negative prompts for steering away from photorealism or anime.

### Recommendation for Our Pipeline

Our extensive negative prompt lists in `style-config.ts` (NEGATIVE_ANTI_PHOTO, NEGATIVE_ANTI_ANIME, etc.) are **mostly ineffective** with FLUX at CFG 1.0. We should:
1. **Remove or minimize negative prompts** — they add complexity without benefit.
2. **Strengthen positive prompts** — describe the desired style explicitly and thoroughly.
3. **Rely on LoRAs** for style steering (which we already do with `ckpf`).
4. If negatives are needed, use Dynamic Thresholding with CFG ~2-3, but test carefully.

---

## 4. CFG / Guidance Scale

FLUX.1 Dev uses a fundamentally different guidance system than SD1.5/SDXL:

### Two Separate "Guidance" Controls

| Parameter | Where | Default | Purpose |
|-----------|-------|---------|---------|
| **CFG Scale** | KSampler node | **1.0** | Traditional classifier-free guidance. Should stay at 1.0 for FLUX Dev. |
| **Guidance** | CLIPTextEncodeFlux node | **3.5** | Distilled guidance — controls prompt adherence. This is the one to adjust. |

### Guidance Value Tuning

| Value | Effect | Use Case |
|-------|--------|----------|
| 1.0 - 1.5 | Low adherence, high creativity, natural textures | Long/complex prompts, creative exploration |
| 2.0 - 3.0 | Balanced | General use, photorealistic |
| 3.0 - 3.8 | Good adherence, slight reduction in realism | **Our sweet spot for portraits** |
| 4.0 - 5.0 | Strong adherence, may reduce quality | Specific compositions, text rendering |
| 5.0+ | Overly rigid, artifacts likely | Avoid |

### How This Affects Prompting Strategy

- At guidance 3.5, FLUX follows your prompt reasonably well. You don't need to "shout" at the model.
- Unlike SD where you'd use CFG 7-12 and needed negative prompts to counterbalance, FLUX at guidance 3.5 approximates what CFG 7 would do in older models.
- **Lower guidance for longer prompts.** If your prompt is detailed (50+ words), guidance 1.0-2.0 prevents the model from being over-constrained.
- **Higher guidance for shorter prompts.** If your prompt is brief, guidance 4.0 helps maintain adherence.

---

## 5. LoRA Interaction with Prompts

### Trigger Words

FLUX LoRAs handle trigger words differently from SD LoRAs:

- **FLUX doesn't naturally understand trigger words.** T5-XXL processes contextual meaning, and arbitrary trigger tokens can confuse it.
- **Some LoRAs work without trigger words** and activate automatically based on training data patterns.
- **When trigger words are needed**, incorporate them naturally. `in the style of ckpf` reads better to T5 than a bare `ckpf` token.
- **Put trigger words in clip_l as tags.** clip_l is more tolerant of non-natural tokens. For t5xxl, weave the trigger into a sentence.

### Trigger Word Placement Example (Our `ckpf` Style LoRA)

**clip_l:**
```
in the style of ckpf, painterly fantasy portrait, dramatic lighting
```

**t5xxl:**
```
A painterly fantasy portrait in the style of ckpf. A female elf with sharp
angular features gazes contemplatively to the side. Rich oil painting texture
with dramatic chiaroscuro lighting.
```

### LoRA Strength vs Prompt Emphasis

- LoRA strength 0.4-0.7 is typical for style LoRAs. Higher values override the prompt more.
- If the LoRA has a strong style, you can use lighter style prompting. If it's subtle, reinforce with prompt text.
- **Multiple LoRAs:** Each LoRA's trigger word should appear in the prompt. Order in prompt doesn't matter as much as LoRA model weight.
- **Style LoRAs and detail LoRAs serve different purposes.** Style LoRAs change the overall aesthetic; detail LoRAs (like our detail enhancer) sharpen specific features without needing trigger words.

---

## 6. Portrait / Face Prompting

### Face-Specific Best Practices

1. **Be specific about facial features.** "Sharp angular cheekbones, deep-set hazel eyes with amber flecks, a narrow aquiline nose, thin lips" is far better than "beautiful face".
2. **Expression matters.** FLUX handles nuanced expressions well: "a knowing half-smile", "furrowed brow with concerned eyes", "serene and contemplative gaze".
3. **Lighting defines the face.** "Warm key light from the upper left, cool fill from below" gives dimensional faces. Flat lighting produces flat faces.
4. **Specify gaze direction.** "Looking directly at the viewer", "gazing slightly off-camera to the right", "eyes downcast".
5. **Hair control is critical for faces.** Be explicit: "hair pulled back tightly, forehead fully exposed, ears visible" for clean face shots. Hair descriptions should come early in the prompt since they frame the face.

### Portrait Composition Prompting

- **Bust portrait:** "Close-up bust portrait from chest up, centered in frame"
- **Face only:** "Extreme close-up of face, chin to forehead, filling the frame"
- **3/4 view:** "Three-quarter view portrait, face turned slightly to the left"
- **Profile:** "Side profile portrait, facing left, clean silhouette"

### Identity Consistency (PuLID)

When using PuLID for identity preservation:
- PuLID handles the identity — don't over-describe facial structure that PuLID already provides.
- Focus prompts on **what PuLID can't control**: expression, lighting, angle, hair styling, accessories.
- PuLID weight 0.6-0.9; higher = more identity lock, less prompt influence on face shape.
- Our PuLID hair fix (masking label 17) means hair can be prompted independently from identity.

### Example Portrait Prompt (Split for Dual CLIP)

**clip_l:**
```
in the style of ckpf, painterly fantasy portrait, female elf, pointed ears,
green eyes, angular features, dark background, warm lighting, oil painting,
detailed eyes, three-quarter view, bust portrait
```

**t5xxl:**
```
A painterly fantasy bust portrait in the style of ckpf. A female elf with
sharp angular cheekbones and luminous green eyes gazes contemplatively past
the viewer's right shoulder. Her pointed ears extend past her temples, and
her dark auburn hair is pulled back revealing her full face. Warm golden
key light from the upper left creates dramatic chiaroscuro across her
features. The background is a deep, dark atmospheric void. Rich oil painting
texture with visible brushstrokes and emotionally expressive rendering.
```

---

## 7. Style Control

### Steering Away from Photorealism

FLUX defaults toward hyperrealism, especially with quantized models. Active prompting is required to push toward painterly styles:

- **"In the style of" alone doesn't work well.** Double down: "by XY, XY art style" combined with technique description.
- **Describe the technique explicitly:** "oil painting with visible brushstrokes, impasto texture, rich saturated pigments, painterly color mixing".
- **Reference artistic traditions:** "Renaissance chiaroscuro", "Pre-Raphaelite color palette", "Frazetta-inspired fantasy illustration".
- **Lower step counts can help with painterly styles.** 8-10 steps instead of 20-30 produces less refined, more painterly results (though at quality cost).

### Style Anchors (Keep to 1-2)

Too many style references dilute each other. Pick one or two strong anchors:
- "painterly fantasy illustration, oil painting texture" (our current approach)
- NOT "painterly fantasy illustration, oil painting, watercolor, gouache, digital art, concept art" (too many)

### Style LoRAs vs Prompt-Only

- **LoRAs are more reliable** for consistent style than prompting alone.
- Our `ckpf` style LoRA is the primary style anchor.
- Prompt text reinforces and fine-tunes what the LoRA establishes.
- For painterly styles specifically, the combination of LoRA + prompt technique description gives the best results.

### Using IP-Adapter for Style Transfer

If prompt + LoRA isn't enough for consistent style:
- IP-Adapter can enforce a reference image's style onto new generations
- Useful for matching a specific illustration style from the Core Rulebook
- ComfyUI has Flux-compatible IP-Adapter nodes (requires separate model download)

---

## 8. Common Pitfalls

### Things That Break FLUX

| Pitfall | Why It Fails | Fix |
|---------|-------------|-----|
| Same text for clip_l and t5xxl | 50-75% quality drop | Split: tags for clip_l, sentences for t5xxl |
| SD-style weight syntax `(word:1.5)` | FLUX ignores/misinterprets | Use natural language: "with emphasis on word" |
| Negative prompts with CFG 1.0 | FLUX is guidance-distilled, negatives are ignored | Use positive-only prompting or Dynamic Thresholding |
| "white background" in Dev | Causes blurry/undefined output | Use "plain grey background" or "neutral background" |
| Prompts over 200 words | Internally summarized, details dropped | Stay under 60 words, be concise |
| Prompts under 10 words | Internally expanded unpredictably | Provide at least 20 words of description |
| Too many style anchors | Styles dilute each other | Keep 1-2 strong style references |
| Bare trigger words in t5xxl | T5 processes contextual meaning, bare tokens confuse it | Weave trigger words into natural sentences |
| High guidance (>5.0) with detailed prompts | Over-constrained, artifacts | Lower guidance for longer prompts |
| Disorganized prompt structure | Model gets confused about composition | Use Subject → Action → Environment → Lighting → Style order |

### Text Rendering

FLUX can render text in images (a significant improvement over SD):
- Short phrases work best
- ALL CAPS is more reliable than mixed case
- Clean backgrounds help text clarity
- Don't rely on it for critical text — it's still imperfect

---

## 9. Recommended Settings Summary (Our Pipeline)

| Parameter | Value | Notes |
|-----------|-------|-------|
| CFG Scale | 1.0 | Always 1.0 for FLUX Dev |
| Guidance (CLIPTextEncodeFlux) | 3.5 | Reduce to 2.0-3.0 for long prompts |
| Steps | 20 | 15 for draft, 20-25 for final |
| Resolution | 768x768 | 1024x1024 when VRAM allows |
| clip_l content | Tags/descriptors | Style, mood, subject keywords |
| t5xxl content | Natural sentences | Full scene description |
| Negative prompt | Minimal or none | Not effective at CFG 1.0 |
| PuLID weight | 0.6-0.9 | Higher = more identity lock |
| Style LoRA strength | 0.4-0.7 | ckpf at 0.6 currently |

---

## 10. Action Items for Our Pipeline

Based on this research, the following changes would improve our portrait quality:

1. **Split prompt builder output into separate clip_l and t5xxl content.** The `buildPortraitPrompt()` function should return `{ clip_l: string, t5xxl: string, negativePrompt: string }` instead of a single `positive` string.
2. **clip_l variant:** Concatenate the style tags, subject keywords, composition tags. Keep under 77 tokens.
3. **t5xxl variant:** Build natural language sentences from the same data. "A [seed] [sex] with [physical description]. They have [face details]. [Expression]. [Lighting]. [Style technique description]."
4. **Remove or gate negative prompts.** They're not effective at CFG 1.0. Remove from default workflow, or add Dynamic Thresholding support if negatives are needed.
5. **Adjust LoRA trigger placement.** Put `in the style of ckpf` in both encoders, but as a tag in clip_l and as a sentence fragment in t5xxl.
6. **Tune guidance per prompt length.** Short identity lock prompts → guidance 3.5-4.0. Full character portraits with equipment/narrative → guidance 2.5-3.0.

---

## Sources

- [ComfyUI CLIPTextEncodeFlux Node Documentation](https://docs.comfy.org/built-in-nodes/ClipTextEncodeFlux)
- [Forge Flux Dual Prompting Discussion #1182](https://github.com/lllyasviel/stable-diffusion-webui-forge/discussions/1182) — The critical dual-encoder experiment
- [Sandner.art: Prompting Art Styles in Flux](https://sandner.art/prompting-art-and-design-styles-in-flux-in-forge-and-comfyui/)
- [Andreas Kuhr: The Flux AI Guide](https://andreaskuhr.com/en/flux-ai-guide.html)
- [getimg.ai: FLUX.1 Prompt Guide](https://getimg.ai/blog/flux-1-prompt-guide-pro-tips-and-common-mistakes-to-avoid)
- [Skywork: Flux Prompting Ultimate Guide](https://skywork.ai/blog/flux-prompting-ultimate-guide-flux1-dev-schnell/)
- [fal.ai: How to Use FLUX AI](https://fal.ai/learn/tools/how-to-use-flux)
- [DeepInfra: FLUX.1-dev Guide](https://deepinfra.com/blog/flux1-dev-guide)
- [Next Diffusion: Mastering FLUX.1 Portrait Prompts](https://www.nextdiffusion.ai/blogs/mastering-ai-portrait-prompts-with-flux1-for-realistic-images)
- [ComfyUI FLUX Examples](https://comfyanonymous.github.io/ComfyUI_examples/flux/)
- [CivitAI: Flux Style Captioning Differences](https://civitai.com/articles/6792/flux-style-captioning-differences-training-diary)
- [CivitAI: Captions vs No-Captions for Flux LoRA Training](https://civitai.com/articles/7203/captions-vs-no-captions-a-deep-dive-into-effects-on-flux-lora-training)
- [Pelayo Arbues: What to Caption for Flux LoRA Training](https://www.pelayoarbues.com/literature-notes/Articles/What-Exactly-to-Caption-for-Flux-LoRa-Training)
- [HuggingFace: What is guidance-distilled?](https://huggingface.co/black-forest-labs/FLUX.1-dev/discussions/17)
- [Forge BitsandBytes + Flux Discussion #981](https://github.com/lllyasviel/stable-diffusion-webui-forge/discussions/981)
