/**
 * KRMA Wallet Service — Wallet CRUD, funding, and transaction history
 *
 * Wallets are the containers for KRMA. Every unit of KRMA
 * lives in exactly one wallet at any given time.
 */
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { NotFoundError, ForbiddenError, ValidationError } from '@/lib/errors';
import { canManageCampaign } from '@/lib/permissions';
import { executeTransaction } from './ledger';
import type { WalletType, WalletSummary, TransactionRecord, TransactionMetadata } from '@/types/krma';

// ── Schemas ──

export const fundCampaignSchema = z.object({
  amount: z.number().int().positive('Amount must be a positive integer'),
  idempotencyKey: z.string().min(1, 'Idempotency key required'),
});

// ── Wallet Creation ──

export async function createUserWallet(userId: string): Promise<WalletSummary> {
  const existing = await prisma.wallet.findUnique({ where: { ownerId: userId } });
  if (existing) return toWalletSummary(existing);

  const wallet = await prisma.wallet.create({
    data: {
      ownerId: userId,
      walletType: 'USER',
      ownerType: 'USER',
      balance: BigInt(0),
    },
  });
  return toWalletSummary(wallet);
}

export async function createCampaignWallet(campaignId: string): Promise<WalletSummary> {
  const existing = await prisma.wallet.findFirst({ where: { campaignId, walletType: 'CAMPAIGN' } });
  if (existing) return toWalletSummary(existing);

  const wallet = await prisma.wallet.create({
    data: {
      walletType: 'CAMPAIGN',
      ownerType: 'CAMPAIGN',
      campaignId,
      label: null,
      balance: BigInt(0),
    },
  });
  return toWalletSummary(wallet);
}

export async function createCharacterWallet(characterId: string, campaignId: string): Promise<WalletSummary> {
  const existing = await prisma.wallet.findFirst({ where: { characterId, walletType: 'CHARACTER' } });
  if (existing) return toWalletSummary(existing);

  const wallet = await prisma.wallet.create({
    data: {
      walletType: 'CHARACTER',
      ownerType: 'CHARACTER',
      characterId,
      campaignId,
      label: null,
      balance: BigInt(0),
    },
  });
  return toWalletSummary(wallet);
}

export async function createSystemWallet(walletType: WalletType, label: string): Promise<WalletSummary> {
  const existing = await prisma.wallet.findFirst({ where: { walletType, label } });
  if (existing) return toWalletSummary(existing);

  const wallet = await prisma.wallet.create({
    data: {
      walletType,
      ownerType: walletType,
      label,
      balance: BigInt(0),
    },
  });
  return toWalletSummary(wallet);
}

// ── Wallet Queries ──

export async function getWallet(walletId: string): Promise<WalletSummary> {
  const wallet = await prisma.wallet.findUnique({ where: { id: walletId } });
  if (!wallet) throw new NotFoundError(`Wallet not found: ${walletId}`);
  return toWalletSummary(wallet);
}

export async function getWalletByOwner(ownerId: string): Promise<WalletSummary> {
  const wallet = await prisma.wallet.findUnique({ where: { ownerId } });
  if (!wallet) throw new NotFoundError(`No wallet found for user: ${ownerId}`);
  return toWalletSummary(wallet);
}

export async function getWalletByCampaign(campaignId: string): Promise<WalletSummary> {
  const wallet = await prisma.wallet.findFirst({ where: { campaignId, walletType: 'CAMPAIGN' } });
  if (!wallet) throw new NotFoundError(`No wallet found for campaign: ${campaignId}`);
  return toWalletSummary(wallet);
}

export async function getWalletByCharacter(characterId: string): Promise<WalletSummary> {
  const wallet = await prisma.wallet.findFirst({ where: { characterId, walletType: 'CHARACTER' } });
  if (!wallet) throw new NotFoundError(`No wallet found for character: ${characterId}`);
  return toWalletSummary(wallet);
}

