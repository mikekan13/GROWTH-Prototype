/**
 * GRO.WTH Portrait Pipeline — Prompt Builder
 *
 * Translates character data into structured prompts for image generation.
 * Fields are organized by visual weight tiers (T1 highest → T7 lowest).
 */

import type {
  PortraitCharacterData,
  VisibleEquipment,
  CharacterWound,
  ActiveCondition,
  AttributeDepletionState,
  VisualTrait,
  EnvironmentContext,
  PromptOutput,
  StyleConfig,
  CampaignStyleConfig,
  PortraitOverrides,
} from './types';
import { getDefaultStyleConfig, applyCampaignStyle, getCompositionPreset, getAnglePreset, getCreationModeNegative, getIdentityLockStyle, getFaceOnlyNegative } from './style-config';

// ============================================================
// Main Entry Point
// ============================================================

export interface PromptBuildOptions {
  campaignStyle?: CampaignStyleConfig;
  overrides?: PortraitOverrides;
  /** Creation mode: pure physical identity, no equipment/wounds/conditions */
  creationMode?: boolean;
}

export function buildPortraitPrompt(
  char: PortraitCharacterData,
  campaignStyleOrOptions?: CampaignStyleConfig | PromptBuildOptions,
  overridesArg?: PortraitOverrides,
): PromptOutput {
  // Support both old signature (campaignStyle, overrides) and new options object
  let campaignStyle: CampaignStyleConfig | undefined;
  let overrides: PortraitOverrides | undefined;
  let creationMode = false;

  if (campaignStyleOrOptions && 'creationMode' in campaignStyleOrOptions) {
    campaignStyle = campaignStyleOrOptions.campaignStyle;
    overrides = campaignStyleOrOptions.overrides;
    creationMode = campaignStyleOrOptions.creationMode || false;
  } else {
    campaignStyle = campaignStyleOrOptions as CampaignStyleConfig | undefined;
    overrides = overridesArg;
  }

  const baseConfig = getDefaultStyleConfig();
  const config = applyCampaignStyle(baseConfig, campaignStyle);

  // T1: IDENTITY BLOCK (always included)
  const identityBlock = buildIdentityBlock(char);

  // T1: BODY DESCRIPTION BLOCK
  const bodyBlock = buildBodyDescriptionBlock(char);

  // ── IDENTITY LOCK FACE MODE ──
  // When anglePreset is set, we're generating face-only images for identity lock.
  // ONLY facial features — no body, no limbs, no accessories, no clothing.
  if (overrides?.anglePreset) {
    const faceBlock = buildFaceOnlyBlock(char);
    const blocks: string[] = [];
    blocks.push(getIdentityLockStyle());
    blocks.push(faceBlock);
    blocks.push(getAnglePreset(overrides.anglePreset));

    return {
      prompt: blocks.filter(Boolean).join(', '),
      negativePrompt: getFaceOnlyNegative(),
      identityBlock,
      bodyDescriptionBlock: bodyBlock || '',
    };
  }

  // ── STANDARD PORTRAIT MODE ──
  const blocks: string[] = [];

  // STYLE BLOCK
  blocks.push(config.stylePrefix);

  blocks.push(identityBlock);
  if (bodyBlock) blocks.push(bodyBlock);

  if (creationMode) {
    // Creation mode: pure physical identity, no equipment or state
    blocks.push('nude, bare skin, no clothing, no armor, no accessories, no jewelry, no headwear, simple plain underwear only if needed');
  } else {
    // T2: EQUIPMENT BLOCK
    const equipBlock = buildEquipmentBlock(char.visibleEquipment);
    if (equipBlock) blocks.push(equipBlock);

    // T3: STATUS BLOCK (wounds + conditions + depletion)
    const statusBlock = buildStatusBlock(char.wounds, char.conditions, char.attributeDepletion);
    if (statusBlock) blocks.push(statusBlock);
  }

  // T4: NARRATIVE BLOCK (subtle influence)
  const narrativeBlock = buildNarrativeBlock(char);
  if (narrativeBlock) blocks.push(narrativeBlock);

  // T5: VISUAL TRAITS
  const traitBlock = buildTraitBlock(char.visualTraits);
  if (traitBlock) blocks.push(traitBlock);

  // STEERING WORDS (user overrides)
  if (overrides?.steeringWords?.length) {
    blocks.push(overrides.steeringWords.join(', '));
  }

  // COMPOSITION BLOCK
  const composition = overrides?.composition
    ? getCompositionPreset(overrides.composition)
    : config.compositionSuffix;
  blocks.push(composition);

  if (!creationMode) {
    // T6: ENVIRONMENT BLOCK
    const envBlock = buildEnvironmentBlock(char.environment);
    if (envBlock) blocks.push(envBlock);
  } else {
    blocks.push('neutral grey studio background, soft even lighting');
  }

  // Use stronger negative prompt in creation mode (anti-clothing/accessories)
  const negativePrompt = creationMode ? getCreationModeNegative() : config.negativePrompt;

  return {
    prompt: blocks.filter(Boolean).join(', '),
    negativePrompt,
    identityBlock,
    bodyDescriptionBlock: bodyBlock || '',
  };
}

