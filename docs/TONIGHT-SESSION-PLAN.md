# Tonight's Session Plan (2026-04-13)

## Downloads In Progress
- [x] InstantX ControlNet Union (6.2GB) ✅
- [ ] t5xxl fp8 text encoder (4.89GB) — downloading
- [ ] Q4_K_S GGUF (6.81GB) — next
- [x] NSFW Unlock LoRA (19MB) ✅
- [x] Painterly Fantasy LoRA (74MB) ✅
- [x] Extreme Detailer LoRA (74MB) ✅

## Phase 1: Wire New Models + Test (as soon as downloads finish)

### 1a. Verify new models load
- Kill ComfyUI, restart with new models
- Check: Q4_K_S loads, t5xxl_fp8 loads, ControlNet Union loads
- All workflows already updated to reference new filenames

### 1b. Test InstantX ControlNet
- The InstantX workflow (`character-face-controlnet-instantx.json`) is built
- Uses standard `ControlNetLoader` + `ControlNetApplyAdvanced` + `KSampler`
- LoRA-compatible (no XlabsSampler)
- Test: generate front face with ControlNet — should control pose WITHOUT affecting style

### 1c. Test quality improvement
- Q4_K_S should produce better detail than Q4_0
- t5xxl_fp8 should give much better prompt adherence
- Test: same prompt, compare output quality

## Phase 2: Complete Identity Lock Pipeline

### 2a. Fix remaining wizard issues
- Bad/Good buttons should work (abortRef fix deployed)
- Angle generation should auto-trigger on step transition (prevStepRef fix deployed)
- Existing image picker loads previous generations
- Test full flow: pick face → lock → angles generate → grade → body → test → lock

### 2b. NSFW Unlock for nude base body
- Add nudity toggle to campaign settings (simple ON/OFF)
- When ON: add NSFW unlock LoRA (flux-nsfw-unlock.safetensors) + trigger word `aidmaNSFWunlock` to workflow
- When OFF: keep "simple underwear" in prompt (current behavior)
- Wire into workflow chain as 3rd LoRA: Style → Detail → NSFW Unlock (conditional)
- Test: generate nude base body for identity lock

### 2c. Face lock should produce:
- Front face (PuLID from reference photo)
- 3/4 left, 3/4 right, profile left, profile right (ControlNet for pose)
- Full body front (nude or underwear based on toggle)
- All stored as persona lock reference set

## Phase 3: Equipment Inpainting Foundation

### 3a. Create inpainting workflow
- FLUX supports inpainting via `SetLatentNoiseMask` node
- Workflow: Load base portrait → mask region → new prompt for that region → generate
- New workflow file: `character-inpaint.json`

### 3b. Body region masks
- Define rectangular mask zones for each equipment slot:
  - HEAD: helmet, hat, hood area
  - TORSO: chest armor, shirt, jacket
  - LEGS: pants, greaves, skirt
  - HANDS: held items (left/right)
  - FEET: boots, shoes
  - NECK: necklace, scarf, collar
  - CLOAK: full overlay from shoulders
- MVP: simple rectangle masks based on body proportions
- Future: DWPose segmentation for precise masks

### 3c. Equipment → prompt mapping
- Forge item description becomes the inpainting prompt
- Character style preferences (colors + aesthetics) modify the prompt
- Example: "Iron Chain Tunic" + Elegant + purple/gold = "elegant iron chainmail tunic with purple fabric lining and gold clasps"

### 3d. Layered inpainting order
- Generate from inside out: skin → undergarment → clothing → armor → cloak
- Each layer uses progressively smaller mask
- Outer layers reveal inner layers at edges (collar, hem, cuffs)

### 3e. Auto-underwear when nudity OFF
- Simple inpainting pass after nude base body generation
- Mask: torso lower + upper legs
- Prompt: "simple plain underwear, [skin tone] skin"
- This becomes the effective "base" for all-ages campaigns

## Phase 4: Portrait Formatting

### Portrait display (3:4 aspect from square generation)
- Use sharp to crop 768x768 → 576x768 (3:4) centered on face
- Save as separate display variant alongside full square
- Token gets different treatment (full body, circular crop for VTT)

## Key Architecture Decisions Made Tonight
- **Visual Identity** (not "Character Portrait") — encompasses portrait, token, 3D view
- **Style Preferences** — 3 colors + 2 aesthetics, inferred from reference photos
- **Nudity toggle** — simple ON/OFF per campaign, Watcher controls
- **Equipment as layers** — inpaint inside-out, each slot is a visual layer
- **Items are universal** — same item renders differently per body type + style prefs
- **Collapsible body parts** — HEAD expanded by default, others collapsed
- **GROWTH vocabulary** — Watcher/Trailblazer not GM/Player
