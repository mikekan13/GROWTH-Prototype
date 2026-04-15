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
import {
  getDefaultStyleConfig, applyCampaignStyle, getCompositionPreset, getAnglePreset,
  getCreationModeNegative, getFaceOnlyNegative,
  getStyleTags, getStyleSentences,
  getIdentityLockTags, getIdentityLockReinforcement,
} from './style-config';

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
    const anglePreset = getAnglePreset(overrides.anglePreset);

    // Verified working formula (bf706666-*.png + 9445b459-*.png):
    // clip_l and t5xxl receive IDENTICAL text — the style/bald tag stack, then
    // face block, then angle. Do NOT split tags/prose. Do NOT append reinforcement
    // sentences (bf706666 proved them unnecessary once the prompt order was right).
    const clipLParts = [getIdentityLockTags(), faceBlock, anglePreset];
    const clipL = clipLParts.filter(Boolean).join(', ');

    const reinforcement = getIdentityLockReinforcement();
    const t5xxl = reinforcement ? clipL + '. ' + reinforcement : clipL;

    return {
      clipL,
      t5xxl,
      negativePrompt: getFaceOnlyNegative(),
      identityBlock,
      bodyDescriptionBlock: bodyBlock || '',
    };
  }

  // ── STANDARD PORTRAIT MODE ──
  // Build separate tag list (clip_l) and sentence list (t5xxl)
  const tags: string[] = [];
  const sentences: string[] = [];

  // STYLE — all 3 LoRA triggers (ckpf, aidmafluxpro1.1, drkfnts style) are in the global style
  tags.push(getStyleTags());
  sentences.push(getStyleSentences());

  // IDENTITY (tags = keywords, sentences = natural language)
  tags.push(identityBlock);
  sentences.push(buildIdentitySentence(char));

  // BODY DESCRIPTION
  if (bodyBlock) {
    tags.push(bodyBlock);
    sentences.push(buildBodySentence(char));
  }

  if (creationMode) {
    // Mature filter governs nudity vs underwear.
    //   allowNudity=true  → fully nude (anatomical reference, NSFW LoRA fires)
    //   allowNudity=false → plain underwear (default SFW; body proportions still legible)
    const allowNude = campaignStyle?.allowNudity === true;
    if (allowNude) {
      tags.push('nude, completely bare, no clothing, no accessories, no armor, no jewelry');
      sentences.push('The character is completely nude with bare skin, no clothing whatsoever, no armor, no accessories, no jewelry.');
    } else {
      tags.push('wearing plain neutral grey bra and panties, simple modest underwear only, no other clothing, no armor, no accessories, no jewelry');
      sentences.push('The character wears only simple plain neutral grey underwear (bra and panties), no other clothing, no armor, no accessories, no jewelry.');
    }
    tags.push('A-pose standing, arms slightly away from body, symmetric stance');
    tags.push('full body from head to feet, entire body visible, feet on ground');
    sentences.push('They stand in an A-pose with arms held slightly away from the body in a symmetric stance.');
    sentences.push('The entire body is visible from head to feet including the full figure and both feet on the ground.');
  } else {
    // T2: EQUIPMENT
    const equipBlock = buildEquipmentBlock(char.visibleEquipment);
    if (equipBlock) {
      tags.push(equipBlock);
      sentences.push(buildEquipmentSentence(char.visibleEquipment));
    }

    // T3: STATUS (wounds + conditions + depletion)
    const statusBlock = buildStatusBlock(char.wounds, char.conditions, char.attributeDepletion);
    if (statusBlock) {
      tags.push(statusBlock);
      // Status is already descriptive enough for t5xxl
      sentences.push(statusBlock + '.');
    }
  }

  // T4: NARRATIVE (subtle)
  const narrativeBlock = buildNarrativeBlock(char);
  if (narrativeBlock) {
    tags.push(narrativeBlock);
    sentences.push(narrativeBlock + '.');
  }

  // T5: VISUAL TRAITS
  const traitBlock = buildTraitBlock(char.visualTraits);
  if (traitBlock) {
    tags.push(traitBlock);
    sentences.push(traitBlock + '.');
  }

  // STEERING WORDS
  if (overrides?.steeringWords?.length) {
    tags.push(overrides.steeringWords.join(', '));
    sentences.push(overrides.steeringWords.join(', ') + '.');
  }

  // COMPOSITION
  const composition = overrides?.composition
    ? getCompositionPreset(overrides.composition)
    : config.compositionSuffix;
  tags.push(composition);
  sentences.push(composition + '.');

  if (!creationMode) {
    const envBlock = buildEnvironmentBlock(char.environment);
    if (envBlock) {
      tags.push(envBlock);
      sentences.push(envBlock + '.');
    }
  } else {
    tags.push('neutral grey studio background, soft even lighting');
    sentences.push('Neutral grey studio background with soft even lighting.');
  }

  const negativePrompt = creationMode ? getCreationModeNegative() : config.negativePrompt;

  return {
    clipL: tags.filter(Boolean).join(', '),
    t5xxl: sentences.filter(Boolean).join(' '),
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

  // Hair FIRST + STRAND-LEVEL emphasis. FLUX interprets "long hair" as flowing fabric
  // (robes/cloaks) without strand-texture tokens. Stacking "individual strands" +
  // "hair texture" prevents the robe-confusion seen in early body gen tests.
  // (See CREATION_MODE_NEGATIVE for the matching no-robe negative tokens.)
  const hairDesc = [identity.hairColor, identity.hairLength, identity.hairTexture].filter(Boolean);
  if (hairDesc.length > 0) {
    const hairCore = hairDesc.join(' ');
    if (identity.hairStyle) {
      parts.push(`${hairCore} hair worn ${identity.hairStyle}`);
    } else {
      parts.push(`${hairCore} hair`);
    }
    parts.push(`hair made of individual strands, hair texture clearly visible`);
    parts.push(`glossy ${identity.hairColor || hairCore} silken hair flowing freely behind shoulders and down the back`);
  }

  if (identity.skinTone) parts.push(`${identity.skinTone} skin`);
  if (identity.cosmetics) parts.push(identity.cosmetics);
  if (identity.hygiene && identity.hygiene !== 'Average') {
    parts.push(`${identity.hygiene.toLowerCase()} appearance`);
  }
  if (identity.eyeColor) parts.push(`${identity.eyeColor} eyes`);
  if (identity.bodyType) parts.push(`${identity.bodyType} build`);

  // Distinguishing features (tattoos, birthmarks, piercings, scars) — dedupe
  // because character.identity.distinguishingFeatures has been observed to contain
  // the same string repeated 9x (autosave bug). Duplicates bloat the prompt and
  // exhaust the token window.
  if (identity.distinguishingFeatures?.length) {
    parts.push(...Array.from(new Set(identity.distinguishingFeatures)));
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

  // Face lock = ONLY the bare face. No hair, no cosmetics, no accessories, nothing.
  // Hair/body/equipment get added back in regular portrait generation.
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

// ============================================================
// T5-XXL Sentence Builders (natural language for T5 encoder)
// ============================================================

/** Build a natural language sentence describing the face for identity lock */
function buildFaceSentence(char: PortraitCharacterData): string {
  const { identity, seed } = char;
  const parts: string[] = [];

  const agePart = identity.age ? `${identity.age}-year-old` : '';
  const sexPart = identity.sex || '';
  const seedPart = seed?.name || '';
  const coreParts = [agePart, sexPart, seedPart].filter(Boolean);
  if (coreParts.length > 0) {
    parts.push(`The subject is a ${coreParts.join(' ')}.`);
  }

  if (identity.skinTone) parts.push(`They have ${identity.skinTone} skin.`);
  if (identity.eyeColor) parts.push(`Their eyes are ${identity.eyeColor}.`);

  return parts.join(' ');
}

/** Build a natural language sentence describing the character's identity */
function buildIdentitySentence(char: PortraitCharacterData): string {
  const { identity, seed } = char;
  const parts: string[] = [];

  const agePart = identity.age ? `${identity.age}-year-old` : '';
  const sexPart = identity.sex || '';
  const seedPart = seed?.name || '';
  const coreParts = [agePart, sexPart, seedPart].filter(Boolean);
  if (coreParts.length > 0) {
    parts.push(`A ${coreParts.join(' ')}.`);
  }

  if (seed?.description) parts.push(seed.description + '.');
  if (identity.physicalDescription) parts.push(identity.physicalDescription + '.');

  return parts.join(' ');
}

/** Build a natural language sentence describing the character's body */
function buildBodySentence(char: PortraitCharacterData): string {
  const { identity } = char;
  const parts: string[] = [];

  if (identity.skinTone) parts.push(`${identity.skinTone} skin`);

  const hairDesc = [identity.hairColor, identity.hairLength, identity.hairTexture].filter(Boolean);
  if (hairDesc.length > 0) {
    let hair = `${hairDesc.join(' ')} hair`;
    if (identity.hairStyle) hair += ` worn ${identity.hairStyle}`;
    parts.push(hair);
  }

  if (identity.eyeColor) parts.push(`${identity.eyeColor} eyes`);
  if (identity.bodyType) parts.push(`a ${identity.bodyType} build`);

  if (identity.distinguishingFeatures?.length) {
    parts.push(Array.from(new Set(identity.distinguishingFeatures)).join(', '));
  }

  if (parts.length === 0) return '';
  return `They have ${parts.join(', ')}.`;
}

/** Build a natural language sentence describing visible equipment */
function buildEquipmentSentence(equipment: VisibleEquipment[]): string {
  if (!equipment.length) return '';

  const held = equipment.filter(e => e.slot.startsWith('held'));
  const worn = equipment.filter(e => !e.slot.startsWith('held'));
  const parts: string[] = [];

  if (worn.length > 0) {
    const wornParts = worn.map(e => {
      const conditionAdj = getConditionAdjective(e.condition);
      const materialPart = e.material ? `${e.material} ` : '';
      return `${conditionAdj}${materialPart}${e.name}`.trim();
    });
    parts.push(`They are wearing ${wornParts.join(', ')}.`);
  }

  if (held.length > 0) {
    const heldParts = held.map(e => {
      const materialPart = e.material ? `${e.material} ` : '';
      return `${materialPart}${e.name}`.trim();
    });
    parts.push(`They are holding ${heldParts.join(' and ')}.`);
  }

  return parts.join(' ');
}

