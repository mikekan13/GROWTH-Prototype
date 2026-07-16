import 'server-only';
import { z } from 'zod';
import crypto from 'crypto';
import { prisma } from '@/lib/db';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { executeTransaction } from '@/services/krma/ledger';
import { getWalletByCharacter, createCharacterWallet } from '@/services/krma/wallet';
import type { GrowthCharacter, GrowthTrait, RollModifier } from '@/types/growth';

/**
 * Blossom custody — the "borrowed power" loan model (Mike 2026-07-13).
 *
 * Blossoms are temporary buffs CRAFTED by Godheads (AI-authored from campaign
 * stories), never by players. Bestowing one is a LOAN: the Godhead transfers
 * KRMA out of its own wallet and LOCKs it onto the character as the blossom.
 * That exact KRMA returns to the same Godhead when the blossom expires (its
 * duration elapses on the campaign clock) or the character dies. The chain of
 * custody is carried on the trait itself (grantedByGodHeadId + kv +
 * blossomInstanceId) so every hop is attributed on the ledger.
 *
 * This mirrors nectar-bestowal's godhead→character transfer, but where a Nectar
 * is a permanent grant, a Blossom is a temporary loan that must come home.
 */

export const bestowBlossomSchema = z.object({
  name: z.string().min(1).max(120),
  pillar: z.enum(['body', 'spirit', 'soul']),
  mechanicalEffect: z.string().min(1).max(1000),
  rollModifiers: z
    .array(
      z.object({
        flat: z.number().int(),
        skillNamePattern: z.string().optional(),
        governorAttribute: z.string().optional(),
        label: z.string().optional(),
      }),
    )
    .optional(),
  /** The borrowed power — moves Godhead → character and returns in full. */
  kv: z.number().int().min(1).max(10_000),
  /** Lifetime in meta cycles; the granter sets it. Omit for open-ended. */
  durationCycles: z.number().positive().optional(),
  reason: z.string().min(1).max(1000),
});

export type BestowBlossomInput = z.infer<typeof bestowBlossomSchema>;

/**
 * Godhead-side: craft + bestow a blossom on a character. Transfers `kv` KRMA
 * from the Godhead's wallet to the character (LOCK) and stamps the trait with
 * the custody chain. Returns the created blossom instance.
 */
export async function bestowBlossom(
  godHeadId: string,
  characterId: string,
  input: BestowBlossomInput,
): Promise<{ blossomInstanceId: string; amount: number }> {
  const validated = bestowBlossomSchema.parse(input);

  const godHead = await prisma.godHead.findUnique({
    where: { id: godHeadId },
    select: { id: true, name: true, walletId: true },
  });
  if (!godHead) throw new NotFoundError('Godhead not found');
  if (!godHead.walletId) throw new ValidationError('Bestowing godhead has no wallet');

  const character = await prisma.character.findUnique({ where: { id: characterId } });
  if (!character) throw new NotFoundError('Character not found');
  const charData = JSON.parse(character.data) as GrowthCharacter;
  const campaignId = character.campaignId ?? undefined;

  // Character wallet (lazy-create, like crystallization / nectar bestowal).
  let charWallet;
  try {
    charWallet = await getWalletByCharacter(characterId);
  } catch {
    if (!campaignId) throw new ValidationError('Character has no campaign wallet context');
    charWallet = await createCharacterWallet(characterId, campaignId);
  }

  const blossomInstanceId = crypto.randomUUID();

  // Compute expiry against the campaign clock if a duration was given.
  let expiresAtCycle: number | undefined;
  if (validated.durationCycles && campaignId) {
    const campaign = await prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { currentCycle: true },
    });
    if (campaign) expiresAtCycle = campaign.currentCycle + validated.durationCycles;
  }

  // The loan: Godhead wallet → character wallet (LOCK), fully attributed.
  await executeTransaction({
    fromWalletId: godHead.walletId,
    toWalletId: charWallet.id,
    amount: BigInt(validated.kv),
    state: 'LOCK',
    reason: 'BLOSSOM_BESTOW',
    description: `Blossom bestowed (loan): ${validated.name} — ${validated.reason.slice(0, 120)}`,
    metadata: { characterId, blossomInstanceId, godHeadId, durationCycles: validated.durationCycles },
    campaignId,
    actorId: godHead.id,
    actorType: 'GODHEAD',
    idempotencyKey: `blossom-bestow:${blossomInstanceId}`,
  });

  const blossom: GrowthTrait = {
    name: validated.name,
    type: 'blossom',
    category: 'utility',
    description: validated.reason,
    pillar: validated.pillar,
    mechanicalEffect: validated.mechanicalEffect,
    rollModifiers: validated.rollModifiers,
    source: godHead.name,
    blossomInstanceId,
    grantedByGodHeadId: godHead.id,
    grantedByGodHeadName: godHead.name,
    kv: validated.kv,
    durationCycles: validated.durationCycles,
    expiresAtCycle,
  };
  charData.traits = [...(charData.traits ?? []), blossom];

  await prisma.character.update({
    where: { id: characterId },
    data: { data: JSON.stringify(charData) },
  });

  return { blossomInstanceId, amount: validated.kv };
}

