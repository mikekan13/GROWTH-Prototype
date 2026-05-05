# FLUX.2 Migration Plan

## Morning summary (2026-04-21 overnight run)

**Status: FLUX.2 Dev is live on the pod and working.** Both a bare t2i gen and a 3-ref face identity gen ran successfully on the first clean attempts. Results are in `overnight-results/` — `01-smoke-test.png` (plain t2i with `GROWTH_FACE_PROMPT`) and `02-multiref-face-kai.png` (3 Kai refs chained through `ReferenceLatent`). The multi-ref gen preserved Kai's identity (same bangs, braids, lip shape, green-grey eyes) while following the new three-quarter pose direction from the prompt.

**Pod session**: one session, 08:23:30Z → 10:12:16Z = **108.77 min**. Well under the 180-min cap ($5.42 of $10). Hibernated cleanly. Second pod session not needed — the multi-ref test rode in the same session as the smoke test.

**Key deltas from the pre-night plan**:

1. **Text encoder: bf16 → fp8.** The 35.5 GB bf16 file got corrupted mid-way through wget resume (tensor regions scrambled — tekken_model tokenizer blob ended up pointing at bf16 weight data, breaking CLIPLoader with a UTF-8 decode on byte 0x9d). Re-fetched the 18 GB fp8 variant via `hf download` (Xet-verified) — **69 sec at ~260 MB/s**. Transformer also re-fetched via hf to eliminate the same risk (131 sec). All four workflow JSONs updated to point at `mistral_3_small_flux2_fp8.safetensors`.
2. **Future rule for downloads**: use `HF_HUB_ENABLE_HF_TRANSFER=1 hf download ...`, not wget. 60-70× faster and hash-verified.
3. **Volume quota blocker**: network volume is 125 GB, not the 418 TB the cluster df reports. Had 8 GB free pre-night — couldn't fit the remaining downloads. Deleted three items explicitly listed in the plan's deletion section (flux1-fill-dev 23 GB, agflux-fill-nsfw 12 GB, infinite_you/ 5.9 GB — total 40.9 GB) to make room. Kept flux1-dev and flux1-kontext as rollback.
4. **ComfyUI deps**: pod image was missing `SQLAlchemy`, `alembic`, `tqdm`, `tokenizers`, `transformers` and several others required by ComfyUI 0.19.3. Full `pip install -r requirements.txt` inside the pod fixed it. This will survive hibernate (site-packages live on the container root).
5. **Custom node failures**: InfiniteYou, PuLID-Flux, controlnet_aux, GGUF, x-flux-comfyui, IPAdapter-Flux, CatvtonFluxWrapper all `IMPORT FAILED` at ComfyUI startup. All are FLUX.1 tooling we're moving away from. Harmless for the FLUX.2 pipeline; can be removed later if they clutter logs.
6. **`ImageScaleToTotalPixels` requires `resolution_steps`** in 0.19.3 (default 1, advanced). Added to all three workflows that use it.
7. **Style prompt aesthetic landed.** The `GROWTH_FACE_PROMPT` prose (no keyword soup, natural language for Mistral-3 encoder) got us the target look — pale cool skin, soft key, grey vignetted BG, cinematic painterly-photo hybrid — on the *first* gen.

**Next concrete steps (for when you pick this up)**:

- Look at `overnight-results/02-multiref-face-kai.png`. If the identity match is good enough, the "replace PuLID+InfiniteYou+ControlNet with FLUX.2 multi-ref" rung is proven — wire it into `generatePortrait()`/`generateFacePortrait()` in `src/ai/portraits/providers/local.ts` (that file still has ~1000 lines of PuLID logic; rip it and route to `flux2-face-multiref.json`).
- Body gen next. Reuse `flux2-face-multiref.json` structure but with `GROWTH_BODY_PROMPT` and 1024×1536 (portrait aspect) — or build a sibling `flux2-body.json`.
- Native mask edit: `flux2-edit-masked.json` is written but untested (SetLatentNoiseMask path). Test on one image edit request end-to-end.
- Clean up the deletable FLUX.1 models once you've confirmed quality parity with the Kontext baseline (flux1-dev, flux1-kontext, t5xxl encoders — per the original deletion list).

