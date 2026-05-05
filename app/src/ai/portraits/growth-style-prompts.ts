/**
 * Per-stage style prompt prefixes for the GROWTH portrait pipeline on FLUX.2 Dev.
 *
 * Mistral-3 (FLUX.2's text encoder) understands natural prose — no keyword soup.
 * Target length per BFL guidance: 30-80 words, front-loaded subject, concrete
 * lighting + camera cues, material/texture descriptors.
 *
 * Pose and framing live in the pose template image (public/portraits/pose-refs/),
 * fed through Canny → ReferenceLatent. These prompts therefore describe LOOK
 * (tone, lighting quality, render style) — not composition.
 *
 * Identity, when the user supplies reference photos, is pulled directly by FLUX.2
 * from chained ReferenceLatent nodes. When no refs are present, the dynamic
 * character description from prompt-builder fills in physical identity instead.
 *
 * Color/tone correction notes (from Kai test batches 2026-04-21):
 * - First pass used "cool desaturated with cyan lift" → skin read as blue-green,
 *   too frigid. Corrected to neutral warmth: balanced white point, subtle warm
 *   highlights, desaturated only in the wardrobe/background, not the skin.
 */

// Style calibrated from actual FLUX.1 "gold ratio" outputs — 11-image sample
// from C:/Users/Mikek/OneDrive/Desktop/FLUX 2 LORAs/ (Apr 2026). The reference
// images are painterly-illustrated fantasy portraits, NOT photoreal. Skin is
// matte and stylized; linework is crisp; backdrop is flat mid-grey with a
// subtle painterly vignette and dust smudges at the feet. Palette is muted
// with jewel-tone accents. No LoRA triggers — the `Flux2D3tailedP0rtraits`
// LoRA advertised for FLUX.2 is actually a FLUX.1 kohya LoRA (base_model.model.*
// tensor prefix) and silently no-ops on FLUX.2, so we lean entirely on prose.
export const GROWTH_FACE_PROMPT =
  "Painterly fantasy character portrait in the spirit of " +
  "Charlie Bowater and WLOP. Head-and-shoulders, front-facing, centered, " +
  "looking directly at camera, neutral expression. Porcelain-pale stylized " +
  "skin with a matte hand-painted finish (not photoreal, not cel-shaded). " +
  "Large almond eyes with sharp highlight catchlights; rosy matte lips; " +
  "prominent cheekbones. Dark wavy hair rendered in soft volumetric strokes. " +
  "Soft frontal studio key light with a subtle cool rim, gentle shadows. " +
  "Completely empty flat neutral-grey backdrop with a subtle darker vignette. " +
  "Crisp illustrated linework over soft painterly brushwork. Muted palette: " +
  "greys, charcoal, porcelain — with restrained jewel-tone accents.";

export const GROWTH_BODY_PROMPT =
  "Painterly fantasy character concept sheet in the spirit " +
  "of Charlie Bowater and WLOP. Full-body head-to-toe portrait, subject " +
  "centered and front-facing, arms relaxed in slight contrapposto, credible " +
  "anatomy. Porcelain-pale stylized skin with a matte hand-painted finish (not " +
  "photoreal, not cel-shaded). Dark wavy hair with soft volumetric strokes. " +
  "Soft frontal key with subtle cool rim, gentle shadows. Completely empty " +
  "flat neutral-grey backdrop, subtle darker vignette at the edges, faint " +
  "painterly dust smudges at the feet. Crisp illustrated linework over soft " +
  "painterly brushwork. Muted dark-fantasy palette — greys, charcoal, " +
  "porcelain — with jewel-tone wardrobe accents (emerald, violet, burgundy, " +
  "rose). No environmental detail, no cropping at crown or feet.";

export const GROWTH_FINETUNE_PROMPT =
  "Preserve the subject's identity exactly: same face shape, same eye shape, " +
  "same nose, same mouth, same hair, same skin tone. Keep the same head pose, " +
  "framing, and composition. Apply the edit instruction to everything else.";

export type PortraitStage = "face" | "body" | "finetune";

export function stylePromptFor(stage: PortraitStage): string {
  switch (stage) {
    case "face":
      return GROWTH_FACE_PROMPT;
    case "body":
      return GROWTH_BODY_PROMPT;
    case "finetune":
      return GROWTH_FINETUNE_PROMPT;
  }
}

/**
 * Build the final positive prompt: style prefix + user prompt.
 * Idempotent — returns the input unchanged if it already starts with the prefix.
 */
export function composeStylePrompt(stage: PortraitStage, userPrompt: string): string {
  const prefix = stylePromptFor(stage);
  const trimmed = userPrompt.trim();
  if (!trimmed) return prefix;
  if (trimmed.startsWith(prefix)) return trimmed;
  return `${prefix} ${trimmed}`;
}

/**
 * When identity is driven by reference photos (FLUX.2 multi-ref), we omit
 * physical-appearance details from the dynamic prompt — the model reads them
 * directly off the refs, and double-stating them fights the ref signal.
 *
 * When there are NO refs, we fall back to describing the character from
 * structured fields (hair, skin tone, age, sex, etc.). Same prompt STYLE
 * either way; only the identity block toggles.
 */
export const REF_DRIVEN_IDENTITY_HINT =
  "Match the identity, face shape, eye shape, hair, and complexion shown in the " +
  "reference images exactly. The references are the authoritative identity source.";

/**
 * Metadata for the one curated FLUX.2 LoRA available locally. Optional stack-on
 * at 0.5-0.7 weight for extra micro-detail. The style prompts above stand alone
 * without it.
 */
export const GROWTH_LORA = {
  filename: "Flux2D3tailedP0rtraits-000001.safetensors",
  trigger: "D3tailedP0rtraits",
  label: "Detailed Portraits",
  recommendedWeight: 0.6,
  description:
    "FLUX.2-compatible LoRA adding micro-detail to portrait renders. " +
    "Include the trigger word in the prompt for the LoRA to fire.",
} as const;
