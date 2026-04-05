import 'server-only';

/**
 * GRO.WTH Portrait Pipeline — Main Service
 *
 * Orchestrates portrait generation, persona locking, and state management.
 * This is the single entry point for all portrait operations.
 */

import { prisma } from '@/lib/db';
import { getPortraitProvider, isPortraitGenerationAvailable, getProviderStatuses } from './providers';
import { diffVisualState } from './state-diff';
import { extractPortraitData } from './character-adapter';
import type {
  PortraitInput,
  PortraitResult,
  CampaignStyleConfig,
  PortraitOverrides,
  PortraitCharacterData,
} from './types';

// ============================================================
// Portrait Generation
// ============================================================

/**
 * Generate a new portrait for a character.
 *
 * Handles the full flow: extract character data → check for persona lock →
 * build prompt → call provider → save to DB → return result.
 */
export async function generatePortrait(
  characterId: string,
  options?: {
    campaignStyle?: CampaignStyleConfig;
    overrides?: PortraitOverrides;
    preferCloud?: boolean;
  },
): Promise<PortraitResult> {
  // 1. Load character data
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    include: { backstory: true },
  });

  if (!character) {
    return {
      success: false,
      metadata: emptyMetadata(),
      error: `Character ${characterId} not found`,
    };
  }

  // 2. Extract portrait-relevant data from character
  const characterData = extractPortraitData(character);

  // 3. Check for existing persona lock
  const personaLock = await prisma.personaLock.findUnique({
    where: { characterId },
  });

  const personaLockData = personaLock ? {
    referenceImagePath: personaLock.referenceImagePath,
    embeddingPath: personaLock.embeddingPath,
    lockedPrompt: personaLock.lockedPrompt,
    lockedSeed: personaLock.lockedSeed,
    pulidWeight: personaLock.pulidWeight,
    bodyDescription: personaLock.bodyDescription,
  } : null;

  // 4. Get provider and generate
  const provider = await getPortraitProvider(options?.preferCloud);

  const input: PortraitInput = {
    characterId,
    characterData,
    personaLock: personaLockData,
    pipelineType: 'character_portrait',
    campaignStyle: options?.campaignStyle,
    overrides: options?.overrides,
  };

  const result = await provider.generatePortrait(input);

  // 5. Save generation record to DB
  if (result.success && result.imagePath) {
    await prisma.portraitGeneration.create({
      data: {
        characterId,
        imagePath: result.imagePath,
        thumbnailPath: result.thumbnailPath || null,
        prompt: result.metadata.prompt,
        negativePrompt: result.metadata.negativePrompt,
        seed: result.metadata.seed,
        model: result.metadata.model,
        steps: result.metadata.steps,
        pulidWeight: result.metadata.pulidWeight || null,
        styleLoraName: result.metadata.styleLoraName || null,
        styleLoraWeight: result.metadata.styleLoraWeight || null,
        generationTimeMs: result.metadata.generationTimeMs,
        stateSnapshot: JSON.stringify(characterData),
        campaignId: character.campaignId,
        status: 'completed',
      },
    });
  }

  return result;
}

// ============================================================
// Portrait Acceptance
// ============================================================

/**
 * Accept a generated portrait as the character's current portrait.
 * Updates the Character.portrait field.
 */
export async function acceptPortrait(
  generationId: string,
  characterId: string,
): Promise<void> {
  // Unset any previous current portrait
  await prisma.portraitGeneration.updateMany({
    where: { characterId, isCurrentPortrait: true },
    data: { isCurrentPortrait: false },
  });

  // Set this one as current
  const generation = await prisma.portraitGeneration.update({
    where: { id: generationId },
    data: {
      status: 'accepted',
      isCurrentPortrait: true,
    },
  });

  // Update character's portrait field
  await prisma.character.update({
    where: { id: characterId },
    data: { portrait: generation.imagePath },
  });
}

// ============================================================
// Persona Lock
// ============================================================

/**
 * Lock a portrait as the character's permanent identity anchor.
 * This stores the reference image and prompt so all future generations
 * use PuLID to maintain the same face and appearance.
 */