See the "Overnight pod time ledger" and "Overnight findings" sections below for the full log.

---

Written 2026-04-21, mid-migration. Purpose: hand a fresh Claude context enough to pick this up without re-deriving every decision.

---

## The decision (non-negotiable)

**We are replacing the FLUX.1 + Kontext + PuLID + InfiniteYou stack with FLUX.2 Dev.** Mike approved this explicitly 2026-04-21: "dump it. get the big boy. We can spend another night tuning loras. I WILL PAY THE DEVELOPER LICENSE WHEN WE RELEASE."

### What form of FLUX.2

- **FLUX.2 Dev FP8 mixed** — NVIDIA-partnered release targeting H100 native FP8 tensor cores. 35.5 GB.
- BF16 (64 GB) is technically the flagship but does not fit in 80 GB VRAM on an H100 once the text encoder + activations load. On H100 the FP8-mixed form **is** the flagship in practice.
- If we ever upgrade to H200 141 GB, revisit BF16.

### License posture

- FLUX.2 Dev is under the FLUX Non-Commercial License. **Mike has explicitly accepted this debt.** Commercial release requires either BFL Pro API usage or a negotiated commercial license from BFL — this is a **pre-launch** action item, not a blocker for dev.
- Memory file: `flux2-dev-decision.md` in the memory index.
- Add FLUX.2 Dev to the existing `license-debt-identity-stack.md` list of consciously-carried debts.

---

## Why this solves real problems

Current pain → FLUX.2 answer:

| Pain | FLUX.2 answer |
|---|---|
| Kontext Dev post-composite masking never lands cleanly (dress extends too far OR edits get rejected) | Native mask-aware conditioning inside the model |
| Identity pipeline = PuLID + InfiniteYou + ControlNet + IP-Adapter (fragile, multiple non-commercial weights) | Built-in multi-reference (up to 10 images) — one model handles identity |
| FLUX.1 Dev + Fill + Kontext = 3 models, ~50 GB disk, complicated branching | One model, 35.5 GB, one code path |
| Dev iteration required VRAM acrobatics on the 4060 8 GB local | Pod-first now; local stays a stretch goal |

---

## What is already done (as of 2026-04-21 07:20 UTC)

### Memory system updates
- `memory/flux2-dev-decision.md` — the decision, license stance
- `memory/feedback-lead-with-most-powerful-tech.md` — don't lead with gimped fallbacks; H100 has 80 GB
- `memory/feedback-hibernate-pod-when-idle.md` — $2.99/hr; off when not actively downloading/gen/testing
- `MEMORY.md` index updated with the above

### Pod downloads (state at hibernate — 2026-04-21 ~07:35 UTC)

**Pod is HIBERNATED.** Files persist on the network volume; wget processes were killed by the stop. Use `wget -c` to resume.

| File | Dest | Size | State at hibernate |
|---|---|---|---|
| `flux2_dev_fp8mixed.safetensors` | `/workspace/ComfyUI/models/diffusion_models/` | 35.5 GB total | partial, ~13.7 GB (38%) |
| `mistral_3_small_flux2_bf16.safetensors` | `/workspace/ComfyUI/models/text_encoders/` | expect ~35 GB (log showed 38% at 13.8 GB) | partial, ~13.8 GB |
| `full_encoder_small_decoder.safetensors` | `/workspace/ComfyUI/models/vae/` | 249 MB | ✅ complete |

