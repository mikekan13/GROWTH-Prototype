# Mask Edge Cutoff Solutions for AI Image Editing

**Context:** FLUX Kontext Dev + sharp (Node.js) for garment/region edits (e.g. shirt → long dress). Problem: generated content gets clipped at the mask boundary, producing hard hems, amputated sleeves, dresses that stop mid-thigh, etc.

---

## TL;DR — the proven recipe for our stack

The community converges on a hybrid: **pre-dilate the mask generously + feather the edge + use differential-diffusion-style soft inpainting + optionally run a second-pass refinement using an auto-computed difference mask.** No single knob fixes this; it is always a combination.

For GRO.WTH on Kontext Dev + sharp:

1. **Anticipatory dilation.** Expand the painted mask by a percentage of subject height (not a fixed px), proportional to how large the shape change is. Rule of thumb from the community: 5–20 px for minor edits, but for "shirt → long dress" you need **15–30% of subject height** expansion downward and **outward biased by edit intent**.
2. **Directional/asymmetric expansion.** Expand downward a lot (for a longer garment), outward moderately, upward minimally. Uniform dilation wastes budget and risks damaging the face/hair.
3. **Feather the edge** with a Gaussian blur of sigma 8–20 px on the final mask before compositing. This is the single biggest quality win per unit of effort.
4. **Differential-diffusion-style conditioning** at generation time — treat the mask as a gradient, not a binary. Kontext external masks accept a grayscale mask; pass the blurred mask directly.
5. **Two-pass refinement:** generate → diff source vs output to compute the *actual* changed region → dilate+feather that diff as the composite alpha → composite generated-over-source with that alpha. This bypasses the painted mask entirely for the final composite step, so natural hems survive.

Detail, references, and sharp code below.

---

## 1. Mask dilation strategies

### What the community uses

- **ComfyUI `GrowMask` / `Expand Mask`**: Default 16 px grow. "Typical expansion: 5–20 pixels beyond visible edge" (Apatero 2026 guide, ComfyUI wiki). This is tuned for small refinements (faces, hands).
- **Fooocus auto-inpaint**: uses an algorithm that dilates and re-blends around the painted region; the user paints sloppy and Fooocus widens it automatically before generation.
- **For large shape changes (shirt → dress)**: pure uniform dilation is wrong. You want *directional* dilation. The `masquerade-nodes-comfyui` Mask Morphology node and Blender's dilate/erode both support directional/shaped kernels.

### Methods ranked

1. **Morphological dilation (proper, cheap, fast)** — best for the base expansion. Operates on the binary mask, grows by N pixels using a disk/box/directional kernel.
2. **Blur + threshold** — equivalent to dilation at scale, slightly softer-shouldered, but loses precision on small details. Useful as a *second* stage after morphological dilation.
3. **Distance-transform-based growth** — for proportional expansion tied to mask geometry (e.g. "grow 25% of bounding box height"). Use when edit magnitude depends on subject scale.

### sharp implementation

`sharp` **ships native dilate/erode** via libvips (since 0.30.x, still current in 0.34+). Width param = pixels. The morphology is Chebyshev-distance (8-connected).

```js
import sharp from 'sharp';

// Input: grayscale mask PNG, white = edit region
// Goal: grow by N px, then feather with Gaussian blur
async function expandMask(maskPath, growPx, featherSigma) {
  return sharp(maskPath)
    .ensureAlpha()
    .greyscale()
    .dilate(growPx)       // morphological dilation, N-px radius
    .blur(featherSigma)   // Gaussian, sigma in 8..20 for soft edges
    .toBuffer();
}
```

**Caveat:** `sharp.dilate(width)` is uniform. For **directional** growth (grow downward more than upward), do it with `extract` + `extend` + a shifted composite, or pre-process on a canvas and then run dilate. Pattern:

```js
// Asymmetric grow: more downward, less elsewhere.
// Trick: translate the mask down by half the extra, then union with original.
async function directionalDilate(maskBuf, { down=40, up=4, side=12 }) {
  const meta = await sharp(maskBuf).metadata();
  const shifted = await sharp(maskBuf)
    .extend({ top: 0, bottom: down, left: side, right: side, background: '#000' })
    .extract({ left: 0, top: 0, width: meta.width, height: meta.height })
    .toBuffer();
  // Union original with the shifted copy
  return sharp(maskBuf)
    .composite([{ input: shifted, blend: 'lighten' }]) // per-pixel max on grayscale
    .dilate(side)     // fine uniform expansion
    .blur(12)
    .toBuffer();
}
```

---

## 2. Smart mask expansion (detect generated content edges)

**Paradigm:** Don't rely on the painted mask at composite time. Compare source vs generated, let the diff tell you what actually changed, use that as your alpha.

