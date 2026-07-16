/**
 * Nectar bestowal (T32 — the M4 golden path's landing half).
 *
 * A godhead (normally Kai, routed by Et'herling after goal.completed)
 * PROPOSES a Nectar via a structured GodHeadMessage. Nothing touches the
 * sheet until the GM confirms — the confirmation surface is the godhead
 * message panel (INV-57: the gesture lives on the canvas).
 *
 * On ACCEPT (INV-07 cap permitting): the trait lands on the sheet with its
 * mechanical hook (rollModifiers — same engine every roll consumes), and
 * the KRMA value transfers custodian-godhead wallet → character wallet
 * (LOCK, GROVINE_NECTAR) so the bestowal is attributed on the ledger.
 *
 * On DECLINE (player's choice, or the INV-07 cap forces it): the Nectar
 * converts to raw KRMA into MAX FREQUENCY minus the ~10% decline tax
 * (r-2026-06-09) — floor(kv × 0.9) is transferred GROVINE_NECTAR_DECLINE
 * and max Frequency grows by the same; the tax remainder never leaves the
 * godhead's wallet.
 */
import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';
import { canManageCampaign } from '@/lib/permissions';
import { executeTransaction } from '@/services/krma/ledger';
import { getWalletByCharacter, createCharacterWallet } from '@/services/krma/wallet';
import { NECTAR_DECLINE_TAX_RATE } from '@/lib/economy-config';
import type { GrowthCharacter, RollModifier } from '@/types/growth';

export const BESTOWAL_KIND = 'nectar_bestowal';

export interface NectarBestowalProposal {
  kind: typeof BESTOWAL_KIND;
  characterId: string;
  goalId?: string;
  nectar: {
    name: string;
    pillar: 'body' | 'spirit' | 'soul';
    mechanicalEffect: string;
    rollModifiers?: RollModifier[];
  };
  kv: number;
  reason: string;
  resolved?: { action: 'accept' | 'decline'; at: string; by: string };
}

export const proposalSchema = z.object({
  characterId: z.string().min(1),
  goalId: z.string().optional(),
  nectar: z.object({
    name: z.string().min(1).max(120),
    pillar: z.enum(['body', 'spirit', 'soul']),
    mechanicalEffect: z.string().min(1).max(1000),
    rollModifiers: z.array(z.object({
      // INV-29: negatives live ONLY on Thorns — a Nectar is always positive.
      flat: z.number().int().min(1),
      skillNamePattern: z.string().optional(),
      governorAttribute: z.string().optional(),
      label: z.string().optional(),
    })).optional(),
  }),
  kv: z.number().int().min(1).max(10_000),
  reason: z.string().min(1).max(1000),
});

/** Godhead-side: create the structured proposal message for the GM. */
export async function proposeNectarBestowal(
  godHeadId: string,
  campaignId: string,
  input: z.infer<typeof proposalSchema>,
  invocationId?: string,
): Promise<{ messageId: string }> {
  const validated = proposalSchema.parse(input);
  const character = await prisma.character.findUnique({
    where: { id: validated.characterId },
    select: { id: true, name: true, campaignId: true },
  });
  if (!character || character.campaignId !== campaignId) {
    throw new NotFoundError('Character not found in this campaign');
  }
  const proposal: NectarBestowalProposal = { kind: BESTOWAL_KIND, ...validated };
  const message = await prisma.godHeadMessage.create({
    data: {
      godHeadId,
      campaignId,
      direction: 'GODHEAD_TO_GM',
      content: JSON.stringify(proposal),
      invocationId: invocationId ?? null,
    },
  });
  return { messageId: message.id };
}

export function parseBestowalProposal(content: string): NectarBestowalProposal | null {
  try {
    const parsed = JSON.parse(content) as NectarBestowalProposal;
    return parsed.kind === BESTOWAL_KIND ? parsed : null;
  } catch {
    return null;
  }
}

/** INV-07: Nectar+Thorn count cap = Fate Die face value. */
function fateDieCap(charData: GrowthCharacter): number {
  const die = charData.creation?.seed?.baseFateDie ?? 'd4';
  const n = parseInt(String(die).replace(/^d/i, ''), 10);
  return Number.isFinite(n) ? n : 4;
}

/**
 * GM-side resolution. accept = trait + KRMA land; decline = taxed
 * conversion into max Frequency. Both paths mark the message resolved.
 */