export async function getReserveWallet(label: string): Promise<WalletSummary> {
  const wallet = await prisma.wallet.findFirst({ where: { walletType: 'RESERVE', label } });
  if (!wallet) throw new NotFoundError(`Reserve wallet not found: ${label}`);
  return toWalletSummary(wallet);
}

export async function getSystemWallet(walletType: WalletType, label: string): Promise<WalletSummary> {
  const wallet = await prisma.wallet.findFirst({ where: { walletType, label } });
  if (!wallet) throw new NotFoundError(`System wallet not found: ${walletType}/${label}`);
  return toWalletSummary(wallet);
}

export async function getAllReserveWallets(): Promise<WalletSummary[]> {
  const wallets = await prisma.wallet.findMany({ where: { walletType: 'RESERVE' } });
  return wallets.map(toWalletSummary);
}

// ── Campaign Economy ──

export interface CampaignEconomy {
  campaignId: string;
  fluid: bigint;
  crystallized: bigint;
  total: bigint;
  characterBreakdown: { characterId: string; name: string; balance: bigint }[];
}

export async function getCampaignEconomy(campaignId: string): Promise<CampaignEconomy> {
  let campaignWallet = await prisma.wallet.findFirst({
    where: { campaignId, walletType: 'CAMPAIGN' },
  });
  // Auto-create wallet for campaigns that predate the KRMA system
  if (!campaignWallet) {
    campaignWallet = await prisma.wallet.create({
      data: { walletType: 'CAMPAIGN', ownerType: 'CAMPAIGN', campaignId, balance: BigInt(0) },
    });
  }

  const [characterWallets, characters] = await Promise.all([
    prisma.wallet.findMany({
      where: { campaignId, walletType: 'CHARACTER' },
      select: { characterId: true, balance: true },
    }),
    prisma.character.findMany({
      where: { campaignId },
      select: { id: true, name: true },
    }),
  ]);

  const nameMap = new Map(characters.map(c => [c.id, c.name]));

  let crystallized = BigInt(0);
  const characterBreakdown = characterWallets.map(w => {
    crystallized += w.balance;
    return {
      characterId: w.characterId!,
      name: nameMap.get(w.characterId!) ?? 'Unknown',
      balance: w.balance,
    };
  });

  const fluid = campaignWallet.balance;
  return {
    campaignId,
    fluid,
    crystallized,
    total: fluid + crystallized,
    characterBreakdown,
  };
}

// ── Campaign Funding ──

export async function fundCampaign(
  gmUserId: string,
  gmRole: string,
  campaignId: string,
  amount: bigint,
  idempotencyKey: string,
): Promise<TransactionRecord> {
  // Validate GM owns this campaign
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new NotFoundError('Campaign not found');
  if (!canManageCampaign(gmUserId, gmRole, campaign)) {
    throw new ForbiddenError('Only the campaign GM can fund this campaign');
  }

  const gmWallet = await getWalletByOwner(gmUserId);
  const campaignWallet = await getWalletByCampaign(campaignId);

  return executeTransaction({
    fromWalletId: gmWallet.id,
    toWalletId: campaignWallet.id,
    amount,
    state: 'FLUID',
    reason: 'CAMPAIGN_FUND',
    description: `GM funded campaign "${campaign.name}"`,
    metadata: { campaignId },
    campaignId,
    actorId: gmUserId,
    actorType: 'GM',
    idempotencyKey,
  });
}

export async function defundCampaign(
  gmUserId: string,
  gmRole: string,
  campaignId: string,
  amount: bigint,
  idempotencyKey: string,
): Promise<TransactionRecord> {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new NotFoundError('Campaign not found');
  if (!canManageCampaign(gmUserId, gmRole, campaign)) {
    throw new ForbiddenError('Only the campaign GM can defund this campaign');
  }

  const gmWallet = await getWalletByOwner(gmUserId);
  const campaignWallet = await getWalletByCampaign(campaignId);

  return executeTransaction({
    fromWalletId: campaignWallet.id,
    toWalletId: gmWallet.id,
    amount,
    state: 'FLUID',
    reason: 'CAMPAIGN_DEFUND',
    description: `GM withdrew from campaign "${campaign.name}"`,
    metadata: { campaignId },
    campaignId,
    actorId: gmUserId,
    actorType: 'GM',
    idempotencyKey,
  });
}

