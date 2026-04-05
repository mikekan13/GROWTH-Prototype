# Character Consistency in AI Image Generation — Research (March 2026)

Research for GRO.WTH TTRPG portrait pipeline. Key constraint: painterly fantasy illustration (NOT photorealistic). Characters must be recognizable across hundreds of generations over years of play, with varying equipment, wounds, poses, and environments.

Hardware target: NVIDIA RTX 4060 (8GB VRAM).

---

## 1. PuLID (Pure and Lightning ID Customization)

**Status:** NeurIPS 2024 paper. PuLID Flux II is the current version for Flux models.

**How it works:** Uses contrastive alignment to inject facial identity into diffusion models without "model pollution" — the base model's style and composition capabilities remain intact. Extracts face embeddings via InsightFace + EVA-CLIP, then injects identity features through cross-attention layers.

**Strengths:**
- Zero model pollution — preserves the base model's artistic style completely
- Works from a single reference image (no training required)
- Tunable weight (0.5-1.5) to balance identity vs. style freedom
- 8GB VRAM compatible (with quantized Flux)
- Fast: ~15-30s per generation on RTX 4060 with Nunchaku
- Compatible with TeaCache and WaveSpeed for speed optimization
- Native ComfyUI support via cubiq/PuLID_ComfyUI

**Weaknesses:**
- Most restrictive for expression/pose variation — tends to mirror reference image's hairstyle and face angle
- Least effective at extreme head turns and unusual angles
- Cannot change hairstyle easily (sticks rigidly to reference)
- Requires InsightFace + EVA-CLIP models loaded alongside main model

**Compatibility:** Flux Dev/Pro (native), SDXL (original version). Flux II is the recommended version.

**For GRO.WTH:** CURRENT RECOMMENDATION in PORTRAIT-PIPELINE.md. Best balance of quality, VRAM, and zero-training workflow. The rigid pose/hairstyle issue is actually acceptable for a portrait pipeline where we control composition via prompts.

---

## 2. InstantID

**Status:** Mature, 11.9k GitHub stars. SDXL-based. No native Flux support.

**How it works:** Combines IP-Adapter with ControlNet facial keypoints. Uses InsightFace for face embedding + ControlNet for facial landmark guidance, giving both identity and structural control.

**Strengths:**
- Highest face similarity scores in benchmarks (~82-86% facial recognition match)
- Excellent at extreme angles and head turns
- Good balance of identity preservation and creative flexibility
- Well-established ComfyUI ecosystem

**Weaknesses:**
- SDXL only — no official Flux support (major limitation in 2026)
- Higher VRAM usage than PuLID (ControlNet + IP-Adapter combined)
- Moderate complexity (more nodes in workflow than PuLID)
- Sometimes shows original hair color "bleeding through" style changes

**Compatibility:** SDXL only. Community Flux ports exist but are unofficial.

**For GRO.WTH:** Not recommended as primary. SDXL-only locks us out of Flux's superior quality. Could be a fallback if SDXL is ever needed for specific stylized outputs.

---

## 3. IP-Adapter / IP-Adapter FaceID

**Status:** 6.5k GitHub stars. FaceID Plus V2 is the latest face-specific variant.

**How it works:** Injects image prompt embeddings into cross-attention layers of diffusion models. FaceID variant uses InsightFace embeddings specifically for facial identity. Plus V2 adds CLIP image embeddings for better face structure.

**Strengths:**
- Simplest workflow (3-4 nodes in ComfyUI)
- Fastest generation (6-10 seconds)
- Lowest VRAM (works on 6GB)
- Most flexible for expression and pose changes
- Widest model compatibility (SD 1.5, SDXL)

**Weaknesses:**
- Lowest identity fidelity of the three main approaches
- No official Flux support — SDXL/SD1.5 only
- FaceID Plus V2 requires accompanying LoRA file
- Less precise facial feature preservation than PuLID or InstantID

**Compatibility:** SD 1.5, SDXL. No Flux support.

**For GRO.WTH:** Not recommended. Inferior identity preservation and no Flux support.

---

## 4. PhotoMaker (V1 and V2)

**Status:** CVPR 2024 paper, 10.1k GitHub stars. V2 available.

**How it works:** Stacks multiple ID embeddings from reference images into the generation process. V2 uses improved stacked ID embedding for better multi-image identity fusion.

**Strengths:**
- Good at combining identity from multiple reference photos
- Can handle style transfer while maintaining identity
- Works with SDXL

**Weaknesses:**
- SDXL only — no Flux support
- Requires multiple reference images for best results
- Less precise than InstantID or PuLID for single-reference scenarios
- Community adoption has plateaued

