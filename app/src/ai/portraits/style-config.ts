/**
 * GRO.WTH Portrait Pipeline — Style Configuration
 *
 * Global art style anchor and campaign modifiers.
 * Target: Painterly fantasy illustration, not photorealistic, not anime.
 */

import type { StyleConfig, CampaignStyleConfig } from './types';

// ============================================================
// LoRA Trigger Words
// ============================================================

/** Painterly Fantasy style LoRA — always active in draft/final */
export const TRIGGER_PAINTERLY = 'ckpf';

/** Extreme Detailer LoRA — always active in draft/final */
export const TRIGGER_DETAIL = 'aidmafluxpro1.1';

/** SXZ Dark Fantasy campaign LoRA — active when campaign uses dark fantasy theme */
export const TRIGGER_DARK_FANTASY = 'drkfnts style';

/** NSFW Unlock LoRA trigger — kept as the original camelCase to match the
 *  state Mike confirmed was producing acceptable output. */
export const TRIGGER_NSFW = 'aidmaNSFWunlock';

// ============================================================
// Global Style Bible — Split for Dual CLIP Encoding
// ============================================================

// 2026-10-13: rewritten from Mike's reference set (style-refs/STYLE-VOCABULARY.md).
// FLUX.1 LoRA triggers (ckpf / aidmafluxpro1.1 / drkfnts) are NOT loaded on the
// FLUX.2 serverless path — they were noise tokens. Style is prose-driven now.
//
// clip_l: concise tags (CLIP-L is keyword-oriented, ≤77 tokens)
const STYLE_TAGS = [
  'painterly digital character illustration',
  'semi-realistic concept art',
  'matte finish',
  'porcelain-smooth skin with a soft matte sheen',
  'large glassy eyes with smoky dark lids',
  'idealized symmetrical features',
  'hair and fabric edges dissolve into loose brushwork',
  'flat mottled grey studio backdrop like toned paper',
  'soft diffuse frontal light',
  'cool grey shadows',
  'desaturated neutral palette with one saturated accent color',
].join(', ');

// t5xxl: natural language sentences (T5-XXL excels at descriptive prose)
const STYLE_SENTENCES = [
  'A painterly digital character illustration in a semi-realistic concept-art style with a matte finish, painted rather than photographed.',
  'The skin is porcelain-smooth with a soft matte sheen and almost no pore texture; the eyes are large and glassy with smoky dark lids and the features are idealized and symmetrical.',
  'The face and eyes are the sharpest point of the image, while the tips of the hair and the edges of fabric dissolve into loose visible brushwork.',
  'The backdrop is a flat mottled grey studio wall like toned paper, with faint paint smudges and a soft ground shadow, and nothing else in the scene.',
  'Soft diffuse frontal light with a gentle top key; shadows are cool grey, never black, with no hard shadows and no rim light.',
  'The palette is desaturated and cool-neutral, carrying one saturated accent color, with pale skin set against dark hair.',
].join(' ');

// Legacy combined prefix — kept for backward compatibility
const STYLE_PREFIX = STYLE_TAGS;

// ============================================================
// FLUX.2 style paragraph — THE single source of the GROWTH look
// ============================================================
// The FLUX.2 serverless path (providers/local.ts: face lock, pass 2, body)
// builds its own prose prompts and does NOT go through getStyleTags /
// getStyleSentences. Every one of those prompts must embed this paragraph so
// the style is identical from the first lock image onward. FLUX.2's text
// encoder is Mistral (one encoder, prose only) — there is no clip_l/t5 split.
// Vocabulary: style-refs/STYLE-VOCABULARY.md (from Mike's reference set).
const FLUX2_STYLE_PROSE =
  'Rendered as a painterly digital character illustration in a semi-realistic concept-art style, painted rather than photographed, with a matte finish and no photographic texture. ' +
  'The skin is porcelain-smooth with a soft matte sheen and almost no pore detail; the eyes are large and glassy with smoky dark lids; the features are idealized and symmetrical. ' +
  'The face and eyes are the sharpest point of the image, while the tips of the hair and the outer edges of the figure dissolve into loose visible brushwork. ' +
  'The backdrop is a flat mottled grey studio wall like toned paper with faint paint smudges, and nothing else is in the scene. ' +
  'Soft diffuse frontal light with a gentle top key; shadows are cool grey, never black; no hard shadows, no rim light, no lens effects. ' +
  'The palette is desaturated and cool-neutral with one saturated accent color, pale skin against dark hair.';

