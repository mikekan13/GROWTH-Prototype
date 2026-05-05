# Dynamic Portraits, Character Fine-Tuning & Constrained Editing — Research

## Existing Plans (from GROWTH docs)

The character pipeline vision has an 11-rung ladder. We're currently at rungs 1-3 (face lock, body). The relevant future rungs:

- **Rung 5 (Fine-Tune)**: Segformer-B5 19-label masks for surgical edits — eye color, beauty marks, freckles, tattoos, scars. Inpaint only target regions using BiSeNet masks.
- **Rung 7 (Expressions)**: LivePortrait KJ for expression control. Works on cloud pod but was blocked locally on Python 3.13.
- **Rung 10 (Animated Portraits)**: LivePortrait + 5-angle lock + voice/emotion driving.
- **Rung 11 (Video Recaps)**: Wan 2.2/Kling for 90-second end-of-session cinematics.

---

## 1. Dynamic/Animated Portraits

### LivePortrait (Best for GROWTH)
- **What**: Implicit-keypoint framework that animates a single portrait image. NOT a diffusion model — runs near real-time.
- **Controls**: Eye blinks, eyebrow movement, pupil position, mouth shape, smiles, head rotation, breathing.
- **Idle Animation**: Supports built-in motion templates — can generate automatic blink/breathe loops WITHOUT a driving video.
- **ComfyUI Nodes**: `ComfyUI-LivePortraitKJ` (kijai) and `ComfyUI-AdvancedLivePortrait` (PowerHouseMan). Both installed on our pod already.
- **How it works**: Appearance Feature Extractor encodes identity, Motion Extractor derives keypoints, Warping Module deforms the source. Stitching module composites back.
- **Performance**: Extremely lightweight. Can run near real-time on GPU. Our H100 would handle it trivially.
- **Best for GROWTH**: Idle portrait animations (blink, breathe, subtle head movement), expression reactions during gameplay events, talking head for dialogue.

### Wan 2.2 Animate (For Full-Motion Scenes)
- **What**: Pose-driven video generation. Single image + driving pose video → identity-preserving animation.
- **Controls**: Full body motion, facial expressions, hair/clothing secondary motion. Expression strength (0-1) and secondary motion (0-1) dials.
- **Pipeline**: DWPreprocessor → pose keypoints → FaceMaskFromPoseKeypoints → face crops → Wan 2.2 synthesis.
- **Performance**: Diffusion-based, much slower than LivePortrait. Better for pre-rendered cinematics than real-time.
- **Best for GROWTH**: Session recap cinematics (Rung 11), action scenes, dramatic reveals.

### Hallo3 (Research-Grade)
- **What**: Audio-driven portrait animation with dynamic head/body movement. CVPR 2025.
- **Best for**: Voice-driven character responses. Could power "talking head" dialogue with GM voice input.

### Recommendation for GROWTH
1. **Idle portraits** → LivePortrait with motion templates (blink/breathe loop). Lightweight, can run client-side or pre-render a 5-10 second loop.
2. **Expression reactions** → LivePortrait with parameter control (smile on success, frown on damage, etc.). Game events trigger expression changes.
3. **Dialogue animation** → LivePortrait + audio driving for lip-sync during GM narration.
4. **Cinematics** → Wan 2.2 Animate for full-motion recap videos. Pre-rendered, not real-time.

---

## 2. Character Fine-Tuning ("Make Hair Longer")

### FLUX Kontext (Best Fit)
- **What**: Instruction-based image editing model from BFL. Takes source image + text instruction → edited image.
- **How**: "Make the hair longer" or "change eye color to green" — preserves identity, lighting, background.
- **Max**: 512 token prompt limit. Works with simple direct instructions.
- **Identity Preservation**: Built-in — designed to maintain character consistency across edits.
- **ComfyUI**: Native support via `Comfy-Org/flux1-kontext-dev_ComfyUI`. 12B params, runs on consumer hardware.
- **Prompt Style**: Direct instructions, not elaborate descriptions. "Change the hair to red, keep everything else identical."
- **Model Size**: ~22-24GB. We have room on our volume.

