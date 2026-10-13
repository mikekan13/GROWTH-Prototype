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
import { ingredientRef, recordProvenanceSafe } from '@/services/provenance';
import { extractPortraitData } from './character-adapter';
import { screenImage } from '@/lib/lawfulness-hooks';
import { WithheldContentError } from '@/lib/errors';
import { storeWithheldRow } from '@/services/lawful-intake';
import type {
  PortraitInput,
  PortraitResult,
  CampaignStyleConfig,
  PortraitOverrides,
  PortraitCharacterData,
  PersonaLockData,
} from './types';
import { resolveMoodKey } from './style-config';

// ============================================================
// Campaign MOOD (style layer 2)
// ============================================================

/**
 * The MOOD key for a portrait job: explicit `styleMood` wins; else the campaign's
 * `genre` (Campaign.genre, free text) — campaign found directly or via the
 * character; else 'growth'. Never throws (a lookup failure → 'growth').
 */
export async function resolvePortraitMood(ctx: {
  styleMood?: string | null;
  campaignId?: string | null;
  characterId?: string | null;
}): Promise<string> {
  if (ctx.styleMood?.trim()) return resolveMoodKey({ styleMood: ctx.styleMood });
  let genre: string | null = null;
  try {
    let campaignId = ctx.campaignId ?? null;
    if (!campaignId && ctx.characterId && ctx.characterId !== 'creation-preview') {
      const ch = await prisma.character.findUnique({ where: { id: ctx.characterId }, select: { campaignId: true } });
      campaignId = ch?.campaignId ?? null;
    }
    if (campaignId) {
      const c = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { genre: true } });
      genre = c?.genre ?? null;
    }
  } catch (e) {
    console.warn('[portraits] mood lookup failed, using default:', e instanceof Error ? e.message : e);
  }
  return resolveMoodKey({ genre });
}

