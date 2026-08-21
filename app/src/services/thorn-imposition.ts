/**
 * Thorn imposition — the lien half of the proxy-war economy.
 *
 * Mirrors nectar-bestowal (T32): a godhead (normally the WINNING/opposing
 * godhead after a goal fails) PROPOSES a diegetic thorn on a character via a
 * structured GodHeadMessage. Nothing touches the sheet until the GM confirms.
 *
 * THE SIZING LAW (blessed Mike 2026-08-21, lien-sizing-staked-claims):
 *   lien = min(Kai's grade of the wound KV, the winner's attested stake).
 * Claims are earned like favors — a zero-stake winner imposes a scar with NO
 * creditor (the thorn lands with no lien fields). Stake attestation is a
 * number + note passed by the proposer for now (the opportunity economy that
 * will make it ledger-derived isn't built yet); the note is recorded verbatim
 * in lienStakeNote.
 *
 * THE LOCK MODEL (thorn-krma-mechanics, resolved 2026-04-05): a lien is KRMA
 * locked IN the character — the holder gains authority, never possession. No
 * KRMA moves at imposition (unlike a nectar, where the godhead's own KRMA
 * lands on the character, a lien encumbers the bearer's existing value — the
 * ledger has no from→to pair for an in-place encumbrance, so the claim is
 * recorded on the trait only). Settlement happens at death, by pillar
 * (thorn-liens-death-routing-2026-08-19):
 *   body   → thorn dies with the body; holder paid the FULL lienKV from the
 *            GM's death harvest (campaign wallet — the death payout lands
 *            there first; the wallet backstops shortfall).
 *   soul   → holder paid HALF (floor); a less-severe "(faded)" successor
 *            thorn, same holder, remaining half, rides the Spirit Package.
 *   spirit → rides whole across lives; no payment. Released only by
 *            displacement or forgiveness.
 *   fated-age origin (Tara's claim markers) → removed with NO payment when
 *            she collects — her claim IS the collection (custom, not
 *            contract; tara-liens-fated-age-custom-2026-08-19).
 */
import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';
import { canManageCampaign } from '@/lib/permissions';
import { TRAIT_CATEGORIES } from '@/types/growth';
import type { GrowthCharacter, GrowthTrait, LienOrigin, RollModifier } from '@/types/growth';

export const IMPOSITION_KIND = 'thorn_imposition';

export interface ThornImpositionProposal {
  kind: typeof IMPOSITION_KIND;
  characterId: string;
  goalId?: string;
  thorn: {
    name: string;
    pillar: 'body' | 'spirit' | 'soul';
    category?: (typeof TRAIT_CATEGORIES)[number];
    mechanicalEffect: string;
    rollModifiers?: RollModifier[];
  };
  /** Kai's case-by-case grade of the natural wound's KV magnitude. */
  kaiGradeKV: number;
  /** The winner's attested stake in the opposition (manual until the O-channel economy lands). */
  stakeKV: number;
  /** How the stake was attested — recorded verbatim on the trait. */
  stakeNote: string;
  lienOrigin: LienOrigin;
  reason: string;
  resolved?: { action: 'accept' | 'decline'; at: string; by: string };
}

export const impositionSchema = z.object({
  characterId: z.string().min(1),
  goalId: z.string().optional(),
  thorn: z.object({
    name: z.string().min(1).max(120),
    pillar: z.enum(['body', 'spirit', 'soul']),
    category: z.enum(TRAIT_CATEGORIES).optional(),
    mechanicalEffect: z.string().min(1).max(1000),
    rollModifiers: z.array(z.object({
      // INV-29: negatives live ONLY on Thorns — a Thorn is always a penalty.
      flat: z.number().int().max(-1),
      skillNamePattern: z.string().optional(),
      governorAttribute: z.string().optional(),
      label: z.string().optional(),
    })).optional(),
  }),
  kaiGradeKV: z.number().int().min(1).max(10_000),
  stakeKV: z.number().int().min(0).max(10_000_000),
  stakeNote: z.string().min(1).max(1000),
  lienOrigin: z.enum(['opposition-win', 'fated-age', 'bestowed', 'other']).default('opposition-win'),
  reason: z.string().min(1).max(1000),
});

/**
 * THE SIZING LAW: lien = min(Kai's grade of the wound, the attested stake).
 * A zero (or negative) input on either side yields 0 — a scar with no
 * creditor. Pure — vitest covers it.
 */
export function sizeLien(kaiGradeKV: number, attestedStakeKV: number): number {
  const grade = Math.floor(kaiGradeKV);
  const stake = Math.floor(attestedStakeKV);
  return Math.max(0, Math.min(grade, stake));
}