### Practical Approach for GROWTH
1. Player locks face → body → has a base character.
2. Player wants to change hair: FLUX Kontext takes the locked face image + instruction "make hair shoulder-length and curly" → new face image.
3. System validates the edit against seed/species rules (see section 3).
4. If valid, the new image becomes the new locked face.
5. Body re-generates using the updated face.

### Alternative: Inpainting with Masks
- Use BiSeNet/Segformer to segment specific regions (hair = label 17, eyes = 4/5).
- Mask only the target region.
- FLUX Fill inpaints just that region with the new prompt.
- More precise but more complex than Kontext's instruction approach.

### What We Need
- Download FLUX Kontext dev (~24GB) to the pod.
- Build a simple UI: select character → type edit instruction → preview → accept/reject.
- The edit produces a new image that goes through the same identity lock pipeline.

---

## 3. Constrained Editing (Species/Seed Rules)

### The Problem
A human character shouldn't be able to add wings, extra arms, or change species. Edits need to be validated against the character's seed (species/race) definition.

### Technical Approaches

#### Prompt-Level Validation (Simplest)
- Before sending the edit to Kontext/FLUX, parse the instruction against a seed rule set.
- Each seed defines: allowed body modifications, forbidden features, optional features.
- Example: HUMANOID seed allows hair color/length, eye color, skin tone, tattoos, piercings. Forbids: wings, tail, extra limbs, horns (unless species has them).
- Implementation: LLM classifies the edit instruction → checks against seed rules → allows or blocks.

#### Visual Validation (Post-Generation)
- After generating the edit, run a classifier/detector to verify no forbidden features appeared.
- YOLO or CLIP-based detection for wings, extra limbs, tails, etc.
- Reject and re-roll if forbidden features detected.

#### Hybrid (Recommended for GROWTH)
1. **Pre-generation**: LLM parses edit instruction, checks against seed rules. Fast, catches most issues.
2. **Post-generation**: Visual inspection for edge cases where prompt leaked forbidden features.
3. **KRMA cost**: Each edit costs KRMA. Failed edits (rejected by validation) still cost a fraction. This naturally limits experimentation.

### What Already Exists in GROWTH
- Seeds define species with body part maps (HUMANOID_BODY, etc.)
- Physical description fields are structured (height, build, skin tone, eye color, hair)
- The character creation wizard already constrains available options per seed

### Implementation Plan
1. Build a `SeedEditValidator` service that takes seed + edit instruction → allowed/forbidden.
2. Seed definitions in the game data already have body part lists — extend with `allowedModifications` and `forbiddenFeatures`.
3. The edit UI shows the validation result before generating.

---

## 4. Implementation Priority

### Phase 1: Idle Portraits (LivePortrait)
- Already have LivePortrait KJ on the pod
- Generate a 5-10 second blink/breathe loop from the locked face
- Save as WebM/MP4, serve to client
- Replace static portraits with animated ones in the UI
- **Effort**: Low — models installed, just need workflow + UI integration

### Phase 2: Character Editing (FLUX Kontext)  
- Download Kontext model
- Build edit UI: text instruction → preview → accept
- Seed validation (prompt-level first)
- **Effort**: Medium — new model, new UI, validation logic

### Phase 3: Expression Reactions (LivePortrait)
- Map game events to expression parameters
- Player takes damage → frown, success → smile, etc.
- Real-time or pre-cached expression variants
- **Effort**: Medium — needs event system integration

### Phase 4: Cinematics (Wan 2.2)
- End-of-session recap generation
- Full-motion character animation
- Pre-rendered, queued after session ends
- **Effort**: High — complex pipeline, large model, long render times

---

## 5. Model Requirements Summary

| Model | Size | Purpose | On Pod? |
|-------|------|---------|---------|
| LivePortrait | ~1.2GB | Idle animation, expressions | Yes (models deleted but node installed) |
| FLUX Kontext Dev | ~24GB | Character editing | No — need to download |
| Wan 2.2 Animate 14B | ~30GB+ | Full-motion cinematics | No — future |
| Segformer-B5 | ~400MB | Region masking for surgical edits | No — future |

Current pod volume: 125GB, ~47GB free. LivePortrait models need re-download (~1.2GB). Kontext fits. Wan 2.2 would need volume expansion or model rotation.
