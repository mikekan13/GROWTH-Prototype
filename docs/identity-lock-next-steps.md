# Identity Lock — Next Steps

Written 2026-04-17 after overnight agent runs that confirmed:
- ControlNet (openpose mode) thrashes PuLID identity even at reduced strength
- FLUX's bald+grey-backdrop prompt distribution overlaps heavily with 3D-render training data → plastic skin
- Hair preservation in PuLID refs → better identity AND skin realism (but breaks bald-face-lock downstream)

Current pipeline state (after quick-wins landed today):
- Front Lock: `skipControlNet: true` + new DSLR-photography prompt + Pass 2 T-zone skin inpaint
- 3/4 + Profile angles: still use CN in openpose mode (they need pose anchoring)

## The core tension

**We want ControlNet to enforce framing/pose, NOT facial identity.**

Current CN path is:
```
angle-refs/front.jpg → DWPose preprocessor → pose skeleton (body + face keypoints) → ControlNet Union Pro 2 → FLUX attention conditioning
```

DWPose encodes face-specific keypoints from whatever person is in the angle-ref photo. Even with `detect_face: disable`, body-level head keypoints still imprint head position/tilt. Any CN contribution pulls our subject's face toward the reference photo's facial geometry — not just framing, but identity features.

Front angle doesn't need CN (prompt + PuLID + seed are enough for symmetric frontal). Dropping it was the right call.
**3/4 and profile angles genuinely need external pose anchoring** — prompt alone won't reliably rotate the head. That's where the research matters.

## Research options, ranked by ROI

### A. Depth ControlNet (highest ROI, lowest risk)

**Why:** Depth maps encode "head occupies this 3D volume at this angle" without specifying eye shape / nose shape / mouth shape. Identity-neutral but pose-anchoring.

**How:**
- Switch CN from openpose mode → depth mode on the angle workflows
- Union Pro 2 supports depth mode (it's multi-mode)
- Replace `DWPreprocessor` → `MiDaS-DepthMapPreprocessor` or `Zoe-DepthMapPreprocessor`
- Angle-ref images stay the same (`angle-refs/three_quarter_left.jpg` etc.); just run them through depth preprocessor instead of DWPose

**Cost:** 2-3 hours to wire + test
**Risk:** Depth maps still contain some face-shape signal (a wide face looks "closer to camera" at certain depths); may need lower CN strength than with keypoints.

### B. Synthetic angle-ref images (low ROI, very low risk)

**Why:** Currently angle-refs are photos of a real person. Even with depth/canny processing, the processed output carries facial structure from that specific face.

**How:**
- Replace `public/portraits/angle-refs/*.jpg` with synthetic/blurred versions:
  - Option 1: Gaussian-blur the face region heavily (keep head silhouette, erase features)
  - Option 2: Replace with a generic 3D head mesh render at each angle (no identity at all)
  - Option 3: Solid-color head-shaped blob at the right position for pure pose/framing control
- Could pair with Depth CN for cleanest "pose without identity"

**Cost:** 1-2 hours to generate replacement angle-refs + A/B test
**Risk:** Over-abstracted refs might not provide enough pose information for ControlNet to anchor.

### C. CN scheduling (medium ROI, low risk)

**Why:** CN's identity imprint happens during EARLY sampling steps when latent is malleable. If we turn CN OFF after it establishes pose, PuLID can dominate the remaining steps.

**How:**
- Set `ControlNetApplyAdvanced.end_percent` to 0.3 or 0.4 (currently 0.8)
- CN only active during first 30-40% of sampling → establishes head position + framing
- Remaining 60-70% is pure PuLID + prompt → identity + skin texture

**Cost:** Single parameter change, ~15 min to test
**Risk:** Pose may drift in late steps without CN to anchor. Worth trying at 0.4, 0.3, 0.2.

### D. Hair-preserved + bald inpaint (highest skin realism, complex)

**Why:** Agent 1's iter 4 showed id=8, skin=7 with hair preserved in PuLID refs. We want that face, without the hair, as the Lock output.

**How:**
1. Lock Pass 1: generate with hair preserved (temp toggle `PULID_KEEP_HAIR=1` on pod-side bg_label, re-enabled per-request via env var passthrough)
2. Extract hair mask via BiSeNet (already loaded by PuLID — expose as separate output)
3. Pass 1.5 (new): inpaint hair region → bald scalp. Short workflow, ~10 sec
4. Pass 2 (existing): T-zone skin inpaint, unchanged

**Cost:** 4-6 hours. Needs a hair-to-bald inpaint workflow + pod-side BiSeNet hair mask export + chained UI flow.
**Risk:** Seamless bald-inpaint is non-trivial. Skin-tone matching at the hair-to-forehead boundary is the hard part. May need feathering + color-matching postprocess.

### E. Train a Kai LoRA (nuclear option)

**Why:** Ultimate identity preservation — trained specifically on Kai's photos.

**How:** Standard FLUX LoRA training pipeline on the 3 uploaded reference photos.

**Cost:** 2-4 hours training + infrastructure for per-character LoRA storage + wizard integration
**Risk:** One-off for Kai vs a scalable solution. Only worth it if we're committed to her specifically, OR we build a per-character LoRA pipeline.

## Recommended order

1. **Try C (CN scheduling) immediately on angle stages.** 15-min test, might be enough.
2. **If C isn't enough, try A (Depth ControlNet)** for the angles that still thrash identity.
3. **B (synthetic angle-refs)** is a complement to A, not an alternative — worth layering if A alone isn't clean enough.
4. **D (hair-then-inpaint) is a separate research track** for the skin-realism win, independent of CN fixes.
5. **E (Kai LoRA)** only if nothing else gets us to "recognizably Kai." Last resort.

## Known knobs we're not using yet

- `ControlNetApplyAdvanced.start_percent` — currently 0. Could delay CN start so PuLID establishes identity in early steps, then CN nudges pose later.
- Per-angle CN config — 3/4 and profiles may need different strength/timing than front.
- `true_cfg` mode (PuLID author's recommendation) — "sometimes better ID similarity." Not tested.
- Bigger ref preprocessing (lanczos to 1536 instead of 1024) — more face pixels for InsightFace.