async function withMood(
  style: CampaignStyleConfig | undefined,
  ctx: { campaignId?: string | null; characterId?: string | null },
): Promise<CampaignStyleConfig> {
  return { ...(style ?? {}), styleMood: await resolvePortraitMood({ styleMood: style?.styleMood, ...ctx }) };
}

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
    /** Who asked — for the lawfulness flag. */
    requesterId?: string | null;
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

  // 4. LAWFULNESS (unit 8b) — before anything is queued.
  await assertLawfulImageJob({
    prompt: portraitScreenText(characterData, options?.overrides),
    usesRealReference: !!personaLockData?.referenceImagePath,
    campaignId: character.campaignId,
    userId: options?.requesterId ?? null,
    subjectCharacterIds: [characterId],
  });

  // 5. Get provider and generate
  const provider = await getPortraitProvider(options?.preferCloud);

  const input: PortraitInput = {
    characterId,
    characterData,
    personaLock: personaLockData,
    pipelineType: 'character_portrait',
    campaignStyle: await withMood(options?.campaignStyle, { campaignId: character.campaignId }),
    overrides: options?.overrides,
  };

  const result = await provider.generatePortrait(input);

  // 5. Save generation record to DB
  if (result.success && result.imagePath) {
    const generation = await prisma.portraitGeneration.create({
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
    // Provenance manifest (2026-09-20): a portrait is a COMPOSITE act — the
    // bearer's identity/reference photos + the generator. Ingredients = the
    // character (its identity + PersonaLock ride on it); tool = the model.
    recordProvenanceSafe({
      assetType: 'portrait',
      assetId: generation.id,
      campaignId: character.campaignId,
      creatorUserId: character.userId,
      creatorKind: 'composite',
      tool: `portrait:${result.metadata.model}${result.metadata.styleLoraName ? `+${result.metadata.styleLoraName}` : ''}`,
      ingredients: [ingredientRef('character', characterId)],
      content: result.imagePath,
    });
  }

  return result;
}

/**
 * Generate a portrait from inline description data (no DB character required).
 * Used during character creation before a Character record exists.
 */
export async function generateFromDescription(
  characterData: PortraitCharacterData,
  options?: {
    campaignStyle?: CampaignStyleConfig;
    overrides?: PortraitOverrides;
    preferCloud?: boolean;
    referenceImagePath?: string;
    referenceImagePaths?: string[];
    creationMode?: boolean;
    /** Who asked + where — for the lawfulness flag. */
    requesterId?: string | null;
    campaignId?: string | null;
  },
): Promise<PortraitResult> {
  // Build a persona lock stub if reference image(s) provided.
  // Multiple refs (when available) get chained as FLUX.2 ReferenceLatent anchors.
  const primaryRef = options?.referenceImagePath || options?.referenceImagePaths?.[0];

  // LAWFULNESS (unit 8b) — before anything is queued. A Watcher-enabled nude
  // creation body counts as nudity for the screen (real face → refused; a
  // character recorded under 18 → refused).
  const dbCharacterId = characterData.characterId && characterData.characterId !== 'creation-preview' ? characterData.characterId : undefined;
  const nude = options?.creationMode === true && options?.campaignStyle?.allowNudity === true;
  await assertLawfulImageJob({
    prompt: [portraitScreenText(characterData, options?.overrides), nude ? 'nude' : ''].filter(Boolean).join('\n'),
    usesRealReference: !!primaryRef,
    campaignId: options?.campaignId ?? null,
    userId: options?.requesterId ?? null,
    subjectCharacterIds: dbCharacterId ? [dbCharacterId] : undefined,
    subjectAges: typeof characterData.identity?.age === 'number' ? [characterData.identity.age] : undefined,
    characterId: dbCharacterId,
  });

  const provider = await getPortraitProvider(options?.preferCloud);

  const personaLock: PersonaLockData | null = primaryRef ? {
    referenceImagePath: primaryRef,
    referenceImagePaths: options?.referenceImagePaths,
    embeddingPath: '',
    lockedPrompt: '',
    lockedSeed: 0,
    pulidWeight: 0.8,
    bodyDescription: '',
  } : null;

  const input: PortraitInput = {
    characterId: characterData.characterId || 'creation-preview',
    characterData,
    personaLock,
    pipelineType: 'character_portrait',
    campaignStyle: await withMood(options?.campaignStyle, { campaignId: options?.campaignId, characterId: dbCharacterId }),
    overrides: options?.overrides,
    creationMode: options?.creationMode,  // previously dropped here — caused body gen to render clothed despite creationMode=true
  };

  return provider.generatePortrait(input);
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
 * use FLUX.2 multi-reference to maintain the same face and appearance.
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

// ============================================================
// Lawfulness (unit 8b)
// ============================================================

/** What a refused image job tells the requester. */
export const IMAGE_REFUSED_MESSAGE = 'Image refused: this request cannot be processed. It has been flagged for review.';

/**
 * The USER-controllable text of a portrait job: custom prompts and the
 * sheet's free-text appearance. The pipeline's own fixed recipe (the
 * creation-mode underwear base, style blocks) is not the requester's words and
 * is not screened here — see generateFromDescription for the nude toggle.
 */
export function portraitScreenText(data: PortraitCharacterData, overrides?: PortraitOverrides): string {
  return [
    overrides?.customPrompt,
    overrides?.customPass2Prompt,
    data.identity?.physicalDescription,
    ...(data.identity?.distinguishingFeatures ?? []),
  ].filter((t): t is string => typeof t === 'string' && t.trim() !== '').join('\n');
}

/**
 * Screen an image job before it is queued. Blocked → the prompt is stored as a
 * withheld row (the flag's pointer, when there is a campaign), a flag is raised
 * (IMAGE_PROMPT, or IMAGE_REFERENCE when a real face is involved), and the job
 * is refused with `IMAGE_REFUSED_MESSAGE` (422).
 */
export async function assertLawfulImageJob(job: {
  prompt: string;
  usesRealReference: boolean;
  campaignId?: string | null;
  userId?: string | null;
  subjectCharacterIds?: string[];
  subjectAges?: number[];
  /** For the withheld row when no campaign id is known. */
  characterId?: string;
}): Promise<void> {
  const verdict = await screenImage({
    prompt: job.prompt,
    usesRealReference: job.usesRealReference,
    campaignId: job.campaignId ?? null,
    userId: job.userId ?? null,
    subjectCharacterIds: job.subjectCharacterIds,
    subjectAges: job.subjectAges,
    onBlocked: async (categories) => job.userId
      ? storeWithheldRow({ campaignId: job.campaignId, characterId: job.characterId, userId: job.userId, text: job.prompt, origin: 'IMAGE_JOB' }, categories)
      : null,
  });
  if (verdict.blocked) throw new WithheldContentError(IMAGE_REFUSED_MESSAGE);
}
