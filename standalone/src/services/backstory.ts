import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';
import { canEditCharacter } from '@/lib/permissions';

// --- Schemas ---

const backstoryResponseItem = z.object({
  prompt: z.string(),
  response: z.string(),
});

export const submitBackstorySchema = z.object({
  responses: z.array(backstoryResponseItem).min(1),
  submit: z.boolean().optional(),
});

export const reviewBackstorySchema = z.object({
  status: z.enum(['APPROVED', 'REVISION']),
  gmNotes: z.string().max(2000).optional(),
});

// --- Service Functions ---

export async function submitBackstory(
  characterId: string,
  userId: string,
  input: z.infer<typeof submitBackstorySchema>,
) {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    select: { userId: true },
  });

  if (!character) throw new NotFoundError('Character not found');
  if (character.userId !== userId) throw new ForbiddenError('Not your character');

  if (input.submit && input.responses.filter(r => r.response.trim()).length < 3) {
    throw new ValidationError('Please answer at least 3 prompts before submitting');
  }

  return prisma.characterBackstory.upsert({
    where: { characterId },
    create: {
      characterId,
      responses: JSON.stringify(input.responses),
      status: input.submit ? 'SUBMITTED' : 'DRAFT',
    },
    update: {
      responses: JSON.stringify(input.responses),
      status: input.submit ? 'SUBMITTED' : 'DRAFT',
    },
  });
}

export async function reviewBackstory(
  characterId: string,
  userId: string,
  userRole: string,
  input: z.infer<typeof reviewBackstorySchema>,
) {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    include: { campaign: { select: { gmUserId: true } } },
  });

  if (!character) throw new NotFoundError('Character not found');
  if (!canEditCharacter(userId, userRole, character)) {
    throw new ForbiddenError('Only GM can review backstories');
  }

  return prisma.characterBackstory.update({
    where: { characterId },
    data: { status: input.status, gmNotes: input.gmNotes || null },
  });
}
