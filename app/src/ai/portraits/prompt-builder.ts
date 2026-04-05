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
import { getDefaultStyleConfig, applyCampaignStyle, getCompositionPreset } from './style-config';

// ============================================================
// Main Entry Point
// ============================================================

export function buildPortraitPrompt(
  char: PortraitCharacterData,
  campaignStyle?: CampaignStyleConfig,
  overrides?: PortraitOverrides,
): PromptOutput {
  const baseConfig = getDefaultStyleConfig();
  const config = applyCampaignStyle(baseConfig, campaignStyle);

  const blocks: string[] = [];

  // STYLE BLOCK (constant)
  blocks.push(config.stylePrefix);

  // T1: IDENTITY BLOCK (always included)
  const identityBlock = buildIdentityBlock(char);
  blocks.push(identityBlock);

  // T1: BODY DESCRIPTION BLOCK
  const bodyBlock = buildBodyDescriptionBlock(char);
  if (bodyBlock) blocks.push(bodyBlock);

  // T2: EQUIPMENT BLOCK
  const equipBlock = buildEquipmentBlock(char.visibleEquipment);
  if (equipBlock) blocks.push(equipBlock);

  // T3: STATUS BLOCK (wounds + conditions + depletion)
  const statusBlock = buildStatusBlock(char.wounds, char.conditions, char.attributeDepletion);
  if (statusBlock) blocks.push(statusBlock);

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

  // T6: ENVIRONMENT BLOCK
  const envBlock = buildEnvironmentBlock(char.environment);
  if (envBlock) blocks.push(envBlock);

  return {
    prompt: blocks.filter(Boolean).join(', '),
    negativePrompt: config.negativePrompt,
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
  if (identity.hairColor && identity.hairStyle) {
    parts.push(`${identity.hairColor} ${identity.hairStyle} hair`);
  } else if (identity.hairColor) {
    parts.push(`${identity.hairColor} hair`);
  } else if (identity.hairStyle) {
    parts.push(`${identity.hairStyle} hair`);
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

