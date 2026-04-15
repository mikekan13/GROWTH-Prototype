---
name: Identity Lock Session 2026-04-13/14
description: Full portrait pipeline session — model upgrades, ControlNet fixes, PuLID hair fix, quality tiers, LoRA chain
type: project
---

## Major Accomplishments

### Model Stack Upgrade
- **Q4_K_S GGUF** (6.81GB) downloaded and active — better quality quantization than Q4_0
- **t5xxl fp8** (4.89GB) — dramatically better prompt adherence. CRITICAL: clip_l and t5xxl should get DIFFERENT content (tags vs sentences)
- **InstantX ControlNet Union Pro 2.0 FP8** (2.14GB) — replaced 6.6GB Union model, fits in 16GB RAM
- **DWPose + OpenPose mode** — replaced Canny edge detection. Uses `SetUnionControlNetType` node set to "openpose". No geometry leak.
- All LoRAs installed: painterly-fantasy, extreme-detailer, hand-detail, nsfw-unlock, dark-fantasy-v2

### PuLID Fixes (Critical)
1. **GGUF device mismatch fix**: Added `ca.to(img.device, dtype=img.dtype)` at line 94 of `pulidflux.py` — PuLID CA layers get swept to CPU by GGUF offloader between inferences. This fix ensures they're moved back.
2. **Hair masking fix**: Added label 17 (hair) to `bg_label` at line 304 of `pulidflux.py`. PuLID's BiSeNet face parser was NOT masking hair before sending to EVA-CLIP, causing hair from reference photos to bleed into every generation. One-line fix eliminates hair bleed entirely.

### Quality Tiers
- **sketch**: 384px (bumped to test), 4 steps, zero LoRAs — composition/framing only
- **draft**: 640px, 15 steps, style+detail LoRAs — face discovery/grading
- **final**: 768px, 20 steps, all LoRAs — body, test, persona lock

### LoRA Chain (all workflows)
Style(15) → Detail(16) → Hand(17) → NSFW(18) → Campaign/Dark Fantasy(19) → downstream
- Chain skip: LoRAs at strength 0 are dynamically removed (rewired) to save VRAM
- Injection by title: "style", "detail" (not hand), "hand detail", "nsfw unlock", "campaign"

### Workflow Architecture
- 4 generation workflows + 1 inpainting (unused, kept for future equipment layers)
- InstantX workflow uses: DWPreprocessor → SetUnionControlNetType(openpose) → ControlNetApplyAdvanced(+vae)
- Angle reference images padded to square (250x250) to prevent aspect ratio distortion

### Mature Content System
- `Campaign.aiSettings` JSON field stores `{ matureContent: true }`
- Toggle in CampaignSettingsForm (red coral toggle)
- NSFW unlock LoRA + `aidmaNSFWunlock` trigger word when enabled
- Only active in final quality mode

### Dual CLIP Encoding (Important Discovery)
- Feeding identical text to clip_l and t5xxl loses 50-75% of FLUX prompt adherence
- clip_l: short comma-separated tags
- t5xxl: full descriptive sentences, reinforced for specific instructions (bald, etc.)

## What's Next
- Test angle consistency (3/4, profile) with new stack
- Switch from sketch to draft/final quality
- Enable all LoRAs and tune style
- Full identity lock wizard flow: front → angles → body → test → lock
- Portrait aspect ratio (square gen → 3:4 crop for display)
- Equipment inpainting foundation
