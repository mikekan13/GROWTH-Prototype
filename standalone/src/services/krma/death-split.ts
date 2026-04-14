/**
 * KRMA Death Split Service
 *
 * Orchestrates the multi-transaction death process.
 * When a character dies, their locked KRMA is decomposed
 * component-by-component and routed to the correct destinations.
 */
import { prisma } from '@/lib/db';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { executeBatch, type CreateTransactionInput } from './ledger';
import { getWalletByOwner, getWalletByCampaign, getWalletByCharacter, getSystemWallet } from './wallet';
import { calculateTKV, calculateDeathSplit, hashEvaluator } from './evaluator';
import type { GrowthCharacter } from '@/types/growth';
import type { TransactionRecord, DeathSplitManifest } from '@/types/krma';
import { SYSTEM_WALLETS } from '@/types/krma';

export interface DeathSplitResult {
  transactions: TransactionRecord[];
  manifest: DeathSplitManifest;
  characterId: string;
  spiritPackageKV: number;
}

export async function executeDeathSplit(
  characterId: string,
  campaignId: string,
  deathContext: { cause: string; sessionId?: string },
  actorId: string,
): Promise<DeathSplitResult> {
  // Load character
  const character = await prisma.character.findUnique({ where: { id: characterId } });
  if (!character) throw new NotFoundError('Character not found');
  if (character.campaignId !== campaignId) throw new ValidationError('Character does not belong to this campaign');
  if (character.status === 'DEAD') throw new ValidationError('Character is already dead');

  // Parse character data
  let charData: GrowthCharacter;
  try {
    charData = JSON.parse(character.data) as GrowthCharacter;
  } catch {
    throw new ValidationError('Invalid character data');
  }

  // Load wallets
  const characterWallet = await getWalletByCharacter(characterId);
  const campaignWallet = await getWalletByCampaign(campaignId);
  const playerWallet = await getWalletByOwner(character.userId);
  const ladyDeathWallet = await getSystemWallet('LADY_DEATH', SYSTEM_WALLETS.LADY_DEATH);

  // Calculate TKV and death split
  const tkv = calculateTKV(charData);
  const manifest = calculateDeathSplit(charData, tkv);

  // Verify the split accounts for the character wallet balance
  const totalSplit = BigInt(manifest.toCampaign + manifest.toPlayer + manifest.toLadyDeath);
  if (totalSplit > characterWallet.balance) {
    // Split exceeds wallet — use wallet balance as ceiling, proportionally reduce
    // This can happen if KV was partially spent or the evaluator changed
    // For safety, we cap at actual balance
  }

  // Build transaction batch
  const transactions: CreateTransactionInput[] = [];
  const batchId = crypto.randomUUID();
  const evalHash = hashEvaluator();

  const baseMeta = {
    characterId,
    campaignId,
    deathContext,
    evaluatorVersion: tkv.version,
    evaluatorHash: evalHash,
    batchId,
  };

  // Body KRMA → campaign
  if (manifest.toCampaign > 0) {
    const amount = capAmount(BigInt(manifest.toCampaign), characterWallet.balance);
    if (amount > BigInt(0)) {
      transactions.push({
        fromWalletId: characterWallet.id,
        toWalletId: campaignWallet.id,
        amount,
        state: 'UNLOCK',
        reason: 'DEATH_BODY_RETURN',
        description: `Death: Body/Soul/destroyed components return to campaign`,
        metadata: { ...baseMeta, components: manifest.components.filter(c => c.destination === 'campaign') },
        campaignId,
        actorId,
        actorType: 'SYSTEM',
        idempotencyKey: `death-${characterId}-campaign-${batchId}`,
      });
    }
  }

  // Spirit/Soul to player → Spirit Package
  if (manifest.toPlayer > 0) {
    const amount = capAmount(BigInt(manifest.toPlayer), characterWallet.balance - BigInt(manifest.toCampaign));
    if (amount > BigInt(0)) {
      transactions.push({
        fromWalletId: characterWallet.id,
        toWalletId: playerWallet.id,
        amount,
        state: 'UNLOCK',
        reason: 'DEATH_SPIRIT_TO_PLAYER',
        description: `Death: Spirit Package → player ownership`,
        metadata: {
          ...baseMeta,
          components: manifest.components.filter(c => c.destination === 'player'),
          deathSplitManifest: manifest,
        },
        campaignId,
        actorId,
        actorType: 'SYSTEM',
        idempotencyKey: `death-${characterId}-player-${batchId}`,
      });
    }
  }

  // Frequency → Lady Death
  if (manifest.toLadyDeath > 0) {
    const alreadyAllocated = BigInt(manifest.toCampaign) + BigInt(manifest.toPlayer);
    const amount = capAmount(BigInt(manifest.toLadyDeath), characterWallet.balance - alreadyAllocated);
    if (amount > BigInt(0)) {
      transactions.push({
        fromWalletId: characterWallet.id,
        toWalletId: ladyDeathWallet.id,
        amount,
        state: 'UNLOCK',
        reason: 'DEATH_FREQUENCY_SINK',
        description: `Death: Frequency tax → Lady Death`,
        metadata: { ...baseMeta },
        campaignId,
        actorId,
        actorType: 'SYSTEM',
        idempotencyKey: `death-${characterId}-ladydeath-${batchId}`,
      });
    }
  }

  // Execute all death transactions atomically
  let results: TransactionRecord[] = [];
  if (transactions.length > 0) {
    results = await executeBatch(transactions);
  }

  // Update character status to DEAD
  await prisma.character.update({
    where: { id: characterId },
    data: { status: 'DEAD' },
  });

  return {
    transactions: results,
    manifest,
    characterId,
    spiritPackageKV: manifest.toPlayer,
  };
}

/** Cap an amount to not exceed available balance (can't go negative) */
function capAmount(desired: bigint, available: bigint): bigint {
  if (available <= BigInt(0)) return BigInt(0);
  return desired > available ? available : desired;
}
