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

/** NSFW Unlock LoRA — active when mature content enabled */
export const TRIGGER_NSFW = 'aidmaNSFWunlock';

// ============================================================
// Global Style Bible — Split for Dual CLIP Encoding
// ============================================================

// clip_l: concise tags (CLIP-L is keyword-oriented, ≤77 tokens)
const STYLE_TAGS = [
  `in the style of ${TRIGGER_PAINTERLY}`,
  TRIGGER_DETAIL,
  TRIGGER_DARK_FANTASY,
  'hyperrealistic fantasy portrait',
  'art nouveau influence',
  'extremely detailed',
  'subtle painterly quality',
  'dramatic chiaroscuro lighting',
  'luminous detailed eyes',
  'rich deep colors',
].join(', ');

// t5xxl: natural language sentences (T5-XXL excels at descriptive prose)
const STYLE_SENTENCES = [
  `A hyperrealistic fantasy portrait in the style of ${TRIGGER_PAINTERLY} and ${TRIGGER_DARK_FANTASY}.`,
  'Extremely detailed rendering that borders on photorealistic with a subtle art nouveau elegance.',
  'Dramatic chiaroscuro lighting with warm and cool color contrast.',
  'Luminous, almost impossibly detailed eyes and skin with fine pore texture.',
  'Rich deep color palette with dark atmospheric depth.',
].join(' ');

// Legacy combined prefix — kept for backward compatibility
const STYLE_PREFIX = STYLE_TAGS;

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
const CREATION_MODE_NEGATIVE = 'robe, cloak, cape, dress, gown, kimono, fabric panel, fabric drape, garment, robes, shawl, mantle, train, fabric flowing behind';

// ============================================================
// Default Composition
// ============================================================

const DEFAULT_COMPOSITION = 'bust portrait, three-quarter view, dark atmospheric background, warm key light from upper left';

const COMPOSITION_PRESETS: Record<string, string> = {
  bust: 'bust portrait, three-quarter view, dark atmospheric background, warm key light from upper left',
  half_body: 'half body portrait, three-quarter view, atmospheric background, dramatic side lighting',
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
const IDENTITY_LOCK_TAGS = [
  'completely bald',
  'shaved head',
  'bare scalp',
  'no hair at all',
  'in the style of ckpf',               // painterly LoRA trigger
  'aidmafluxpro1.1',                    // detail LoRA trigger — activates extreme detailer more strongly
  'close-up face portrait centered in frame',
  'face centered vertically and horizontally',
  'chin and forehead both fully visible',
  'forehead fully exposed',
  'ears fully visible',
  'smooth scalp with no hair',
  'natural skin with fine pore detail',
  'highly detailed facial features',
  'luminous vivid eyes with rich color',
  'crisp sharp focus',
  'soft lighting',
  'high resolution',
  'no clothing visible',
  'bare skin only',
  'head and face only',
].join(', ');

// Reinforcement sentences appended to t5xxl (after the clip_l mirror).
// Required when ControlNet is active — the silhouette conditioning needs extra
// bald signal to counter. Without ControlNet, bf706666 showed these aren't needed.
const IDENTITY_LOCK_REINFORCEMENT = 'The character is completely bald with a smooth clean-shaven scalp. There is absolutely no hair on the head whatsoever. The scalp is fully bare and exposed.';

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
  front: 'plain grey background, even lighting',
  three_quarter_left: 'plain grey background, soft lighting',
  three_quarter_right: 'plain grey background, soft lighting',
  profile_left: 'plain grey background, soft lighting',
  profile_right: 'plain grey background, soft lighting',
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
export function getStyleTags(): string {
  return STYLE_TAGS;
}

/** Get style sentences for t5xxl encoder */
export function getStyleSentences(): string {
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
export function getCreationModeNegative(): string {
  return CREATION_MODE_NEGATIVE;
}

/** Get the negative prompt (minimal — FLUX ignores most negatives at CFG 1.0) */
export function getNegativePrompt(): string {
  return FULL_NEGATIVE_PROMPT;
}
