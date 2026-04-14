import 'server-only';
import { prisma } from '@/lib/db';
import { ForbiddenError, NotFoundError } from '@/lib/errors';
import { isAdminRole, canManageCampaign } from '@/lib/permissions';
import { createDefaultCharacter } from '@/lib/defaults';

/**
 * Entity service — campaign entity listing and management.
 * Entities are Characters with a campaign association (excludes GODHEAD).
 */

export interface EntityListItem {
  id: string;
  name: string;
  entityType: string;
  status: string;
  portrait: string | null;
  seedName: string | null;
  tkv: number | null;
  stewarding: boolean;       // true if a player stewards this entity (PC)
  stewardName: string | null;
  activeGoals: number;
  createdAt: string;
}

export async function listCampaignEntities(
  campaignId: string,
  userId: string,
  userRole: string,
): Promise<EntityListItem[]> {
  // Verify campaign exists and user has access
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true, gmUserId: true, members: { select: { userId: true } } },
  });

  if (!campaign) throw new NotFoundError('Campaign not found');

  const isGM = campaign.gmUserId === userId;
  const isMember = campaign.members.some(m => m.userId === userId);
  if (!isGM && !isMember && !isAdminRole(userRole)) {
    throw new ForbiddenError('Not a member of this campaign');
  }

  const characters = await prisma.character.findMany({
    where: {
      campaignId,
      entityType: { not: 'GODHEAD' },
    },
    select: {
      id: true,
      name: true,
      entityType: true,
      status: true,
      portrait: true,
      data: true,
      userId: true,
      user: { select: { username: true } },
      goals: {
        where: { status: 'ACTIVE' },
        select: { id: true },
      },
      createdAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  return characters.map(c => {
    // Parse seed name and TKV from character JSON data
    let seedName: string | null = null;
    let tkv: number | null = null;
    try {
      const data = JSON.parse(c.data);
      seedName = data?.creation?.seed?.name || null;
      tkv = data?.tkv ?? null;
    } catch { /* invalid JSON, skip */ }

    // An entity is "stewarded" if it's a PLAYER_CHARACTER type (owned by a player)
    const stewarding = c.entityType === 'PLAYER_CHARACTER';

    return {
      id: c.id,
      name: c.name,
      entityType: c.entityType,
      status: c.status,
      portrait: c.portrait,
      seedName,
      tkv,
      stewarding,
      stewardName: stewarding ? c.user.username : null,
      activeGoals: c.goals.length,
      createdAt: c.createdAt.toISOString(),
    };
  });
}

// --- Draft creation and management ---

export async function createDraftEntity(
  campaignId: string,
  userId: string,
  userRole: string,
): Promise<{ id: string }> {
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { id: true, gmUserId: true },
  });

  if (!campaign) throw new NotFoundError('Campaign not found');
  if (!canManageCampaign(userId, userRole, campaign)) {
    throw new ForbiddenError('Only the GM can create entities');
  }

  const defaultData = createDefaultCharacter('New Entity');
  const character = await prisma.character.create({
    data: {
      name: 'New Entity',
      entityType: 'NPC',
      status: 'DRAFT',
      userId,
      campaignId,
      data: JSON.stringify(defaultData),
    },
    select: { id: true },
  });

  return { id: character.id };
}

export interface DraftStepData {
  step: number;
  name?: string;
  prompt?: string;
  targetKV?: number;
  characterData?: Record<string, unknown>;
}

export async function saveDraftStep(
  entityId: string,
  userId: string,
  userRole: string,
  stepData: DraftStepData,
): Promise<void> {
  const character = await prisma.character.findUnique({
    where: { id: entityId },
    select: { id: true, name: true, data: true, campaign: { select: { gmUserId: true } } },
  });

  if (!character) throw new NotFoundError('Entity not found');
  if (!character.campaign) throw new NotFoundError('Entity has no campaign');
  if (!canManageCampaign(userId, userRole, character.campaign)) {
    throw new ForbiddenError('Only the GM can edit entities');
  }

  // Merge step data into existing character data
  const existing = JSON.parse(character.data) as Record<string, unknown>;
  const merged = { ...existing, ...(stepData.characterData || {}) };

  // Store wizard metadata (prompt, targetKV, current step) in a _wizardDraft key
  const wizardDraft = (existing._wizardDraft as Record<string, unknown>) || {};
  const updatedWizard = {
    ...wizardDraft,
    step: stepData.step,
    prompt: stepData.prompt ?? (wizardDraft.prompt as string) ?? '',
    targetKV: stepData.targetKV ?? (wizardDraft.targetKV as number) ?? 500,
  };
  merged._wizardDraft = updatedWizard;

  await prisma.character.update({
    where: { id: entityId },
    data: {
      name: stepData.name || character.name,
      data: JSON.stringify(merged),
    },
  });
}

export async function loadDraftEntity(
  entityId: string,
  userId: string,
  userRole: string,
): Promise<{ id: string; name: string; data: Record<string, unknown> }> {
  const character = await prisma.character.findUnique({
    where: { id: entityId },
    select: { id: true, name: true, status: true, data: true, campaign: { select: { gmUserId: true } } },
  });

  if (!character) throw new NotFoundError('Entity not found');
  if (!character.campaign) throw new NotFoundError('Entity has no campaign');
  if (!canManageCampaign(userId, userRole, character.campaign)) {
    throw new ForbiddenError('Only the GM can edit entities');
  }
  if (character.status !== 'DRAFT') {
    throw new ForbiddenError('Entity is not a draft');
  }

  return {
    id: character.id,
    name: character.name,
    data: JSON.parse(character.data),
  };
}