**Compatibility:** SDXL only.

**For GRO.WTH:** Not recommended. SDXL-only and no clear advantage over PuLID for our single-reference workflow.

---

## 5. LoRA / DreamBooth Training Per Character

**Status:** Mature technique. kohya-ss/sd-scripts is the gold standard. ai-toolkit is a newer alternative with Flux presets.

**How it works:** Fine-tunes a small adapter network on 15-30 images of a specific character. The resulting LoRA file (50-150MB) captures deep identity features that generalize across poses, lighting, and styles.

**Best Practices (Flux 2 Pro, 2026):**
- Dataset: 15-20 well-curated images (diverse angles, lighting)
- Training: 1500-2500 steps, learning rate 1e-4, cosine scheduler
- Network dim: 32 (sweet spot for character LoRAs)
- Resolution: 1024
- VRAM: 12GB minimum (8GB possible with GGUF quantized base)
- Training time: 1-3 hours
- Cost: ~$5 in cloud GPU compute

**Strengths:**
- Highest identity consistency of any method — learns abstract identity concepts
- Character holds up across extreme pose changes, lighting, style variations
- Flux 2 LoRAs dramatically better than SDXL LoRAs at generalization
- Supports up to 8 reference images per generation with multi-reference
- One-time training cost, unlimited generations

**Weaknesses:**
- Requires training per character (impractical for player-generated characters at scale)
- Needs 15-30 reference images (where do these come from for fictional characters?)
- Risk of overfitting if dataset is poor
- Cannot be done in real-time — requires offline GPU training
- Larger storage per character (50-150MB per LoRA)

**Compatibility:** Flux 2 Pro/Dev (best), SDXL (good), SD 1.5 (adequate).

**For GRO.WTH:** NOT suitable as primary pipeline — we need on-demand generation from a single reference for player characters. However, could be excellent for RECURRING NPCs that a Watcher uses frequently. A Watcher could train a LoRA for their key NPCs after generating enough reference images via PuLID. This is a Phase D+ feature.

---

## 6. FLUX.1 Kontext

**Status:** Released June 2025 by Black Forest Labs. Dev (open-source, 12B params) and Pro/Max (API) versions. Native ComfyUI support from day one.

**How it works:** A unified architecture that takes both text and image inputs via sequence concatenation. Understands existing images and modifies them through text instructions — no adapters, no ControlNet, no training needed. The model natively understands identity and can preserve it across edits.

**Strengths:**
- 98% identity retention across generations (claimed)
- Native character preservation — no external adapters needed
- Instruction-based: "change the background to a forest" preserves identity automatically
- Supports iterative editing without degradation (unlike other models)
- Context-aware lighting adaptation
- Open-source Dev version runs locally
- No training, no adapters, no complex workflows

**Weaknesses:**
- 12B parameters — heavier than adapter-based approaches
- Best results require careful prompting (avoid pronouns, specify what to preserve)
- Avoid multi-attribute changes in single request
- Avoid simultaneous pose + background changes
- Dev version is non-commercial license
- Relatively new — ecosystem still maturing

**Compatibility:** Standalone model (Flux architecture). ComfyUI native support.

**For GRO.WTH:** STRONG CONTENDER as a complement to PuLID. Kontext could handle portrait updates (equipment changes, injuries, scene changes) while PuLID handles initial identity establishment. The instruction-based editing ("add a scar across the left eye", "put them in plate armor") maps perfectly to our dynamic portrait update triggers. Worth investigating as the Phase C/D solution.

---

## 7. ReActor / FaceSwap (Post-Processing)

**Status:** ReActor's GitHub repository was TAKEN DOWN by GitHub for ToS violations. The approach is legally and ethically questionable.

**How it works:** Generates an image first, then swaps the face using InsightFace face detection + replacement. Post-processing approach rather than generation-time identity injection.

**Strengths:**
- Can achieve very high face similarity (near 100%)
- Works with any base model since it's post-processing
- Fast face swap step

**Weaknesses:**
- Repository removed from GitHub (supply chain risk)
- Ethical/legal concerns (deepfake technology)
- Two-step process introduces artifacts at face boundaries
- Style mismatch between swapped face and generated body
- Poor results with non-photorealistic styles (painterly faces look wrong when swapped)

**For GRO.WTH:** DO NOT USE. Ethically problematic, repository taken down, and fundamentally incompatible with painterly fantasy style (face swap produces uncanny results on illustrated faces).

---

## 8. StoryDiffusion

**Status:** NeurIPS 2024 Spotlight. 6.4k GitHub stars.

