import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';
import { isAdminRole } from '@/lib/permissions';
import { executeTransaction } from './krma/ledger';
import { getWalletByCampaign, getWalletByCharacter, createCharacterWallet } from './krma/wallet';
import type { TransactionReason } from '@/types/krma';

/**
 * Session Rewards — flow KRMA from the campaign reserve into a character's
 * wallet during or after a session.
 *
 * Per design: GM approves a reward to a character with a reason code (one of
 * the SESSION_REWARD-family transaction reasons defined in types/krma.ts).
 * Reward writes a normal ledger transaction; the campaignEvent log records
 * the GM's stated reason ("closed a goal", "key roleplay moment", etc.) so
 * later UI can audit/replay.
 */

const REWARD_REASONS = [
  'SESSION_REWARD',
  'GROVINE_NECTAR',
  'STORY_INFLUENCE',
  'GROUP_CONTRIBUTION',
  'DIVINE_FAVOR',
] as const satisfies ReadonlyArray<TransactionReason>;

export const grantSessionRewardSchema = z.object({
  sessionId: z.string().min(1),
  characterId: z.string().min(1),
  amount: z.number().int().positive().max(1_000_000),
  reason: z.enum(REWARD_REASONS).default('SESSION_REWARD'),
  note: z.string().max(500).optional(),
});

export type GrantSessionRewardInput = z.infer<typeof grantSessionRewardSchema>;

export async function grantSessionReward(
  gmUserId: string,
  gmRole: string,
  input: GrantSessionRewardInput,
) {
  const session = await prisma.gameSession.findUnique({
    where: { id: input.sessionId },
    include: { campaign: true },
  });
  if (!session) throw new NotFoundError('Session not found');

  const isGM = session.campaign.gmUserId === gmUserId;
  if (!isGM && !isAdminRole(gmRole)) {
    throw new ForbiddenError('Only the GM or admin can grant session rewards');
  }

  const character = await prisma.character.findUnique({ where: { id: input.characterId } });
  if (!character) throw new NotFoundError('Character not found');
  if (character.campaignId !== session.campaignId) {
    throw new ValidationError('Character is not in this campaign');
  }

  // Lazy-create the character wallet on first reward.
  let charWallet;
  try {
    charWallet = await getWalletByCharacter(input.characterId);
  } catch {
    charWallet = await createCharacterWallet(input.characterId, session.campaignId);
  }

  const campaignWallet = await getWalletByCampaign(session.campaignId);

  const tx = await executeTransaction({
    fromWalletId: campaignWallet.id,
    toWalletId: charWallet.id,
    amount: BigInt(input.amount),
    state: 'FLUID',
    reason: input.reason,
    description: input.note ?? `Session ${session.number} reward to ${character.name}`,
    metadata: { sessionId: input.sessionId, characterId: input.characterId, note: input.note },
    campaignId: session.campaignId,
    actorId: gmUserId,
    actorType: 'GM',
    // Idempotency: a single (session, character, amount, reason) combo
    // de-dupes accidental double-clicks within the same GM session. If the
    // GM genuinely wants to grant the same reward twice, they include a note
    // to vary the key.
    idempotencyKey: `session-reward::${input.sessionId}::${input.characterId}::${input.reason}::${input.amount}::${input.note ?? ''}`,
  });

  // Record as a session event so the UI can render the timeline.
  const gmUser = await prisma.user.findUnique({ where: { id: gmUserId }, select: { username: true } });
  await prisma.campaignEvent.create({
    data: {
      campaignId: session.campaignId,
      sessionId: input.sessionId,
      type: 'reward',
      actor: 'gm',
      actorUserId: gmUserId,
      actorName: gmUser?.username ?? 'GM',
      payload: JSON.stringify({
        characterId: input.characterId,
        characterName: character.name,
        amount: input.amount,
        reason: input.reason,
        note: input.note,
        transactionId: tx.id,
      }),
    },
  });

  return { transaction: tx, amount: input.amount, characterId: input.characterId };
}

export async function listSessionRewards(
  userId: string,
  userRole: string,
  sessionId: string,
) {
  const session = await prisma.gameSession.findUnique({
    where: { id: sessionId },
    include: { campaign: true },
  });
  if (!session) throw new NotFoundError('Session not found');
  const isGM = session.campaign.gmUserId === userId;
  if (!isGM && !isAdminRole(userRole)) {
    // Players can see rewards granted in sessions they're part of, but for
    // simplicity in v1 we only expose the listing to GM/admin.
    throw new ForbiddenError('Only the GM or admin can list session rewards');
  }
  const events = await prisma.campaignEvent.findMany({
    where: { campaignId: session.campaignId, sessionId, type: 'reward' },
    orderBy: { createdAt: 'desc' },
  });
  return events.map(e => {
    let payload: Record<string, unknown> = {};
    try { payload = JSON.parse(e.payload as string); } catch { /* skip */ }
    return {
      id: e.id,
      createdAt: e.createdAt,
      ...payload,
    };
  });
}
