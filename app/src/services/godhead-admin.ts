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
import { ForbiddenError, NotFoundError } from '@/lib/errors';
import { isAdminRole, canEditCharacter } from '@/lib/permissions';

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
 * GM/owner-driven "Enable AI" action: promote a crystallized character
 * (NPC, etc.) into an AI-played one by minting a placeholder GodHead row.
 *
 * Gating: viewer must have edit rights for the character (admin, campaign
 * GM, or character owner). Errors if the character already has a persona.
 */
export async function enableAIForCharacter(
  characterId: string,
  userId: string,
  userRole: string,
) {
  const character = await prisma.character.findUnique({
    where: { id: characterId },
    select: {
      id: true,
      name: true,
      userId: true,
      campaign: { select: { gmUserId: true } },
      godHead: { select: { id: true } },
    },
  });
  if (!character) throw new NotFoundError('Character not found');
  if (!canEditCharacter(userId, userRole, character)) {
    throw new ForbiddenError('You do not have edit rights for this character');
  }
  if (character.godHead) {
    throw new ForbiddenError('This character already has an AI persona attached');
  }

  return createPlaceholderGodHead({
    characterId: character.id,
    characterName: character.name,
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
