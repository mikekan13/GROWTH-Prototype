# ComfyUI Workflow Templates

This directory contains ComfyUI workflow JSON files exported in **API format**.

## How to create workflow files

1. Open ComfyUI at `http://127.0.0.1:8188`
2. Design your workflow using the node editor
3. Click the gear icon → "Save (API Format)"
4. Save the exported JSON here with the matching filename

## Required workflows

### `character-portrait.json` (Phase A)
Basic character portrait generation WITHOUT identity preservation.
Used for first-time portrait generation before persona lock.

**Required nodes:**
- GGUF Loader → FLUX.1 Dev Q4_0
- CLIP Text Encode (positive) — title: "Positive"
- CLIP Text Encode (negative) — title: "Negative"
- KSampler (seed, steps, cfg)
- Empty Latent Image (width, height)
- VAE Decode
- Save Image

**Optional nodes (when style LoRA is available):**
- LoRA Loader — title: "Style LoRA"

### `character-portrait-pulid.json` (Phase B)
Character portrait WITH PuLID identity preservation.
Used for all regenerations after persona lock.

**Additional nodes beyond basic:**
- Load Image — title: "PuLID Reference"
- PuLID Flux node (weight parameter)
- InsightFace loader (for face embedding)

### `character-portrait-campaign.json` (Phase D)
Adds campaign-specific LoRA on top of PuLID workflow.

**Additional nodes:**
- LoRA Loader — title: "Campaign LoRA"

## Node naming convention

The prompt injection system (`local.ts`) finds nodes by `class_type` and
`_meta.title`. Use these exact titles:

| Node | Title |
|------|-------|
| Positive prompt | "Positive" |
| Negative prompt | "Negative" |
| PuLID reference image | "PuLID Reference" |
| Global style LoRA | "Style LoRA" |
| Campaign genre LoRA | "Campaign LoRA" |
