import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';
import { canViewCharacter, canEditCharacter } from '@/lib/permissions';
import { createDefaultCharacter } from '@/lib/defaults';
import { createChangeLogEntry } from '@/services/changelog';
import { applyCreationGrants, loadMechanicsForgeItems, type AssignMechanicsInput } from '@/services/character-grants';
import { emit as emitGodHeadEvent } from '@/services/godhead-dispatcher';
import type { GrowthCharacter } from '@/types/growth';

// --- Schemas ---

export const createCharacterSchema = z.object({
  name: z.string().min(1, 'Character name required').max(100),
  campaignId: z.string().min(1, 'Campaign ID required'),
});

export const updateCharacterSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  data: z.record(z.string(), z.unknown()).optional(),
  status: z.string().optional(),
  portrait: z.string().nullable().optional(),
});

// --- Service Functions ---

export async function listCharacters(userId: string) {
  return prisma.character.findMany({
    where: { userId },
    include: {
      campaign: { select: { name: true } },
      backstory: { select: { status: true } },
    },
    orderBy: { updatedAt: 'desc' },
  });
}

export async function getCharacter(characterId: string, userId: string, userRole: string) {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    include: {
      campaign: { select: { name: true, gmUserId: true } },
      backstory: true,
    },
  });

  if (!character) throw new NotFoundError('Character not found');
  if (!canViewCharacter(userId, userRole, character)) throw new ForbiddenError();

  return character;
}

export async function createCharacter(userId: string, input: z.infer<typeof createCharacterSchema>) {
  const campaign = await prisma.campaign.findUnique({ where: { id: input.campaignId } });
  if (!campaign) throw new NotFoundError('Campaign not found');

  const defaultData = createDefaultCharacter(input.name);

  return prisma.character.create({
    data: {
      name: input.name,
      userId,
      campaignId: input.campaignId,
      data: JSON.stringify(defaultData),
    },
  });
}

/**
 * Auto-create a draft Character + empty Backstory for a player whose interest
 * was just accepted by the GM. Called from reviewInterest (campaign service).
 * Idempotent — returns existing character if one is already in flight.
 */
export async function createDraftCharacterForMember(
  userId: string,
  campaignId: string,
  fallbackName: string,
) {
  const existing = await prisma.character.findFirst({
    where: { userId, campaignId, status: { in: ['DRAFT', 'SUBMITTED', 'APPROVED'] } },
  });
  if (existing) return existing;

  const defaultData = createDefaultCharacter(fallbackName);
  const character = await prisma.character.create({
    data: {
      name: fallbackName,
      userId,
      campaignId,
      status: 'DRAFT',
      data: JSON.stringify(defaultData),
    },
  });

  await prisma.characterBackstory.upsert({
    where: { characterId: character.id },
    create: { characterId: character.id, responses: '[]', status: 'DRAFT' },
    update: {},
  });

  return character;
}

export async function updateCharacter(
  characterId: string,
  userId: string,
  userRole: string,
  input: z.infer<typeof updateCharacterSchema>,
) {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    include: { campaign: { select: { gmUserId: true } } },
  });

  if (!character) throw new NotFoundError('Character not found');
  if (!canEditCharacter(userId, userRole, character)) {
    throw new ForbiddenError('Only the GM can modify character data');
  }

  // Immutability: once ACTIVE, players cannot edit their own character —
  // only the GM (or admin) can make changes during play.
  const isGmOrAdmin = character.campaign?.gmUserId === userId || userRole === 'ADMIN';
  if (character.status === 'ACTIVE' && !isGmOrAdmin) {
    throw new ForbiddenError('Locked character — only the GM can modify this in play');
  }

  // Capture before-state for changelog
  const beforeData = input.data ? JSON.parse(character.data) : null;

  const updateData: Record<string, unknown> = {};
  if (input.data) updateData.data = JSON.stringify(input.data);
  if (input.name) updateData.name = input.name;
  if (input.status) updateData.status = input.status;
  if (input.portrait !== undefined) updateData.portrait = input.portrait;

  const result = await prisma.character.update({ where: { id: characterId }, data: updateData });

  // Log changes asynchronously (non-blocking)
  if (beforeData && input.data) {
    createChangeLogEntry({
      campaignId: character.campaignId!,
      characterId,
      characterName: character.name,
      actor: character.campaign?.gmUserId === userId ? 'gm' : 'player',
      actorUserId: userId,
      source: 'manual_change',
      beforeData,
      afterData: input.data as Record<string, unknown>,
    }).catch(() => { /* silent — changelog failure should not break character saves */ });
  }

  return result;
}

// ── Creation lifecycle ────────────────────────────────────────────────────

export const assignMechanicsSchema = z.object({
  seedForgeItemId: z.string().min(1),
  rootForgeItemIds: z.array(z.string().min(1)).max(5).optional(),
  branchForgeItemIds: z.array(z.string().min(1)).max(5).optional(),
});

