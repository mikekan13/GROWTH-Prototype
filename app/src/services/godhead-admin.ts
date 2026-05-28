/**
 * Godhead Admin Service — read/update operations for AI personas attached
 * to characters. Surfaces big-picture metrics (invocation count, token
 * cost, last invocation, wallet balance) without loading every godhead's
 * full memory.
 *
 * Gating (as of 2026-05-26):
 *   - listGodheadsAdmin   — ADMIN-only (global Terminal list).
 *   - getGodheadAdmin     — viewer must be able to EDIT the underlying
 *                           character (admin, campaign GM, or character
 *                           owner). Persona is editable, so read access is
 *                           gated the same way as write.
 *   - updateGodheadAdmin  — same edit-rights check as the GET.
 *   - createPlaceholderGodHead — internal helper; gating is the caller's
 *                                responsibility (entity.ts crystallization
 *                                runs only on GM-driven actions; the
 *                                enable-ai endpoint runs canEditCharacter).
 */

import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';
import { isAdminRole, canEditCharacter, canManageCampaign } from '@/lib/permissions';

export interface GodheadListItem {
  id: string;
  name: string;
  pillar: string;
  domain: string;
  defaultModel: string | null;
  temperature: number;
  walletBalance: string;     // BigInt as string
  invocationCount: number;
  lastInvocationAt: string | null;
  totalInputTokens: number;
  totalOutputTokens: number;
  totalCostEstimateUSD: number;
  memoryEntryCount: number;
  characterId: string;
  createdAt: string;
  updatedAt: string;
}

export async function listGodheadsAdmin(userRole: string): Promise<GodheadListItem[]> {
  if (!isAdminRole(userRole)) throw new ForbiddenError('Admin only');

  const rows = await prisma.godHead.findMany({
    include: {
      _count: { select: { invocations: true, memory: true } },
      invocations: {
        select: { createdAt: true },
        orderBy: { createdAt: 'desc' },
        take: 1,
      },
      tokenUsage: {
        select: { inputTokens: true, outputTokens: true, costEstimate: true },
      },
    },
    orderBy: [{ pillar: 'asc' }, { name: 'asc' }],
  });

  // Pull wallet balances in one query
  const walletIds = rows.map(r => r.walletId).filter((id): id is string => !!id);
  const wallets = walletIds.length
    ? await prisma.wallet.findMany({ where: { id: { in: walletIds } }, select: { id: true, balance: true } })
    : [];
  const walletMap = new Map(wallets.map(w => [w.id, w.balance]));

  return rows.map(r => {
    const totals = r.tokenUsage.reduce(
      (acc, t) => ({
        input: acc.input + t.inputTokens,
        output: acc.output + t.outputTokens,
        cost: acc.cost + t.costEstimate,
      }),
      { input: 0, output: 0, cost: 0 },
    );

    return {
      id: r.id,
      name: r.name,
      pillar: r.pillar,
      domain: r.domain,
      defaultModel: r.defaultModel,
      temperature: r.temperature,
      walletBalance: (r.walletId ? walletMap.get(r.walletId) ?? BigInt(0) : BigInt(0)).toString(),
      invocationCount: r._count.invocations,
      lastInvocationAt: r.invocations[0]?.createdAt.toISOString() ?? null,
      totalInputTokens: totals.input,
      totalOutputTokens: totals.output,
      totalCostEstimateUSD: Math.round(totals.cost * 10000) / 10000,
      memoryEntryCount: r._count.memory,
      characterId: r.characterId,
      createdAt: r.createdAt.toISOString(),
      updatedAt: r.updatedAt.toISOString(),
    };
  });
}

export interface GodheadDetail extends GodheadListItem {
  systemPrompt: string;
  recentInvocations: Array<{
    id: string;
    triggerType: string;
    status: string;
    stepCount: number;
    error: string | null;
    createdAt: string;
  }>;
  memoryEntries: Array<{
    key: string;
    value: string;
    updatedAt: string;
  }>;
  recentActions: Array<{
    id: string;
    toolName: string;
    durationMs: number | null;
    error: string | null;
    createdAt: string;
  }>;
}

