/**
 * Mana lifecycle (r-2026-07-23-02 / -05).
 *
 * - adjustMana: GM/ADMIN actuation for NARRATIVE mana gain/loss — there is
 *   deliberately no regen loop ("mana comes from all over; narratively
 *   gained, refilled"). JEWL calls this via the adjust_mana tool.
 * - recordCastResidue: spent mana's KV lingers WITH the spell. Created by
 *   executeCast when mana was spent.
 * - sweepManaResidues: clock-advance decay — residue fades back to the
 *   weave over ~dr cycles (powerful casts linger longer). While present it
 *   is godhead-attractable and tappable (future hooks).
 *   NOTE: decay is bookkeeping-only — NO KRMA transfer yet. Mana has no
 *   ledger custody today, so a decay transfer would MINT (INV-13). Flagged
 *   in NEEDS-MIKE ("mana KV custody").
 */

import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { NotFoundError, ForbiddenError, ValidationError } from '@/lib/errors';
import { broadcastEvent } from '@/lib/campaign-stream';
import type { GrowthCharacter } from '@/types/growth';

export const adjustManaSchema = z.object({
  characterId: z.string().min(1),
  /** Change to CURRENT mana (may be negative). */
  delta: z.number().int(),
  /** Optional change to MAX mana (narrative capacity shifts). */
  maxDelta: z.number().int().optional(),
  /** Narrative source — where the mana came from / went ("ley line", "ritual"). */
  note: z.string().max(500).optional(),
});

export type AdjustManaRequest = z.infer<typeof adjustManaSchema>;

export interface AdjustManaResult {
  characterId: string;
  current: number;
  max: number;
  note?: string;
}

export async function adjustMana(
  userId: string,
  userRole: string,
  input: AdjustManaRequest,
): Promise<AdjustManaResult> {
  const validated = adjustManaSchema.parse(input);

  const character = await prisma.character.findUnique({
    where: { id: validated.characterId },
    include: { campaign: { select: { gmUserId: true } } },
  });
  if (!character) throw new NotFoundError('Character not found');
  const isGM = character.campaign?.gmUserId === userId;
  if (!isGM && userRole !== 'ADMIN') {
    throw new ForbiddenError('Only the campaign GM adjusts mana (narrative gains are GM/JEWL-actuated)');
  }

  const charData = JSON.parse(character.data) as GrowthCharacter;
  charData.magic ??= {
    mercy: { schools: [], knownSpells: [] },
    severity: { schools: [], knownSpells: [] },
    balance: { schools: [], knownSpells: [] },
  };
  charData.magic.mana ??= { current: 0, max: 0 };
  const pool = charData.magic.mana;

  const newMax = Math.max(0, pool.max + (validated.maxDelta ?? 0));
  const newCurrent = Math.min(newMax, Math.max(0, pool.current + validated.delta));
  if (validated.delta > 0 && newCurrent === pool.current && (validated.maxDelta ?? 0) <= 0) {
    throw new ValidationError(`Mana already at max (${pool.max}) — raise maxDelta to grow capacity`);
  }
  pool.max = newMax;
  pool.current = newCurrent;

  await prisma.character.update({
    where: { id: character.id },
    data: { data: JSON.stringify(charData) },
  });

  if (character.campaignId) {
    broadcastEvent(character.campaignId, {
      kind: 'character_update',
      characterId: character.id,
      characterName: character.name,
      fields: ['magic'],
    });
  }

  return { characterId: character.id, current: pool.current, max: pool.max, note: validated.note };
}

// ── Residue (r-2026-07-23-02) ─────────────────────────────────────────────

export interface ResidueInput {
  campaignId: string;
  characterId?: string;
  spellName?: string;
  method: 'wild' | 'woven';
  dr: number;
  manaSpent: number;
}

/** Record the lingering residue for a cast that spent mana. */
export async function recordCastResidue(input: ResidueInput) {
  if (input.manaSpent <= 0) return null;
  return prisma.manaResidue.create({
    data: {
      campaignId: input.campaignId,
      characterId: input.characterId ?? null,
      spellName: input.spellName ?? null,
      method: input.method,
      dr: input.dr,
      manaInitial: input.manaSpent,
      manaRemaining: input.manaSpent,
    },
  });
}

export interface ResidueSweepResult {
  decayed: Array<{ id: string; spellName: string | null; before: number; after: number }>;
  fadedOut: number;
}

/**
 * Decay all of a campaign's residues by the elapsed cycles. A residue fades
 * over ~dr cycles: perCycle = max(1, round(manaInitial / dr)). Fully-faded
 * rows are deleted ("slowly just fades back to the weave").
 */
export async function sweepManaResidues(
  campaignId: string,
  elapsedCycles: number,
): Promise<ResidueSweepResult> {
  const result: ResidueSweepResult = { decayed: [], fadedOut: 0 };
  if (elapsedCycles <= 0) return result;

  const residues = await prisma.manaResidue.findMany({ where: { campaignId } });
  for (const r of residues) {
    const perCycle = Math.max(1, Math.round(r.manaInitial / Math.max(1, r.dr)));
    const after = Math.max(0, r.manaRemaining - perCycle * elapsedCycles);
    if (after === r.manaRemaining) continue;
    if (after === 0) {
      await prisma.manaResidue.delete({ where: { id: r.id } });
      result.fadedOut += 1;
    } else {
      await prisma.manaResidue.update({ where: { id: r.id }, data: { manaRemaining: after } });
    }
    result.decayed.push({ id: r.id, spellName: r.spellName, before: r.manaRemaining, after });
  }
  return result;
}
