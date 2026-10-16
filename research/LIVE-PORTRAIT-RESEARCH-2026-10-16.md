# Live Portrait Research — fast edits for wearing / conditions / mood

Date: 2026-10-16 · Read-only research · Author: Claude (research agent) for Mike

**Legend.** `[src]` means a primary or secondary source says it. `[est]` is my own estimate, derived from a sourced number plus a stated assumption. Measure every `[est]` on our own endpoint before anyone relies on it.

**Anchor from our own memory.** The current lane runs Qwen-Image-2.1 at 25 steps on an RTX PRO 6000 96 GB. It takes **15–16 s per 1024² edit** and **8 s bare** (`memory/ruling-switch-to-qwen-image-2-1-2026-10-13.md`). The serverless endpoint `qr4r1dkgw3uyhf` has had **1–3 min cold starts** in practice (`memory/serverless-portraits-2026-08-08.md`).

---

## 0. Two facts that change the plan (read first)

1. **Qwen-Image-2.1 is research-only, and so are its Lightning and Turbo derivatives.** The licence grants use "FOR NON-COMMERCIAL PURPOSES ONLY". A commercial grant has to be requested by email (model-business@notice.qwencloud.com), and no price or process is published.
   - Sources: https://techaiwire.com/articles/qwen-research-license-explained/ · https://www.orcarouter.ai/blog/qwen-image-2-1-turbo-vs-z-image-turbo · https://huggingface.co/Qwen/Qwen-Image-2.1/blob/main/LICENSE
   - Memory already records this as licence debt. The new part is scale: a live portrait multiplies the number of Qwen-2.1 calls by about 100×. The commercial-licence question therefore stops being a pre-launch formality and becomes the main gating issue.
   - Apache-2.0 fast-edit fallbacks:
     - **FLUX.2 [klein] 4B**: https://huggingface.co/black-forest-labs/FLUX.2-klein-4B
     - **Qwen-Image-Edit-2511** (Apache-2.0, the older Qwen line): https://huggingface.co/Qwen/Qwen-Image-Edit-2511
     - **Z-Image Turbo** (Apache-2.0, but it generates only; Z-Image-Edit is still unreleased): https://github.com/Tongyi-MAI/Z-Image