export async function getGodheadAdmin(
  userId: string,
  userRole: string,
  name: string,
): Promise<GodheadDetail> {
  const row = await prisma.godHead.findUnique({
    where: { name },
    include: {
      character: { select: { userId: true, campaign: { select: { gmUserId: true } } } },
      _count: { select: { invocations: true, memory: true } },
      invocations: {
        orderBy: { createdAt: 'desc' },
        take: 15,
        select: { id: true, triggerType: true, status: true, stepCount: true, error: true, createdAt: true },
      },
      memory: {
        orderBy: { updatedAt: 'desc' },
        take: 40,
        select: { key: true, value: true, updatedAt: true },
      },
      actionLogs: {
        orderBy: { createdAt: 'desc' },
        take: 25,
        select: { id: true, toolName: true, durationMs: true, error: true, createdAt: true },
      },
      tokenUsage: { select: { inputTokens: true, outputTokens: true, costEstimate: true } },
    },
  });

  if (!row) throw new NotFoundError(`Godhead not found: ${name}`);
  if (!canEditCharacter(userId, userRole, row.character)) {
    throw new ForbiddenError('You do not have edit rights for this character');
  }

  const wallet = row.walletId
    ? await prisma.wallet.findUnique({ where: { id: row.walletId }, select: { balance: true } })
    : null;

  const totals = row.tokenUsage.reduce(
    (acc, t) => ({
      input: acc.input + t.inputTokens,
      output: acc.output + t.outputTokens,
      cost: acc.cost + t.costEstimate,
    }),
    { input: 0, output: 0, cost: 0 },
  );

  return {
    id: row.id,
    name: row.name,
    pillar: row.pillar,
    domain: row.domain,
    defaultModel: row.defaultModel,
    temperature: row.temperature,
    systemPrompt: row.systemPrompt,
    walletBalance: (wallet?.balance ?? BigInt(0)).toString(),
    invocationCount: row._count.invocations,
    lastInvocationAt: row.invocations[0]?.createdAt.toISOString() ?? null,
    totalInputTokens: totals.input,
    totalOutputTokens: totals.output,
    totalCostEstimateUSD: Math.round(totals.cost * 10000) / 10000,
    memoryEntryCount: row._count.memory,
    characterId: row.characterId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    recentInvocations: row.invocations.map(i => ({
      ...i,
      createdAt: i.createdAt.toISOString(),
    })),
    memoryEntries: row.memory.map(m => ({
      ...m,
      updatedAt: m.updatedAt.toISOString(),
    })),
    recentActions: row.actionLogs.map(a => ({
      ...a,
      createdAt: a.createdAt.toISOString(),
    })),
  };
}

export const updateGodheadSchema = z.object({
  systemPrompt: z.string().min(20).max(20_000).optional(),
  temperature: z.number().min(0).max(1).optional(),
  defaultModel: z.string().min(1).max(80).nullable().optional(),
  domain: z.string().min(3).max(500).optional(),
  pillar: z.enum(['MERCY', 'BALANCE', 'SEVERITY', 'TRINITY']).optional(),
});
export type UpdateGodheadInput = z.infer<typeof updateGodheadSchema>;

export async function updateGodheadAdmin(
  userId: string,
  userRole: string,
  name: string,
  input: UpdateGodheadInput,
) {
  const validated = updateGodheadSchema.parse(input);

  const existing = await prisma.godHead.findUnique({
    where: { name },
    include: {
      character: { select: { userId: true, campaign: { select: { gmUserId: true } } } },
    },
  });
  if (!existing) throw new NotFoundError(`Godhead not found: ${name}`);
  if (!canEditCharacter(userId, userRole, existing.character)) {
    throw new ForbiddenError('You do not have edit rights for this character');
  }

  return prisma.godHead.update({
    where: { name },
    data: validated,
  });
}

// Note (2026-05-25, per Mike): no separate godhead creation form. Godheads
// use the same EntityCreationWizard as every other character. The GodHead
// metadata row (system prompt, temperature, default model) is auto-created
// on crystallization when entityType=GODHEAD.
//
// As of 2026-05-26 the same placeholder helper is reused by an
// "Enable AI" flow on the character sheet so GMs can promote any
// crystallized character (NPC, etc.) into an AI-played one without going
// through the Godhead-typed wizard path.
//
// Seed scripts that need to mint godheads outside the wizard should still
// use scripts/seed-godheads*.ts directly.

/**
 * GM/owner-driven AI-action-mode toggle. Sets aiActionMode on the
 * character's GodHead row. If enabling and no GodHead row exists yet,
 * mints a placeholder persona first (so the user only takes one action).
 * Disabling leaves the GodHead row + its memory intact — toggling AI off
 * is purely a flag flip, not a destructive operation.
 *
 * Gating: viewer must have edit rights for the character (admin, campaign
 * GM, or character owner).
 *
 * Returns the resulting GodHead row, so callers can refresh the UI off it.
 */
