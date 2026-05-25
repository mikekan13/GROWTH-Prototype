import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';
import { isAdminRole, canManageCampaign } from '@/lib/permissions';
import { createDefaultCharacter } from '@/lib/defaults';
import { isPrimeCampaign } from '@/lib/prime-campaign';
import type { GrowthCharacter, SkillGovernor } from '@/types/growth';
import { assignMechanics } from './character';
import { createGoal } from './goal';

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

  // Prime Campaign override: godheads ARE the party here, so don't filter them out.
  // For every other campaign, godheads remain hidden (they belong to Prime).
  const campaignRow = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { name: true },
  });
  const includeGodheads = isPrimeCampaign(campaignRow);

  const characters = await prisma.character.findMany({
    where: {
      campaignId,
      ...(includeGodheads ? {} : { entityType: { not: 'GODHEAD' } }),
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
    select: { id: true, name: true, gmUserId: true },
  });

  if (!campaign) throw new NotFoundError('Campaign not found');
  if (!canManageCampaign(userId, userRole, campaign)) {
    throw new ForbiddenError('Only the GM can create entities');
  }

  // In Prime, every new entity is a GODHEAD. Everywhere else, NPC default.
  // (Mike's design: same wizard for everyone — Prime context decides the type.)
  const entityType = isPrimeCampaign(campaign) ? 'GODHEAD' : 'NPC';

  const defaultData = createDefaultCharacter('New Entity');
  if (entityType === 'GODHEAD') {
    defaultData.fatedAge = 0; // eternal
  }
  const character = await prisma.character.create({
    data: {
      name: 'New Entity',
      entityType,
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
  /**
   * Per-step wizard state that doesn't belong in the canonical character
   * JSON yet — branches/skills/traits/goals queued for crystallization.
   * Persisted under `_wizardDraft.<key>` to round-trip cleanly.
   */
  wizardExtra?: Record<string, unknown>;
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
    ...(stepData.wizardExtra || {}),
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

// ── Crystallization ──────────────────────────────────────────────────────

export const crystallizeSchema = z.object({
  seedName: z.string().nullable().optional(),
  rootForgeItemId: z.string().nullable().optional(),
  branchForgeItemIds: z.array(z.string()).default([]),
  attributes: z.record(z.string(), z.number().int().min(1).max(20)).default({}),
  skills: z.array(z.object({
    name: z.string().min(1),
    level: z.number().int().min(1).max(20),
    governors: z.array(z.string()).min(1),
    description: z.string().optional(),
    forgeItemId: z.string().optional(),
  })).default([]),
  traits: z.array(z.object({
    name: z.string().min(1),
    type: z.enum(['nectar', 'thorn']),
    description: z.string().optional(),
    pillar: z.enum(['body', 'spirit', 'soul']).optional(),
    mechanicalEffect: z.string().optional(),
    forgeItemId: z.string().optional(),
  })).default([]),
  goals: z.array(z.object({
    description: z.string().min(3).max(500),
    priority: z.number().int().min(1).max(5),
  })).default([]),
  targetKV: z.number().int().min(0).optional(),
});

export type CrystallizeInput = z.infer<typeof crystallizeSchema>;

/**
 * Convert a DRAFT entity into an APPROVED one by applying:
 *   - Seed + Root + Branches via assignMechanics (initializes attributes/Fate Die/etc.)
 *   - Wizard-tuned attribute levels (layered on top of seed augments)
 *   - Selected skills + traits (Nectars/Thorns)
 *   - Goals (created via goal service so godhead dispatch fires)
 *
 * Strips the `_wizardDraft` scratchpad off the character data on success.
 */
export async function crystallizeEntity(
  entityId: string,
  userId: string,
  userRole: string,
  input: CrystallizeInput,
): Promise<{ id: string; status: string }> {
  const validated = crystallizeSchema.parse(input);

  const character = await prisma.character.findUnique({
    where: { id: entityId },
    select: { id: true, name: true, status: true, data: true, campaignId: true, entityType: true, campaign: { select: { gmUserId: true } } },
  });
  if (!character) throw new NotFoundError('Entity not found');
  if (!character.campaign) throw new NotFoundError('Entity has no campaign');
  if (!canManageCampaign(userId, userRole, character.campaign)) {
    throw new ForbiddenError('Only the GM can crystallize entities');
  }
  if (character.status !== 'DRAFT') {
    throw new ValidationError('Entity must be in DRAFT status to crystallize');
  }

  // Step 1: If seed + root provided, run assignMechanics. This resets
  // attributes/Fate Die/Fated Age from the forge templates.
  if (validated.rootForgeItemId) {
    // Find the seed forge item id by name (assignMechanics expects an id).
    let seedForgeItemId: string | undefined;
    if (validated.seedName) {
      const seedItem = await prisma.forgeItem.findFirst({
        where: { campaignId: character.campaignId!, type: 'seed', name: validated.seedName, status: 'published' },
        select: { id: true },
      });
      seedForgeItemId = seedItem?.id;
    }
    if (seedForgeItemId) {
      await assignMechanics(entityId, userId, userRole, {
        seedForgeItemId,
        rootForgeItemIds: [validated.rootForgeItemId],
        branchForgeItemIds: validated.branchForgeItemIds,
      });
    }
  }

  // Step 2: Re-read character (assignMechanics may have mutated data)
  const post = await prisma.character.findUnique({
    where: { id: entityId },
    select: { data: true },
  });
  const charData = JSON.parse(post!.data) as GrowthCharacter & Record<string, unknown>;

  // Step 3: Apply wizard-tuned attribute LEVELS on top of seed augments.
  // The seed contributed augmentPositive via applyCreationGrants; we set
  // `.level` from the wizard. `current` mirrors level + augments.
  if (charData.attributes) {
    const attrs = charData.attributes as unknown as Record<string, { level?: number; current?: number; augmentPositive?: number; augmentNegative?: number } | undefined>;
    for (const [name, level] of Object.entries(validated.attributes)) {
      const a = attrs[name];
      if (a && typeof a === 'object') {
        a.level = level;
        // Reset current pool to full
        const pos = a.augmentPositive ?? 0;
        const neg = a.augmentNegative ?? 0;
        a.current = level + pos - neg;
      }
    }
  }

  // Step 4: Append wizard-selected skills (de-dup by forgeItemId or name)
  const existingSkills = charData.skills || [];
  const skillKey = (s: { name: string; forgeItemId?: string }) => s.forgeItemId ?? `name:${s.name.toLowerCase()}`;
  const existingKeys = new Set(existingSkills.map(s => skillKey(s)));
  for (const sk of validated.skills) {
    if (existingKeys.has(skillKey(sk))) continue;
    existingSkills.push({
      name: sk.name,
      level: sk.level,
      governors: sk.governors as SkillGovernor[],
      description: sk.description,
      forgeItemId: sk.forgeItemId,
    });
  }
  charData.skills = existingSkills;

  // Step 5: Append wizard-selected traits (Nectars + Thorns)
  const existingTraits = charData.traits || [];
  const traitNames = new Set(existingTraits.map(t => t.name.toLowerCase()));
  for (const tr of validated.traits) {
    if (traitNames.has(tr.name.toLowerCase())) continue;
    existingTraits.push({
      name: tr.name,
      type: tr.type,
      // Default category for wizard-selected traits; forge-authored traits
      // will carry their own category in metadata and override at runtime.
      category: 'utility',
      description: tr.description ?? '',
      pillar: tr.pillar,
      mechanicalEffect: tr.mechanicalEffect,
    });
  }
  charData.traits = existingTraits;

  // Step 6: Strip the wizard scratchpad and persist character data + APPROVED
  delete (charData as Record<string, unknown>)._wizardDraft;
  await prisma.character.update({
    where: { id: entityId },
    data: {
      data: JSON.stringify(charData),
      status: 'APPROVED',
    },
  });

  // Step 7: Create Goals (each call fires godhead dispatcher for triage).
  // Failures here don't roll back crystallization — log and continue.
  for (const g of validated.goals) {
    try {
      await createGoal(userId, userRole, {
        characterId: entityId,
        campaignId: character.campaignId!,
        description: g.description,
        priority: g.priority,
      });
    } catch { /* swallow — character is already crystallized */ }
  }

  // Step 8: Godhead provisioning — when entityType=GODHEAD (which happens
  // automatically in Prime Campaign), spin up the GodHead row + KRMA wallet
  // so the AI agent has identity to run on. Persona placeholders here;
  // admin edits them via the Persona sub-panel on the character sheet.
  // Idempotent: skipped if a GodHead row already exists for this character.
  if (character.entityType === 'GODHEAD') {
    const existing = await prisma.godHead.findFirst({ where: { characterId: entityId } });
    if (!existing) {
      const wallet = await prisma.wallet.create({
        data: {
          walletType: 'GODHEAD',
          ownerType: 'GODHEAD',
          label: `${character.name} Wallet`,
          balance: BigInt(0),
        },
      });
      await prisma.godHead.create({
        data: {
          name: character.name,
          domain: 'Placeholder domain — edit via the Persona panel on the character sheet.',
          pillar: 'BALANCE',
          characterId: entityId,
          systemPrompt: `You are ${character.name}, a God-head of GRO.WTH.\n\n[Persona placeholder — the admin will replace this via the Persona panel on your character sheet. Until then, behave as a thoughtful, restrained agent who defers to the GM.]`,
          temperature: 0.6,
          defaultModel: 'claude-sonnet-4-6',
          walletId: wallet.id,
        },
      });
    }
  }

  return { id: entityId, status: 'APPROVED' };
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
