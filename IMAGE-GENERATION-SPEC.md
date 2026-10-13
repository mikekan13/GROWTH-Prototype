# GRO.WTH Image Generation Spec

**Status:** DRAFT for Mike to cement · 2026-10-13. Sources: memory files (cited by name) + `app/src` at 3e95e8d. Where memory conflicts, newer wins and both dates are listed.

## 1. Purpose

What images a character gets, how each is made, what the user supplies, and what is undecided. The designer rehaul builds against this file. Covers character images only (locations and battlemaps: `ai-image-generation-pipeline-2026-06-02`).

## 2. Outputs

| Output | Purpose | Size / ratio | When generated | Where shown | Status |
|---|---|---|---|---|---|
| **Face candidate** | Identity discovery; the user picks one, which becomes the locked face | 1280×1280 (1:1) | Designer step "Face", repeatable | Wizard only | BUILT |
| **Locked face** | Identity anchor for every later step (`PersonaLock.referenceImagePath`) | 1280² | When the user picks a face ("perfect" grade) | Wizard, Lock summary | BUILT |
| **Body** | Full-length A-pose, identity-matched | 1024×1792 canvas (provider forces it; request says 1536) | Designer step "Body" | Wizard | BUILT |
| **Finetune layers** | Iterative edits on the body: clothes, hair, mods, masked fixes, pulling in an object reference | Same as source | Designer step "Finetune" | Wizard | BUILT, loop UNFINISHED |
| **Official bust ("Portrait")** | The character's canonical portrait; marks the image as done for completion | 1280² | "Lock Identity & Generate Portraits" | Visual Identity panel → `data.identity.generatedBust` | BUILT |
| **Official full body** | Canonical body | 1024×1792 | Same click, after the bust | Shown in the frame labelled **"Token"** → `data.identity.generatedFullBody` | BUILT |
| **Canvas token / avatar** | Card and graph image | Circle crop of `Character.portrait` | Not generated. It reads `Character.portrait` | `RelationsCanvas`, `CharacterCard`, `FolderGroup` | OPEN |
| **5 angles** | Formerly identity refs | — | Gated by `false &&` | — | DECIDED: ABANDONED (`portrait-pipeline-true-state-2026-07-11`) |
| **Identity test shots** | Outfit/pose previews | various | Unreachable | — | DEAD PATH |
| **Generated reference set → identity LoRA** | Permanent likeness (10–20 variations of the accepted character) | — | After finetune | Invisible | DECIDED, NOT BUILT (`serverless-portraits-2026-08-08`) |
| **Live / state-reactive portrait** | Wounds, gear and mood shown on the portrait | — | — | — | OPEN (`portrait-pipeline-true-state-2026-07-11`, `character-pipeline-vision`) |

## 3. Pipeline per output

**Common stack:** FLUX.2 Dev **`flux2_dev_fp8mixed`** UNet, Mistral-3-small FP8 text encoder, FLUX.2 VAE, ComfyUI on RunPod Serverless **`growth-portraits` = `qr4r1dkgw3uyhf`** (worker-comfyui 5.8.6, volume `o5y6of5tje`, scale-to-zero, workersMax 1). `ServerlessProvider` (`ai/portraits/providers/serverless.ts`) swaps only the transport of `LocalProvider` (`providers/local.ts`) and is selected when `RUNPOD_ENDPOINT_ID` is set. Refs go in as 1024px data-URLs; results come back base64 into `public/portraits/`.
- **Identity method:** FLUX.2 native multi-reference (`LoadImage → ImageScaleToTotalPixels → VAEEncode → ReferenceLatent` chain, up to 5 slots in `workflows/flux2-face-cloud.json`). There is **no PuLID or InfiniteYou in the live path**.
- **Style method:** prompt language only. No style LoRA is loaded. The only LoRA is `Flux2TurboComfyv2` at strength 0 (turbo lever: 8 steps when on). Auto style/pose refs are disabled (`styleRefCount = 0`, an OOM workaround).
- **Prompt rules:** prose, not tag soup; no negative prompts (the negative is sent empty); describe what you want (`feedback-flux-no-negatives`, `flux2-environment-prompting-2026-08-02`). FLUX.1 trigger words are retired. Reuse the vocabulary, not the triggers (`portrait-face-lock-golden-recipe`).
- **Defaults (golden config):** 20 steps, guidance 4.0, 1280², turbo OFF, all uploaded refs (`serverless-portraits-2026-08-08`).