/** Godhead-side: create the structured proposal message for the GM. */
export async function proposeThornImposition(
  godHeadId: string,
  campaignId: string,
  input: z.infer<typeof impositionSchema>,
  invocationId?: string,
): Promise<{ messageId: string; lienKV: number }> {
  const validated = impositionSchema.parse(input);
  const character = await prisma.character.findUnique({
    where: { id: validated.characterId },
    select: { id: true, name: true, campaignId: true },
  });
  if (!character || character.campaignId !== campaignId) {
    throw new NotFoundError('Character not found in this campaign');
  }
  const proposal: ThornImpositionProposal = { kind: IMPOSITION_KIND, ...validated };
  const message = await prisma.godHeadMessage.create({
    data: {
      godHeadId,
      campaignId,
      direction: 'GODHEAD_TO_GM',
      content: JSON.stringify(proposal),
      invocationId: invocationId ?? null,
    },
  });
  return { messageId: message.id, lienKV: sizeLien(validated.kaiGradeKV, validated.stakeKV) };
}

export function parseImpositionProposal(content: string): ThornImpositionProposal | null {
  try {
    const parsed = JSON.parse(content) as ThornImpositionProposal;
    return parsed.kind === IMPOSITION_KIND ? parsed : null;
  } catch {
    return null;
  }
}

/** INV-07: Nectar+Thorn count cap = Fate Die face value (same as bestowal). */
function fateDieCap(charData: GrowthCharacter): number {
  const die = charData.creation?.seed?.baseFateDie ?? 'd4';
  const n = parseInt(String(die).replace(/^d/i, ''), 10);
  return Number.isFinite(n) ? n : 4;
}

/**
 * GM-side resolution. accept = the thorn lands on the sheet with its lien
 * fields (no ledger row — lock model: the claim encumbers the bearer, KRMA
 * moves only at death settlement). decline = nothing lands. Both paths mark
 * the message resolved.
 */
export async function resolveThornImposition(
  messageId: string,
  action: 'accept' | 'decline',
  gmUserId: string,
  gmRole: string,
): Promise<{ action: 'accept' | 'decline'; lienKV: number }> {
  const message = await prisma.godHeadMessage.findUnique({
    where: { id: messageId },
    include: { godHead: { select: { id: true, name: true } }, campaign: true },
  });
  if (!message) throw new NotFoundError('Message not found');
  if (!canManageCampaign(gmUserId, gmRole, message.campaign)) {
    throw new ForbiddenError('Only the GM resolves impositions');
  }
  const proposal = parseImpositionProposal(message.content);
  if (!proposal) throw new ValidationError('Message is not a thorn imposition proposal');
  if (proposal.resolved) throw new ValidationError(`Already resolved (${proposal.resolved.action})`);

  const lienKV = sizeLien(proposal.kaiGradeKV, proposal.stakeKV);

  if (action === 'accept') {
    const character = await prisma.character.findUnique({ where: { id: proposal.characterId } });
    if (!character) throw new NotFoundError('Character not found');
    const charData = JSON.parse(character.data) as GrowthCharacter;

    // INV-07 cap check — a full permanent-trait ledger blocks the imposition.
    const traitCount = (charData.traits ?? []).filter(t => t.type === 'nectar' || t.type === 'thorn').length;
    const cap = fateDieCap(charData);
    if (traitCount >= cap) {
      throw new ValidationError(
        `INV-07 cap reached (${traitCount}/${cap} for ${charData.creation?.seed?.baseFateDie}) — decline the imposition`,
      );
    }

    const thorn: GrowthTrait = {
      name: proposal.thorn.name,
      type: 'thorn',
      category: proposal.thorn.category ?? 'utility',
      description: proposal.reason,
      pillar: proposal.thorn.pillar,
      mechanicalEffect: proposal.thorn.mechanicalEffect,
      rollModifiers: proposal.thorn.rollModifiers,
      source: message.godHead.name,
      // Zero-stake winner = scar with NO creditor: no lien fields at all.
      ...(lienKV > 0
        ? {
            lienHolderGodHeadId: message.godHead.id,
            lienHolderName: message.godHead.name,
            lienKV,
            lienOrigin: proposal.lienOrigin,
            lienStakeNote: proposal.stakeNote,
          }
        : {}),
    };
    charData.traits = [...(charData.traits ?? []), thorn];

    await prisma.character.update({
      where: { id: proposal.characterId },
      data: { data: JSON.stringify(charData) },
    });
  }

  proposal.resolved = { action, at: new Date().toISOString(), by: gmUserId };
  await prisma.godHeadMessage.update({
    where: { id: messageId },
    data: { content: JSON.stringify(proposal), readAt: new Date() },
  });

  return { action, lienKV: action === 'accept' ? lienKV : 0 };
}

