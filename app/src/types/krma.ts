/**
 * KRMA Ledger System — Type Definitions & Constants
 *
 * KRMA is the universal meta-currency of GRO.WTH.
 * See docs/KRMA-SYSTEM-DESIGN.md for full architecture.
 */

// ── Wallet Types ──

export type WalletType = 'USER' | 'RESERVE' | 'CAMPAIGN' | 'CHARACTER' | 'BURN' | 'LADY_DEATH';

// ── Transaction Enums ──

export type KrmaState = 'FLUID' | 'LOCK' | 'UNLOCK' | 'BURN';

export type ActorType = 'USER' | 'SYSTEM' | 'GM' | 'EVALUATOR' | 'GODHEAD';

export type TransactionReason =
  // Genesis & System
  | 'GENESIS_SEED'
  | 'RESERVE_TRANSFER'
  | 'CORRECTION'
  // GM Economy
  | 'GM_ALLOCATION'
  | 'CAMPAIGN_FUND'
  | 'CAMPAIGN_DEFUND'
  // Character Creation
  | 'CHARACTER_INVEST'
  | 'CHARACTER_ADJUST'
  // Session Play
  | 'SESSION_REWARD'
  | 'REROLL_COST'
  | 'SKILL_ADVANCE'
  | 'ATTRIBUTE_ENHANCE'
  | 'WEALTH_CHANGE'
  | 'RARE_ITEM_ACCESS'
  | 'STORY_INFLUENCE'
  | 'DIVINE_FAVOR'
  | 'LANGUAGE_ACQUIRE'
  | 'GROUP_CONTRIBUTION'
  // Death & Reincarnation
  | 'DEATH_BODY_RETURN'
  | 'DEATH_SOUL_SPLIT'
  | 'DEATH_SPIRIT_TO_PLAYER'
  | 'DEATH_FREQUENCY_SINK'
  | 'SOUL_PACKAGE_CREATE'
  | 'REINCARNATION_COST'
  // GRO.vine Rewards
  | 'GROVINE_NECTAR'
  | 'GROVINE_NECTAR_DECLINE'
  | 'GROVINE_TAX'
  | 'THORN_NECTAR_REPLACE'
  // Harvest
  | 'HARVEST_REWARD'
  | 'HARVEST_WEALTH';

// ── Genesis Constants ──

/** Total KRMA supply — hard cap, never exceeded */
export const GENESIS_SUPPLY = BigInt("100000000000");

/** Global burn cap — after this, burns are disabled forever */
export const BURN_CAP = BigInt("5000000000");

/** Reserve wallet distribution at genesis */
export const GENESIS_DISTRIBUTION = {
  TERMINAL:  { label: 'Terminal',  percentage: 75,    amount: BigInt("75000000000") },
  BALANCE:   { label: 'Balance',   percentage: 12.5,  amount: BigInt("12500000000") },
  MERCY:     { label: 'Mercy',     percentage: 6.25,  amount: BigInt("6250000000") },
  SEVERITY:  { label: 'Severity',  percentage: 6.25,  amount: BigInt("6250000000") },
} as const;

/** System wallet labels (non-reserve) */
export const SYSTEM_WALLETS = {
  BURN_SINK: 'Burn Sink',
  LADY_DEATH: 'Lady Death',
} as const;

/** Sentinel wallet ID for genesis transactions (no actual source) */
export const VOID_WALLET_ID = '__VOID__';

/** Seed for the first checksum in the chain */
export const GENESIS_CHECKSUM_SEED = 'GROWTH_GENESIS_2026';

// ── KV Evaluator Constants (Deterministic Track) ──

export const EVALUATOR_VERSION = 1;

/** KV cost per attribute level */
export const KV_PER_ATTRIBUTE_LEVEL = 1;

/** KV cost per skill level */
export const KV_PER_SKILL_LEVEL = 1;

/** KV cost per magic school skill level */
export const KV_PER_MAGIC_SKILL_LEVEL = 2;