/** The GROWTH look as one prose paragraph for FLUX.2 prompts. */
export function getFlux2StyleProse(): string {
  return FLUX2_STYLE_PROSE;
}

// ============================================================
// Negative Prompts — Minimal for FLUX
// ============================================================
// FLUX at CFG 1.0 is guidance-distilled and largely ignores negative prompts.
// These are kept minimal as safety nets; real style steering comes from
// positive prompting + LoRAs.

// FLUX at CFG 1.0 is guidance-distilled — negatives are ignored for FACE-LOCK
// generation (where adding any token, including negatives, hurts).
// BUT for body generation, FLUX *does* respond to negatives enough to fix specific
// known failures: long hair tokens get interpreted as robes/cloaks/capes. So
// CREATION_MODE_NEGATIVE explicitly lists garment shapes to avoid.
const FULL_NEGATIVE_PROMPT = '';
// Block fantasy garments + body decoration + non-front poses. Painterly LoRA
// keeps wanting to dress the figure in gold/jewelry/decorative elements.
const CREATION_MODE_NEGATIVE_BASE = 'robe, cloak, cape, dress, gown, kimono, fabric panel, fabric drape, garment, robes, shawl, mantle, train, fabric flowing behind, gold, gold trim, gold paint, body paint, tattoo, markings, jewelry, necklace, choker, bracelet, ring, earring, crown, tiara, headdress, ornate, decorated, embellished, side view, profile view, three quarter view, turned to side, contrapposto, leg crossed, leaning, tilted hip, cropped feet, cut off feet, no feet';

const CREATION_MODE_NEGATIVE_NUDE = `${CREATION_MODE_NEGATIVE_BASE}, bodysuit, leotard, swimsuit, bikini, lingerie, doll, doll body, plastic body, Barbie, Barbie smooth, mannequin, featureless crotch, smooth crotch, no nipples, no pubic, censored, blurred genitals, mosaic, pixelated`;

// Kept for backward-compat; defaults to the underwear-allowed (SFW) variant.
const CREATION_MODE_NEGATIVE = CREATION_MODE_NEGATIVE_BASE;

// ============================================================
// Default Composition
// ============================================================

const DEFAULT_COMPOSITION = 'bust portrait, head and shoulders centered in frame, facing the viewer, flat mottled grey studio backdrop, soft vignette, soft diffuse frontal light';

const COMPOSITION_PRESETS: Record<string, string> = {
  bust: 'bust portrait, head and shoulders centered in frame, facing the viewer, flat mottled grey studio backdrop, soft vignette, soft diffuse frontal light',
  half_body: 'half body portrait, figure centered, facing the viewer, flat mottled grey studio backdrop, soft diffuse frontal light',
  full_body: 'full body reference shot, standing figure centered in frame, head at top of frame feet at bottom of frame, long shot framing, subject occupies full vertical height, arms hands and feet all visible, wide angle, neutral grey background, balanced even lighting',
  action: 'dynamic action pose, motion blur on periphery, dramatic lighting, environment interaction',
};

// ============================================================
// Campaign Theme Modifiers
// ============================================================

