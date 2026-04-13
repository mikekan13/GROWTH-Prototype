/**
 * GRO.WTH Portrait Pipeline — Style Configuration
 *
 * Global art style anchor and campaign modifiers.
 * Target: Painterly fantasy illustration, not photorealistic, not anime.
 */

import type { StyleConfig, CampaignStyleConfig } from './types';

// ============================================================
// Global Style Bible
// ============================================================

const STYLE_PREFIX = [
  'in the style of ckpf,',
  'painterly fantasy illustration',
  'rich saturated color palette',
  'dramatic chiaroscuro lighting',
  'emotionally expressive face',
  'visible brushstrokes',
  'oil painting texture',
  'fantasy art masterwork',
  'detailed expressive eyes',
  'warm and cool color contrast',
  'atmospheric depth',
].join(', ');

// ============================================================
// Negative Prompt Layers
// ============================================================

const NEGATIVE_ANTI_PHOTO = [
  'photograph', 'photorealistic', 'photo', 'realistic skin texture', 'pores',
  'camera grain', 'lens flare', 'bokeh', 'DSLR', 'RAW photo',
].join(', ');

const NEGATIVE_ANTI_ANIME = [
  'anime', 'cartoon', 'cel shading', 'flat color', 'manga', 'chibi',
  'line art', 'vector art', 'clip art', 'comic book',
].join(', ');

const NEGATIVE_ANTI_ARTIFACT = [
  'deformed', 'disfigured', 'bad anatomy', 'extra fingers', 'mutated hands',
  'poorly drawn face', 'blurry', 'watermark', 'signature', 'text', 'logo',
].join(', ');

const NEGATIVE_STYLE_PURITY = [
  '3d render', 'CGI', 'digital art', 'smooth gradient', 'plastic skin',
  'oversaturated', 'neon colors', 'flat lighting', 'stock photo',
].join(', ');

const FULL_NEGATIVE_PROMPT = [
  NEGATIVE_ANTI_PHOTO,
  NEGATIVE_ANTI_ANIME,
  NEGATIVE_ANTI_ARTIFACT,
  NEGATIVE_STYLE_PURITY,
].join(', ');

// Extra negatives for creation mode (no clothing, accessories, or embellishments)
const NEGATIVE_CREATION_MODE = [
  'clothing', 'clothes', 'armor', 'shirt', 'dress', 'robe', 'cloak', 'cape',
  'jewelry', 'necklace', 'earrings', 'crown', 'tiara', 'headband', 'hat', 'helmet',
  'weapon', 'sword', 'shield', 'staff',
  'ornate', 'decorated', 'embellished', 'accessories',
].join(', ');

const CREATION_MODE_NEGATIVE = `${FULL_NEGATIVE_PROMPT}, ${NEGATIVE_CREATION_MODE}`;

// ============================================================
// Default Composition
// ============================================================

const DEFAULT_COMPOSITION = 'bust portrait, three-quarter view, dark atmospheric background, warm key light from upper left';

const COMPOSITION_PRESETS: Record<string, string> = {
  bust: 'bust portrait, three-quarter view, dark atmospheric background, warm key light from upper left',
  half_body: 'half body portrait, three-quarter view, atmospheric background, dramatic side lighting',
  full_body: 'full body portrait from head to feet, standing pose, entire body visible including feet, neutral grey background, balanced lighting',
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

// Realistic style with subtle painterly touch — used ONLY during identity lock face generation
// Replaces the full fantasy style prefix to prevent FLUX from adding crowns, jewelry, etc.
const IDENTITY_LOCK_STYLE = [
  'in the style of ckpf,',
  'face portrait',
  'natural skin with fine detail',
  'highly detailed facial features',
  'crisp sharp focus',
  'soft lighting',
  'high resolution',
  'hair slicked back in tight bun, all hair pulled away from face',
  'ears fully visible',
  'no clothing visible',
  'bare skin only',
].join(', ');

// Negative prompt specifically for face-only identity lock generation
const NEGATIVE_FACE_ONLY = [
  // Anti-body: we want ONLY the face
  'shoulders', 'neck', 'body', 'torso', 'chest', 'arms', 'hands', 'fingers',
  'full body', 'half body', 'upper body',
  // Anti-clothing/accessories: nothing but the bare face
  'clothing', 'clothes', 'armor', 'shirt', 'dress', 'robe', 'cloak', 'cape',
  'jewelry', 'necklace', 'earrings', 'crown', 'tiara', 'headband', 'hat', 'helmet',
  'accessories', 'ornate', 'decorated', 'embellished', 'feathers', 'ornaments',
  'loose hair', 'hair covering face', 'bangs over eyes', 'bangs', 'hair over ears', 'wig',
  // Anti-style: prevent extreme cartoon/illustration but allow subtle artistry
  'anime', 'cartoon', 'comic', 'manga',
  'CGI', '3d render', 'oil painting', 'watercolor', 'sketch',
  'heavy brushstrokes', 'flat color',
  // Anti-background distractions
  'background details', 'scenery', 'landscape', 'room', 'outdoors',
  // Standard quality
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
    loraStrength: 0.6,
    pulidWeight: 0.8,
  };
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

/** Get the negative prompt layers individually (for debugging/tuning) */
export function getNegativePromptLayers() {
  return {
    antiPhoto: NEGATIVE_ANTI_PHOTO,
    antiAnime: NEGATIVE_ANTI_ANIME,
    antiArtifact: NEGATIVE_ANTI_ARTIFACT,
    stylePurity: NEGATIVE_STYLE_PURITY,
    full: FULL_NEGATIVE_PROMPT,
  };
}