/**
 * Return a single blossom's borrowed KRMA to the Godhead that lent it
 * (character wallet → godhead wallet, UNLOCK). Pure ledger move — does NOT
 * mutate/persist the character's trait list; the caller owns trait removal
 * (death does it via transformCharacterToGhost; expiry via expireBlossom).
 * Idempotent per blossom instance. No-op (returns 0) if the blossom carries no
 * custody data (legacy / un-lent blossom).
 */
export async function returnBlossomKrma(
  characterId: string,
  campaignId: string | undefined,
  blossom: GrowthTrait,
  context: 'death' | 'expiry',
): Promise<number> {
  if (blossom.type !== 'blossom') return 0;
  const grantorId = blossom.grantedByGodHeadId;
  const kv = blossom.kv ?? 0;
  if (!grantorId || kv <= 0) return 0;

  const grantor = await prisma.godHead.findUnique({
    where: { id: grantorId },
    select: { id: true, name: true, walletId: true },
  });
  if (!grantor?.walletId) return 0; // grantor gone / wallet-less — nothing to return to

  let charWallet;
  try {
    charWallet = await getWalletByCharacter(characterId);
  } catch {
    return 0; // no character wallet → nothing was locked
  }

  const instance = blossom.blossomInstanceId ?? `${blossom.name}:${grantorId}`;
  await executeTransaction({
    fromWalletId: charWallet.id,
    toWalletId: grantor.walletId,
    amount: BigInt(kv),
    state: 'UNLOCK',
    reason: 'BLOSSOM_RETURN',
    description: `Blossom returned (${context}): ${blossom.name} → ${grantor.name}`,
    metadata: { characterId, blossomInstanceId: instance, godHeadId: grantorId, context },
    campaignId,
    actorId: grantor.id,
    actorType: 'GODHEAD',
    idempotencyKey: `blossom-return:${instance}:${context}`,
  });
  return kv;
}

/**
 * Return every active blossom on a character to its bestowing Godhead. Used by
 * the death engine (before the character transforms to a ghost). Returns the
 * total KRMA sent home and a per-godhead breakdown for the audit log.
 */
export async function returnAllBlossoms(
  charData: GrowthCharacter,
  characterId: string,
  campaignId: string | undefined,
  context: 'death' | 'expiry',
): Promise<{ total: number; returns: Array<{ godHeadId: string; name: string; kv: number }> }> {
  const blossoms = (charData.traits ?? []).filter(
    (t): t is GrowthTrait => t.type === 'blossom' && !!t.grantedByGodHeadId && (t.kv ?? 0) > 0,
  );
  const returns: Array<{ godHeadId: string; name: string; kv: number }> = [];
  let total = 0;
  for (const b of blossoms) {
    const amount = await returnBlossomKrma(characterId, campaignId, b, context);
    if (amount > 0) {
      total += amount;
      returns.push({ godHeadId: b.grantedByGodHeadId!, name: b.name, kv: amount });
    }
  }
  return { total, returns };
}

