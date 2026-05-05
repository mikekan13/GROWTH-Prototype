import 'server-only';

/**
 * GRO.WTH Portrait Pipeline — Character Adapter
 *
 * Transforms Prisma Character model + GrowthCharacter JSON data
 * into the flat PortraitCharacterData structure used by the prompt builder.
 */

import type {
  PortraitCharacterData,
  VisibleEquipment,
  CharacterWound,
  ActiveCondition,
  AttributeDepletionState,
  VisualTrait,
} from './types';
import type {
  GrowthCharacter,
  GrowthConditions,
  GrowthAttributes,
  GrowthVitals,
  GrowthTrait,
  BodyPart,
} from '@/types/growth';

// Body parts visible in bust/half-body portraits
const BUST_VISIBLE_PARTS = new Set<string>([
  'HEAD', 'NECK', 'TORSO', 'RIGHTARM', 'LEFTARM',
]);

/**
 * Extract portrait-relevant data from a Prisma Character record.
 *
 * The Character model stores game data as a JSON string in the `data` field.
 * This function parses it and flattens the relevant fields into PortraitCharacterData.
 */
export function extractPortraitData(
  character: { id: string; campaignId: string | null; data: string; backstory?: { responses: string; narrative?: string | null } | null },
): PortraitCharacterData {
  const charData = JSON.parse(character.data) as GrowthCharacter;

  return {
    characterId: character.id,
    campaignId: character.campaignId,

    // T1: Core Identity
    identity: extractIdentity(charData, character.backstory),
    seed: charData.creation?.seed ? {
      name: charData.creation.seed.name,
      description: charData.creation.seed.description,
    } : undefined,
    root: charData.creation?.root?.name,
    branches: charData.creation?.branches?.map(b => b.name),

    // T2: Visible Equipment
    visibleEquipment: extractVisibleEquipment(charData),

    // T3: Wounds and Status
    wounds: extractWounds(charData.vitals),
    conditions: extractConditions(charData.conditions),
    attributeDepletion: calculateDepletion(charData.attributes),

    // T4: Narrative
    backstoryThemes: extractBackstoryThemes(character.backstory),
    personalityTraits: charData.backstory?.personalityTraits,

    // T5: Visual Traits
    visualTraits: extractVisualTraits(charData.traits),

    // T6: Environment (set per-generation, not from character data)
    environment: undefined,
  };
}

// ============================================================
// Identity Extraction
// ============================================================

function extractIdentity(
  charData: GrowthCharacter,
  backstory?: { responses: string; narrative?: string | null } | null,
): PortraitCharacterData['identity'] {
  const pd = charData.identity.physicalDescription;
  const head = pd?.bodyParts?.HEAD;

  // Build distinguishing features from all body part descriptions
  const distinguishing: string[] = [];
  if (pd?.bodyParts) {
    for (const [part, data] of Object.entries(pd.bodyParts)) {
      if (data.description && part !== 'HEAD') {
        distinguishing.push(data.description);
      }
    }
  }
  // Head "Other Details" field
  if (head?.description) {
    distinguishing.push(head.description);
  }

  // Fallback to backstory-extracted description if no structured data
  const physicalDesc = extractPhysicalDescription(backstory);

  return {
    name: charData.identity.name,
    age: charData.identity.age,
    sex: pd?.gender,
    physicalDescription: physicalDesc,
    skinTone: pd?.skinTone,
    hairColor: head?.hairColor,
    hairLength: head?.hairLength,
    hairTexture: head?.hairTexture,
    hairStyle: head?.hairStyle,
    cosmetics: head?.cosmetics,
    hygiene: head?.hygiene,
    eyeColor: head?.eyeColor,
    facialHair: head?.facialHair,
    bodyType: pd?.build ? `${pd.build}${pd.height ? `, ${Math.floor(pd.height / 12)}'${pd.height % 12}"` : ''}` : undefined,
    distinguishingFeatures: distinguishing.length > 0 ? distinguishing : undefined,
    styleColors: charData.identity.styleColors,
    styleAesthetics: charData.identity.styleAesthetics,
  };
}