const CAMPAIGN_THEME_MODIFIERS: Record<string, string> = {
  'dark fantasy': 'dark moody atmosphere, muted earth tones, grim shadows, ominous undertones',
  'high fantasy': 'vibrant magical glow, ethereal light, majestic, epic scale',
  'steampunk': 'brass and copper accents, steam wisps, mechanical elements, Victorian aesthetic',
  'horror': 'unsettling atmosphere, eerie shadows, pale sickly lighting, dread',
  'mystery': 'noir lighting, deep shadows, fog, muted cool tones',
  'romance': 'soft warm lighting, gentle bokeh, intimate framing, warm color palette',
  'sci-fi': 'holographic accents, cool blue lighting, sleek materials, futuristic',
  'western': 'dusty warm tones, golden hour light, rugged textures, vast sky',
  'gothic': 'ornate dark architecture, candlelight, deep reds and purples, dramatic shadows',
  'nautical': 'ocean spray, stormy skies, weathered textures, teal and grey palette',
};

// ============================================================
// Identity Lock — Face-Only Style & Angles
// ============================================================

// ============================================================
// Identity Lock — Face-Only Style (Split for Dual CLIP)
// ============================================================

// IDENTITY LOCK — RESTORED from known-working 2026-04-14 00:XX generation
// (see public/portraits/creation-preview/9445b459-*.png for the golden reference).
// DO NOT re-split this into "elegant" tag vs sentence forms — the redundancy
// between clip_l and t5xxl is what keeps the face visible. Don't remove "bald"
// language — despite contrary intuition, the aggressive repetition of "completely
// bald / shaved head / no hair at all" is what prevents FLUX from generating head
// coverings. Proven by A/B comparison with the PNG above.
// RESTORED to golden 9445b459 recipe with ControlNet.
// bf706666's cleaner prompt worked without ControlNet — but the moment we pair it
// with ControlNet/DWPose, the silhouette guidance overrides weak bald signal and
// we get headwraps. 9445b459's aggressive bald stack (with "smooth scalp with no
// hair" + t5xxl reinforcement sentences) is what overpowers ControlNet's silhouette
// cues. Keep "head and face only" from bf706666 — it's a clean crop hint.
// 2026-10-13 (Mike: "style from the beginning"): the lock used to ask for a
// photograph — "natural skin with fine pore detail, crisp sharp focus, high
// resolution" — so the locked face was photographic and the body inherited that
// through the reference latent. The bald stack and framing lines are kept
// verbatim (proven); the photographic descriptors are replaced with the
// painterly vocabulary from style-refs/STYLE-VOCABULARY.md. The dead FLUX.1
// LoRA triggers are gone (nothing loads them on FLUX.2). Negatives are never
// sent on the FLUX.2 path, so the positive stack is the only style lever.
const IDENTITY_LOCK_TAGS = [
  'completely bald',
  'shaved head',
  'bare scalp',
  'no hair at all',
  'painterly digital character illustration',
  'semi-realistic concept art portrait',
  'painted rather than photographed',
  'matte finish',
  'close-up face portrait centered in frame',
  'face centered vertically and horizontally',
  'chin and forehead both fully visible',
  'forehead fully exposed',
  'ears fully visible',
  'smooth scalp with no hair',
  'porcelain-smooth skin with a soft matte sheen',
  'idealized symmetrical features',
  'large glassy eyes with smoky dark lids',
  'soft diffuse frontal light',
  'cool grey shadows',
  'flat mottled grey studio backdrop like toned paper',
  'no clothing visible',
  'bare skin only',
  'head and face only',
].join(', ');

// Reinforcement sentences appended to t5xxl (after the clip_l mirror).
// Bald sentence proven; painterly sentence added 2026-10-13 so T5 gets the
// style in prose as well as tags.
const IDENTITY_LOCK_REINFORCEMENT = 'The character is completely bald with a smooth clean-shaven scalp. There is absolutely no hair on the head whatsoever. The scalp is fully bare and exposed. This is a painted character illustration, not a photograph: semi-realistic concept art with a matte finish, porcelain-smooth skin with a soft matte sheen and almost no pore texture, large glassy eyes with smoky dark lids, soft diffuse frontal light with cool grey shadows, on a flat mottled grey studio backdrop like toned paper.';