export async function lockPersona(
  generationId: string,
  characterId: string,
): Promise<void> {
  const generation = await prisma.portraitGeneration.findUnique({
    where: { id: generationId },
  });

  if (!generation) {
    throw new Error(`Generation ${generationId} not found`);
  }

  // Parse the state snapshot to extract the body description
  const stateSnapshot = JSON.parse(generation.stateSnapshot) as PortraitCharacterData;
  const bodyDescription = buildBodyDescriptionForLock(stateSnapshot);

  // Upsert persona lock (archive existing if re-locking)
  const existingLock = await prisma.personaLock.findUnique({
    where: { characterId },
  });

  if (existingLock) {
    // Re-lock: increment version, archive old reference
    await prisma.personaLock.update({
      where: { characterId },
      data: {
        referenceImagePath: generation.imagePath,
        embeddingPath: '',  // Phase B: extracted from ComfyUI workflow
        lockedPrompt: generation.prompt,
        lockedSeed: generation.seed,
        bodyDescription,
        lockVersion: existingLock.lockVersion + 1,
        previousLockId: existingLock.id,
      },
    });
  } else {
    await prisma.personaLock.create({
      data: {
        characterId,
        referenceImagePath: generation.imagePath,
        embeddingPath: '',  // Phase B
        lockedPrompt: generation.prompt,
        lockedSeed: generation.seed,
        bodyDescription,
        pulidWeight: 0.8,
        loraStrength: 0.6,
      },
    });
  }

  // Also accept this portrait as current
  await acceptPortrait(generationId, characterId);
}

/**
 * Build a locked body description from the character state.
 * This is stored in the persona lock and included in every future prompt
 * to maintain full-body consistency beyond just the face.
 */
function buildBodyDescriptionForLock(state: PortraitCharacterData): string {
  const parts: string[] = [];
  const { identity } = state;

  if (identity.skinTone) parts.push(`${identity.skinTone} skin`);
  if (identity.hairColor) parts.push(`${identity.hairColor} hair`);
  if (identity.hairStyle) parts.push(`${identity.hairStyle}`);
  if (identity.eyeColor) parts.push(`${identity.eyeColor} eyes`);
  if (identity.bodyType) parts.push(`${identity.bodyType} build`);
  if (identity.distinguishingFeatures?.length) {
    parts.push(...identity.distinguishingFeatures);
  }
  if (identity.physicalDescription) parts.push(identity.physicalDescription);

  return parts.join(', ');
}

// ============================================================
// State Diff / Should Regenerate
// ============================================================

/**
 * Check if a character's visual state has changed enough to warrant regeneration.
 */
export async function checkForVisualChanges(characterId: string) {
  // Get the most recently accepted portrait's state snapshot
  const lastPortrait = await prisma.portraitGeneration.findFirst({
    where: { characterId, isCurrentPortrait: true },
    orderBy: { createdAt: 'desc' },
  });

  if (!lastPortrait) {
    return { shouldRegenerate: true, reason: 'No existing portrait', changes: [] };
  }

  // Get current character state
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    include: { backstory: true },
  });

  if (!character) {
    return { shouldRegenerate: false, reason: 'Character not found', changes: [] };
  }

  const previousState = JSON.parse(lastPortrait.stateSnapshot) as PortraitCharacterData;
  const currentState = extractPortraitData(character);

  const diff = diffVisualState(previousState, currentState);

  return {
    shouldRegenerate: diff.hasVisualChanges,
    reason: diff.hasVisualChanges
      ? `${diff.changes.length} visual change(s) detected (${diff.severity})`
      : 'No visual changes',
    changes: diff.changes,
    severity: diff.severity,
  };
}

// ============================================================
// Portrait History
// ============================================================

/** Get all portraits for a character, most recent first */
export async function getPortraitHistory(characterId: string) {
  return prisma.portraitGeneration.findMany({
    where: { characterId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      imagePath: true,
      thumbnailPath: true,
      status: true,
      isCurrentPortrait: true,
      seed: true,
      generationTimeMs: true,
      createdAt: true,
    },
  });
}

/** Delete a portrait (only non-current, non-locked portraits) */
export async function deletePortrait(generationId: string): Promise<void> {
  const generation = await prisma.portraitGeneration.findUnique({
    where: { id: generationId },
  });

  if (!generation) throw new Error('Portrait not found');
  if (generation.isCurrentPortrait) throw new Error('Cannot delete the current portrait');

  // Check if this portrait is used as a persona lock reference
  const lock = await prisma.personaLock.findFirst({
    where: { referenceImagePath: generation.imagePath },
  });
  if (lock) throw new Error('Cannot delete a persona-locked portrait');

  await prisma.portraitGeneration.update({
    where: { id: generationId },
    data: { status: 'archived' },
  });
}

// ============================================================
// Provider Status (for UI)
// ============================================================

export { isPortraitGenerationAvailable, getProviderStatuses };

// ============================================================
// Helpers
// ============================================================

function emptyMetadata() {
  return {
    prompt: '',
    negativePrompt: '',
    seed: 0,
    model: '',
    steps: 0,
    cfg: 0,
    width: 0,
    height: 0,
    generationTimeMs: 0,
  };
}
