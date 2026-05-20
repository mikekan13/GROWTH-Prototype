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
import { emit as emitGodHeadEvent } from '../godhead-dispatcher';
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

  // Spirit/Soul "to player" is DEPRECATED under the transformation model.
  // Kept components stay on the character wallet (ghost) — no transfer fires.
  // Pre-2026-05-19 manifests may still set toPlayer > 0; honor them for
  // backwards compatibility so old in-flight deaths don't get stuck.
  if (manifest.toPlayer > 0) {
    const amount = capAmount(BigInt(manifest.toPlayer), characterWallet.balance - BigInt(manifest.toCampaign));
    if (amount > BigInt(0)) {
      transactions.push({
        fromWalletId: characterWallet.id,
        toWalletId: playerWallet.id,
        amount,
        state: 'UNLOCK',
        reason: 'DEATH_SPIRIT_TO_PLAYER',
        description: `Death (legacy split): Spirit Package → player ownership`,
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

  // ── Character transformation (locked Mike 2026-05-19) ──
  // The character is NOT destroyed; they become a ghost. Mutate their data
  // blob in place: zero body attributes/skills, halve soul attributes/skills,
  // strip body-pillared traits, zero max Frequency, keep Spirit + non-body.
  // status moves to 'GHOST'.
  const ghostData = transformCharacterToGhost(charData);
  await prisma.character.update({
    where: { id: characterId },
    data: {
      status: 'GHOST',
      data: JSON.stringify(ghostData),
    },
  });

  // Notify Lady Death — she manages the Spirit Package and may decide to
  // memorialize the death in her memory. Fire-and-forget.
  void emitGodHeadEvent('character.died', {
    characterId,
    campaignId,
    cause: deathContext.cause,
    sessionId: deathContext.sessionId,
    spiritPackageKV: manifest.toPlayer,
    batchId,
  }).catch(() => { /* swallow */ });

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

/**
 * Transform a living character into a ghost form per the death canon
 * (Mike 2026-05-19). Pure function — caller persists the result.
 *
 * Mutations:
 *  - Body attributes (clout, celerity, constitution) → level=0, current=0, augments=0
 *  - Soul attributes (willpower, wisdom, wit) → level halved, current clamped
 *  - Frequency → level=0, current=0 (capacity stripped to Lady Death)
 *  - Flow + Focus → unchanged
 *  - Skills with any body governor → removed
 *  - Skills with only soul governor → level halved (rounds down)
 *  - Skills with only spirit governor → unchanged
 *  - Traits pillared body → removed
 *  - Traits pillared soul → kept (the KRMA value is split; the trait itself is binary present/absent)
 *  - Traits pillared spirit (or un-tagged) → kept
 *  - vitals.baseResist → 0 (body property)
 */
function transformCharacterToGhost(character: GrowthCharacter): GrowthCharacter {
  const c = JSON.parse(JSON.stringify(character)) as GrowthCharacter;

  const BODY_ATTRS: ReadonlyArray<keyof GrowthCharacter['attributes']> = ['clout', 'celerity', 'constitution'];
  const SOUL_ATTRS: ReadonlyArray<keyof GrowthCharacter['attributes']> = ['willpower', 'wisdom', 'wit'];

  if (c.attributes) {
    for (const a of BODY_ATTRS) {
      if (c.attributes[a]) {
        c.attributes[a] = { level: 0, current: 0, augmentPositive: 0, augmentNegative: 0 };
      }
    }
    for (const a of SOUL_ATTRS) {
      const attr = c.attributes[a];
      if (attr && (attr.level ?? 0) > 0) {
        const newLevel = Math.floor((attr.level ?? 0) / 2);
        attr.level = newLevel;
        if ((attr.current ?? 0) > newLevel) attr.current = newLevel;
      }
    }
    if (c.attributes.frequency) {
      c.attributes.frequency = { level: 0, current: 0 };
    }
  }

  // Skills — drop body, halve soul, keep spirit
  const BODY_GOV = new Set(['clout', 'celerity', 'constitution']);
  const SOUL_GOV = new Set(['willpower', 'wisdom', 'wit']);
  if (Array.isArray(c.skills)) {
    c.skills = c.skills.filter(s => {
      const govs = (s.governors as string[]) ?? [];
      const hasBody = govs.some(g => BODY_GOV.has(g));
      if (hasBody) return false;
      return true;
    }).map(s => {
      const govs = (s.governors as string[]) ?? [];
      const hasSoul = govs.some(g => SOUL_GOV.has(g));
      if (hasSoul) {
        return { ...s, level: Math.floor((s.level ?? 0) / 2) };
      }
      return s;
    });
  }

  // Traits — drop body-pillared; keep spirit + soul (the KRMA half-strip is
  // handled at the ledger; the trait itself remains as identity).
  if (Array.isArray(c.traits)) {
    c.traits = c.traits.filter(t => {
      const pillar = (t as { pillar?: 'body' | 'spirit' | 'soul' }).pillar ?? 'spirit';
      return pillar !== 'body';
    });
  }

  // Body resist is a body property → 0
  if (c.vitals) {
    c.vitals.baseResist = 0;
  }

  return c;
}

/**
 * Preview the death split WITHOUT executing it. Returns the manifest so the
 * GM can confirm before triggering `executeDeathSplit`. Pure read — no
 * transactions written.
 */
export async function previewDeathSplit(
  characterId: string,
  campaignId: string,
): Promise<{
  tkv: ReturnType<typeof calculateTKV>;
  manifest: DeathSplitManifest;
  characterWalletBalance: string;
  characterName: string;
}> {
  const character = await prisma.character.findUnique({ where: { id: characterId } });
  if (!character) throw new NotFoundError('Character not found');
  if (character.campaignId !== campaignId) {
    throw new ValidationError('Character does not belong to this campaign');
  }
  let charData: GrowthCharacter;
  try {
    charData = JSON.parse(character.data) as GrowthCharacter;
  } catch {
    throw new ValidationError('Invalid character data');
  }
  const tkv = calculateTKV(charData);
  const manifest = calculateDeathSplit(charData, tkv);

  // Character wallet may not exist yet (no crystallization done).
  let charWalletBalance = BigInt(0);
  try {
    const wallet = await getWalletByCharacter(characterId);
    charWalletBalance = wallet.balance;
  } catch { /* no wallet, balance is 0 */ }

  return {
    tkv,
    manifest,
    characterWalletBalance: charWalletBalance.toString(),
    characterName: character.name,
  };
}