**How it works:** Uses "Consistent Self-Attention" — shares attention features across a batch of images being generated simultaneously, ensuring the same character looks consistent across all images in the batch. Requires 3+ text prompts (5-6 recommended) generated together.

**Strengths:**
- Designed specifically for multi-image character consistency
- Hot-pluggable, compatible with SD 1.5 and SDXL models
- Good for generating character reference sheets (multiple poses at once)
- Also includes motion predictor for video generation

**Weaknesses:**
- Requires batch generation (3+ images at once) — not suitable for on-demand single portraits
- SD 1.5 and SDXL only — no Flux support
- Consistency degrades over very long sequences
- Not designed for "generate one portrait that matches a previous one"

**Compatibility:** SD 1.5, SDXL. No Flux support.

**For GRO.WTH:** Not suitable for our primary pipeline (we need single on-demand portraits). However, could be useful for generating initial character reference sheets — batch-generate 5-6 poses of a new character to establish visual identity, then use those as PuLID references. Niche utility only.

---

## 9. CharaConsist

**Status:** Research paper (2025). Addresses fine-grained consistency under action variations.

**How it works:** Uses point-tracking attention and adaptive token merge to maintain character identity even during significant pose/action changes. Addresses "locality bias" that causes other methods to lose identity when characters move.

**Strengths:**
- Fine-grained consistency under action variations
- Controllable background preserving or switching
- Addresses a real weakness of other methods (identity loss during action)

**Weaknesses:**
- Research-stage, limited practical tooling
- No established ComfyUI integration
- Unclear VRAM requirements and speed

**For GRO.WTH:** Watch this space. If it matures into ComfyUI nodes, it could solve the "character in action poses" problem better than PuLID.

---

## 10. ACE++ (Alibaba)

**Status:** Released January 2025. Instruction-based editing built on Flux Fill.

**How it works:** Context-aware content filling that can swap faces and reconstruct surrounding elements. Instruction-based approach similar to Kontext but from Alibaba's team.

**Strengths:**
- High face similarity in front-facing shots (comparable to Hyper LoRA)
- Can reconstruct occluding elements (flowers, jewelry around face)
- Instruction-based editing

**Weaknesses:**
- Flux Fill training was suspended due to instability (heterogeneity between training data and Flux model)
- Development appears stalled
- Less robust than Kontext for iterative editing

**For GRO.WTH:** Not recommended. Development suspended, Kontext is the better instruction-based option.

---

## 11. ControlNet for Pose/Composition

**Status:** Mature. InstantX Flux Union ControlNet supports Flux Dev.

**How it works:** Conditions image generation on structural inputs — OpenPose skeletons, depth maps, canny edges, etc. Controls composition and pose without affecting identity.

**Modes available for Flux:**
- OpenPose (skeletal pose)
- Depth (3D structure)
- Canny (edge detection)
- Soft Edge
- Grayscale

**Strengths:**
- Precise pose and composition control
- Works alongside identity methods (PuLID + ControlNet together)
- Essential for "character in specific pose" scenarios
- Flux Union ControlNet handles multiple modes simultaneously

**Weaknesses:**
- Requires source pose image or skeleton
- Additional VRAM overhead
- Can conflict with identity adapters if both try to control facial structure

**For GRO.WTH:** Useful for Phase C+ when we want specific poses (combat stance, sitting, etc.). Combine with PuLID: ControlNet handles pose, PuLID handles identity. Not needed for basic bust portraits (Phase A/B).

---

## 12. Hyper LoRA (Flux)

**Status:** Emerging technique, competitive with established methods.

**How it works:** A specialized LoRA approach that provides face identity preservation without per-character training. Functions more like an adapter than a traditional LoRA.

**Strengths:**
- Superior prompt adherence (better than InstantID or PuLID at following style instructions)
- Most flexible with creative changes (hairstyle, color changes)
- High face similarity in direct shots
- Good at separating identity from style

**Weaknesses:**
- Less documented than PuLID/InstantID
- Newer, smaller community
- Performance at extreme angles less tested

**For GRO.WTH:** Worth monitoring. If it proves to offer better style flexibility than PuLID while maintaining identity, it could be a better fit for painterly fantasy portraits where we need to change equipment/appearance while keeping the face.

---

## Flux vs SDXL: Which Base Model?

**Verdict for 2026: Flux wins for character consistency.**