Community term: "**MaskByDifferent**" / "**Pixelwise MASK - MASK**" / "difference masking" (ComfyUI LayerStyle, was-node-suite, Impact-Pack all ship variants).

### Algorithm

1. Run generation with a generously dilated painted mask (Step 1 above).
2. Compute per-pixel difference: `abs(source - generated)` in Lab or luminance space.
3. Threshold at ~5–10% (per channel mean) to produce a binary diff mask.
4. Morphological close (dilate→erode) to fill small gaps in the diff.
5. Gaussian blur (sigma 10–25) to feather.
6. This becomes your composite alpha: `output = source * (1 - alpha) + generated * alpha`.

### sharp implementation

```js
import sharp from 'sharp';

async function diffMask(sourcePath, generatedPath, threshold = 12) {
  const [src, gen] = await Promise.all([
    sharp(sourcePath).greyscale().raw().toBuffer({ resolveWithObject: true }),
    sharp(generatedPath).greyscale().raw().toBuffer({ resolveWithObject: true }),
  ]);
  const { width, height } = src.info;
  const diff = Buffer.alloc(width * height);
  for (let i = 0; i < diff.length; i++) {
    diff[i] = Math.abs(src.data[i] - gen.data[i]) > threshold ? 255 : 0;
  }
  return sharp(diff, { raw: { width, height, channels: 1 } })
    .dilate(6)   // close small gaps / include anti-aliased border pixels
    .blur(14)    // feather for smooth composite
    .png()
    .toBuffer();
}

async function composite(sourcePath, generatedPath, alphaMaskBuf) {
  // Use dest-in to cut generated to the alpha shape, then place over source
  const generatedCut = await sharp(generatedPath)
    .ensureAlpha()
    .composite([{ input: alphaMaskBuf, blend: 'dest-in' }])
    .png()
    .toBuffer();
  return sharp(sourcePath)
    .composite([{ input: generatedCut, blend: 'over' }])
    .png()
    .toBuffer();
}
```

This is the **single most important trick** for our stack: it lets Kontext "paint outside the lines" as long as the painted mask was dilated generously, and the final composite respects whatever shape the model actually drew.

---

## 3. Outpainting-style approaches (edits that naturally extend)

- **Fooocus inpaint model** (Acly `comfyui-inpaint-nodes`) explicitly supports outpainting with the same pipeline: the mask extends off the canvas or over empty pixels, and the model hallucinates continuation. Kontext Dev doesn't have a dedicated outpaint patch but handles extension fine if you dilate the mask beyond the current garment silhouette.
- **Inpaint Crop & Stitch** (`lquesada/ComfyUI-Inpaint-CropAndStitch`) — crops around mask + context area, generates at full res, stitches back with automatic edge blending. Doesn't VAE-roundtrip the unmasked pixels, so the rest of the image is pixel-perfect. Worth porting the "context-area + stitch-with-blend" pattern into our Node.js service even if we don't use ComfyUI for it.

### Practical "outpaint the garment" pattern
- Segment the torso + legs (SAM / person-parts model) to get a person silhouette.
- Build the edit mask = `person_silhouette ∩ lower_body_bbox` instead of exactly the painted shirt shape. This gives Kontext the *room* to draw a long dress without having to guess where the legs are.

---

## 4. Post-processing — the diff-mask composite

Covered in §2. This is the single highest-ROI fix for "dress cut off at hem" specifically — because the model draws the full dress, but the painted mask throws away the extra. The diff mask keeps it.

---

## 5. Two-pass workflows

**Proven pattern** (Apatero 2026 guide, Prompting Pixels):

- **Pass 1 — rough placement.** Large dilated mask (25–40 px grow, sigma 20 blur), denoise 0.85–1.0. Generate. This gives you a silhouette.
- **Pass 2 — edge refinement.** Recompute mask from pass-1 output using diff-mask (§2). Smaller feather (sigma 6). Low denoise (0.3–0.5). This cleans the seam without disturbing the new content.
- **Pass 3 (optional) — ultra-narrow edge band.** Dilate diff mask 3 px, erode 1 px → thin ring. Denoise 0.2–0.3 at that ring only. Kills residual lighting mismatches.

Most consumer apps (Photoshop Generative Fill, Firefly) use a two-pass variant under the hood. The Adobe approach is essentially "generate into a padded region, then blend with a content-aware alpha."

---

## 6. Feather + alpha ramping

- **Photoshop Generative Fill** feathers ~8–12 px on 1024px images and additionally runs content-aware seam blending (frequency separation) in the composite.
- **Apatero recommendation:** blur 3–10 px for small edits, more for large. Our "shirt → dress" case = large edit → **sigma 12–20**.
- **Alpha ramping formula:** `alpha = clamp((distance_from_mask_center - hard_core_radius) / feather_radius, 0, 1)` — gives you a hard interior + soft outer band, which preserves intended content while letting the model fade edges.

