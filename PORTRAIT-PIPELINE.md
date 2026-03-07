# GRO.WTH Portrait Pipeline — Research & Design

Last updated: 2026-03-07

## Hardware Baseline

- **GPU**: NVIDIA GeForce RTX 4060 (8GB VRAM)
- **Target**: Local generation during alpha/beta, cloud option later
- **Constraint**: 8GB VRAM limits model choices — need quantized models or VRAM-optimized pipelines

## Recommended Stack

### Base Model: FLUX.2 Dev (Quantized)

FLUX.2 Dev is a 32B parameter open-weight model from Black Forest Labs (Nov 2025). It produces high-quality portraits with strong prompt adherence and supports both generation and editing.

**Why FLUX.2 over SDXL:**
- Superior prompt following and composition
- Better face quality out of the box
- Active ecosystem with quantized variants for low-VRAM systems
- Supports up to 10 reference images per generation

**8GB VRAM Options:**
- **Nunchaku quantization**: 4x faster renders, under 8GB VRAM usage. Optimized for RTX GPUs
- **GGUF format**: Q4_0 or Q4_K_S quantization fits 8GB. Generate at 1024x1024 with careful VRAM management
- **ComfyUI flags**: `--lowvram` or `--lowvram --cpu-text-encoder` for tight VRAM budgets

### Identity Preservation: PuLID (Flux II)

PuLID (Principle-guided Latent Identity) maintains consistent facial features across generated images from a single reference face.

**Why PuLID over alternatives:**
- **Lightweight**: Works on 8GB VRAM (unlike LoRA training which needs more)
- **Zero model pollution**: PuLID v2 doesn't degrade the base model's style/composition
- **Single reference image**: No need for multiple training images
- **Tunable**: Weight 1.0-1.5 for strong identity, 0.5-0.8 for variation
- **Fast**: Compatible with TeaCache and WaveSpeed for production speeds

**Alternatives considered:**
- **InstantID**: Good identity preservation but heavier, uses ControlNet + InsightFace. More VRAM hungry
- **IP-Adapter FaceID**: Lighter than InstantID but less identity fidelity than PuLID v2
- **LoRA training**: Best quality but requires training per character (impractical for player-generated characters)

### Orchestration: ComfyUI

ComfyUI provides the workflow engine for the pipeline. It runs locally, has a node-based editor, and extensive community workflows for character consistency.

**Key nodes needed:**
- FLUX.2 Dev loader (GGUF or Nunchaku quantized)
- PuLID Flux II node
- Florence2 (optional) for auto-captioning reference images
- Face detection/cropping for reference preparation

## Architecture Design

### Data Flow

```
Character Data → Prompt Template → ComfyUI API → FLUX.2 + PuLID → Portrait Image → App Storage
```

### Prompt Template System

The prompt template lives in the backend and is assembled from character data:

```
[STYLE BLOCK] Fantasy character portrait, painterly style, dramatic lighting, [campaign style]
[IDENTITY BLOCK] [race/seed], [age], [physical description from backstory]
[STATE BLOCK] [current equipment], [armor], [injuries/scars], [expression based on conditions]
[COMPOSITION] Bust portrait, facing slightly left, dark background, warm key light
```

**Template inputs (from character data):**
- `identity.description` — Physical appearance
- `creation.seed.name` — Race/species
- `identity.age` — Age
- `backstory.responses` — Physical description prompt answer
- `inventory.items` — Visible equipment
- `vitals.bodyParts` — Injuries (damage > 0 on visible parts)
- `conditions` — Expression modifiers (exhausted, overwhelmed, etc.)
- `traits` — Thorns that affect appearance (scars, marks, etc.)

### Identity Storage

When a portrait is first generated and accepted:
1. Save the generated portrait image
2. Save the PuLID face embedding/reference data
3. Save the prompt used (for reproducibility)
4. Store as `Character.portrait` (image path) + `Character.portraitIdentity` (JSON with embedding ref + prompt)

Future regeneration uses the stored identity data to maintain consistency.

### Dynamic Portrait Updates

Triggers for portrait regeneration:
- Equipment change (new visible items)
- Injury to HEAD, NECK, or body parts (scars, missing limbs)
- Thorn acquired that affects appearance
- Age change / narrative transformation
- Player/GM manual request

The system diffs current state vs last portrait state and only regenerates if visible changes occurred.

## Implementation Phases

### Phase A: Basic Generation (MVP)
- Install ComfyUI locally with FLUX.2 Dev GGUF
- Build prompt template from character description
- "Generate Portrait" button on character page
- Save portrait to local filesystem
- Display on character sheet

### Phase B: Identity Consistency
- Add PuLID node to workflow
- Save reference face embedding on first generation
- All subsequent generations use stored identity
- "Regenerate" preserves face while allowing prompt changes

### Phase C: Steering & Refinement
- UI for adding steering words (e.g., "battle-worn", "smiling", "hooded")
- Thumbnail preview before accepting
- History of previous portraits

### Phase D: Dynamic State Updates
- Auto-detect state changes that affect portrait
- Queue regeneration when conditions change
- Side-by-side comparison before accepting update

## Open Questions

1. **Art style**: Should all portraits use the same style (painterly fantasy)? Or should campaigns be able to set their own style?
2. **ComfyUI integration**: Run as a subprocess? Separate service? Use the ComfyUI API directly from Next.js?
3. **Storage**: Local filesystem with paths in DB? Or base64 in DB? (Filesystem is better for size)
4. **Generation time**: FLUX.2 on RTX 4060 with Nunchaku takes ~15-30 seconds per 1024x1024 image. Acceptable for portrait generation?
5. **Fallback**: What happens if ComfyUI isn't running or GPU is unavailable? Placeholder avatar?

## References

- [FLUX.2 Dev on Hugging Face](https://huggingface.co/black-forest-labs/FLUX.2-dev)
- [Nunchaku: 8GB VRAM Flux Optimization](https://myaiforce.com/nunchaku/)
- [PuLID Flux II Workflow](https://www.runcomfy.com/comfyui-workflows/pulid-flux-ii-in-comfyui-consistent-character-ai-generation)
- [ComfyUI GGUF Guide](https://cosmo-edge.com/comfyui-gguf-image-generation/)
- [FLUX.2 NVIDIA RTX Setup](https://blogs.nvidia.com/blog/rtx-ai-garage-flux-2-comfyui/)
- [PuLID Flux Chroma GitHub](https://github.com/PaoloC68/ComfyUI-PuLID-Flux-Chroma)
- [InstantID Paper](https://arxiv.org/html/2401.07519v1)
- [Consistent Character Creation with Flux & ComfyUI](https://civitai.com/articles/8995/consistent-character-creation-with-flux-and-comfyui-by-thinkdiffusion)
