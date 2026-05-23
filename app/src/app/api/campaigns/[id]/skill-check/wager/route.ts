/**
 * Skill Check Wager — Player submits effort wager to resolve a pending check.
 *
 * Flow:
 *   1. Player submits: checkId, effort wagers per governor
 *   2. Server validates wager against available pools
 *   3. Server rolls FD (Fate Die)
 *   4. Server computes total = SD + FD + effort vs DR
 *   5. Server deducts effort from character attributes
 *   6. Server broadcasts check_result to everyone
 *   7. Server persists result as terminal event
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { prisma } from '@/lib/db';
import { rollDie } from '@/lib/dice';
import { getSkillDieType, parseDie } from '@/lib/dice-utils';
import { getPendingCheck, removePendingCheck, storePendingCheck } from '@/lib/pending-checks';
import { broadcastEvent } from '@/lib/campaign-stream';
import { createCampaignEvent } from '@/services/campaign-event';
import { gatherTraitModifiers, type TraitModifierContribution } from '@/services/trait-modifiers';
import type { GrowthCharacter } from '@/types/growth';

export const dynamic = 'force-dynamic';

const WagerSchema = z.object({
  checkId: z.string(),
  wagers: z.array(z.object({
    governor: z.string(),
    amount: z.number().int().min(0),
  })),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id: campaignId } = await params;
    const body = await request.json();
    const input = WagerSchema.parse(body);

    // Look up and remove the pending check
    const pending = removePendingCheck(input.checkId);
    if (!pending) {
      return NextResponse.json({ error: 'Check not found or already resolved' }, { status: 404 });
    }

    // Verify the submitting user owns this check
    if (session.user.id !== pending.targetUserId) {
      // Re-store it since we removed it
      return NextResponse.json({ error: 'Not your check to wager on' }, { status: 403 });
    }

    // Validate wagers against available governors
    const totalEffort = input.wagers.reduce((sum, w) => sum + w.amount, 0);
    for (const wager of input.wagers) {
      const gov = pending.availableGovernors.find(g => g.name === wager.governor);
      if (!gov) {
        return NextResponse.json({ error: `Invalid governor: ${wager.governor}` }, { status: 400 });
      }
      if (wager.amount > gov.current) {
        return NextResponse.json({
          error: `Cannot wager ${wager.amount} from ${wager.governor} (current: ${gov.current})`,
        }, { status: 400 });
      }
    }

    // Roll the Fate Die (SD was already rolled on initiate)
    const fdSides = parseDie(pending.fateDie);
    const fdResult = rollDie(fdSides);

    // ── Trait modifiers ──────────────────────────────────────────────────
    // Sum any Nectar / Blossom / Thorn rollModifiers that apply to this
    // skill/governor combo. Load character data here (it's also loaded
    // below for effort deduction — could merge later if hot, but the
    // second findUnique is microseconds against the same row in cache).
    let traitFlat = 0;
    let traitSources: TraitModifierContribution[] = [];
    try {
      const charForTraits = await prisma.character.findUnique({
        where: { id: pending.characterId },
        select: { data: true },
      });
      if (charForTraits) {
        const cd = JSON.parse(charForTraits.data) as GrowthCharacter;
        const primaryGov = input.wagers.find(w => w.amount > 0)?.governor
          ?? pending.availableGovernors[0]?.name
          ?? pending.attributeName;
        const mods = gatherTraitModifiers(cd, {
          skillName: pending.skillName,
          governorAttribute: primaryGov,
        });
        traitFlat = mods.totalFlat;
        traitSources = mods.sources;
      }
    } catch { /* ignore — no modifier applied on parse failure */ }

    // Compute result: SD + FD + effort + trait modifiers vs DR
    const total = pending.sdResult + fdResult + totalEffort + traitFlat;
    const success = total >= pending.dr;
    const margin = total - pending.dr;

    // Deduct effort from character attributes
    const character = await prisma.character.findUnique({ where: { id: pending.characterId } });
    if (character) {
      const charData = (typeof character.data === 'string' ? JSON.parse(character.data) : character.data) as GrowthCharacter;

      for (const wager of input.wagers) {
        if (wager.amount <= 0) continue;
        const attr = charData.attributes[wager.governor as keyof typeof charData.attributes];
        if (attr && typeof attr === 'object' && 'current' in attr) {
          (attr as { current: number }).current = Math.max(0, (attr as { current: number }).current - wager.amount);
        }
      }

      await prisma.character.update({
        where: { id: pending.characterId },
        data: { data: JSON.stringify(charData) },
      });

      // Broadcast character update
      broadcastEvent(campaignId, {
        kind: 'character_update',
        characterId: pending.characterId,
        characterName: pending.characterName,
        fields: ['attributes'],
      });
    }

    // Broadcast check result to everyone
    broadcastEvent(campaignId, {
      kind: 'check_result',
      checkId: pending.id,
      characterId: pending.characterId,
      characterName: pending.characterName,
      skillName: pending.skillName,
      sdDie: pending.sdDie,
      sdResult: pending.sdResult,
      fdDie: pending.fateDie,
      fdResult,
      effort: totalEffort,
      traitFlat,
      traitSources,
      total,
      dr: pending.dr,
      success,
      margin,
    });

    // Build effort description for the terminal
    const effortDesc = input.wagers
      .filter(w => w.amount > 0)
      .map(w => `${w.amount} ${w.governor}`)
      .join(' + ');

    // Terminal event is NOT posted here — the client posts it after the
    // Fate Die settles on the canvas, so the result appears at the right time.

    // ── Contested check chaining ──────────────────────────────────────────
    // If this was the attacker's half, auto-initiate the defender's check
    if (pending.contestedWith) {
      const cw = pending.contestedWith;
      const attackerTotal = total; // Attacker's total becomes the DR

      // Look up defender's character data for skill/attribute info
      const defCharacter = await prisma.character.findUnique({ where: { id: cw.defenderCharacterId } });
      if (defCharacter) {
        const defData = (typeof defCharacter.data === 'string' ? JSON.parse(defCharacter.data) : defCharacter.data) as GrowthCharacter;
        const defFateDie = cw.defenderFateDie;
        const defFdMax = parseDie(defFateDie);

        // Roll defender's SD
        const defSdInfo = getSkillDieType(cw.defenderSkillLevel);
        const defSdMax = defSdInfo.isFlat ? defSdInfo.flatBonus : defSdInfo.sides;
        let defSdResult: number;
        let defSdDie: string;
        if (defSdInfo.isFlat) {
          defSdResult = defSdInfo.flatBonus;
          defSdDie = `flat:${defSdInfo.flatBonus}`;
        } else {
          defSdResult = rollDie(defSdInfo.sides);
          defSdDie = `d${defSdInfo.sides}`;
        }

        // Build defender's available governors (only the overlap)
        const defAttrs = defData.attributes;
        const defAvailableGovernors = cw.defenderGovernors.map(name => {
          const pillar = ({ clout: 'body', celerity: 'body', constitution: 'body', flow: 'spirit', focus: 'spirit', willpower: 'soul', wisdom: 'soul', wit: 'soul' } as Record<string, 'body' | 'spirit' | 'soul'>)[name.toLowerCase()] || 'body';
          const attr = defAttrs[name as keyof typeof defAttrs];
          if (!attr || typeof attr !== 'object') return { name, current: 0, pillar };
          const a = attr as { current: number };
          return { name, current: a.current, pillar };
        });

        const defMaxPossible = defFdMax + cw.defenderSkillLevel;
        const defDifficultyHint = (() => {
          const maxRoll = defSdMax + defFdMax;
          if (maxRoll === 0) return 'red' as const;
          const ratio = attackerTotal / maxRoll;
          if (ratio <= 0.4) return 'blue' as const;
          if (ratio <= 0.7) return 'purple' as const;
          return 'red' as const;
        })();

        const defCheckId = crypto.randomUUID();
        const defTimeoutHandle = setTimeout(() => { removePendingCheck(defCheckId); }, 90_000);

        storePendingCheck({
          id: defCheckId,
          campaignId,
          characterId: cw.defenderCharacterId,
          characterName: cw.defenderCharacterName,
          targetUserId: cw.defenderUserId,
          skillName: cw.defenderSkillName,
          skillLevel: cw.defenderSkillLevel,
          isSkilled: cw.defenderIsSkilled,
          attributeName: cw.defenderAttributeName || cw.defenderGovernors[0] || 'willpower',
          fateDie: defFateDie,
          sdDie: defSdDie,
          sdResult: defSdResult,
          dr: attackerTotal, // Attacker's total IS the DR (meet = beat = attacker wins)
          difficultyHint: defDifficultyHint,
          availableGovernors: defAvailableGovernors,
          maxUsefulEffort: 0,
          revealDR: pending.revealDR,
          requestedBy: session.user.username,
          createdAt: Date.now(),
          timeoutHandle: defTimeoutHandle,
        });

        // Send wager prompt to defender
        broadcastEvent(campaignId, {
          kind: 'effort_wager_prompt',
          checkId: defCheckId,
          sdResult: defSdResult,
          sdDie: defSdDie,
          difficultyHint: defDifficultyHint,
          availableGovernors: defAvailableGovernors,
          maxPossible: defMaxPossible,
          skillLevel: cw.defenderSkillLevel,
          skillName: cw.defenderSkillName,
          fateDie: defFateDie,
          fdMax: defFdMax,
        }, cw.defenderUserId);
      }
    }

    return NextResponse.json({
      checkId: pending.id,
      characterId: pending.characterId,
      characterName: pending.characterName,
      skillName: pending.skillName,
      skillLevel: pending.skillLevel,
      isSkilled: pending.isSkilled,
      sdDie: pending.sdDie,
      sdResult: pending.sdResult,
      fdDie: pending.fateDie,
      fdResult,
      effort: totalEffort,
      effortAttribute: effortDesc || undefined,
      traitFlat,
      traitSources,
      total,
      dr: pending.dr,
      success,
      margin,
      revealDR: pending.revealDR,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
