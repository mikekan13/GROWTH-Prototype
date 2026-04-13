# Character Generation Pipeline — Architecture & Implementation Plan

Last updated: 2026-04-13

## Vision

GRO.WTH characters have **persistent visual identity**. A character looks the same across:
- Portraits (bust, half body, full body)
- Battle map tokens (top-down/isometric)
- Scene illustrations (character in environments)
- Dynamic updates (equipment changes, wounds, aging, mood)
- Multi-angle views (front, 3/4, profile)
- Future: 3D model generation from reference set

This is NOT a portrait generator. It's a **character identity system** that produces consistent 2D renders from any angle, in any context, with any equipment — and eventually feeds into 3D model generation.

## Current Hardware

- **GPU:** NVIDIA RTX 4060 (8GB VRAM, Ada Lovelace, fp8 hardware support)
- **RAM:** 16GB (upgrade to 48GB planned)
- **Storage:** Local SSD
- **Network:** Intermittent (hotspot)

## Stack (Installed)

| Component | Version | Purpose |
|-----------|---------|---------|
| ComfyUI | latest (c2657d5f) | Workflow orchestration |
| FLUX.1 Dev Q4_0 GGUF | 6.7GB | Base image generation |
| T5 Q4_K_M GGUF | 2.9GB | Text encoder |
| CLIP-L | ~250MB | Text encoder |
| VAE (ae.safetensors) | ~300MB | Image decode |
| PuLID-Flux II | ~1GB | Face identity preservation |
| InsightFace + AntelopeV2 | ~300MB | Face detection (used by PuLID) |
| **XLabs Canny ControlNet v3** | **1.4GB** | **Pose/composition control (NEW)** |
| **ComfyUI-Advanced-ControlNet** | node | **ControlNet workflow integration (NEW)** |
| **comfyui_controlnet_aux** | node | **Preprocessors: Canny, DWPose, Depth (NEW)** |
| **sharp** | npm | **Server-side image crop/resize (NEW)** |

## The Three Pillars of Consistent Character Generation

### 1. PuLID — Face Identity Lock
- Extracts face embedding from a reference image via InsightFace + EVA-CLIP
- Injects identity into the generation process
- Same face regardless of angle, clothing, lighting, expression
- **Limitation:** Only controls the FACE. Body, pose, composition are uncontrolled.

### 2. ControlNet — Pose & Composition Control
- Forces the generation to match a reference edge map, depth map, or pose skeleton
- Controls: camera angle, body pose, framing, spatial layout
- **Canny mode:** Detect edges in a reference image → generation matches those edges
- **Depth mode:** Control depth layout (needs depth model, not yet installed)
- **Pose mode:** Control body pose via skeleton (needs DWPose model, downloads on first use)

### 3. Prompt Builder — Appearance & Context
- Structured prompt from character data (identity, body, equipment, wounds, etc.)
- Tiered system: T1 (identity) through T6 (environment)
- Creation mode: strips equipment, enforces bare skin
- Identity lock mode: realistic style, face-only framing

**Together:** PuLID locks the face + ControlNet locks the pose/composition + Prompt describes everything else = consistent character from any angle in any context.

## Identity Lock Pipeline (Current Build)

### Step 1: Find Your Face
- Generate front face candidates using player's reference photo as PuLID input
- Player grades: Bad (retry) / Good (use as PuLID ref, converge) / Perfect (lock)
- Iterative refinement until face is right

### Step 2: Angle Verification
- Locked front face → PuLID reference for all subsequent generations
- Generate 3/4 left, 3/4 right, profile left, profile right
- **ControlNet Canny** with angle reference edge maps forces exact composition
- Player grades each — "does this look like the same person?"
- Multi-angle reference set stored for future 3D model input

### Step 3: Body Discovery
- Full body with PuLID face lock + ControlNet T-pose reference
- Bare skin (creation mode) — verify proportions, skin, distinguishing marks

### Step 4: Identity Testing
- Try different outfits, poses, expressions with PuLID + ControlNet
- Proves the identity lock works across variations
- Gallery of test results compared to locked face

### Step 5: Persona Lock
- Store complete reference set (front, 4 angles, body)
- Store locked prompt, seed, PuLID weight
- Generate canonical bust + full body for gameplay
- All future generations use this locked identity

## ControlNet Workflow Design

### XLabs Canny v3 Integration

The XLabs model works differently from InstantX ControlNet. It uses the `XlabsFluxControlNetLoader` and `XlabsFluxControlNetApply` nodes (provided by a small custom node, or via ComfyUI-Advanced-ControlNet).

**Workflow structure:**
```
Reference Image (angle template)
  → Canny Edge Detection (preprocessor)
  → XLabs ControlNet Apply
    + FLUX model
    + PuLID (face identity)
    + Text prompt (character description)
  → KSampler → VAE Decode → SaveImage
```

**Canny parameters for face angles:**
- Low threshold: 100
- High threshold: 200
- ControlNet strength: 0.6-0.8 (too high = copies reference exactly, too low = ignores it)