### sharp chain for a good feathered mask

```js
await sharp(binaryMaskBuf)
  .dilate(20)     // expansion budget
  .blur(14)       // gaussian feather
  .linear(1.4, 0) // steepen the ramp: bring 40% → 60% faster, keeps the core
  .toBuffer();
```

The `linear(a, b)` step adds contrast to the feather — without it, the blurred mask is too gentle and the generated region looks ghosted.

---

## 7. "Region of influence" — must-change vs. can-change

**Differential Diffusion** (Levin & Fried, 2024 — the paper behind ComfyUI's `Differential Diffusion` node) is exactly this. Instead of a binary mask, you provide a **grayscale mask where pixel value = per-pixel denoise strength.**

- White (255) = fully regenerate ("must change")
- Mid-gray (~128) = can change if context demands, otherwise preserve
- Black (0) = lock to source

Kontext Dev accepts external grayscale masks natively (confirmed by FluxKontextInpaintPipeline PR #11820 in huggingface/diffusers). So you can:

```
Build mask:
  core (must change)       = painted shirt, fully eroded by 4 px  → 255
  expansion ring           = dilated zone around core            → 180
  outpaint zone (can grow) = full lower-body silhouette          → 120
  everywhere else                                                 → 0
Then gaussian blur sigma=8 to soften the tier transitions.
```

This is **the most principled fix** and the one we should actually implement. It's a single grayscale PNG — no pipeline changes, just a smarter mask builder.

---

## Recommended implementation for GRO.WTH

Build `src/ai/portraits/mask-builder.ts` with:

```ts
export interface MaskTier {
  region: 'core' | 'expansion' | 'outpaint_zone';
  source: Buffer;       // binary mask
  intensity: number;    // 0..255
}

export async function buildSoftMask(tiers: MaskTier[], featherSigma = 10): Promise<Buffer> {
  // Composite each tier as grayscale, keep the max per pixel
  // Apply final gaussian blur + linear contrast
}

export async function diffAlphaMask(
  sourcePath: string,
  generatedPath: string,
  opts?: { threshold?: number; dilate?: number; blur?: number }
): Promise<Buffer> { /* §2 impl */ }

export async function composite(
  sourcePath: string,
  generatedPath: string,
  alphaMask: Buffer
): Promise<Buffer> { /* §2 impl */ }
```

**Workflow for garment change:**
1. User paints rough shirt area.
2. `buildSoftMask` produces 3-tier grayscale mask (core=shirt, expansion=±20 px, outpaint=lower body silhouette from person-parse).
3. Send to Kontext Dev with grayscale mask.
4. Post-process: `diffAlphaMask(source, generated)` + `composite(...)`.
5. Optional pass-2 refinement with narrow edge band + low denoise.

**Expected outcome:** dresses end where the model drew them, not where the user painted. Hems look natural. No hard edges at the stitch boundary.

---

## Sources

- [Apatero — ComfyUI Inpainting Advanced 2026](https://apatero.com/blog/comfyui-inpainting-advanced-techniques-guide-2026) — grow/feather ranges, multi-pass pattern
- [Prompting Pixels — Soft Inpainting in ComfyUI](https://promptingpixels.com/soft-inpainting-in-comfyui/) — differential diffusion setup
- [Differential Diffusion paper site](https://differential-diffusion.github.io/) — theory behind per-pixel denoise masks
- [Acly `comfyui-inpaint-nodes`](https://github.com/Acly/comfyui-inpaint-nodes) — Fooocus inpaint, Expand Mask node specs
- [lquesada `ComfyUI-Inpaint-CropAndStitch`](https://github.com/lquesada/ComfyUI-Inpaint-CropAndStitch) — crop-context-stitch pattern
- [ZenAI `ComfyUI-Kontext-Inpainting`](https://github.com/ZenAI-Vietnam/ComfyUI-Kontext-Inpainting) — Kontext-specific inpaint node
- [huggingface/diffusers PR #11820](https://github.com/huggingface/diffusers/pull/11820) — FluxKontextInpaintPipeline with external mask support
- [sharp API — morphology](https://sharp.pixelplumbing.com/api-operation/) — `dilate(width)`, `erode(width)`, `blur(sigma)`, `composite` blend modes
- [ComfyUI LayerStyle `MaskByDifferent`](https://www.runcomfy.com/comfyui-nodes/ComfyUI_LayerStyle/LayerMask--MaskByDifferent) — difference-based auto masking
- [ComfyUI Wiki — GrowMask, MaskComposite](https://comfyui-wiki.com/en/comfyui-nodes/mask/mask-composite) — node parameter reference