// ============================================================
// T1: Core Identity
// ============================================================

function buildIdentityBlock(char: PortraitCharacterData): string {
  const parts: string[] = [];

  // Age and sex/presentation
  const { identity, seed } = char;
  const agePart = identity.age ? `${identity.age}-year-old` : '';
  const sexPart = identity.sex || '';
  const seedPart = seed?.name || '';

  // Assemble: "a 34-year-old female Verdathi elf"
  const coreParts = [agePart, sexPart, seedPart].filter(Boolean);
  if (coreParts.length > 0) {
    parts.push(`a ${coreParts.join(' ')}`);
  }

  // Seed-specific physical traits
  if (seed?.description) {
    parts.push(seed.description);
  }

  // Physical description (free-text from character sheet)
  if (identity.physicalDescription) {
    parts.push(identity.physicalDescription);
  }

  return parts.filter(Boolean).join(', ');
}

// ============================================================
// T1: Body Description (for full-body consistency)
// ============================================================

function buildBodyDescriptionBlock(char: PortraitCharacterData): string {
  const { identity } = char;
  const parts: string[] = [];

  if (identity.skinTone) parts.push(`${identity.skinTone} skin`);
  const hairDesc = [identity.hairColor, identity.hairLength, identity.hairTexture].filter(Boolean);
  if (hairDesc.length > 0) {
    parts.push(`${hairDesc.join(' ')} hair`);
  }
  if (identity.hairStyle) {
    parts.push(`worn ${identity.hairStyle}`);
  }
  if (identity.cosmetics) parts.push(identity.cosmetics);
  if (identity.hygiene && identity.hygiene !== 'Average') {
    parts.push(`${identity.hygiene.toLowerCase()} appearance`);
  }
  if (identity.eyeColor) parts.push(`${identity.eyeColor} eyes`);
  if (identity.bodyType) parts.push(`${identity.bodyType} build`);

  // Distinguishing features (tattoos, birthmarks, piercings, scars)
  if (identity.distinguishingFeatures?.length) {
    parts.push(...identity.distinguishingFeatures);
  }

  return parts.join(', ');
}

// ============================================================
// Face-Only Description (for identity lock — no body, no accessories)
// ============================================================

function buildFaceOnlyBlock(char: PortraitCharacterData): string {
  const { identity, seed } = char;
  const parts: string[] = [];

  // Age + sex + species (core identity)
  const agePart = identity.age ? `${identity.age}-year-old` : '';
  const sexPart = identity.sex || '';
  const seedPart = seed?.name || '';
  const coreParts = [agePart, sexPart, seedPart].filter(Boolean);
  if (coreParts.length > 0) {
    parts.push(`a ${coreParts.join(' ')}`);
  }

  // Skin tone
  if (identity.skinTone) parts.push(`${identity.skinTone} skin`);

  // Eye color
  if (identity.eyeColor) parts.push(`${identity.eyeColor} eyes`);

  // NO hair in face lock — hair is pulled back to expose pure face geometry.
  // Hair gets added back from character description in regular portrait generation.
  // NO cosmetics — we want the bare face
  // NO bodyType, height, build, distinguishingFeatures, hairStyle
  // NO physicalDescription (free text may contain body descriptions)
  // NO seed.description (species lore, not visual)

  return parts.filter(Boolean).join(', ');
}

// ============================================================
// T2: Visible Equipment
// ============================================================

function buildEquipmentBlock(equipment: VisibleEquipment[]): string {
  if (!equipment.length) return '';

  const parts: string[] = [];

  // Group equipment by significance
  const held = equipment.filter(e => e.slot.startsWith('held'));
  const worn = equipment.filter(e => !e.slot.startsWith('held'));

  // Worn items: describe material and condition
  if (worn.length > 0) {
    const wornParts = worn.map(e => {
      const conditionAdj = getConditionAdjective(e.condition);
      const materialPart = e.material ? `${e.material} ` : '';
      return `${conditionAdj}${materialPart}${e.name}`.trim();
    });
    parts.push(`wearing ${wornParts.join(', ')}`);
  }

  // Held items
  if (held.length > 0) {
    const heldParts = held.map(e => {
      const materialPart = e.material ? `${e.material} ` : '';
      return `${materialPart}${e.name}`.trim();
    });
    parts.push(`holding ${heldParts.join(' and ')}`);
  }

  return parts.join(', ');
}