function extractPhysicalDescription(
  backstory?: { responses: string; narrative?: string | null } | null,
): string | undefined {
  if (!backstory?.responses) return undefined;

  try {
    const responses = JSON.parse(backstory.responses) as Array<{ prompt: string; response: string }>;
    // Look for physical/appearance-related prompts
    const physicalResponse = responses.find(r => {
      const prompt = r.prompt.toLowerCase();
      return prompt.includes('physical') || prompt.includes('appearance') ||
             prompt.includes('look') || prompt.includes('describe');
    });
    return physicalResponse?.response;
  } catch {
    return undefined;
  }
}

// ============================================================
// Equipment Extraction
// ============================================================

function extractVisibleEquipment(charData: GrowthCharacter): VisibleEquipment[] {
  const equipment: VisibleEquipment[] = [];

  if (!charData.vitals?.equipment) return equipment;

  const layers: Array<{ layer: 'body' | 'clothing' | 'lightArmor' | 'heavyArmor'; slots: typeof charData.vitals.equipment.body }> = [
    { layer: 'body', slots: charData.vitals.equipment.body },
    { layer: 'clothing', slots: charData.vitals.equipment.clothing },
    { layer: 'lightArmor', slots: charData.vitals.equipment.lightArmor },
    { layer: 'heavyArmor', slots: charData.vitals.equipment.heavyArmor },
  ];

  for (const { layer, slots } of layers) {
    if (!slots) continue;
    for (const slot of slots) {
      if (!slot.name) continue;

      // Determine which slot type this covers (for portrait visibility)
      const coveredVisible = slot.coveredParts?.some(p => BUST_VISIBLE_PARTS.has(p)) ?? true;
      if (!coveredVisible) continue;

      equipment.push({
        slot: inferSlotName(slot, layer),
        name: slot.name,
        material: slot.material,
        condition: slot.condition,
        layer,
      });
    }
  }

  return equipment;
}

function inferSlotName(
  slot: { name: string; coveredParts?: BodyPart[] },
  layer: string,
): string {
  // Try to infer the slot from covered parts
  if (slot.coveredParts?.includes('HEAD')) return 'head';
  if (slot.coveredParts?.includes('TORSO')) return 'torso';
  if (slot.coveredParts?.includes('RIGHTARM') || slot.coveredParts?.includes('LEFTARM')) return 'arms';
  if (slot.coveredParts?.includes('NECK')) return 'neck';
  // Fallback to layer name
  return layer;
}

// ============================================================
// Wounds Extraction
// ============================================================

function extractWounds(vitals: GrowthVitals | undefined): CharacterWound[] {
  if (!vitals?.bodyParts) return [];

  const wounds: CharacterWound[] = [];

  for (const [part, damage] of Object.entries(vitals.bodyParts)) {
    if (damage <= 0) continue;

    const severity = damage >= 8 ? 'critical'
      : damage >= 5 ? 'severe'
      : damage >= 3 ? 'moderate'
      : 'minor';

    wounds.push({
      bodyPart: part,
      severity,
      isVisible: BUST_VISIBLE_PARTS.has(part),
    });
  }

  return wounds;
}

// ============================================================
// Conditions Extraction
// ============================================================

function extractConditions(conditions: GrowthConditions | undefined): ActiveCondition[] {
  if (!conditions) return [];

  const active: ActiveCondition[] = [];

  const conditionMap: Record<string, string> = {
    weak: 'strained muscles, diminished posture',
    clumsy: 'unsteady, tense movements',
    exhausted: 'deep fatigue in the eyes, drooping posture',
    deafened: 'distant unfocused gaze',
    deathsDoor: 'pallid skin, hollow eyes, death-touched aura',
    muted: 'closed-off expression, suppressed energy',
    overwhelmed: 'wild desperate eyes, emotional strain',
    confused: 'bewildered unfocused expression',
    incoherent: 'glazed disconnected stare',
  };

  for (const [key, isActive] of Object.entries(conditions)) {
    if (isActive && conditionMap[key]) {
      active.push({
        name: key,
        expressionEffect: conditionMap[key],
      });
    }
  }

  return active;
}