/**
 * GM applies Seed (+ optional Roots/Branches) to a character.
 * - Loads the referenced ForgeItems (must be published, same campaign).
 * - Runs applyCreationGrants() to initialize attributes/Fate Die/Fated Age/traits.
 * - Sets character.status = 'APPROVED' (mechanics applied, awaiting player lock).
 * - Updates CampaignMember.status to 'CHARACTER_CREATION' if currently BACKSTORY.
 */
export async function assignMechanics(
  characterId: string,
  gmUserId: string,
  gmRole: string,
  input: AssignMechanicsInput,
) {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    include: { campaign: { select: { gmUserId: true, id: true } } },
  });
  if (!character) throw new NotFoundError('Character not found');
  if (!canEditCharacter(gmUserId, gmRole, character)) {
    throw new ForbiddenError('Only the GM can apply mechanics');
  }
  if (character.status === 'ACTIVE') {
    throw new ValidationError('Character is already locked — re-applying mechanics is not allowed');
  }

  const { seed, roots, branches } = await loadMechanicsForgeItems(character.campaignId!, input);

  const existing = JSON.parse(character.data) as GrowthCharacter;
  // Reset to defaults before applying so re-runs don't double-stack.
  const fresh = createDefaultCharacter(character.name);
  fresh.identity = existing.identity ?? fresh.identity;
  fresh.backstory = existing.backstory ?? fresh.backstory;

  const updated = applyCreationGrants(fresh, seed, roots, branches);

  const result = await prisma.character.update({
    where: { id: characterId },
    data: {
      data: JSON.stringify(updated),
      status: 'APPROVED',
    },
  });

  // Transition member status if they were still in BACKSTORY
  await prisma.campaignMember.updateMany({
    where: {
      campaignId: character.campaignId!,
      userId: character.userId,
      status: 'BACKSTORY',
    },
    data: { status: 'CHARACTER_CREATION' },
  });

  return result;
}

/**
 * Player locks in their reviewed character. status: APPROVED → ACTIVE.
 * After this, the player cannot edit the character (only the GM can).
 */
export async function lockCharacter(characterId: string, userId: string) {
  const character = await prisma.character.findUnique({ where: { id: characterId } });
  if (!character) throw new NotFoundError('Character not found');
  if (character.userId !== userId) throw new ForbiddenError('Not your character');
  if (character.status !== 'APPROVED') {
    throw new ValidationError('Character must be in APPROVED (review) state to lock in');
  }

  const result = await prisma.character.update({
    where: { id: characterId },
    data: { status: 'ACTIVE' },
  });

  // Player joins the active party
  await prisma.campaignMember.updateMany({
    where: { campaignId: character.campaignId!, userId, status: { in: ['CHARACTER_CREATION', 'BACKSTORY'] } },
    data: { status: 'ACTIVE' },
  });

  void emitGodHeadEvent('character.locked', {
    characterId,
    campaignId: character.campaignId,
    name: character.name,
  }).catch(() => { /* swallow */ });

  return result;
}

export const requestChangesSchema = z.object({
  notes: z.string().max(2000).optional(),
});

export const canvasPositionSchema = z.object({
  x: z.number(),
  y: z.number(),
});

/**
 * GM places (or repositions) a character on the campaign canvas.
 * Stamps canvasX/canvasY on the character's data JSON; only GMs can call this.
 */
export async function setCanvasPosition(
  characterId: string,
  gmUserId: string,
  gmRole: string,
  input: z.infer<typeof canvasPositionSchema>,
) {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    include: { campaign: { select: { gmUserId: true } } },
  });
  if (!character) throw new NotFoundError('Character not found');
  if (!canEditCharacter(gmUserId, gmRole, character)) {
    throw new ForbiddenError('Only the GM can place characters on the canvas');
  }

  const existing = JSON.parse(character.data) as GrowthCharacter & { canvasX?: number; canvasY?: number };
  existing.canvasX = input.x;
  existing.canvasY = input.y;

  return prisma.character.update({
    where: { id: characterId },
    data: { data: JSON.stringify(existing) },
  });
}

/**
 * Player requests changes to the GM-applied mechanics. status: APPROVED → SUBMITTED.
 * GM re-opens the Mechanics panel, makes changes, re-applies.
 */
export async function requestChanges(
  characterId: string,
  userId: string,
  input: z.infer<typeof requestChangesSchema>,
) {
  const character = await prisma.character.findUnique({ where: { id: characterId } });
  if (!character) throw new NotFoundError('Character not found');
  if (character.userId !== userId) throw new ForbiddenError('Not your character');
  if (character.status !== 'APPROVED') {
    throw new ValidationError('You can only request changes while reviewing');
  }

  const existing = JSON.parse(character.data) as GrowthCharacter;
  existing.backstory = existing.backstory ?? {};
  existing.backstory.notes = input.notes
    ? `${existing.backstory.notes ?? ''}\n\n[Player change request ${new Date().toISOString().slice(0, 10)}] ${input.notes}`.trim()
    : existing.backstory.notes;

  return prisma.character.update({
    where: { id: characterId },
    data: {
      status: 'SUBMITTED',
      data: JSON.stringify(existing),
    },
  });
}
