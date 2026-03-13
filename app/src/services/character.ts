import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ForbiddenError, NotFoundError } from '@/lib/errors';
import { canViewCharacter, canEditCharacter } from '@/lib/permissions';
import { createDefaultCharacter } from '@/lib/defaults';
import { createChangeLogEntry } from '@/services/changelog';

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
      campaignId: character.campaignId,
      characterId,
      characterName: character.name,
      actor: character.campaign.gmUserId === userId ? 'gm' : 'player',
      actorUserId: userId,
      source: 'manual_change',
      beforeData,
      afterData: input.data as Record<string, unknown>,
    }).catch(() => { /* silent — changelog failure should not break character saves */ });
  }

  return result;
}
