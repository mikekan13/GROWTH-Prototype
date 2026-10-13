# GROWTH image style — vocabulary extracted from Mike's references (2026-10-13)

Source: `style-refs/inbox/Old Gens/` (55 images from the first image designer, Mike: "really close to
what I want") and `style-refs/inbox/*.png|jpg` (6 older GROWTH images, Mike: "not quite there but close").
Contact sheets in `style-refs/sheets/`.

## What the "really close" set has in common (the target)

**Medium / finish**
- Semi-realistic painterly digital concept art. Reads as a painted illustration, not a photo and not a
  3D render. Skin is porcelain-smooth with a soft matte sheen and almost no pore texture.
- Visible brushwork where the figure meets the background: hair tips, fabric edges and feathers dissolve
  into loose strokes (lost edges). Faces and eyes are the sharpest point; everything else is softer.
- Matte, slightly dusty surface. No gloss, no lens bloom, no chromatic aberration.

**Backdrop / presentation**
- Flat studio backdrop: neutral grey-taupe, mottled like plaster or toned paper, faint paint smudges
  and a soft ground shadow under the feet. No environment, no props, no horizon.
- Character-sheet presentation: figure centred, full height with margin above the head and below the
  feet; hands-on-hips or A-pose; busts are head-and-shoulders, centred, bare shoulders, soft vignette.

**Light**
- Soft, frontal, diffuse light with a gentle top key. No hard shadows, no rim-light drama, no
  chiaroscuro. Shadows are cool grey, not black.

**Palette**
- Desaturated cool-neutral greys carrying ONE or two saturated accents (lilac / royal purple,
  forest green, bone white, dried-blood red). High value contrast: pale skin against black hair and
  dark eye make-up.

**Figure / face**
- Idealised, symmetrical, slightly doll-like features; large glassy eyes with smoky dark lids; soft
  full lips; porcelain skin. Stylised toward "painted portrait", not photographic likeness.
- Fantasy elements (horns, wings, plaster-cracked skin, grime streaks) are rendered in the same
  painterly, matte, dusty way.

## What the "not quite there" set gets wrong
- 3D-render / photo-composite look (plastic skin, CG lighting, lens depth of field).
- Full environments and props competing with the figure.
- Photographic colour and contrast. The one closest is Val: painterly moon backdrop, soft light.

## Prompt-ready phrasing (prose for T5, tags for CLIP-L)
- "A painterly digital character illustration, semi-realistic, matte finish."
- "Flat mottled grey studio backdrop like toned paper, faint paint smudges, soft ground shadow."
- "Soft diffuse frontal light, gentle top key, cool grey shadows, no hard shadows."
- "Porcelain-smooth skin with a soft matte sheen; hair and fabric edges dissolve into loose brushwork."
- "Desaturated neutral palette with one saturated accent colour."
- "Large glassy eyes with smoky dark lids; idealised symmetrical features."
- Avoid in prose (FLUX reads negatives poorly; describe what you want instead): photo, 3D render,
  lens bokeh, chromatic aberration, chiaroscuro, environment.

## Retired
- FLUX.1 LoRA triggers `ckpf`, `aidmafluxpro1.1`, `drkfnts style` — the LoRAs are not loaded on
  FLUX.2; the tokens are noise. Stripped from the standard style block 2026-10-13.

## The layer model (Mike ruled 2026-10-13, "Lets do it")
Consistency across campaigns = three layers, each with ONE job. Code: `app/src/ai/portraits/style-config.ts`
(MEDIUM, MOODS) and `app/src/ai/portraits/finish.ts` (FINISH).
1. **MEDIUM** (fixed forever, subject-agnostic) — the rendering technique only: semi-realistic painted
   character illustration, matte porcelain skin with subtle texture, clean soft shading, crisp defined edges,
   soft diffuse key with low-key falloff, desaturated cool-neutral base with at most one saturated accent;
   no grain/noise/HDR; not anime/cartoon/airbrushed/photographic. No mood words, no subject words. ≤ 4 sentences.
2. **MOOD** (per campaign, small) — palette temperature, shadow hardness/depth, accent colour family, one
   atmosphere word. Max 2 sentences. Default `growth` = the old "old-school dark fantasy × modern sci-fi"
   line: grim, somber, cool clean sci-fi sheen, cold teal undertone in the shadows. Others: horror, dark
   fantasy, high fantasy, sci-fi, romance, mystery, western, gothic, nautical, steampunk. Picked from the
   campaign's genre unless `styleMood` is set.
3. **FINISH** (deterministic post-process, not prompt) — grade (slight desaturation, lifted blacks, cool
   teal shadow tint, warm-neutral mids), seeded monochrome grain, soft vignette; tokens get a circular mask
   + 2-px Terminal teal ring. The prompt says "no grain" — the grain we want is added here, identically.
- Raw model outputs are kept beside the finished ones (`raw/`) — they, not the finished images, go into
  `approved/` (via `app/scripts/approve-image.ts`) and become the LoRA training set.
- Iterate with `app/scripts/style-lab.ts` (`--medium-file` to try MEDIUM wording without a code edit,
  `--mood`, `--no-finish`); Mike picks from `sheet.jpg`.
