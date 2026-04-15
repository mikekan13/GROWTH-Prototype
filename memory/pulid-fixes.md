---
name: PuLID Custom Fixes
description: Two patches to ComfyUI-PuLID-Flux that fix GGUF device mismatch and hair bleed — must reapply after PuLID updates
type: reference
---

Two custom patches in `C:\AI\ComfyUI\custom_nodes\ComfyUI-PuLID-Flux\pulidflux.py`:

### Fix 1: GGUF Device Mismatch (line ~94)
PuLID's cross-attention layers (`pulid_ca`) get swept to CPU by GGUF model patcher between inferences. Added before the double_blocks loop:
```python
if self.pulid_data:
    for ca in self.pulid_ca:
        ca.to(img.device, dtype=img.dtype)
```
**Why:** Without this, second+ inferences crash with "Expected all tensors to be on the same device"

### Fix 2: Hair Masking (line ~304)
Added label 17 (hair) to BiSeNet `bg_label` list:
```python
bg_label = [0, 16, 17, 18, 7, 8, 9, 14, 15]  # 17 = hair
```
**Why:** PuLID sends face features to EVA-CLIP after masking "background" to white. Hair (label 17) was NOT in the mask list, so EVA-CLIP saw full hair from reference photos and embedded it into every generation. Adding 17 masks hair to white, giving EVA-CLIP face-only data.

**How to apply:** These are direct edits to the custom node. If ComfyUI-PuLID-Flux is updated via git pull, these patches will be overwritten and must be reapplied.