**Face** (`generateFaceFlux2`, `local.ts` ~870–1220). Identity refs = uploaded photos only. Pass-1 default prompt: "A photograph of the person in image references 1-N. Match their exact facial identity… Do not invent, average, or embellish features," head-and-shoulders on plain mid-grey. Optional Pass 2 (off by default) is a style render, but its `{style}` slot is empty because no style refs are wired. **Post-processing:** RMBG-1.4 (`ai/portraits/rmbg.ts`, CPU, cached `.clean.png`) strips each uploaded ref before upload; outputs get none.

**Body** (`generateBodyFlux2`, `local.ts` ~1240–1370). The single identity ref is the **locked face**, encoded at 0.25 MP so its framing does not take over the tall canvas. The prompt comes from `buildBodyPrompt`: a full-length painted illustration, A-pose, margin above the head and below the feet, plus physical description, measurements and underclothing. Underclothing is inferred from the genome by `style-profile.ts` when left blank. Nude only when creation mode AND the mature toggle are on.

**Finetune** (`/api/portraits/edit` → `LocalProvider` edit, `local.ts` ~600–780). Three workflows: `flux2-edit-reference` (whole image), `flux2-edit-masked` (painted mask), `flux2-edit-with-refpull` (uploaded object ref). Guidance defaults to 5.0. Each edit takes the latest layer as its source. "Bake" does nothing on FLUX.2.

**Official bust + full body** (`generateFinalAndLock`, `useGeneration.ts` ~300): two fresh generations from the **locked face + locked seed** (`composition: bust`, then `full_body`), followed by `/api/portraits/lock`.

**Gates** (`app/api/portraits/generate/route.ts`): seed set (`assertSeedSetForPortrait`) and genome ≥40 chars, else 400 "write the story first".

## 4. Inputs

- **User supplies:** reference photos of a real person via `/api/references` (JPEG/PNG/WebP ≤50 MB, stored as JPEG ≤2048px). These are the only identity source during capture (`pulid-uploads-only-rule`). Finetune optionally takes an uploaded object ref and a painted mask. Entity images themselves are always generated, never uploaded (`ai-image-generation-pipeline-2026-06-02`).
- **From the character record:** seed (gates generation; species decides composition per `seed-body-structure`), age, sex, physical description, skin, eyes, hair, measurements (height excluded), underclothing override, style colors and aesthetics, mature-content toggle. `/api/references/describe` can draft body-part descriptions from a photo, using **local vision only** (wall ruling).
- **From JEWL/genesis:** the backstory (genome) is a hard prerequisite (`character-genesis-pipeline-2026-08-08`). `style-profile.ts` derives era, underclothing, garment norms and materials from it, and typed overrides always win. Appearance is separate from genesis: the user works on it while JEWL builds (`ruling-genesis-is-a-dialogue-jewl-prods-gm-2026-10-12`).

## 5. Flow / UX contract (as built)

Entry: CharacterTab → Visual Identity → **Lock Identity / Relock Identity** (disabled until a seed is chosen) → `IdentityLockWizard`. The step rail reads **Face → Body → Finetune → Lock**. A Custom Prompt panel (Pass 1/2 prompts, ref specs "all"/"1,3", guidance, turbo, batch count) sits above every step.

1. **Face (required).** Generate candidates from the uploaded refs (each regen = new seed). Grading one "perfect" sets `lockedFace` + `lockedSeed` and advances.
2. **Body (navigable, not technically required).** Generated from the locked face. Pose, seed and denoise levers are optional.
3. **Finetune (optional).** Chain edits; undo, reroll, saved layers and saved masks (localStorage); Accept or Skip both go to Lock.
4. **Lock (required).** "Lock Identity & Generate Portraits" makes the official bust and full body, calls the lock API, then `onComplete` writes `generatedBust` / `generatedFullBody` to `Character.data.identity`.

**Lock semantics:** permanent until relock, which bumps `PersonaLock.lockVersion` and keeps `previousLockId`. Completion = Born AND image done, where image done means `Character.portrait` or `data.identity.generatedBust` exists (`services/character-completion.ts`). Before that the character is "awaiting image": active, not blocked. **Placement (ruled 10-13):** the designer lives in the Tapestry entity view's **Appearance** section (photos, physical identity, style, Finetune visible, portrait/token). No whole-character stage rail (`ruling-tapestry-is-the-making-place-kitchen-metaphor-2026-10-13`).

## 6. Rules already ruled