export async function resolveNectarBestowal(
  messageId: string,
  action: 'accept' | 'decline',
  gmUserId: string,
  gmRole: string,
): Promise<{ action: 'accept' | 'decline'; amount: number }> {
  const message = await prisma.godHeadMessage.findUnique({
    where: { id: messageId },
    include: { godHead: { select: { id: true, name: true, walletId: true } }, campaign: true },
  });
  if (!message) throw new NotFoundError('Message not found');
  if (!canManageCampaign(gmUserId, gmRole, message.campaign)) {
    throw new ForbiddenError('Only the GM resolves bestowals');
  }
  const proposal = parseBestowalProposal(message.content);
  if (!proposal) throw new ValidationError('Message is not a bestowal proposal');
  if (proposal.resolved) throw new ValidationError(`Already resolved (${proposal.resolved.action})`);
  if (!message.godHead.walletId) throw new ValidationError('Proposing godhead has no wallet');

  const character = await prisma.character.findUnique({ where: { id: proposal.characterId } });
  if (!character) throw new NotFoundError('Character not found');
  const charData = JSON.parse(character.data) as GrowthCharacter;

  // INV-07 cap check at bestowal — a full ledger forces the decline path.
  const traitCount = (charData.traits ?? []).filter(t => t.type === 'nectar' || t.type === 'thorn').length;
  const cap = fateDieCap(charData);
  let effectiveAction = action;
  if (action === 'accept' && traitCount >= cap) {
    throw new ValidationError(
      `INV-07 cap reached (${traitCount}/${cap} for ${charData.creation?.seed?.baseFateDie}) — decline to convert to raw KRMA instead`,
    );
  }

  // Character wallet (lazy-create like crystallization does).
  let charWallet;
  try {
    charWallet = await getWalletByCharacter(proposal.characterId);
  } catch {
    charWallet = await createCharacterWallet(proposal.characterId, message.campaignId);
  }

  let amount: number;
  if (effectiveAction === 'accept') {
    amount = proposal.kv;
    charData.traits = [
      ...(charData.traits ?? []),
      {
        name: proposal.nectar.name,
        type: 'nectar',
        category: 'utility',
        description: proposal.reason,
        pillar: proposal.nectar.pillar,
        mechanicalEffect: proposal.nectar.mechanicalEffect,
        rollModifiers: proposal.nectar.rollModifiers,
      } as GrowthCharacter['traits'][number],
    ];
    await executeTransaction({
      fromWalletId: message.godHead.walletId,
      toWalletId: charWallet.id,
      amount: BigInt(amount),
      state: 'LOCK',
      reason: 'GROVINE_NECTAR',
      description: `Nectar bestowed: ${proposal.nectar.name} (${proposal.reason.slice(0, 120)})`,
      metadata: { messageId, characterId: proposal.characterId, goalId: proposal.goalId },
      campaignId: message.campaignId,
      actorId: message.godHead.id,
      actorType: 'GODHEAD',
      idempotencyKey: `bestow:${messageId}`,
    });
  } else {
    // Decline: taxed conversion into MAX Frequency.
    amount = Math.floor(proposal.kv * (1 - NECTAR_DECLINE_TAX_RATE));
    if (amount > 0) {
      await executeTransaction({
        fromWalletId: message.godHead.walletId,
        toWalletId: charWallet.id,
        amount: BigInt(amount),
        state: 'LOCK',
        reason: 'GROVINE_NECTAR_DECLINE',
        description: `Nectar declined: ${proposal.nectar.name} → ${amount} raw KRMA into max Frequency (10% tax)`,
        metadata: { messageId, characterId: proposal.characterId, goalId: proposal.goalId },
        campaignId: message.campaignId,
        actorId: message.godHead.id,
        actorType: 'GODHEAD',
        idempotencyKey: `bestow-decline:${messageId}`,
      });
      if (charData.attributes?.frequency) {
        charData.attributes.frequency.level += amount;
        charData.attributes.frequency.current += amount;
      }
    }
  }

  await prisma.character.update({
    where: { id: proposal.characterId },
    data: { data: JSON.stringify(charData) },
  });

  // Mark the proposal resolved (in-place on the message content).
  proposal.resolved = { action: effectiveAction, at: new Date().toISOString(), by: gmUserId };
  await prisma.godHeadMessage.update({
    where: { id: messageId },
    data: { content: JSON.stringify(proposal), readAt: new Date() },
  });

  return { action: effectiveAction, amount };
}
