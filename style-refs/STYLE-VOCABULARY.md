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