// ─────────────────────────────────────────────────────────────────────────────
// Death routing (thorn-liens-death-routing-2026-08-19) — pure planning layer.
// The death engine (services/krma/death-split.ts) executes the plan: payments
// campaign wallet → holder wallets, then trait removals/successors on the
// ghost. "No special settlement step" — the lien follows the thorn's pillar
// through the same split everything else uses.
// ─────────────────────────────────────────────────────────────────────────────

export interface LienDeathOrder {
  thornName: string;
  pillar: 'body' | 'spirit' | 'soul';
  origin: LienOrigin;
  holderGodHeadId: string;
  holderName?: string;
  /** KRMA owed to the holder at this death (0 = no payment). */
  payKV: number;
  /** What happens to the trait on the ghost. */
  traitAction: 'remove' | 'keep' | 'replace';
  /** For soul thorns: the faded residue that rides the Spirit Package. */
  successor?: GrowthTrait;
}

/**
 * Compute the per-thorn death routing for every liened thorn on a character.
 * Pure — vitest covers the math per pillar.
 *
 *   fated-age → removed, NO payment (Tara's claim IS the collection).
 *   body      → removed, holder paid FULL lienKV.
 *   soul      → holder paid floor(lienKV/2); original removed; a "(faded)"
 *               successor with the remaining half rides forward (same holder,
 *               pillar stays soul; rollModifier flats halve toward zero —
 *               "a less severe but similar one").
 *   spirit    → untouched; rides forward with its full lien.
 */
export function computeThornLienDeathRouting(traits: GrowthTrait[]): LienDeathOrder[] {
  const orders: LienDeathOrder[] = [];
  for (const t of traits ?? []) {
    if (t.type !== 'thorn') continue;
    if (!t.lienHolderGodHeadId || (t.lienKV ?? 0) <= 0) continue;
    const lienKV = t.lienKV ?? 0;
    const pillar = t.pillar ?? 'spirit'; // missing pillar → safe-kept bucket, same as the death engine
    const origin: LienOrigin = t.lienOrigin ?? 'other';
    const base = {
      thornName: t.name,
      pillar,
      origin,
      holderGodHeadId: t.lienHolderGodHeadId,
      holderName: t.lienHolderName,
    };

    if (origin === 'fated-age') {
      // Tara's claim markers: she removes them herself when she collects at
      // the fated age — no payment, regardless of pillar.
      orders.push({ ...base, payKV: 0, traitAction: 'remove' });
      continue;
    }

    if (pillar === 'body') {
      orders.push({ ...base, payKV: lienKV, traitAction: 'remove' });
    } else if (pillar === 'soul') {
      const paid = Math.floor(lienKV / 2);
      const residual = lienKV - paid;
      const successor: GrowthTrait = {
        name: `${t.name} (faded)`,
        type: 'thorn',
        category: t.category,
        description: `Residue of "${t.name}", carried across death: ${t.description}`,
        pillar: 'soul',
        mechanicalEffect: t.mechanicalEffect,
        // "Less severe but similar": penalty flats halve toward zero; a flat
        // that fades to 0 drops off entirely.
        rollModifiers: t.rollModifiers
          ?.map(m => ({ ...m, flat: Math.trunc(m.flat / 2) }))
          .filter(m => m.flat !== 0),
        source: t.source,
        lienHolderGodHeadId: t.lienHolderGodHeadId,
        lienHolderName: t.lienHolderName,
        lienKV: residual,
        lienOrigin: origin,
        lienStakeNote: t.lienStakeNote,
      };
      orders.push({ ...base, payKV: paid, traitAction: 'replace', successor });
    } else {
      // spirit: the undying claim — rides whole, nothing paid.
      orders.push({ ...base, payKV: 0, traitAction: 'keep' });
    }
  }
  return orders;
}

/**
 * Apply the trait side of the routing to a (post-transform) ghost trait list.
 * Pure. Body thorns are already stripped by transformCharacterToGhost —
 * removal here is idempotent. Matches by name + holder so unliened thorns
 * with the same name survive untouched.
 */
export function applyThornLienRouting(traits: GrowthTrait[], orders: LienDeathOrder[]): GrowthTrait[] {
  let out = [...(traits ?? [])];
  for (const order of orders) {
    if (order.traitAction === 'keep') continue;
    out = out.filter(
      t => !(t.type === 'thorn' && t.name === order.thornName && t.lienHolderGodHeadId === order.holderGodHeadId),
    );
    if (order.traitAction === 'replace' && order.successor) {
      out.push(order.successor);
    }
  }
  return out;
}