### Angle Reference Images

We need template images for each angle — simple face outlines that ControlNet uses as composition guides. Options:

1. **Stock face photos** (different angles) → Canny edge detection → store edges
2. **Generated references** — generate one good face, use it as Canny reference for others
3. **Hand-drawn templates** — simple face outlines (most reliable)
4. **3D head render** — render a basic 3D head from each angle (future)

For MVP: generate a front face, then use Canny edges from stock face photos at each angle to force the composition. PuLID maintains the identity.

### Face Crop Post-Processing

After generation, use `sharp` to:
1. Detect face region (center of image for face-angle presets)
2. Crop to face with small margin
3. Save both full image (PuLID reference) and cropped face (display)
4. Generate thumbnails for gallery views

```typescript
import sharp from 'sharp';

async function cropToFace(imageBuffer: Buffer, width: number, height: number): Promise<Buffer> {
  // Face is roughly upper-center 60% of a portrait
  const cropSize = Math.min(width, height) * 0.65;
  const left = Math.round((width - cropSize) / 2);
  const top = Math.round(height * 0.1); // Face starts ~10% from top
  
  return sharp(imageBuffer)
    .extract({ left, top, width: Math.round(cropSize), height: Math.round(cropSize) })
    .toBuffer();
}
```

## Dynamic Portrait Updates (Gameplay)

Once identity is locked, the system can auto-update portraits:

### Trigger Detection (already built: `state-diff.ts`)
- Equipment change → visible items changed
- Wound on visible body part → new scar/injury
- Condition change → expression modifier
- Age change → aging effects

### Update Generation
1. Load PersonaLock reference image
2. Build prompt with CURRENT character state (equipment, wounds, conditions)
3. PuLID + ControlNet (same composition as current portrait)
4. Generate updated portrait
5. Show preview → player/GM approves → replace

### Battle Map Tokens
1. Load PersonaLock reference
2. ControlNet with top-down/isometric pose reference
3. Full body, current equipment
4. Circular crop for VTT token
5. Auto-update when equipment changes

## Future: 3D Model Generation

The multi-angle reference set from identity lock is the exact input format for:
- **Hunyuan3D-2mini** — text/image to 3D mesh
- **TripoSR** — single image to 3D
- **Zero123++** — multi-view to 3D

Pipeline:
```
Locked angle references (front, 3/4, profile)
  → 3D mesh generation (Hunyuan3D-2mini)
  → Auto-rig (UniRig)
  → Store as GLB
  → Render any angle/pose via Blender headless
  → ControlNet references from 3D renders = infinite poses
```

## Upgrade Path (When Internet Available)

### Priority 1: Better ControlNet
- **InstantX/FLUX.1-dev-Controlnet-Union** (6.6GB) or **Union-Pro** — multi-condition support (canny + depth + pose in one model)
- Replaces XLabs Canny v3 (keep as fallback)

### Priority 2: Better FLUX Model  
- **flux1-dev-Q4_K_S.gguf** (6.81GB) — better quality, swaps current Q4_0
- **t5xxl_fp8_e4m3fn.safetensors** (4.89GB) — much better prompt adherence

### Priority 3: 48GB RAM Upgrade
- Enables 1024x1024 generation (currently 768x768)
- PuLID works reliably (no memory pressure fallback)
- Faster generation (less swap)

### Priority 4: fp8 Native Model
- **flux1-dev-fp8.safetensors** (17.2GB) — native GPU fp8, fastest option
- Requires 48GB RAM
- Replaces GGUF entirely

### Priority 5: Additional Models
- **DWPose weights** (~300MB, downloads on first use) — skeleton pose detection
- **Depth model** — depth-based composition control  
- **ComfyUI Impact Pack** (~500MB) — face detection, inpainting tools
- **IP-Adapter for FLUX** — body style transfer (combine with PuLID)

## XLabs Canny v3 — Technical Notes

### Custom Node Requirement
XLabs ControlNet uses its own loader node, not the standard ControlNet loader. Need to verify:
1. Does ComfyUI-Advanced-ControlNet support XLabs models? (likely yes)
2. Or do we need the XLabs-AI custom node? (`ComfyUI-flux-controlnet` from XLabs-AI GitHub)

### Workflow JSON
Need to create: `character-face-lock-controlnet.json`
- Adds ControlNet nodes between text encoding and KSampler
- Adds Canny preprocessor node for reference image
- PuLID node still present for face identity
- Parameters injected by `injectWorkflowParams()`:
  - ControlNet strength (0.6-0.8)
  - Canny thresholds (100, 200)
  - Reference image (angle template)

### Testing Plan
1. Start ComfyUI, verify new custom nodes load
2. Open ComfyUI GUI in browser
3. Build the ControlNet + PuLID workflow manually
4. Test with a reference face photo + Canny edges
5. Export workflow as API JSON
6. Integrate into the app's local provider