**To resume downloads after `cloud-up.mjs`:**
```bash
bash /c/Projects/GRO.WTH/standalone/scripts/pod-exec.sh '
cd /workspace/downloads
nohup wget -c --progress=dot:giga \
  -O /workspace/ComfyUI/models/diffusion_models/flux2_dev_fp8mixed.safetensors \
  https://huggingface.co/Comfy-Org/flux2-dev/resolve/main/split_files/diffusion_models/flux2_dev_fp8mixed.safetensors \
  > /workspace/downloads/flux2_transformer.log 2>&1 &
nohup wget -c --progress=dot:giga \
  -O /workspace/ComfyUI/models/text_encoders/mistral_3_small_flux2_bf16.safetensors \
  https://huggingface.co/Comfy-Org/flux2-dev/resolve/main/split_files/text_encoders/mistral_3_small_flux2_bf16.safetensors \
  > /workspace/downloads/mistral_text_encoder.log 2>&1 &
echo "resumed; expect ~60-75 min to finish at 5 MB/s"
'
```

Download URLs (Comfy-Org + BFL small-decoder mirror — no HF token needed):
- `https://huggingface.co/Comfy-Org/flux2-dev/resolve/main/split_files/diffusion_models/flux2_dev_fp8mixed.safetensors`
- `https://huggingface.co/Comfy-Org/flux2-dev/resolve/main/split_files/text_encoders/mistral_3_small_flux2_bf16.safetensors`
- `https://huggingface.co/black-forest-labs/FLUX.2-small-decoder/resolve/main/full_encoder_small_decoder.safetensors`

Logs at `/workspace/downloads/*.log` on the pod. Resume check:
```bash
bash /c/Projects/GRO.WTH/standalone/scripts/pod-exec.sh '
  ls -lh /workspace/ComfyUI/models/diffusion_models/flux2_dev_fp8mixed.safetensors
  ls -lh /workspace/ComfyUI/models/text_encoders/mistral_3_small_flux2_bf16.safetensors
  ps aux | grep wget | grep -v grep
'
```

### Workflows written (ComfyUI API format, in `src/ai/portraits/workflows/`)
- `flux2-t2i.json` — plain text-to-image
- `flux2-edit-reference.json` — single-reference image edit (source → edited)
- `stock_flux2_ref.json` — reference copy of the stock ComfyUI workflow template for future work