// ── Transaction History ──

export async function getTransactionHistory(
  walletId: string,
  options: { limit?: number; offset?: number; reason?: string } = {},
): Promise<{ transactions: TransactionRecord[]; total: number }> {
  const { limit = 20, offset = 0, reason } = options;

  const where = {
    OR: [{ fromWalletId: walletId }, { toWalletId: walletId }],
    ...(reason ? { reason } : {}),
  };

  const [transactions, total] = await Promise.all([
    prisma.krmaTransaction.findMany({
      where,
      orderBy: { sequenceNumber: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.krmaTransaction.count({ where }),
  ]);

  return {
    transactions: transactions.map(toTxRecord),
    total,
  };
}

// ── Global Metrics ──

export async function getGlobalMetrics() {
  const [reserves, burnLedger, totalWallets, latestSeq] = await Promise.all([
    prisma.wallet.findMany({ where: { walletType: 'RESERVE' } }),
    prisma.burnLedger.findUnique({ where: { id: 'singleton' } }),
    prisma.wallet.count(),
    prisma.ledgerSequence.findUnique({ where: { id: 'singleton' } }),
  ]);

  const allWallets = await prisma.wallet.findMany({
    select: { balance: true, walletType: true },
  });

  let totalCirculation = BigInt(0);
  let totalInReserves = BigInt(0);
  for (const w of allWallets) {
    if (w.walletType === 'RESERVE') {
      totalInReserves += w.balance;
    } else {
      totalCirculation += w.balance;
    }
  }

  return {
    reserves: reserves.map(r => ({ label: r.label, balance: r.balance })),
    totalCirculation,
    totalInReserves,
    totalBurned: burnLedger?.totalBurned ?? BigInt(0),
    burnCapRemaining: (burnLedger?.cap ?? BigInt("5000000000")) - (burnLedger?.totalBurned ?? BigInt(0)),
    totalWallets,
    totalTransactions: Number(latestSeq?.current ?? BigInt(0)),
  };
}

// ── Helpers ──

interface RawWallet {
  id: string;
  walletType: string;
  label: string | null;
  balance: bigint;
  ownerId: string | null;
  campaignId: string | null;
  characterId: string | null;
  frozen: boolean;
}

function toWalletSummary(raw: RawWallet): WalletSummary {
  return {
    id: raw.id,
    walletType: raw.walletType,
    label: raw.label,
    balance: raw.balance,
    ownerId: raw.ownerId,
    campaignId: raw.campaignId,
    characterId: raw.characterId,
    frozen: raw.frozen,
  };
}

interface RawTx {
  id: string;
  sequenceNumber: bigint;
  fromWalletId: string;
  toWalletId: string;
  amount: bigint;
  state: string;
  reason: string;
  description: string;
  metadata: string;
  campaignId: string | null;
  actorId: string;
  actorType: string;
  checksum: string;
  idempotencyKey: string | null;
  createdAt: Date;
}

function toTxRecord(raw: RawTx): TransactionRecord {
  let metadata: TransactionMetadata = {};
  try {
    metadata = JSON.parse(raw.metadata) as TransactionMetadata;
  } catch {
    // keep empty
  }
  return {
    id: raw.id,
    sequenceNumber: raw.sequenceNumber,
    fromWalletId: raw.fromWalletId,
    toWalletId: raw.toWalletId,
    amount: raw.amount,
    state: raw.state,
    reason: raw.reason,
    description: raw.description,
    metadata,
    campaignId: raw.campaignId,
    actorId: raw.actorId,
    actorType: raw.actorType,
    checksum: raw.checksum,
    idempotencyKey: raw.idempotencyKey,
    createdAt: raw.createdAt,
  };
}
