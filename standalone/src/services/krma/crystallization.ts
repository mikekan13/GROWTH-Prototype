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

  // Look up GM name for event logging
  const gmUser = await prisma.user.findUnique({ where: { id: gmUserId }, select: { username: true } });

  // Record as a campaign event
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