| Factor | Flux 2 | SDXL |
|--------|--------|------|
| Anatomy/hands | Much better | Frequent errors |
| Prompt following | Superior | Good |
| Identity preservation | Abstract concepts (better generalization) | Pixel patterns (less generalization) |
| LoRA quality | Dramatically better | Good |
| Ecosystem (adapters) | Growing fast (PuLID, Kontext, ControlNet Union) | Mature (InstantID, IP-Adapter, PhotoMaker) |
| VRAM (quantized) | 8GB viable (GGUF Q4) | 8GB native |
| Speed | Slower (more params) | Faster |
| Stylized art | Good, improving | Superior ecosystem of fine-tunes |
| Text in images | Excellent | Poor |

**For GRO.WTH:** Flux is the correct choice. Superior anatomy, better prompt following, and PuLID Flux II + Kontext give us a strong identity pipeline. SDXL's larger fine-tune ecosystem for stylized art is its main advantage, but Flux's native quality + style LoRAs are closing that gap rapidly.

---

## Recommended Pipeline for GRO.WTH (Updated)

### Phase A-B: PuLID + Flux Dev (Current Plan — Validated)
The existing PORTRAIT-PIPELINE.md plan is sound. PuLID Flux II on quantized Flux Dev is the right choice for:
- Single reference image workflow
- 8GB VRAM compatibility
- Zero training required
- Good identity preservation for bust portraits

### Phase C: Add Kontext for Dynamic Updates
When implementing dynamic portrait updates (equipment changes, injuries, aging):
- Use Kontext Dev for instruction-based edits on existing portraits
- "Add plate armor" / "add scar across left eye" / "make them look exhausted"
- Preserves identity natively without re-running PuLID
- Iterative edits don't degrade (unlike regenerating from scratch each time)

### Phase D: Add ControlNet for Pose Variation
When we need full-body or action poses:
- ControlNet Union (OpenPose) for pose guidance
- Combined with PuLID for identity
- Enables combat scenes, group shots, action poses

### Phase E (Future): LoRA Training for Key NPCs
For Watchers who want maximum consistency on recurring NPCs:
- Train character LoRA from PuLID-generated reference images
- 15-20 images generated via PuLID, curated, then used as LoRA training set
- Results in near-perfect identity consistency
- Optional premium feature (requires GPU time)

### Style Control Strategy
For painterly fantasy (non-photorealistic):
- Style LoRAs on top of Flux Dev for consistent art style
- Watercolor, oil painting, fantasy illustration LoRAs available on CivitAI
- Campaign-level style setting (each campaign could have its own art style LoRA)
- PuLID identity weight tuned lower (0.6-0.8) to let style breathe while preserving face

---

## Sources

- [PuLID GitHub](https://github.com/ToTheBeginning/PuLID) — NeurIPS 2024
- [InstantID GitHub](https://github.com/instantX-research/InstantID) — 11.9k stars
- [IP-Adapter GitHub](https://github.com/tencent-ailab/IP-Adapter) — 6.5k stars
- [PhotoMaker GitHub](https://github.com/TencentARC/PhotoMaker) — CVPR 2024
- [StoryDiffusion GitHub](https://github.com/HVision-NKU/StoryDiffusion) — NeurIPS 2024 Spotlight
- [PuLID ComfyUI (cubiq)](https://github.com/cubiq/PuLID_ComfyUI) — Native implementation
- [Flux 2 LoRA Training Guide 2026](https://apatero.com/blog/flux-2-pro-lora-training-character-consistency-2026)
- [4-Way Face Swap Comparison](https://myaiforce.com/hyperlora-vs-instantid-vs-pulid-vs-ace-plus/)
- [InstantID vs PuLID vs FaceID Comparison](https://apatero.com/blog/instantid-vs-pulid-vs-faceid-ultimate-face-swap-comparison-2025)
- [Flux vs SDXL 2026](https://pxz.ai/blog/flux-vs-sdxl)
- [Flux Kontext Character Consistency](https://comfyui.org/en/solving-character-consistency-with-flux1-kontext)
- [FLUX.1 Kontext Dev (HuggingFace)](https://huggingface.co/black-forest-labs/FLUX.1-Kontext-dev)
- [FLUX.1 Kontext (Black Forest Labs)](https://bfl.ai/models/flux-kontext)
- [ACE++ GitHub](https://github.com/ali-vilab/ACE_plus)
- [CharaConsist Paper](https://arxiv.org/html/2507.11533v1)
- [Few-shot DreamBooth with LoRA Paper](https://arxiv.org/abs/2510.09475)
- [Best SDXL Model for DreamBooth](https://apatero.com/blog/best-sdxl-model-dreambooth-training-character-consistency-2025)
- [Flux ControlNet Models Collection](https://comfyui-wiki.com/en/resource/controlnet-models/controlnet-flux-1)