2. **Two pieces of the v1 recipe are tied to Qwen-2.1 at full step counts.**
   - The ink pass happens mid-generation. With a 4-step schedule (sigmas 1.0 / 0.75 / 0.5 / 0.25) there is no real "middle" to inject ink into. My guess is that ink would have to go at step 2 of 4, or be a separate 1–2 step low-denoise pass. That needs a test.
   - grwthpaint_v1 is a Qwen-2.1 LoRA. It will not load on klein or Qwen-Edit-2511, so any switch means retraining. Precedent: our v1 run cost about $3.70. A klein 4B LoRA takes about 60 min on one 4090 (https://huggingface.co/blog/black-forest-labs/flux-2-klein-lora).

---

## 1. Fastest options for an EDIT of an existing portrait

| Model | Steps | Speed (sourced) | 832×1040 edit, warm [est] | Refs / identity | Local edit / mask | Licence | Style LoRA rides? |
|---|---|---|---|---|---|---|---|
| **Qwen-Image-2.1 + LightX2V Lightning LoRA** | 4 (vs 40) | "12–25× speedup"; 4090 t2i bf16 0.62 s/step at 1024², INT8 0.148 s/step | PRO 6000 / H100 ≈ 2.5–3.5 s · 4090 (fp8/INT8) ≈ 2–4 s · L40S ≈ 3–5 s · A10G/L4 ≈ 8–15 s (24 GB: offload) | Up to 10 reference images, identity preservation | Circles, painted annotations, or a **separate mask** | **Research / NC** | Yes, it stacks (Lightning is itself a LoRA). Stacked strength is untested |
| **Qwen-Image-2.1-Turbo** (9 Oct 2026) | 8 | No public benchmarks; prefix KV cache reuses text and ref context | ≈ 2× Lightning | Same as base | Same as base | **Research / NC** | Probably; unverified |
| **Qwen-Image-Edit-2511 + Lightning** | 4 | "≈10× vs 40-step"; up to ≈42× with FP8 + LightX2V; unoptimised H100 ≈ 15 s at full steps | H100 fp8 ≈ 3–5 s (20B model) | Multi-image; improved character consistency | Instruction edit, no native mask (paste-back needed) | **Apache-2.0** | Yes (Qwen-Image LoRAs) |
| **FLUX.2 [klein] 4B (distilled)** | 4 | H100 t2i 1024²: **0.57 s**; 512²: 0.19 s; "under 0.5 s on modern hw"; GB200 ≈ 0.3 s | 4090 ≈ 1–1.5 s · L40S ≈ 1–1.5 s · H100 ≈ 0.7–1 s · L4 ≈ 3–5 s · A10G ≈ 2.5–4 s | Multi-reference editing in one model | Edit-LoRA training mode for inpaint/mask tasks | **Apache-2.0** | Yes. Train on Base 4B, load on distilled |
| **FLUX.2 [klein] 9B** | 4 | GB200 ≈ 0.5 s | ≈ 1.5–2.5 s on 4090 | Multi-reference | As 4B | **FLUX Non-Commercial** | Yes |
| FLUX.1 Kontext dev / schnell | 20+ / 1–4 | n/a | Kontext ≈ 6–10 s on 4090 | Kontext: one ref | Instruction | Kontext: FLUX NC; schnell: Apache (no edit) | Yes |
| SDXL-Lightning / Hyper-SD / LCM | 1–8 | 4090 ≈ 0.5 s at 4 steps, 1024²; 3060 ≈ 2 s | ≈ 0.4–0.6 s on 4090 | IP-Adapter / InstantID ecosystem | Mature inpainting | OpenRAIL++-M (commercial OK) | Yes (SDXL LoRA, retrain) |
| SD3.5 Large Turbo | 4 | n/a | ≈ 2 s on 4090 | Weak | Weak | Stability Community (free under $1M revenue) | Yes |
| Z-Image Turbo (6B) | 8 | 4090 ≈ 2.3 s at 1024² | ≈ 2 s | **No edit** (Z-Image-Edit "to be released", missed Q1 2026) | img2img only | Apache-2.0 | Yes |

How I scaled the estimates: L4 ≈ 1/3, A10G ≈ 1/2.5, L40S ≈ 0.9×, H100 ≈ 1.5–2× of a 4090 for diffusion DiTs. Edit mode costs about 1.3–2× t2i per step because of the extra reference-image tokens; the Lightning card sets `use_kv_cache=False`. A 24 GB card cannot hold Qwen-2.1 in bf16 (7B DiT plus 8B VL encoder) without fp8/INT8 or offload.

Sources:
- https://huggingface.co/lightx2v/Qwen-Image-2.1-Lightning (4-step, edit plus multi-reference code, sigmas)
- https://huggingface.co/Qwen/Qwen-Image-2.1 (10 refs, masks, RGBA)
- https://github.com/umag/qwen-image-rs (4090 s/step table: 6.07 s per 40-step image in resident INT8 mode; VAE decode 0.13–0.27 s)
- https://huggingface.co/lightx2v/Qwen-Image-Edit-2511-Lightning
- https://huggingface.co/Qwen/Qwen-Image-Edit-2511
- https://bfl.ai/blog/flux2-klein-towards-interactive-visual-intelligence
- https://inferencebench.io/blog/flux2-klein-4b-image-generation-benchmark/
- https://huggingface.co/blog/black-forest-labs/flux-2-klein-lora
- https://ucstrategies.com/news/sdxl-lightning-speed-benchmarks-4-step-setup-lora-guide-2026/
- https://www.orcarouter.ai/blog/qwen-image-2-1-turbo-vs-z-image-turbo
- https://github.com/Tongyi-MAI/Z-Image/issues/169

---

## 2. Cost per image on serverless

**RunPod Serverless flex rates (pricing page updated 8 Oct 2026)** [src: https://www.runpod.io/pricing]

| GPU | $/hr | $/s |
|---|---|---|
| L4 / A5000 / 3090 | 0.69 | 0.000192 |
| 4090 PRO | 1.10 | 0.000306 |
| 5090 | 1.58 | 0.000439 |
| L40S / 6000 Ada | 1.75 | 0.000486 |
| A100 80 GB | 2.72 | 0.000756 |
| RTX 6000 Pro 96 GB | 3.49 | 0.000969 |
| H100 PRO | 4.79 | 0.001331 |

- Active (always-on) workers are 20–32% cheaper [src: https://www.spheron.network/blog/runpod-h100-pricing-2026/].
- **Modal:** L4 $0.000222/s · A10 $0.000306/s · L40S $0.000542/s · H100 $0.001097/s. Pinning a region adds a 1.5–1.75× multiplier [src: https://www.spheron.network/blog/modal-gpu-pricing-2026-per-second-billing/].
- **Replicate** (private deployment): L40S $0.000975/s · H100 $0.001525/s [src: https://www.spheron.network/blog/replicate-pricing-2026-per-second-cost/]. Modal and Replicate custom containers are our code on rented GPUs, the same class as RunPod. Whether that counts as "company compute" is Mike's call.
- **Cold starts:**
  - RunPod advertises FlashBoot "as low as 500 ms, P90 < 2.0 s" [src: https://www.runpod.io/blog/serverless-gpu-cold-starts-flashboot].
  - FlashBoot only helps when a recently-idle worker is still retained. A true cold start is 30 s to 2 min or more [src: https://www.premai.io/blog/serverless-llm-deployment-runpod-vs-modal-vs-lambda-2026/]. Our endpoint has measured **1–3 min**.
  - Conclusion: during a session the worker has to stay warm, so latency planning cannot assume cold starts.

### Cost table: 20 characters × 30 changes = 600 edits per session (assume a 4 h session)

| Lane | Seconds per edit (warm) | $ per edit | 600 edits, busy-seconds only | 4 h with one worker held warm |
|---|---|---|---|---|
| Today: Qwen-2.1, 25 steps, PRO 6000 | 15.5 [src: memory] | $0.0150 | **$9.00** | $13.96 (and the queue backs up: 600 × 15.5 s = 2.6 h of GPU) |
| Qwen-2.1 + Lightning 4-step, PRO 6000 | ≈ 3.0–3.5 [est] | $0.0029–0.0034 | **$1.75–2.04** | $13.96 |
| Qwen-2.1 + Lightning, H100 | ≈ 2.5–3.0 [est] | $0.0033–0.0040 | $2.00–2.40 | $19.16 |
| Qwen-Edit-2511 + Lightning fp8, H100 (Apache) | ≈ 3–5 [est] | $0.0040–0.0067 | $2.40–4.00 | $19.16 |
| klein 4B 4-step, 4090 (Apache) | ≈ 1.0–1.5 [est] | $0.0003–0.0005 | **$0.18–0.28** | **$4.40** |
| klein 4B 4-step, L4 | ≈ 3–5 [est] | $0.0006–0.0010 | $0.35–0.58 | $2.76 (but too slow) |
| Same Qwen-Lightning lane on Modal H100 / Replicate H100 | ≈ 3 [est] | $0.0033 / $0.0046 | $1.98 / $2.75 | $15.80 / $21.96 |
| Tier 0 client warp + overlays | 0 GPU | $0 | $0 | $0 |
| LivePortrait expression frame, 4090 | 0.013 [src] | ≈ $0.000004 | ≈ $0.002 | (shares the warm worker) |

**What the table means.**
- 600 edits in 4 h is about one edit every 24 s. At that rate the worker never reaches its idle timeout. **Real cost is the number of GPU-hours a worker is held warm, not the cost per image.**
- On one warm GPU, the realistic bill is **$4–20 per session**, depending on which GPU we pick, and per-image cost hardly matters.
- The levers that actually save money:
  1. Debounce and coalesce state changes. Five changes inside 10 s become one edit.
  2. Cache rendered states by hash.
  3. Pre-render in idle time.
  4. Use a 24 GB card with klein, or share one warm worker across several tables.
- **Throughput limit:** one warm worker handles about 1,000–1,200 Qwen-Lightning edits per hour, or 2,500–3,500 klein edits per hour [est]. One worker easily covers a 20-character table.

---

## 3. Near-zero-cost layers

**(a) Expression: LivePortrait (KlingAIResearch / KwaiVGI)**
- Speed: **12.8 ms per frame on an RTX 4090**. FasterLivePortrait with TensorRT runs at 30+ FPS on a 3090, pre- and post-processing included. Apple MPS is about 20× slower than a 4090. Explicit retargeting controls exist for eyes, lips, and head pose.
- Licence:
  - The code is MIT.
  - The **InsightFace buffalo_l detector weights are non-commercial**. The repo's own advice is to replace them, for example with MediaPipe (Apache) or face-alignment.
  - Kling's own model weights are a separate licence. Verify it before shipping.
- Quality risk: it was trained on photoreal video. On painted, ink-lined faces the warp can smear linework or bend the frame edge. That needs a test on Tara's base.
- Practical use: render a **mood keyframe set** server-side once per base (neutral, weary, grim, grieving, afraid, angry, amused, pained), about 8 stills at roughly $0.00003 total. Ship them to the client and crossfade there. Running the full model live in the browser through ONNX Runtime Web is possible, but it means a heavy download and does not help a still portrait.
- 2026 successors are diffusion-based and heavier: PersonaLive (CVPR 2026), and "Proxy Avatar + Low-Rank Caching" (arXiv 2608.01978, emotion-controllable and real-time, but audio-driven). Neither beats LivePortrait for single still keyframes.
- Sources:
  - https://github.com/KlingAIResearch/LivePortrait
  - https://github.com/kijai/ComfyUI-LivePortraitKJ (InsightFace note)
  - https://huggingface.co/spaces/AndroidGuy/FasterLivepotrait/blob/main/README.md
  - https://github.com/GVCLab/PersonaLive
  - https://arxiv.org/abs/2608.01978

**(b) 2D paperdoll compositing (client-side canvas / WebGL)**
- **Works well for:**
  - Wounds, blood, bruises, bandages, dirt, sweat, and pallor or illness tints, as decals inside body-region masks.
  - Tiredness: under-eye shading, desaturation, a vignette.
  - Small accessories that sit on top of the figure.
- **Works badly for:** whole garments. Every character has a different build and the pose lock is not pixel-identical, so garments need cloth folds, occlusion, and ink linework drawn to that body. Composited garments look pasted on.
- **Qwen-Image-2.1 generates native RGBA transparent layers** [src: model card]. In-style decals can therefore be painted once per item or per wound type with the v1 recipe and reused for every character. The pose skeleton lock gives the region anchors, and each character needs its own body-region masks.
- Cost: about $0 per change, under 16 ms.

**(c) Latent caching / low-denoise img2img**
- Caching the base's VAE latent saves only the encode step, about 0.1–0.3 s.
- Starting a 4-step schedule at sigma 0.5 (img2img) runs 2 steps instead of 4 and roughly halves the denoise cost. That is enough for mood or grime tweaks and **cannot change clothing structure**.
- Qwen-2.1's "prefix KV cache" reuses text and reference context *across steps*. Whether it carries across *requests* is not documented, and the Lightning card disables it.
- Verdict: this is a small (≤ 2×) win, not a separate tier.

**(d) State-matrix pre-render**
- Key every rendered image by `hash(baseId, sorted equipped-visible items, wound regions bucketed, condition bucket, mood bucket)`.
- Fill the cache in idle time, i.e. between sessions or when the worker is warm and the queue is empty:
  - per character: about 3 likely outfits × 8 mood keyframes ≈ 24 stills ≈ $0.07–0.10 on Qwen-Lightning, or about $0.01 on klein [est];
  - mood keyframes come from LivePortrait, which costs nothing.
- Serve from object storage or a CDN (our storage, not a third party).
- During play, states repeat (combat kit, travel clothes, camp), so the hit rate should be high. A cache miss falls back to Tier 1.
- A full matrix is impossible: N items to the power of slots explodes. Pre-render only the *likely* combinations.

---

## 4. Identity and style consistency under fast edits

- **Always edit from the BASE plus the FACE/BODY references. Never chain edits off the previous edit.** Chained edits drift, and 30 changes compound into a different person. Qwen-Edit-2511's changelog specifically lists "mitigate image drift" (https://huggingface.co/Qwen/Qwen-Image-Edit-2511).
- **Masked edit plus pixel paste-back is the strongest identity lock:**
  - Edit only the torso or legs region with a mask (Qwen-2.1 has native masks; for Edit-2511 or klein, crop and inpaint).
  - Composite the result back into the base with a feathered alpha mask.
  - The face stays **bit-identical** for any clothing or wound change below the neck.
  - Only mood touches the face, and that goes through LivePortrait (pixel warp, so style is preserved) or a face-only masked edit.
- **Reference-conditioned edit models** (Qwen-2.1 with 10 refs, Edit-2511, klein multi-reference) hold identity well for single edits, but each call slightly repaints the whole frame: linework, ink, and colour cast shift. Use them inside a mask, not for full-frame edits.
- **A per-character LoRA** is the most robust but too slow and costly at scale: 20+ characters, a training run each, and LoRA swapping per request. Do not do it. Keep PuLID-style identity adapters for Tier 2 only.
- **Keeping a style LoRA on a distilled model:**
  1. Train it on the undistilled base and load it onto the distilled model. BFL recommends exactly this for klein.
  2. For Qwen, stack the Lightning LoRA with grwthpaint_v1. Expect to re-tune the 0.7 strength, because distillation LoRAs shift the style response.
  3. Lock the ink pass as a step-index injection, or as a 1–2 step low-denoise final pass, and A/B it against the 25-step v1.
  4. The paste-back means the style LoRA only has to match *inside the mask*, which is a lower bar.

---

## 5. Architecture recommendation (3 tiers)

**Tier 0: instant, client-side, $0, under 50 ms**
- *Mood:* crossfade between pre-rendered LivePortrait keyframes (8 per base, made at base-approval time).
- *Conditions:* wound, blood, bandage, and dirt decals (RGBA, painted once in v1 style) composited into per-character body-region masks, plus CSS/WebGL tint for tiredness and illness.
- *Quality loss:* moderate. Decals can look applied, and warps on painted faces may smear ink. It is honest about state but not "repainted".
- *Failure modes:*
  - decal misregistration when the build differs from the template;
  - LivePortrait landmark failure on stylised or non-human faces (fall back to the neutral still);
  - InsightFace licence (swap it out).

**Tier 1: about 1–4 s, $0.0003–0.004 per change. Clothing/equipment changes, and bakes Tier-0 decals in properly**
- *Pick, for now (non-commercial dev):* Qwen-Image-2.1 + Lightning 4-step + grwthpaint_v1 + ink. It is the same family as the base, so the style matches and nothing needs retraining. It runs as a **masked region edit with paste-back** at 832×1040 on the warm PRO 6000 or H100, ≈ 2.5–3.5 s [est].
- *Pick, for production (commercial):* FLUX.2 klein 4B (Apache), with grwthpaint retrained on klein Base 4B (≈ 1 h on a 4090), ≈ 1–1.5 s on a 4090 [est].
- *Middle option:* Qwen-Edit-2511 Lightning (Apache), if klein's quality on painted styles disappoints.
- *Front-end:* debounce 5–10 s, coalesce the queue per character, check the state-hash cache first, and show Tier-0 immediately while Tier-1 renders.
- *Quality loss:* the 4-step result is visibly softer than 25 steps. The LightX2V card's own comparisons show it close on edits, with some lost detail. Paste-back hides most of this outside the mask.
- *Failure modes:*
  - seams at the mask border (needs feathering and a 1-step harmonise);
  - garment hallucination when an item has no visual reference (feed the item's image as a ref);
  - style drift with stacked LoRAs;
  - worker contention when several tables share one worker.

**Tier 2: full repaint, rare, 15–40 s, ≈ $0.015–0.05. New base, scene or lighting change, age or body change, approval-grade art**
- Today's full v1 recipe: 25 steps, LoRA 0.7, ink 0.8.
- It becomes the new base, and Tier 0 and Tier 1 then key off that base.
- Run it in the background and never block play on it.

**What "instant" actually buys.** Only Tier 0 is truly instant, and only for things that can be drawn *on top of* the base (mood, marks, tints). Anything that changes silhouette or clothing needs a model, so the realistic best is about 1–3 s warm. That is only possible if a worker is held warm for the session at $4–20 for 4 h; with cold starts the delay is 1–3 min. A good UX is: Tier 0 now, Tier 1 swaps in a few seconds later, and Tier 2 is never awaited.

---

## What I would build first (≤ 15 lines)

1. Put a **state-hash render cache** (base + visible items + wound buckets + mood bucket → image URL) in front of everything. Tiers 0, 1 and 2 all read and write it.
2. Run a **Tier-1 spike on the existing endpoint:** add the LightX2V Qwen-2.1 Lightning LoRA and keep grwthpaint_v1. Do one masked torso edit on Tara at 4 steps with paste-back. Measure seconds, test the ink at step 2, and A/B the result against 25 steps for Mike's eye. This is about $0.10 of GPU time; ask before spending.
3. In parallel, run a **licence spike:** train grwthpaint on FLUX.2 klein Base 4B (≈ 1 h on a 4090, a few dollars) and A/B the same edit. This is the commercial-safe exit if Alibaba's commercial licence is costly or never answered.
4. Build **Tier-0 conditions:** paint about 6 RGBA wound and grime decals with the v1 recipe, add per-character body-region masks from the pose skeleton, and composite on a client canvas.
5. Build **Tier-0 mood:** generate 8 LivePortrait keyframes per approved base, with InsightFace replaced by MediaPipe, and crossfade. Test it on painted faces first; if the ink smears, use face-masked Tier-1 edits for the 8 keyframes instead.
6. Set a **session warm-worker policy:** the GM's "start session" call raises workersMin to 1, and session end lowers it to 0. Budget about $5–15 per 4 h session.
7. Leave Tier 2 exactly as it is today.