export async function setAIActionMode(
  characterId: string,
  userId: string,
  userRole: string,
  aiActionMode: boolean,
) {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    select: {
      id: true,
      name: true,
      userId: true,
      campaign: { select: { gmUserId: true } },
      godHead: { select: { id: true, name: true } },
    },
  });
  if (!character) throw new NotFoundError('Character not found');
  if (!canEditCharacter(userId, userRole, character)) {
    throw new ForbiddenError('You do not have edit rights for this character');
  }

  if (!character.godHead) {
    if (!aiActionMode) {
      throw new NotFoundError('No AI persona to disable — character has no GodHead row');
    }
    // Enabling for the first time: mint persona + flip flag on.
    const created = await createPlaceholderGodHead({
      characterId: character.id,
      characterName: character.name,
    });
    return prisma.godHead.update({
      where: { id: created.id },
      data: { aiActionMode: true },
    });
  }

  return prisma.godHead.update({
    where: { id: character.godHead.id },
    data: { aiActionMode },
  });
}

/**
 * GM-driven controller assignment. Sets who is choosing actions for this
 * character: the AI, the GM personally, or a specific Trailblazer in the
 * campaign. Only the campaign GM or admin can call this — it can transfer
 * ownership of a character to another user, so it is more powerful than
 * the plain AI toggle.
 *
 * For mode='AI': mints a placeholder godhead (if needed) and turns
 * aiActionMode on. Character.userId is left unchanged so the prior human
 * controller stays as a fallback when AI is later turned off.
 *
 * For mode='GM': sets aiActionMode=false (if a godhead exists) and points
 * character.userId at campaign.gmUserId — the GM is now scripting it.
 *
 * For mode='PLAYER': sets aiActionMode=false (if a godhead exists) and
 * assigns character.userId to the chosen Trailblazer. The userId must
 * belong to a campaign member whose status is not INTERESTED or REJECTED.
 */
const PLAYER_MEMBER_STATUSES = ['BACKSTORY', 'CHARACTER_CREATION', 'ACTIVE'];

export async function setCharacterController(
  characterId: string,
  sessionUserId: string,
  sessionUserRole: string,
  mode: 'AI' | 'GM' | 'PLAYER',
  assignedUserId?: string,
) {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    select: {
      id: true,
      name: true,
      userId: true,
      campaign: { select: { id: true, gmUserId: true } },
      godHead: { select: { id: true } },
    },
  });
  if (!character) throw new NotFoundError('Character not found');
  if (!character.campaign) throw new ValidationError('Character has no campaign');
  if (!canManageCampaign(sessionUserId, sessionUserRole, character.campaign)) {
    throw new ForbiddenError('Only the campaign GM can reassign character controllers');
  }

  if (mode === 'AI') {
    return setAIActionMode(characterId, sessionUserId, sessionUserRole, true);
  }

  const targetUserId =
    mode === 'GM'
      ? character.campaign.gmUserId
      : assignedUserId;
  if (!targetUserId) {
    throw new ValidationError('assignedUserId is required when controller is PLAYER');
  }

  if (mode === 'PLAYER') {
    // Must be an active campaign member — block reassignment to randos.
    const member = await prisma.campaignMember.findUnique({
      where: { campaignId_userId: { campaignId: character.campaign.id, userId: targetUserId } },
      select: { status: true },
    });
    if (!member || !PLAYER_MEMBER_STATUSES.includes(member.status)) {
      throw new ValidationError('Target user is not an active member of this campaign');
    }
  }

  // Run both writes in a transaction so character ownership + AI mode stay
  // consistent if one fails.
  return prisma.$transaction(async (tx) => {
    if (character.godHead) {
      await tx.godHead.update({
        where: { id: character.godHead.id },
        data: { aiActionMode: false },
      });
    }
    return tx.character.update({
      where: { id: characterId },
      data: { userId: targetUserId },
      select: { id: true, name: true, userId: true },
    });
  });
}

/**
 * Create a GodHead row + KRMA wallet for an existing character, using
 * placeholder persona defaults. Idempotent: returns the existing row if
 * the character already has one.
 *
 * Shared by:
 *   - services/entity.ts crystallization (entityType=GODHEAD auto-provision)
 *   - enableAIForCharacter (GM-triggered enable via the character sheet)
 */
export async function createPlaceholderGodHead(params: {
  characterId: string;
  characterName: string;
}) {
  const { characterId, characterName } = params;

  const existing = await prisma.godHead.findFirst({ where: { characterId } });
  if (existing) return existing;

  const wallet = await prisma.wallet.create({
    data: {
      walletType: 'GODHEAD',
      ownerType: 'GODHEAD',
      label: `${characterName} Wallet`,
      balance: BigInt(0),
    },
  });

  return prisma.godHead.create({
    data: {
      name: characterName,
      domain: 'Placeholder domain — edit via the Persona panel on the character sheet.',
      pillar: 'BALANCE',
      characterId,
      systemPrompt: `You are ${characterName}.\n\n[Persona placeholder — replace this via the AI Persona panel on the character sheet. Until then, behave as a thoughtful, restrained agent who defers to the GM.]`,
      temperature: 0.6,
      defaultModel: 'claude-sonnet-4-6',
      walletId: wallet.id,
    },
  });
}