// Legacy export for any residual callers.
const IDENTITY_LOCK_SENTENCES = IDENTITY_LOCK_TAGS + '. ' + IDENTITY_LOCK_REINFORCEMENT;

// Legacy combined — kept for backward compat
const IDENTITY_LOCK_STYLE = IDENTITY_LOCK_TAGS;

// RESTORED from working 2026-04-14 PNG. Despite the theory that FLUX tokenizes
// negatives and generates them, the working bald-head generation used this full
// list. The POSITIVE "completely bald" stack is strong enough that negative
// tokens don't bleed through. Don't re-empty this.
const NEGATIVE_FACE_ONLY = [
  // Anti-body — RESTORED to golden 9445b459 version. bf706666's neck-type variants
  // drop the plain "neck" and "collarbone" terms, which is the ONLY remaining
  // difference between the latest headwrap run and the golden clean-bald run.
  'neck', 'shoulders', 'collarbone', 'body', 'torso', 'chest', 'arms', 'hands', 'fingers',
  'full body', 'half body', 'upper body', 'bust', 'portrait from waist up',
  // Anti-clothing
  'clothing', 'clothes', 'armor', 'shirt', 'dress', 'robe', 'cloak', 'cape',
  'collar', 'neckline', 'choker', 'scarf', 'turtleneck', 'high collar',
  // Anti-accessories / head coverings
  'jewelry', 'necklace', 'earrings', 'crown', 'tiara', 'headband', 'hat', 'helmet',
  'headpiece', 'circlet', 'diadem', 'wreath', 'laurel', 'headdress',
  'accessories', 'ornate', 'decorated', 'embellished', 'feathers', 'ornaments',
  // Anti-hair
  'hair', 'long hair', 'short hair', 'bangs', 'wig', 'ponytail', 'braid', 'curls', 'locks',
  'hair on head', 'hair on forehead', 'fringe', 'flyaway hair', 'stray hair', 'hairline',
  // Anti-style
  'anime', 'cartoon', 'comic', 'manga',
  'CGI', '3d render', 'oil painting', 'watercolor', 'sketch',
  'heavy brushstrokes', 'flat color',
  // Anti-background
  'background details', 'scenery', 'landscape', 'room', 'outdoors',
  // Quality
  'deformed', 'disfigured', 'bad anatomy', 'blurry', 'watermark', 'text', 'logo',
  'low quality', 'worst quality',
].join(', ');

const ANGLE_PRESETS: Record<string, string> = {
  front: 'flat mottled grey studio backdrop, soft diffuse frontal light',
  three_quarter_left: 'flat mottled grey studio backdrop, soft diffuse light',
  three_quarter_right: 'flat mottled grey studio backdrop, soft diffuse light',
  profile_left: 'flat mottled grey studio backdrop, soft diffuse light',
  profile_right: 'flat mottled grey studio backdrop, soft diffuse light',
};

// ============================================================
// Exports
// ============================================================

/** Default global style config — used when no campaign style is set */
export function getDefaultStyleConfig(): StyleConfig {
  return {
    stylePrefix: STYLE_PREFIX,
    negativePrompt: FULL_NEGATIVE_PROMPT,
    compositionSuffix: DEFAULT_COMPOSITION,
    styleLora: undefined,         // No global LoRA until Phase D training
    loraStrength: 0.5,
    pulidWeight: 0.8,
  };
}