function getConditionAdjective(condition: number): string {
  switch (condition) {
    case 1: return 'destroyed ';
    case 2: return 'battered ';
    case 3: return 'worn ';
    case 4: return '';  // Undamaged — no adjective needed
    default: return '';
  }
}

// ============================================================
// T3: Wounds, Conditions, Depletion
// ============================================================

function buildStatusBlock(
  wounds: CharacterWound[],
  conditions: ActiveCondition[],
  depletion: AttributeDepletionState,
): string {
  const parts: string[] = [];

  // Visible wounds
  const visibleWounds = wounds.filter(w => w.isVisible);
  if (visibleWounds.length > 0) {
    const woundParts = visibleWounds.map(w => {
      const desc = w.description || `${w.severity} wound`;
      const location = formatBodyPart(w.bodyPart);
      return `${desc} on the ${location}`;
    });
    parts.push(`with ${woundParts.join(', ')}`);
  }

  // Active conditions (affect expression)
  if (conditions.length > 0) {
    const exprParts = conditions.map(c => c.expressionEffect);
    parts.push(exprParts.join(', '));
  }

  // Overall depletion state (affects appearance)
  if (depletion.overallDepletion !== 'fresh') {
    const depletionMap: Record<string, string> = {
      tired: 'slightly fatigued expression',
      drained: 'visibly drained and weary',
      haggard: 'haggard and hollow-eyed with deep exhaustion',
    };
    const depletionDesc = depletionMap[depletion.overallDepletion];
    if (depletionDesc) parts.push(depletionDesc);
  }

  return parts.join(', ');
}

function formatBodyPart(bodyPart: string): string {
  const map: Record<string, string> = {
    HEAD: 'head',
    NECK: 'neck',
    TORSO: 'torso',
    RIGHTARM: 'right arm',
    LEFTARM: 'left arm',
    RIGHTUPPERLEG: 'right thigh',
    LEFTUPPERLEG: 'left thigh',
    RIGHTLOWERLEG: 'right shin',
    LEFTLOWERLEG: 'left shin',
  };
  return map[bodyPart] || bodyPart.toLowerCase();
}

// ============================================================
// T4: Narrative Influence (subtle)
// ============================================================

function buildNarrativeBlock(char: PortraitCharacterData): string {
  const parts: string[] = [];

  // Root influences bearing/demeanor
  if (char.root) {
    const rootInfluence = inferRootInfluence(char.root);
    if (rootInfluence) parts.push(rootInfluence);
  }

  // Personality traits affect expression
  if (char.personalityTraits?.length) {
    // Take up to 2 most relevant traits to avoid prompt bloat
    const relevantTraits = char.personalityTraits.slice(0, 2);
    parts.push(...relevantTraits.map(t => `${t} demeanor`));
  }

  // Backstory themes (very subtle)
  if (char.backstoryThemes?.length) {
    const themes = char.backstoryThemes.slice(0, 2);
    parts.push(...themes);
  }

  return parts.join(', ');
}

function inferRootInfluence(root: string): string {
  // Map common root archetypes to visual bearing
  const rootLower = root.toLowerCase();
  if (rootLower.includes('noble') || rootLower.includes('royal')) return 'regal bearing';
  if (rootLower.includes('street') || rootLower.includes('urchin')) return 'street-wise wariness';
  if (rootLower.includes('military') || rootLower.includes('soldier')) return 'military bearing';
  if (rootLower.includes('scholar') || rootLower.includes('academic')) return 'scholarly composure';
  if (rootLower.includes('wild') || rootLower.includes('feral')) return 'wild untamed presence';
  if (rootLower.includes('merchant') || rootLower.includes('trade')) return 'shrewd calculating gaze';
  if (rootLower.includes('clergy') || rootLower.includes('priest')) return 'serene pious bearing';
  if (rootLower.includes('farm') || rootLower.includes('rural')) return 'weathered practical demeanor';
  return '';
}

// ============================================================
// T5: Visual Traits
// ============================================================

function buildTraitBlock(traits: VisualTrait[]): string {
  if (!traits.length) return '';
  return traits.map(t => t.visualDescription).join(', ');
}

// ============================================================
// T6: Environment
// ============================================================

function buildEnvironmentBlock(env?: EnvironmentContext): string {
  if (!env) return '';

  const parts: string[] = [];

  if (env.location) parts.push(env.location);

  if (env.timeOfDay) {
    const timeMap: Record<string, string> = {
      dawn: 'golden dawn light',
      day: 'bright daylight',
      dusk: 'warm dusk glow',
      night: 'moonlit darkness',
    };
    parts.push(timeMap[env.timeOfDay] || '');
  }

  if (env.weather) parts.push(env.weather);

  return parts.filter(Boolean).join(', ');
}

