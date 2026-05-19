# InfiniteYou + ControlNet Research Findings

**Date:** 2026-04-17  
**Sources:** InfiniteYou paper (arXiv:2503.16418), bytedance/ComfyUI_InfiniteYou source, GitHub issues #13/#20/#23/#42, ComfyUI issue #16

---

## 1. Does InfuseNet conflict with external ControlNet?

**Architecturally: No. They use separate injection paths.** InfuseNet injects identity features via **residual connections** to DiT blocks. Standard ControlNet also uses residual connections but operates on spatial/structural signals. The paper explicitly states: "The plug-and-play design of InfU ensures compatibility with ControlNets and LoRAs." The README shows examples of InfuseNet + ControlNet (canny) + LoRA working together.

**In practice: Yes, there's a bug.** ComfyUI issue #23 shows `InfuseNetFlux.forward() missing 1 required positional argument: 'y'` when chaining external ControlNet with InfuseNet. The `InfuseNet` class subclasses ComfyUI's `ControlNet` and uses `set_previous_controlnet()` for chaining, but the `InfuseNetFlux` model's `forward()` signature expects a `y` argument that standard FLUX ControlNet Union doesn't pass. **This is an unresolved bug in the official ComfyUI nodes as of 2026-04.**

## 2. Correct node wiring order

InfuseNet uses ComfyUI's standard ControlNet chaining: `set_previous_controlnet(prev_cnet)`. The `InfuseNetApply` node reads `prev_cnet = d.get('control', None)` from incoming conditioning, then sets itself as the new control and chains the previous one behind it. This means:

**ControlNetApplyAdvanced FIRST, then InfuseNetApply.** The external ControlNet goes on conditioning first; InfuseNet reads it as `prev_cnet` and chains behind it. This is the standard ComfyUI pattern -- later-applied ControlNets call `set_previous_controlnet()` on earlier ones.

However, due to bug #23, this chaining currently crashes. Until ByteDance fixes the `y` argument issue, the two cannot be combined via the official nodes.

## 3. Best ControlNet type for head pose from 3D mannequin

InfuseNet's **built-in** pose control uses **five-facial-keypoint images** (extracted by `ExtractFacePoseImage` node using InsightFace landmarks). This is far simpler than OpenPose/DWPose -- just 5 dots for eye corners, nose tip, mouth corners.

For external ControlNet head pose control:
- **Depth** is best for 3D mannequin renders -- mannequins produce clean depth maps naturally since they're 3D models. FLUX ControlNet Union Pro 2.0 supports depth as mode 2.
- **Canny** works but captures too much surface detail from mannequins (seams, texture), which bleeds into output.
- **OpenPose/DWPose** -- see next point.

## 4. DWPose on 3D mannequin sculptures

**DWPose will likely fail or produce poor results on mannequin sculptures.** DWPose is trained on real human photos. 3D mannequin heads (especially stylized ones) lack the skin texture, eye detail, and proportions DWPose expects. The face keypoint detector (based on COCO WholeBody) needs recognizable human features.

**Better alternatives for mannequin angle refs:**
- Render **depth maps** directly from the 3D mannequin (trivial if you control the 3D scene)
- Use InfuseNet's built-in 5-keypoint system with manually placed keypoints
- Use real photos of a person at the target angles to extract DWPose, then apply those pose maps

## 5. Does ControlNet strength=0 truly disable it in FLUX?

**No, strength=0 does NOT fully bypass the conditioning path.** The ControlNet model still runs forward inference (costing VRAM and compute), and the conditioning tensor is still present in the chain -- it's just multiplied by 0. The `control_hint` image is still encoded. To truly disable, you must **not connect** the ControlNet node at all, or use a workflow switch/bypass.

In ComfyUI specifically: `set_cond_hint(control_hint, strength=0.0, ...)` still loads the model and processes the hint. The residuals are zeroed but the forward pass runs.

## 6. Strength/end_percent for pose control with identity preservation

From issue #16 (ComfyUI_InfiniteYou), a user found: **InfuseNet strength 0.7 helps text/expression adherence significantly** vs default 1.0. Higher InfuseNet strength = stronger identity but worse prompt following.

Recommended starting points for external ControlNet + InfuseNet:
- **InfuseNet strength:** 0.7-0.85 (identity)
- **External ControlNet strength:** 0.3-0.5 (pose -- go low to avoid fighting InfuseNet)
- **External ControlNet end_percent:** 0.4-0.6 (let ControlNet guide early structure, then let InfuseNet dominate later steps for identity)
- These are theoretical -- **nobody has gotten both working simultaneously** due to bug #23.

## 7. GitHub issues/discussions: InfiniteYou + ControlNet

- **Issue #42** (bytedance/InfiniteYou): "What controlnet to use in conjunction with InfiniteYou" -- **open, no response** from maintainers (Jul 2025)
- **Issue #20** (bytedance/InfiniteYou): "Pose Controlnet with your workflow" -- **open, no response** (Mar 2025)
- **Issue #23** (bytedance/ComfyUI_InfiniteYou): `forward() missing 'y'` when combining ControlNet -- **open, unresolved** (Aug 2025)
- **Issue #16** (bytedance/ComfyUI_InfiniteYou): CFG>1 crashes with shape mismatch -- **open** (identity embedding not doubled for uncond)
- **Issues #13/#32**: TypeError in `controlnet_conditioning_scale` -- fixed in later versions
- The paper's `pipeline_flux_infusenet.py` does support external ControlNet in its `__call__` signature (accepts `controlnet` + `controlnet_conditioning_scale` params), but the ComfyUI node implementation hasn't caught up.

## 8. Community FLUX ControlNet Union + identity setups

No confirmed working setups combining InfiniteYou + FLUX ControlNet Union Pro 2.0 in ComfyUI as of April 2026. The community is using:

- **InfuseNet alone** with its built-in 5-keypoint pose control (works, limited expressiveness)
- **PuLID + ControlNet Union** (your current pipeline -- works because PuLID uses attention injection, not ControlNet subclass)
- **IP-Adapter + ControlNet Union** (works, IP-Adapter uses cross-attention, no conflict)

## Actionable Recommendations

1. **Don't switch from PuLID to InfiniteYou yet** for the angle pipeline. The ControlNet combination is broken in ComfyUI nodes.
2. **If you want to test InfiniteYou**, use its **built-in 5-keypoint pose control** only (no external ControlNet). The `ExtractFacePoseImage` node extracts these from a reference photo.
3. **For head pose control with PuLID (current setup)**, depth maps from 3D mannequin renders are your best bet with ControlNet Union Pro 2.0 (mode 2 = depth).
4. **Watch issue #23** on bytedance/ComfyUI_InfiniteYou for the ControlNet chaining fix.
5. **InfiniteYou's identity quality is reportedly better than PuLID** (72.8% vs 27.2% human preference in paper). Worth revisiting once the ControlNet bug is fixed.