/** Get style tags for clip_l encoder */
export function getStyleTags(creationMode = false): string {
  // creationMode = A-pose nude body reference. Strip all fantasy/painterly
  // style signal — the painterly + dark-fantasy LoRAs are disabled at their
  // weights (0) for body reference so including their triggers just pollutes.
  // Target output is photo-real anatomical reference, not illustrated art.
  if (creationMode) {
    // Body reference: same painterly look as the reference set (the old gens
    // were full-length studio sheets in exactly this style), minus the accent
    // colour line so nothing competes with the plain underwear instruction.
    return [
      'painterly digital character illustration',
      'semi-realistic concept art',
      'painted rather than photographed',
      'matte finish',
      'visible brushwork',
      'porcelain-smooth skin with a soft matte sheen',
      'edges of the figure dissolve into loose brush strokes',
      'flat mottled grey studio backdrop like toned paper',
      'faint paint smudges on the backdrop',
      'soft ground shadow under the feet',
      'soft diffuse frontal light',
      'cool grey shadows',
    ].join(', ');
  }
  return STYLE_TAGS;
}

/** Get style sentences for t5xxl encoder */
export function getStyleSentences(creationMode = false): string {
  if (creationMode) {
    return [
      'A painterly digital character illustration in a semi-realistic concept-art style with a matte finish, painted rather than photographed, with visible brushwork.',
      'The skin is porcelain-smooth with a soft matte sheen and almost no pore texture; the outer edges of the figure dissolve into loose brush strokes.',
      'The backdrop is a flat mottled grey studio wall like toned paper with faint paint smudges and a soft ground shadow under the feet, and nothing else in the scene.',
      'Soft diffuse frontal light with cool grey shadows and no hard shadows.',
    ].join(' ');
  }
  return STYLE_SENTENCES;
}

/** Get composition preset by name */
export function getCompositionPreset(preset: string): string {
  return COMPOSITION_PRESETS[preset] || DEFAULT_COMPOSITION;
}

/** Get angle-specific composition preset for identity lock discovery */
export function getAnglePreset(angle: string): string {
  return ANGLE_PRESETS[angle] || COMPOSITION_PRESETS.bust;
}

/** Get the identity lock style prefix (realistic, not fantasy) */
export function getIdentityLockStyle(): string {
  return IDENTITY_LOCK_STYLE;
}

/** Get identity lock tags for clip_l encoder */
export function getIdentityLockTags(): string {
  return IDENTITY_LOCK_TAGS;
}

/** Get identity lock sentences for t5xxl encoder (legacy, full concatenated form) */
export function getIdentityLockSentences(): string {
  return IDENTITY_LOCK_SENTENCES;
}

/** Get the bald-reinforcement sentences — appended to t5xxl AFTER clip_l mirror */
export function getIdentityLockReinforcement(): string {
  return IDENTITY_LOCK_REINFORCEMENT;
}

/** Get the face-only negative prompt for identity lock */
export function getFaceOnlyNegative(): string {
  return NEGATIVE_FACE_ONLY;
}

/** Apply campaign theme modifiers to the style */
export function applyCampaignStyle(
  baseConfig: StyleConfig,
  campaignStyle?: CampaignStyleConfig
): StyleConfig {
  if (!campaignStyle) return baseConfig;

  const config = { ...baseConfig };

  // Add campaign theme modifiers to the style prefix
  if (campaignStyle.themeModifiers) {
    config.stylePrefix = `${config.stylePrefix}, ${campaignStyle.themeModifiers}`;
  }

  // Override composition if campaign specifies one
  if (campaignStyle.compositionOverride) {
    config.compositionSuffix = campaignStyle.compositionOverride;
  }

  return config;
}

/** Look up built-in theme modifier string by genre name */
export function getThemeModifier(genre: string): string | undefined {
  return CAMPAIGN_THEME_MODIFIERS[genre.toLowerCase()];
}

/** Get the creation-mode negative prompt (includes anti-clothing/accessories) */
export function getCreationModeNegative(allowNude = false): string {
  return allowNude ? CREATION_MODE_NEGATIVE_NUDE : CREATION_MODE_NEGATIVE_BASE;
}

/** Get the negative prompt (minimal — FLUX ignores most negatives at CFG 1.0) */
export function getNegativePrompt(): string {
  return FULL_NEGATIVE_PROMPT;
}