- FLUX.2 Dev is the sole model family. Commercial license is a pre-launch debt (`flux2-dev-decision`, `license-debt-identity-stack`).
- Image generation is serverless. No pod wake/park (`serverless-portraits-2026-08-08`).
- The golden face config is the shipped default; do not "improve" it without an A/B against the reference (`portrait-face-lock-golden-recipe`, `serverless-portraits-2026-08-08`).
- Identity capture uses uploaded photos only. Generated images never feed back during capture. Body and final may anchor on the locked face (`pulid-uploads-only-rule`).
- Never use a styled output as an identity anchor on regen (`style-compounding-in-pulid-chain`).
- Identity capture looks like an unretouched real person; styling comes later (`identity-capture-real-person-aesthetic`).
- No negative prompts; positive phrasing only (`feedback-flux-no-negatives`).
- Same LoRAs at the same weights in every step (`feedback-consistent-lora-weights`); local and cloud look the same, cloud = speed only (`local-cloud-output-parity`).
- 5 angles abandoned; do not resurrect without Mike (`portrait-pipeline-true-state-2026-07-11`).
- Likeness → body → finetune → generated reference set → per-character identity LoRA, plus ONE global GROWTH style LoRA (`serverless-portraits-2026-08-08`, 2026-08-08). This **supersedes** "style = blend, prompt-first" (`growth-style-is-blend-not-lora`, 2026-04-21) pending an A/B.
- Body is one cohesive full-body generation: no compositing or outpainting (`body-pipeline-actual-approach`).
- No image until a seed and a genome exist; clothing is inferred from who the character is (`character-genesis-pipeline-2026-08-08`, seed-first 2026-10-12).
- Born ≠ done: the portrait step finishes completion (`ruling-genesis-is-a-dialogue-jewl-prods-gm-2026-10-12`).
- Finetune stays visible in the redesign; "endpoint paused" shows as a plain error (`STATE-OF-PLAY-2026-10-12`, tapestry ruling 10-13).
- Reference-photo descriptions stay local (wall, `docs/ai_systems.md`).
- *Historical only* (`portrait-pipeline-backlog`): 7-stage plan, per-ref stage tagging, re-lock events.

## 7. OPEN — [QUESTION Mike]

1. Which outputs must exist before the image counts as "done": bust only (today's code), or bust + full body + finetuned look?
2. Is the "Token" a crop of the official bust, the full body (what the frame shows today), or a separate generation with its own size and framing?
3. Should the official bust and full body be generated FROM the finetuned image, or keep regenerating from the locked face (which drops finetune edits)?
4. Is Finetune a step every user walks through, an optional power tool, or GM-only?
5. Do NPCs (sketch tier, JEWL-drafted) and non-humanoid seeds use this same designer, a one-click auto path, or no image at all?
6. When the identity LoRA lands, does training run automatically after Lock, or as a separate step the user confirms (and who pays the ~25 min of compute)?
7. Which tuning levers stay user-visible (pass 2, turbo, guidance, ref specs, seeds, LoRA sliders) and which become hidden defaults?
8. What does relocking mean once a character is in play: the face only, or a full redo that replaces the bust, body and token?

## 8. Code reality gaps

- A paused endpoint's 409 `ENDPOINT_PAUSED` is swallowed: `generateFaceFlux2` catches it and returns null, and the route answers 500 "flux2-face pipeline returned null — see server logs". The user never sees the real cause.
- The wizard never sets `Character.portrait`. Creation-mode generations write no `PortraitGeneration` rows, so the lock call's `history[0]` is usually empty and the lock is skipped quietly. Canvas cards read `Character.portrait`, so a finished designer image may not reach the canvas.
- The official bust and body regenerate from `lockedFace`, which **discards all Finetune work**.
- The "Token" frame shows `generatedFullBody`. No token artifact exists.
- Identity LoRA + global style LoRA ruled (08-08), not built. Only turbo (strength 0) is loaded; `useTuning.ts` LoRA sliders are sent and do nothing.
- Dead (no importers): `growth-style-recipe.json`, `providers/cloud.ts`, `workflow-catalog.ts`, `pose-generator.ts`, `ref-enhance.ts`, `components/character/{PortraitPanel,FrontLockPanel,FaceRefinementPanel,FaceCropModal}.tsx`. Unreachable: `IdentityTestStep`, `AngleSteps`. Legacy pod path: `pod-client`, `pod-keepalive`, `/api/portraits/pod`.
- Size overrides are ignored: the client sends 1024 for faces (renders 1280²), and the provider forces body from 1536 to 1792.
- RMBG-1.4 warns `Unsupported model type "SegformerForSemanticSegmentation"` and falls back to unprocessed refs, so the background strip is effectively off (`serverless-portraits-2026-08-08`).
- `PersonaLock` still writes inert PuLID-era fields (`pulidWeight`, `loraStrength`). `docs/ai_systems.md` still describes the PuLID Phase A design.
- Tuning state (prompts, levers, finetune layers, masks) lives only in per-browser localStorage, not per character.
- Memory says FP16 (`flux2-dev-decision`); code runs `flux2_dev_fp8mixed`.