/** WTH level KRMA costs (level → KV cost) */
export const WTH_COSTS: Record<number, number> = {
  1: -30, 2: -20, 3: -10,
  4: 0, 5: 0,
  6: 10, 7: 20, 8: 30, 9: 40, 10: 50,
};

// ── Pillar Classification (for death split routing) ──

export const BODY_ATTRIBUTES = ['clout', 'celerity', 'constitution'] as const;
export const SPIRIT_ATTRIBUTES = ['flow', 'focus'] as const;
export const SOUL_ATTRIBUTES = ['willpower', 'wisdom', 'wit'] as const;
export const FREQUENCY_ATTRIBUTE = 'frequency' as const;

export type BodyAttribute = typeof BODY_ATTRIBUTES[number];
export type SpiritAttribute = typeof SPIRIT_ATTRIBUTES[number];
export type SoulAttribute = typeof SOUL_ATTRIBUTES[number];

/** Maps any governor attribute to its pillar for death split routing */
export function getAttributePillar(attr: string): 'body' | 'spirit' | 'soul' | 'frequency' {
  if ((BODY_ATTRIBUTES as readonly string[]).includes(attr)) return 'body';
  if ((SPIRIT_ATTRIBUTES as readonly string[]).includes(attr)) return 'spirit';
  if ((SOUL_ATTRIBUTES as readonly string[]).includes(attr)) return 'soul';
  if (attr === 'frequency') return 'frequency';
  return 'body'; // fallback — shouldn't happen with valid data
}

// ── Transaction Metadata ──

export interface TransactionMetadata {
  characterId?: string;
  campaignId?: string;
  skillId?: string;
  forgeItemId?: string;
  corrects?: string;          // Transaction ID being corrected
  deathContext?: { cause: string; sessionId?: string };
  kvBreakdown?: TKVBreakdown;
  deathSplitManifest?: DeathSplitManifest;
  evaluatorVersion?: number;
  evaluatorHash?: string;
  [key: string]: unknown;
}

// ── KV Evaluator Interfaces ──

export interface TKVBreakdown {
  version: number;
  total: number;
  body: { clout: number; celerity: number; constitution: number; subtotal: number };
  spirit: { flow: number; frequency: number; focus: number; subtotal: number };
  soul: { willpower: number; wisdom: number; wit: number; subtotal: number };
  skills: Array<{ name: string; kv: number; governors: string[] }>;
  skillsTotal: number;
  magicSkills: Array<{ school: string; kv: number }>;
  magicTotal: number;
  wthLevels: { wealth: number; tech: number; health: number; subtotal: number };
  traits: Array<{ name: string; kv: number; type: string; deathClassification?: 'kept' | 'destroyed' }>;
  traitsTotal: number;
}

export interface DeathSplitComponent {
  source: string;         // e.g. "attribute:clout", "skill:Swordsmanship", "trait:Fire Resist"
  kv: number;
  destination: 'campaign' | 'player' | 'lady_death';
  reason: string;         // e.g. "Body attribute → 100% to GM"
}

export interface DeathSplitManifest {
  toCampaign: number;
  toPlayer: number;
  toLadyDeath: number;
  components: DeathSplitComponent[];
}

// ── Wallet & Transaction Interfaces ──

export interface WalletSummary {
  id: string;
  walletType: string;
  label: string | null;
  balance: bigint;
  ownerId: string | null;
  campaignId: string | null;
  characterId: string | null;
  frozen: boolean;
}

export interface TransactionRecord {
  id: string;
  sequenceNumber: bigint;
  fromWalletId: string;
  toWalletId: string;
  amount: bigint;
  state: string;
  reason: string;
  description: string;
  metadata: TransactionMetadata;
  campaignId: string | null;
  actorId: string;
  actorType: string;
  checksum: string;
  idempotencyKey: string | null;
  createdAt: Date;
}

export interface ReconciliationReport {
  valid: boolean;
  checkedAt: Date;
  walletCount: number;
  discrepancies: Array<{ walletId: string; expected: bigint; actual: bigint }>;
  globalInvariantHolds: boolean;
  totalInWallets: bigint;
  totalBurned: bigint;
  checksumChainValid: boolean;
  brokenAtSequence?: bigint;
}
