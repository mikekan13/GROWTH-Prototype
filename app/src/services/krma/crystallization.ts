/**
 * KRMA Crystallization Service — Manages fluid → crystallized entity transitions
 *
 * When entities cross the purple line on the canvas, their KV is committed
 * to the campaign's karmic ledger. This service records those events
 * and updates campaign event logs.
 */
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { NotFoundError, ForbiddenError, ValidationError } from '@/lib/errors';
import { canManageCampaign } from '@/lib/permissions';
import type { CrystallizationLedgerEntry, EntityType } from '@/types/crystallization';
import { executeTransaction } from './ledger';
import { createCharacterWallet, getWalletByCampaign, getWalletByCharacter } from './wallet';

// ── Schemas ──

export const crystallizeSchema = z.object({
  entityId: z.string().min(1),
  entityType: z.enum(['character', 'location', 'item']),
  entityName: z.string().min(1),
  karmicValue: z.number().int().min(0),
  action: z.enum(['crystallize', 'dissolve']),
});

// ── Crystallization Logic ──

export async function crystallizeEntity(
  gmUserId: string,
  gmRole: string,
  campaignId: string,
  input: z.infer<typeof crystallizeSchema>,
): Promise<CrystallizationLedgerEntry> {
  // Verify GM access
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new NotFoundError('Campaign not found');
  if (!canManageCampaign(gmUserId, gmRole, campaign)) {
    throw new ForbiddenError('Only the campaign GM can crystallize entities');
  }

  // Load existing ledger from campaign events
  const existingEntries = await getCrystallizationLedger(campaignId);
  const currentPool = existingEntries.reduce((sum, e) => {
    return sum + (e.action === 'crystallize' ? e.kvCommitted : -e.kvCommitted);
  }, 0);

  // Prevent double-crystallization
  const isAlreadyCrystallized = existingEntries.some(
    e => e.entityId === input.entityId && e.action === 'crystallize'
      && !existingEntries.some(d => d.entityId === input.entityId && d.action === 'dissolve'
        && new Date(d.timestamp) > new Date(e.timestamp))
  );

  if (input.action === 'crystallize' && isAlreadyCrystallized) {
    throw new ValidationError('Entity is already crystallized');
  }
  if (input.action === 'dissolve' && !isAlreadyCrystallized) {
    throw new ValidationError('Entity is not crystallized');
  }

  const poolBefore = currentPool;
  const poolAfter = input.action === 'crystallize'
    ? currentPool + input.karmicValue
    : currentPool - input.karmicValue;

  const entry: CrystallizationLedgerEntry = {
    id: crypto.randomUUID(),
    entityId: input.entityId,
    entityType: input.entityType as EntityType,
    entityName: input.entityName,
    kvCommitted: input.karmicValue,
    action: input.action,
    poolBefore,
    poolAfter,
    actorId: gmUserId,
    timestamp: new Date().toISOString(),
  };

  // ── KRMA investment FIRST (CHARACTER only for now) ─────────────────────
  // When a character crystallizes, KRMA equal to its TKV is transferred from
  // the campaign wallet into a per-character wallet. On dissolve, it returns.
  // The transfer runs BEFORE the crystallization event is recorded: a failed
  // transfer (insufficient campaign funds) must leave NO crystallize entry,
  // otherwise the already-crystallized guard permanently blocks the retry
  // (T29 e2e caught exactly that). Locations and items don't yet have
  // per-entity wallets; their KV is only tracked in the campaignEvent ledger.
  if (input.entityType === 'character' && input.karmicValue > 0) {
    try {
      const campaignWallet = await getWalletByCampaign(campaignId);
      if (input.action === 'crystallize') {
        // Lazy-create the character wallet on first crystallization.
        let charWallet;
        try {
          charWallet = await getWalletByCharacter(input.entityId);
        } catch {
          charWallet = await createCharacterWallet(input.entityId, campaignId);
        }
        await executeTransaction({
          fromWalletId: campaignWallet.id,
          toWalletId: charWallet.id,
          amount: BigInt(input.karmicValue),
          state: 'LOCK',
          reason: 'CHARACTER_INVEST',
          description: `Invested ${input.karmicValue} KRMA into ${input.entityName}`,
          metadata: { entityId: input.entityId, entityName: input.entityName, crystallizationId: entry.id },
          campaignId,
          actorId: gmUserId,
          actorType: 'GM',
          idempotencyKey: `crystallize::${entry.id}`,
        });
      } else if (input.action === 'dissolve') {
        // Refund from character wallet back to campaign.
        const charWallet = await getWalletByCharacter(input.entityId);
        await executeTransaction({
          fromWalletId: charWallet.id,
          toWalletId: campaignWallet.id,
          amount: BigInt(input.karmicValue),
          state: 'UNLOCK',
          reason: 'CHARACTER_ADJUST',
          description: `Dissolved ${input.entityName} — refunded ${input.karmicValue} KRMA`,
          metadata: { entityId: input.entityId, entityName: input.entityName, crystallizationId: entry.id },
          campaignId,
          actorId: gmUserId,
          actorType: 'GM',
          idempotencyKey: `dissolve::${entry.id}`,
        });
      }
    } catch (err) {
      throw new ValidationError(
        `Crystallization aborted — KRMA transfer failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // Look up GM name for event logging
  const gmUser = await prisma.user.findUnique({ where: { id: gmUserId }, select: { username: true } });

  // Record as a campaign event (only after the money actually moved).
  await prisma.campaignEvent.create({
    data: {
      campaignId,
      type: 'game_event',
      actor: 'gm',
      actorUserId: gmUserId,
      actorName: gmUser?.username ?? 'GM',
      payload: JSON.stringify({
        subtype: 'crystallization',
        ...entry,
      }),
    },
  });

  return entry;
}

// ── Ledger Queries ──

export async function getCrystallizationLedger(campaignId: string): Promise<CrystallizationLedgerEntry[]> {
  const events = await prisma.campaignEvent.findMany({
    where: {
      campaignId,
      type: 'game_event',
    },
    orderBy: { createdAt: 'asc' },
  });

  const entries: CrystallizationLedgerEntry[] = [];
  for (const event of events) {
    try {
      const payload = JSON.parse(event.payload as string);
      if (payload.subtype === 'crystallization') {
        entries.push({
          id: payload.id,
          entityId: payload.entityId,
          entityType: payload.entityType,
          entityName: payload.entityName,
          kvCommitted: payload.kvCommitted,
          action: payload.action,
          poolBefore: payload.poolBefore,
          poolAfter: payload.poolAfter,
          actorId: payload.actorId,
          timestamp: payload.timestamp,
        });
      }
    } catch {
      // Skip malformed events
    }
  }

  return entries;
}

/** Get the current total crystallized KV for a campaign */
export async function getCampaignCrystallizedPool(campaignId: string): Promise<{
  totalKV: number;
  entityCount: number;
  entries: CrystallizationLedgerEntry[];
}> {
  const entries = await getCrystallizationLedger(campaignId);
  const totalKV = entries.reduce((sum, e) => {
    return sum + (e.action === 'crystallize' ? e.kvCommitted : -e.kvCommitted);
  }, 0);

  // Count currently crystallized entities
  const crystallizedEntities = new Set<string>();
  for (const entry of entries) {
    if (entry.action === 'crystallize') {
      crystallizedEntities.add(entry.entityId);
    } else {
      crystallizedEntities.delete(entry.entityId);
    }
  }

  return { totalKV, entityCount: crystallizedEntities.size, entries };
}

/** Get set of currently crystallized entity IDs */
export async function getCrystallizedEntityIds(campaignId: string): Promise<Set<string>> {
  const entries = await getCrystallizationLedger(campaignId);
  const crystallized = new Set<string>();
  for (const entry of entries) {
    if (entry.action === 'crystallize') {
      crystallized.add(entry.entityId);
    } else {
      crystallized.delete(entry.entityId);
    }
  }
  return crystallized;
}
