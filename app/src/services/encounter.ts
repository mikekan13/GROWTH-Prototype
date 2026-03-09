import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ForbiddenError, NotFoundError } from '@/lib/errors';
import { canManageCampaign } from '@/lib/permissions';

// --- Schemas ---

export const createEncounterSchema = z.object({
  name: z.string().min(1, 'Encounter name required').max(200),
  type: z.enum(['combat', 'social', 'exploration', 'puzzle', 'event']).default('combat'),
  data: z.record(z.string(), z.unknown()).optional(),
  locationId: z.string().nullable().optional(),
  sessionId: z.string().nullable().optional(),
});

export const updateEncounterSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  type: z.enum(['combat', 'social', 'exploration', 'puzzle', 'event']).optional(),
  status: z.enum(['PLANNED', 'ACTIVE', 'PAUSED', 'RESOLVED']).optional(),
  round: z.number().int().min(0).optional(),
  phase: z.enum(['intention', 'resolution', 'impact']).optional(),
  data: z.record(z.string(), z.unknown()).optional(),
  locationId: z.string().nullable().optional(),
  sessionId: z.string().nullable().optional(),
});

// --- Default Data ---

function createDefaultEncounter(): Record<string, unknown> {
  return {
    description: '',
    participants: [],
    objectives: [],
    rewards: [],
    notes: '',
  };
}

// --- Service Functions ---

export async function listEncounters(campaignId: string) {
  return prisma.encounter.findMany({
    where: { campaignId },
    orderBy: { updatedAt: 'desc' },
  });
}

export async function getEncounter(encounterId: string, campaignId: string) {
  const encounter = await prisma.encounter.findUnique({
    where: { id: encounterId },
  });

  if (!encounter || encounter.campaignId !== campaignId) {
    throw new NotFoundError('Encounter not found');
  }

  return encounter;
}

export async function createEncounter(
  campaignId: string,
  userId: string,
  userRole: string,
  input: z.infer<typeof createEncounterSchema>,
) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new NotFoundError('Campaign not found');
  if (!canManageCampaign(userId, userRole, campaign)) {
    throw new ForbiddenError('Only the GM can create encounters');
  }

  const data = input.data ?? createDefaultEncounter();

  return prisma.encounter.create({
    data: {
      name: input.name,
      type: input.type ?? 'combat',
      campaignId,
      data: JSON.stringify(data),
      locationId: input.locationId ?? null,
      sessionId: input.sessionId ?? null,
      createdBy: userId,
    },
  });
}

export async function updateEncounter(
  encounterId: string,
  campaignId: string,
  userId: string,
  userRole: string,
  input: z.infer<typeof updateEncounterSchema>,
) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new NotFoundError('Campaign not found');
  if (!canManageCampaign(userId, userRole, campaign)) {
    throw new ForbiddenError('Only the GM can modify encounters');
  }

  const encounter = await prisma.encounter.findUnique({ where: { id: encounterId } });
  if (!encounter || encounter.campaignId !== campaignId) {
    throw new NotFoundError('Encounter not found');
  }

  return prisma.encounter.update({
    where: { id: encounterId },
    data: {
      ...(input.name !== undefined && { name: input.name }),
      ...(input.type !== undefined && { type: input.type }),
      ...(input.status !== undefined && { status: input.status }),
      ...(input.round !== undefined && { round: input.round }),
      ...(input.phase !== undefined && { phase: input.phase }),
      ...(input.data !== undefined && { data: JSON.stringify(input.data) }),
      ...(input.locationId !== undefined && { locationId: input.locationId }),
      ...(input.sessionId !== undefined && { sessionId: input.sessionId }),
    },
  });
}

export async function deleteEncounter(
  encounterId: string,
  campaignId: string,
  userId: string,
  userRole: string,
) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new NotFoundError('Campaign not found');
  if (!canManageCampaign(userId, userRole, campaign)) {
    throw new ForbiddenError('Only the GM can delete encounters');
  }

  const encounter = await prisma.encounter.findUnique({ where: { id: encounterId } });
  if (!encounter || encounter.campaignId !== campaignId) {
    throw new NotFoundError('Encounter not found');
  }

  return prisma.encounter.delete({ where: { id: encounterId } });
}