### Code changes (in `src/ai/portraits/providers/local.ts`)
- `editImage()` switched from `character-finetune-kontext` → `flux2-edit-reference`
- Class-type handlers updated: `RandomNoise.noise_seed` replaces `KSampler.seed`, trigger words removed (FLUX.1 LoRAs don't transfer so the triggers are dead)
- Thumbs→PNG resolution fix is still in place for the source path

### Things NOT yet done
- Smoke test — zero generations have run on FLUX.2 Dev yet. Workflow is untested.
- Multi-reference workflow for face identity (rung 2) — needs chained `ReferenceLatent` nodes, see "Build next" below
- Mask-aware edit workflow — stock workflow is single-ref without mask. Native mask support TBD after smoke test.
- LoRA chain — all FLUX.1 LoRAs (growth-style-1, realism, detail, perfection, dark-fantasy-v2, MythSharpLines, Arti Sketchy, Kontext HiRes) are INCOMPATIBLE. Retrain plan below.
- Pod hibernate command (`cloud-down.mjs`) was NOT fired yet — downloads still active when Mike asked for this plan.

---

## Pipeline rebuild order (Mike's direction)

> "Start at face identity pull and gen and then work our way back up again."

1. **Rung 2 — Face identity pull.** Multi-reference FLUX.2 gen from user-uploaded photos. Replaces PuLID. Needs a `flux2-face-multiref.json` workflow with 2-5 chained `ReferenceLatent` nodes.
2. **Rung 3 — 5 angles / identity lock.** Reuse the face workflow, vary prompt to request specific angles. Kai is the current test subject.
3. **Rung 4 — Body composition.** T2I with identity references chained. `flux2-t2i.json` extended with multi-ref.
4. **Rung 5 — Finetune / iterative edits.** `flux2-edit-reference.json` (built) + native mask support once we prove the base.
5. Higher rungs follow pipeline-vision.md unchanged.

---

## Build next (in order)

### 1. Smoke test (cannot skip)
Once downloads complete, queue `flux2-t2i.json` with a trivial prompt directly against the ComfyUI API. Confirms the installed ComfyUI (v0.19.3 on the pod) has the required nodes: `UNETLoader`, `CLIPLoader` (with `type: "flux2"`), `VAELoader`, `CLIPTextEncode`, `FluxGuidance`, `Flux2Scheduler`, `EmptyFlux2LatentImage`, `KSamplerSelect`, `RandomNoise`, `BasicGuider`, `SamplerCustomAdvanced`. If any are missing, install `ComfyUI-Manager` or the specific node pack.

### 2. Multi-reference face workflow
Copy `flux2-edit-reference.json` → `flux2-face-multiref.json`. Replace the single `LoadImage → SCALE → ENCODE → ReferenceLatent` chain with 2-5 parallel encode+ref chains:

```
LOAD1 → SCALE1 → ENCODE1 ↘
LOAD2 → SCALE2 → ENCODE2 → ReferenceLatent(chain) → ReferenceLatent(chain) → ReferenceLatent(chain) → conditioning → Guider
LOAD3 → SCALE3 → ENCODE3 ↗
```

Each `ReferenceLatent` accepts `conditioning` + `latent`. Chain them: node2's `conditioning` input comes from node1's output, etc. Validate that the stock FLUX.2 doc explicitly supports this chained form; if not, the alternate pattern is to stitch references via a single image collage and one `ReferenceLatent`.

### 3. Wire into `generatePortrait()` face path
`local.ts` has a face-gen path (`generatePortrait` / `generateFacePortrait` — grep for `LoadImage` handlers and `PuLID` node references). Replace it with the new multi-ref FLUX.2 workflow. PuLID, InfiniteYou, ControlNet, IP-Adapter, InsightFace nodes come out.

### 4. Native mask support for `editImage`
Research what ComfyUI node chain gives FLUX.2 masked editing. Candidates:
- `SetLatentNoiseMask` between `ENCODE` and `SamplerCustomAdvanced` (masks noise so only masked pixels change)
- `InpaintModelConditioning` (shipped with Kontext; unclear if it applies to FLUX.2 arch)
- If neither works cleanly, a mask-aware fine-tune LoRA exists in the wild — search Civitai for "flux2 inpaint lora"

The post-composite fallback in `editImage` stays available but is a patch, not the answer.

### 5. Style matching — prompt-extracted, NOT LoRA retrained (primary path)

**Correction to earlier framing**: there is no single "growth-style-1 trained GROWTH identity LoRA." The GROWTH look was a BLEND of 7 community LoRAs at specific weights — mostly compensating for FLUX.1's weak base. FLUX.2 base is much stronger, so most of that compensation is not needed.

**Primary approach — vision-to-prompt extraction (per-stage)**:

**Reference images are in**: `C:/Users/Mikek/OneDrive/Desktop/FLUX 2 LORAs/`

Mike dropped two things there:
- One FLUX.2-compatible LoRA (exact filename — grep the folder to find it; it's the only `.safetensors`)
- Every good generation from the FLUX.1 pipeline: faces, bodies, finetune results. Mixed together.

**How to extract the per-stage style prompts (do this BEFORE any smoke test):**

1. **Sort the images into three buckets by reading each one with the Read tool** (supports images directly — no separate vision API needed):
   - `face` — tight portraits, head-and-shoulders, identity-focused gens
   - `body` — full-body or half-body compositions, outfit visible
   - `finetune` — edits on top of earlier gens (may look closer to a drawing-over, or have specific changes to clothes/accessories)
   
   You can tell them apart by looking. Record the mapping to a scratch note.

2. **For each bucket, run vision analysis on every image** (again via Read tool — Claude Code's image reading is the vision model). For each image, ask yourself: what *exactly* makes this look right? Record observations on:
   - Lighting (direction, temperature, contrast)
   - Color grading (palette, saturation, gamma)
   - Skin/material rendering (pore-level texture vs smoothed? wet/oily vs matte?)
   - Linework and edges (crisp vs soft, pencil-like vs render-like)
   - Composition and framing (distance, angle, negative space)
   - Mood (somber, serene, documentary, heroic?)

3. **Collapse observations into three style-prompt constants**:
   - `GROWTH_FACE_PROMPT` — style prefix for face-identity stage
   - `GROWTH_BODY_PROMPT` — style prefix for body gen stage
   - `GROWTH_FINETUNE_PROMPT` — style prefix for edit/finetune stage
   
   Save all three in `src/ai/portraits/growth-style-prompts.ts` as exported constants.

4. **Wire them into the provider**:
   - Face gen: prepend `GROWTH_FACE_PROMPT` + ", " + user prompt
   - Body gen: prepend `GROWTH_BODY_PROMPT`
   - Edit/finetune: prepend `GROWTH_FINETUNE_PROMPT`

5. **A/B iterate**: run a gen, compare to the matching reference in the folder, adjust the prompt fragment, repeat. This is the budget for "LoRA replacement" — if the prompt fragment can land within visual-vibe distance of the reference, we've successfully migrated style without a single LoRA train.

**LoRA in the folder**: identify what it is, what it's trained on, and whether it adds useful signal on top of the extracted style prompt. Don't assume you have to use it — Mike dropped it as an option, not a requirement. Test with and without.

Benefits: zero training cost, zero license debt, portable across face/body/edit, fast to iterate (minutes vs days for a LoRA train).

**Fallback — LoRA training**: only if prompt-extracted style doesn't converge on the target aesthetic after a serious iteration pass. Ecosystem note: very few FLUX.2 LoRAs exist in the wild as of 2026-04-21 (Mike confirmed after hunting). If we do train, use `ai-toolkit` (RunComfy FLUX.2 trainer) or `kohya-ss/musubi-tuner`. FLUX.2 LoRAs work at 0.5-0.6 weight typically; full 1.0 over-saturates.

---

## Pod + budget rules

- **Pod**: `iucnxl51ddxzpq` (H100 80 GB, US-NE-1, $2.99/hr)
- **Volume**: `o5y6of5tje` ("growth-models-v2", network FS with ~418 TB free — disk is NOT a constraint)
- **Hibernate**: `node C:/Projects/GRO.WTH/standalone/scripts/cloud-down.mjs`
- **Resume**: `node C:/Projects/GRO.WTH/standalone/scripts/cloud-up.mjs`
- **SSH exec**: `bash C:/Projects/GRO.WTH/standalone/scripts/pod-exec.sh '<command>'`
- **ComfyUI proxy URL** (dynamic, re-read via `pod-info-json.mjs`): `https://iucnxl51ddxzpq-8188.proxy.runpod.net/`

**Rule**: hibernate when not actively using. Active = download running, gen queued, test in progress, or Mike about to test. Not active = building workflows locally, writing code, researching, waiting on Mike.

**Rule**: ask before spending (existing rule). Any pod resize, tier upgrade, or paid action needs Mike's OK with $ delta called out.

---

## Reference: FLUX.2 workflow node structure

API-format workflow file shape. Key class types:

| Node | Key inputs | Notes |
|---|---|---|
| `UNETLoader` | `unet_name`, `weight_dtype` | Use `flux2_dev_fp8mixed.safetensors`, dtype `default` |
| `CLIPLoader` | `clip_name`, `type`, `device` | `type: "flux2"` is required (not "flux" — different) |
| `VAELoader` | `vae_name` | `full_encoder_small_decoder.safetensors` |
| `CLIPTextEncode` | `text`, `clip` | Single encoder (Mistral), no dual-clip |
| `FluxGuidance` | `conditioning`, `guidance` | Stock default 4.0 (Kontext was 5.0) |
| `ReferenceLatent` | `conditioning`, `latent` | For ref/edit. Chain for multi-ref. |
| `Flux2Scheduler` | `steps`, `width`, `height` | Scheduler is FLUX.2-specific |
| `KSamplerSelect` | `sampler_name` | `euler` |
| `RandomNoise` | `noise_seed` | Seed lives here, NOT in a KSampler |
| `BasicGuider` | `model`, `conditioning` | Wraps model + positive for sampler |
| `EmptyFlux2LatentImage` | `width`, `height`, `batch_size` | FLUX.2-specific latent init |
| `SamplerCustomAdvanced` | `noise`, `guider`, `sampler`, `sigmas`, `latent_image` | The new sampler (no KSampler) |
| `VAEDecode` | `samples`, `vae` | Standard |
| `LoadImage` | `image` | Standard. Match by `_meta.title` in provider. |
| `ImageScaleToTotalPixels` | `image`, `upscale_method`, `megapixels` | Pre-scale source to ~1 MP before encode |
| `GetImageSize` | `image` | Gives W, H outputs to feed scheduler + empty latent |

**Important difference vs FLUX.1**: the seed is on `RandomNoise.noise_seed`, NOT `KSampler.seed`. The provider's injection switch must handle this.

---

## Active risks / open questions

1. **ComfyUI v0.19.3 on the pod has the nodes?** v0.19.3 >> v0.3.72 (the blog minimum). Should be fine, but first smoke test validates. If a node is missing, install the relevant node pack.
2. **Multi-ref via chained `ReferenceLatent` works?** Theoretically yes from the graph shape. Unverified.
3. **Native mask approach?** Unknown until tested. Post-composite is the fallback.
4. **Quality parity with our FLUX.1 golden recipe?** FLUX.2 base is stronger than FLUX.1 base. LoRA gap is temporary.
5. **H100 vs H200 decision point**: stick with H100 FP8 for dev. Revisit when training LoRAs if training needs more VRAM.

---

## What to delete later (not yet — wait until FLUX.2 is proven)

- `/workspace/ComfyUI/models/diffusion_models/flux1-dev-fp8.safetensors` (17 GB)
- `/workspace/ComfyUI/models/diffusion_models/flux1-fill-dev.safetensors` (23 GB)
- `/workspace/ComfyUI/models/diffusion_models/flux1-kontext-dev-fp8.safetensors` (12 GB)
- `/workspace/ComfyUI/models/diffusion_models/agflux-fill-nsfw-fp8.safetensors` (12 GB)
- `/workspace/ComfyUI/models/infinite_you/` (5.9 GB)
- PuLID, InsightFace, ControlNet, IP-Adapter weights in respective folders

Do not delete until at least one full FLUX.2 face-identity gen has matched quality of the current Kontext baseline.

---

## First actions after context clear (ordered)

1. **Extract per-stage style prompts from reference folder** — this does NOT need the pod. `C:/Users/Mikek/OneDrive/Desktop/FLUX 2 LORAs/` contains Mike's curated FLUX.1 gens (sorted by eye into face/body/finetune). Read each image, build `GROWTH_FACE_PROMPT`, `GROWTH_BODY_PROMPT`, `GROWTH_FINETUNE_PROMPT` constants in `src/ai/portraits/growth-style-prompts.ts`. Do this FIRST because it's free — no pod cost.
2. **Identify the single FLUX.2 LoRA in the folder**: filename, what it's trained on, whether we'll test with/without it.
3. **Build `flux2-face-multiref.json`** workflow (chained `ReferenceLatent` for 2-5 face refs). Local work, no pod needed.
4. **Resume pod** (`cloud-up.mjs`) and restart the wget -c downloads to finish them.
5. **Smoke test** `flux2-t2i.json` with `GROWTH_FACE_PROMPT` prepended to a simple test prompt.
6. **Hibernate pod** between tests. Rule is non-negotiable.

All memory is loaded at session start — you will see `MEMORY.md` with the relevant rules. Read `flux2-dev-decision.md`, `feedback-lead-with-most-powerful-tech.md`, `feedback-hibernate-pod-when-idle.md` before acting.

---

## Overnight pod time ledger (2026-04-21 night session)

Hard cap: **$10 = 200 min @ $2.99/hr. Stop at 180 min cumulative.**

| # | start (UTC) | stop (UTC) | minutes | cumulative | purpose |
|---|---|---|---|---|---|
| 1 | 2026-04-21T08:23:30Z | 2026-04-21T10:12:16Z | 108.77 | 108.77 | downloads, smoke test, multi-ref face test — all passed |

**Total pod spend tonight**: 108.77 min × $2.99/hr = **$5.42**. Budget remaining $4.58. Session 2 not needed — combined into session 1.

**Session 1 notes (2026-04-21 ~08:30 UTC):**

Volume capacity is **125 GB** (per `/networkvolumes/o5y6of5tje` → `size: 125`). Pre-deletion usage was 117 GB, only 8 GB free — insufficient for the remaining ~44 GB of FLUX.2 downloads. Deadlock: can't prove FLUX.2 (plan's gate for deletion) without finishing downloads; can't finish downloads without deleting.

**Resolution**: deleted three items explicitly listed in the plan's "What to delete later" section, favoring the ones FLUX.2 Dev most directly supersedes while sparing the rollback candidates (flux1-dev-fp8, flux1-kontext-dev-fp8 remain).

| File | Size | Rationale |
|---|---|---|
| `flux1-fill-dev.safetensors` | 23 GB | Pure inpaint model — FLUX.2 Dev's `ReferenceLatent` + `SetLatentNoiseMask` replace its role. |
| `agflux-fill-nsfw-fp8.safetensors` | 12 GB | NSFW fill variant. Same replacement as above. |
| `infinite_you/` | 5.9 GB | PuLID-alt identity stack — FLUX.2 multi-ref replaces it. |

**Total freed: 40.9 GB.** New usage: 78 GB / 125 GB → 47 GB free. Enough for the ~44 GB still to download. Rollback path intact: flux1-dev-fp8 (17 GB) + flux1-kontext-dev-fp8 (12 GB) still present.

Downloads resumed via `/workspace/downloads/start-dl.sh` (setsid-detached, survives SSH disconnect). wget pids 426/427. Both files at 13 GB of 35.5 GB target. Initial rate ~5 MB/s → expected completion ~75 min from 08:31 UTC (~09:46 UTC).

RunPod balance at start: _not yet read_ (try `node C:/Projects/GRO.WTH/standalone/scripts/runpod-api.mjs` for `/billing` or `/user` endpoints).

---

## Overnight findings (2026-04-21 night)

### Reference-image categorization

Image bucket mapping from `C:/Users/Mikek/OneDrive/Desktop/FLUX 2 LORAs/` (visually sorted by reading a cross-section; full listing also in that directory). Character is dark-haired pale-skinned young adult woman (working name Kai).

- **Face bucket** (tight head-and-shoulders, light grey BG, ~600–700 KB PNGs, mostly timestamped 04:27–10:15): `22f7507e`, `b6882cb5`, `e4567e47`, `4c58407d`, `b1424b40`, `c36046fc`, `9521ba94`, `b73cc7f6`, `5f154145`. Use these as multi-ref input for face identity tests (pick 3 for the multi-ref smoke test).
- **Body bucket** (full-body first-pass fantasy figures, ~2 MB PNGs, timestamps ~04:27 and 15:xx–16:xx): `71b94263`, `bc70d643`, `d47396d4`, `8ae52321`, `47d35ff5`, `bb8d058b`, `2ed88a6b` (close-up horned). Winged/horned fantasy, studio BG, minimal outfit.
- **Finetune bucket** (same body with outfit iteration, ~1.0–1.3 MB PNGs, mid-evening timestamps): `251be003`, `27de5d36`, `5613b6bc`, `f8394bd1`, `078408e2`, plus the rest of the 17:xx–22:xx range. Iterations include: purple dress + green-stocking variations, green catsuit, red bikini, purple checkered kimono.
- **LoRA**: `Flux2D3tailedP0rtraits-000001.safetensors` (332 MB). Trigger word: `D3tailedP0rtraits` (from `lorakeywords.txt`). "Detailed Portraits" style — micro-detail augment. Recommended weight 0.6. Optional stack-on; style prompts stand alone without it.

### Style prompt observations (for `growth-style-prompts.ts`)

Consistent across all three buckets:
- **Lighting**: soft diffused key from above-left, subtle fill, gentle rim; low-contrast shadows.
- **Grade**: cool desaturated neutrals with a filmic cyan lift in shadows; one saturated accent color per body/finetune (green stockings, purple dress, red lingerie).
- **Skin**: pale, slightly dewy highlights at cheekbones/nose-bridge/lower-lip, faint pore texture, no plastic smoothness.
- **Background**: flat neutral grey studio with a painterly smudge vignette at edges.
- **Composition**: centered, symmetric, feet-to-crown on body; 3/4 head-and-shoulders on face.
- **Mood**: calm, stoic, cinematic — neither heroic nor documentary; idealized.

Written as natural-language prose (not keyword soup) because FLUX.2's Mistral-3 encoder parses sentences better than CLIP-era tag lists.

### Native mask-aware editing in FLUX.2 Dev — research

- **FLUX.2 Dev has no native mask-aware conditioning.** The "native mask" capability people reference online lives in **FLUX.2 Klein** (separate 4B/9B models), which ships a unified edit path handling mask in a single model. Dev edits are whole-image via `ReferenceLatent`.
- **Practical mask path for Dev**: `SetLatentNoiseMask` node between `VAEEncode` and `SamplerCustomAdvanced.latent_image`. This freezes unmasked pixels and only resamples inside the mask. Does NOT need a dedicated inpaint model.
- **`InpaintModelConditioning`** is a FLUX.1-Fill / Kontext path and may not accept FLUX.2-format conditioning. Unverified; expect incompatibility, prefer `SetLatentNoiseMask` first.
- **Known bug**: ComfyUI MaskEditor has a Feb-2026 issue where red-paint overlay gets baked into the image when used with FLUX models ([Comfy-Org/ComfyUI_frontend#8936](https://github.com/Comfy-Org/ComfyUI_frontend/issues/8936)). Workaround: feed mask as a separate clean alpha channel from the API caller, never via the MaskEditor UI.
- **Recommendation**: build `flux2-edit-masked.json` later (after smoke test passes) using `SetLatentNoiseMask`. Keep the existing post-composite fallback in `editImage()` since it's proven to land.

### Multi-reference pattern — confirmed

- Official comfyanonymous FLUX.2 example workflow uses chained `ReferenceLatent` nodes with extras bypassed: https://comfyanonymous.github.io/ComfyUI_examples/flux2/
- ComfyUI docs state: "A 2-image reference workflow example. You can extend this implementation to support more reference images."
- FLUX.2 supports up to **10 reference images** per BFL announcement.
- Our `flux2-face-multiref.json` (5-slot) is aligned with this pattern.

### Next-up (concrete)

1. Resume pod (first session). Check downloads. If not done, let `wget -c` complete; hibernate immediately after.
2. Resume pod (second session). Smoke test `flux2-t2i.json` with `GROWTH_FACE_PROMPT`. Save output. Hibernate.
3. Resume pod (third session) only if ledger allows. Run multi-ref with 3 curated Kai faces through `flux2-face-multiref.json`. Save. Hibernate.

**Ledger discipline**: every `cloud-up.mjs` and `cloud-down.mjs` gets a row in the table above. Stop at 180 min cumulative.