/**
 * Standalone expiry: the blossom's duration has elapsed. Returns its KRMA to
 * the granting Godhead and removes the trait from the sheet. (The auto-trigger
 * that scans the campaign clock for elapsed blossoms is the T23 clock hook;
 * this is the operation it invokes.)
 */
export async function expireBlossom(
  characterId: string,
  blossomInstanceId: string,
): Promise<{ returned: number }> {
  const character = await prisma.character.findUnique({ where: { id: characterId } });
  if (!character) throw new NotFoundError('Character not found');
  const charData = JSON.parse(character.data) as GrowthCharacter;
  const blossom = (charData.traits ?? []).find(
    t => t.type === 'blossom' && t.blossomInstanceId === blossomInstanceId,
  );
  if (!blossom) throw new NotFoundError('Blossom not found on character');

  const returned = await returnBlossomKrma(characterId, character.campaignId ?? undefined, blossom, 'expiry');

  charData.traits = (charData.traits ?? []).filter(
    t => !(t.type === 'blossom' && t.blossomInstanceId === blossomInstanceId),
  );
  await prisma.character.update({
    where: { id: characterId },
    data: { data: JSON.stringify(charData) },
  });
  return { returned };
}

/**
 * T23 clock hook: expire every blossom in the campaign whose expiresAtCycle
 * has been reached. Called after the campaign clock moves (advance/set).
 * Godhead-bestowed blossoms return their borrowed KRMA (expireBlossom);
 * GM-authored blossoms (no custody chain) are simply removed from the sheet.
 * Per-blossom failures are isolated so one bad row can't block the sweep.
 */
export async function sweepExpiredBlossoms(
  campaignId: string,
  currentCycle: number,
): Promise<{ expired: Array<{ characterId: string; characterName: string; name: string; returned: number }> }> {
  const characters = await prisma.character.findMany({
    where: { campaignId },
    select: { id: true, name: true, data: true },
  });

  const expired: Array<{ characterId: string; characterName: string; name: string; returned: number }> = [];

  for (const ch of characters) {
    let charData: GrowthCharacter;
    try {
      charData = JSON.parse(ch.data) as GrowthCharacter;
    } catch {
      continue;
    }
    const due = (charData.traits ?? []).filter(
      t => t.type === 'blossom' && typeof t.expiresAtCycle === 'number' && t.expiresAtCycle <= currentCycle,
    );
    if (due.length === 0) continue;

    for (const blossom of due) {
      try {
        if (blossom.blossomInstanceId) {
          const { returned } = await expireBlossom(ch.id, blossom.blossomInstanceId);
          expired.push({ characterId: ch.id, characterName: ch.name, name: blossom.name, returned });
        } else {
          // GM-authored blossom without custody — remove the trait, no ledger.
          const fresh = await prisma.character.findUnique({ where: { id: ch.id } });
          if (!fresh) continue;
          const freshData = JSON.parse(fresh.data) as GrowthCharacter;
          freshData.traits = (freshData.traits ?? []).filter(
            t => !(t.type === 'blossom' && t.name === blossom.name && t.expiresAtCycle === blossom.expiresAtCycle),
          );
          await prisma.character.update({
            where: { id: ch.id },
            data: { data: JSON.stringify(freshData) },
          });
          expired.push({ characterId: ch.id, characterName: ch.name, name: blossom.name, returned: 0 });
        }
      } catch {
        // Isolated: a failed expiry (missing wallet, race) must not block the rest.
      }
    }
  }

  return { expired };
}