// ============================================================
// Attribute Depletion
// ============================================================

function calculateDepletion(attributes: GrowthAttributes | undefined): AttributeDepletionState {
  if (!attributes) {
    return { overallDepletion: 'fresh', bodyDepletion: 0, spiritDepletion: 0, soulDepletion: 0 };
  }

  const bodyDepletion = calculatePillarDepletion([
    attributes.clout, attributes.celerity, attributes.constitution,
  ]);

  const spiritDepletion = calculatePillarDepletion([
    attributes.flow, attributes.focus,
  ]);

  const soulDepletion = calculatePillarDepletion([
    attributes.willpower, attributes.wisdom, attributes.wit,
  ]);

  const overall = (bodyDepletion + spiritDepletion + soulDepletion) / 3;

  const overallDepletion: AttributeDepletionState['overallDepletion'] =
    overall >= 0.75 ? 'haggard' :
    overall >= 0.5 ? 'drained' :
    overall >= 0.25 ? 'tired' :
    'fresh';

  return { overallDepletion, bodyDepletion, spiritDepletion, soulDepletion };
}

function calculatePillarDepletion(
  attrs: Array<{ level: number; current: number; augmentPositive?: number; augmentNegative?: number }>,
): number {
  let totalMax = 0;
  let totalUsed = 0;

  for (const attr of attrs) {
    const max = attr.level + (attr.augmentPositive || 0) - (attr.augmentNegative || 0);
    if (max <= 0) continue;
    const used = max - attr.current;
    totalMax += max;
    totalUsed += Math.max(0, used);
  }

  return totalMax > 0 ? totalUsed / totalMax : 0;
}

// ============================================================
// Trait Extraction
// ============================================================

function extractVisualTraits(traits: GrowthTrait[] | undefined): VisualTrait[] {
  if (!traits) return [];

  // Filter to traits that have visual manifestation
  // For now, include all traits — the prompt builder will use descriptions
  return traits
    .filter(t => {
      // Skip traits that are purely mechanical with no visual effect
      const desc = (t.description || '').toLowerCase();
      return desc.includes('scar') || desc.includes('mark') || desc.includes('glow') ||
             desc.includes('eye') || desc.includes('skin') || desc.includes('hair') ||
             desc.includes('tattoo') || desc.includes('aura') || desc.includes('horn') ||
             desc.includes('wing') || desc.includes('tail') || desc.includes('scale') ||
             desc.includes('claw') || desc.includes('fang') || desc.includes('visible') ||
             desc.includes('appearance') || desc.includes('physical');
    })
    .map(t => ({
      name: t.name,
      type: t.type,
      visualDescription: t.description,
    }));
}

// ============================================================
// Backstory Theme Extraction
// ============================================================

function extractBackstoryThemes(
  backstory?: { responses: string; narrative?: string | null } | null,
): string[] | undefined {
  if (!backstory?.narrative) return undefined;

  // Extract key theme words from the narrative for subtle portrait influence.
  // This is intentionally light — just picking up dominant mood/theme keywords.
  const narrative = backstory.narrative.toLowerCase();
  const themes: string[] = [];

  const themeKeywords: Record<string, string> = {
    'war': 'battle-hardened',
    'noble': 'aristocratic bearing',
    'orphan': 'self-reliant determination',
    'scholar': 'intellectual curiosity',
    'criminal': 'street-wise wariness',
    'exile': 'haunted by the past',
    'healer': 'compassionate warmth',
    'hunter': 'predatory focus',
    'priest': 'spiritual serenity',
    'merchant': 'calculating shrewdness',
  };

  for (const [keyword, theme] of Object.entries(themeKeywords)) {
    if (narrative.includes(keyword)) {
      themes.push(theme);
    }
  }

  return themes.length > 0 ? themes.slice(0, 2) : undefined;
}
