/**
 * Skill Check Initiate — GM triggers a skill check against a player character.
 *
 * Flow:
 *   1. GM sends: characterId, skillName (or attributeName for unskilled), DR
 *   2. Server rolls SD (Skill Die)
 *   3. Server stores pending check
 *   4. Server broadcasts effort_wager_prompt to the target player via SSE
 *   5. Server broadcasts skill_check_request to everyone else
 *   6. Player responds via /api/campaigns/[id]/skill-check/wager
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { prisma } from '@/lib/db';
import { rollDie } from '@/lib/dice';
import { getSkillDieType, parseDie } from '@/lib/dice-utils';
import { storePendingCheck, removePendingCheck } from '@/lib/pending-checks';
import { broadcastEvent } from '@/lib/campaign-stream';
import { createCampaignEvent } from '@/services/campaign-event';
import { markAttributeTrainable, markSkillTrainable } from '@/services/advancement';
import { gatherTraitModifiers, type TraitModifierContribution } from '@/services/trait-modifiers';
import type { GrowthCharacter } from '@/types/growth';

export const dynamic = 'force-dynamic';

const PILLAR_GOVERNORS: Record<string, string[]> = {
  body: ['clout', 'celerity', 'constitution'],
  spirit: ['flow', 'focus'],
  soul: ['willpower', 'wisdom', 'wit'],
};

const GOVERNOR_TO_PILLAR: Record<string, 'body' | 'spirit' | 'soul'> = {
  clout: 'body', celerity: 'body', constitution: 'body',
  flow: 'spirit', focus: 'spirit',
  willpower: 'soul', wisdom: 'soul', wit: 'soul',
};

const InitiateSchema = z.object({
  characterId: z.string(),
  skillName: z.string().optional(),
  attributeName: z.string().optional(),
  dr: z.number().int().min(1),
  revealDR: z.boolean().optional().default(false),
}).refine(d => d.skillName || d.attributeName, {
  message: 'Either skillName or attributeName is required',
});

/** Calculate difficulty hint based on DR relative to character's max roll */
function getDifficultyHint(dr: number, sdMax: number, fdMax: number): 'blue' | 'purple' | 'red' {
  const maxPossible = sdMax + fdMax;
  if (maxPossible === 0) return 'red';
  const ratio = dr / maxPossible;
  if (ratio <= 0.4) return 'blue';
  if (ratio <= 0.7) return 'purple';
  return 'red';
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id: campaignId } = await params;
    const body = await request.json();
    const input = InitiateSchema.parse(body);

    // Look up the character
    const character = await prisma.character.findUnique({
      where: { id: input.characterId },
      include: { user: true },
    });
    if (!character || character.campaignId !== campaignId) {
      return NextResponse.json({ error: 'Character not found in this campaign' }, { status: 404 });
    }

    const charData = (typeof character.data === 'string' ? JSON.parse(character.data) : character.data) as GrowthCharacter;
    const fateDie = charData.creation?.seed?.baseFateDie || 'd6';
    const fdMax = parseDie(fateDie);

    // Determine skill info
    let skillName: string | undefined;
    let skillLevel = 0;
    let isSkilled = false;
    let governorAttr: string;

    if (input.skillName) {
      const skill = charData.skills.find(s => s.name.toLowerCase() === input.skillName!.toLowerCase());
      if (skill) {
        skillName = skill.name;
        skillLevel = skill.level;
        isSkilled = true;
        governorAttr = (skill.governors?.[0]) || input.attributeName || 'willpower';
      } else {
        // Skill not found — treat as unskilled check with the named skill
        skillName = input.skillName;
        governorAttr = input.attributeName || 'willpower';
      }
    } else {
      governorAttr = input.attributeName!;
    }

    // Roll the Skill Die — player sees this before wagering effort
    const sdInfo = getSkillDieType(skillLevel);
    const sdMax = sdInfo.isFlat ? sdInfo.flatBonus : sdInfo.sides;
    let sdResult: number;
    let sdDie: string;

    if (sdInfo.isFlat) {
      sdResult = sdInfo.flatBonus;
      sdDie = `flat:${sdInfo.flatBonus}`;
    } else {
      sdResult = rollDie(sdInfo.sides);
      sdDie = `d${sdInfo.sides}`;
    }

    // Calculate difficulty hint
    const difficultyHint = getDifficultyHint(input.dr, sdMax, fdMax);

    // Build available governors for effort wager — only the skill's actual governors
    const skillGovernors = isSkilled
      ? (charData.skills.find(s => s.name === skillName)?.governors || [governorAttr])
      : [governorAttr];
    const attrs = charData.attributes;
    const availableGovernors = skillGovernors.map(name => {
      const pillar = GOVERNOR_TO_PILLAR[name.toLowerCase()] || 'body';
      const attr = attrs[name as keyof typeof attrs];
      if (!attr || typeof attr !== 'object') return { name, current: 0, pillar };
      const a = attr as { current: number };
      return { name, current: a.current, pillar };
    });

    // Hard ceiling: FD Max + Skill Level (effort can't push past this)
    const maxPossible = fdMax + skillLevel;

    const checkId = crypto.randomUUID();

    // Auto-resolve after 90 seconds with 0 effort
    const timeoutHandle = setTimeout(async () => {
      const pending = removePendingCheck(checkId);
      if (!pending) return;

      // Roll FD and resolve with 0 effort
      const autoFdResult = rollDie(fdMax);

      // T24: trait modifiers fire on the auto-resolve path too — skipping the
      // wager forfeits Effort, never the character's Nectars/Blossoms/Thorns.
      let traitFlat = 0;
      let traitSources: TraitModifierContribution[] = [];
      let freshData: GrowthCharacter | null = null;
      try {
        const freshChar = await prisma.character.findUnique({
          where: { id: character.id },
          select: { data: true },
        });
        if (freshChar) {
          freshData = JSON.parse(freshChar.data) as GrowthCharacter;
          const mods = gatherTraitModifiers(freshData, {
            skillName: pending.skillName,
            governorAttribute: pending.attributeName,
          });
          traitFlat = mods.totalFlat;
          traitSources = mods.sources;
        }
      } catch { /* no modifier applied on load/parse failure */ }

      const total = pending.sdResult + autoFdResult + traitFlat;
      const success = total >= pending.dr;
      const margin = total - pending.dr;

      // Failed check → mark trainable (r-2026-07-15-01), same as the wager path.
      if (!success && freshData) {
        try {
          if (pending.isSkilled && pending.skillName) {
            markSkillTrainable(freshData, pending.skillName);
          } else {
            markAttributeTrainable(freshData, pending.attributeName);
          }
          await prisma.character.update({
            where: { id: character.id },
            data: { data: JSON.stringify(freshData) },
          });
          broadcastEvent(campaignId, {
            kind: 'character_update',
            characterId: character.id,
            characterName: character.name,
            fields: ['attributes', 'skills'],
          });
        } catch { /* mark is best-effort on the timeout path */ }
      }

      broadcastEvent(campaignId, {
        kind: 'check_result',
        checkId,
        characterId: character.id,
        characterName: character.name,
        skillName: pending.skillName,
        sdDie: pending.sdDie,
        sdResult: pending.sdResult,
        fdDie: fateDie,
        fdResult: autoFdResult,
        effort: 0,
        traitFlat,
        traitSources,
        total,
        dr: pending.dr,
        success,
        margin,
      });

      // Persist as terminal event
      await createCampaignEvent({
        campaignId,
        type: 'dice_roll',
        actor: 'system',
        actorUserId: session.user.id,
        actorName: 'System',
        characterId: character.id,
        characterName: character.name,
        payload: {
          kind: 'dice_roll',
          context: `${pending.skillName || governorAttr} check vs DR ${pending.dr} (auto-resolved, no wager)`,
          skillName: pending.skillName,
          skillLevel: pending.skillLevel,
          skillDie: { die: pending.sdDie, value: pending.sdResult, isFlat: pending.sdDie.startsWith('flat') },
          fateDie: { die: fateDie, value: autoFdResult },
          effort: 0,
          flatModifiers: traitFlat || undefined,
          total,
          dr: pending.dr,
          success,
          margin,
          isSkilled: pending.isSkilled,
        },
      });
    }, 90_000);

    // Store pending check (SD already rolled, FD will be rolled on wager commit)
    storePendingCheck({
      id: checkId,
      campaignId,
      characterId: character.id,
      characterName: character.name,
      targetUserId: character.userId,
      skillName,
      skillLevel,
      isSkilled,
      attributeName: governorAttr,
      fateDie,
      sdDie,
      sdResult,
      dr: input.dr,
      difficultyHint,
      availableGovernors,
      maxUsefulEffort: 0,
      revealDR: input.revealDR,
      requestedBy: session.user.username,
      createdAt: Date.now(),
      timeoutHandle,
    });

    // Broadcast effort wager prompt to the target player (shows SD result)
    broadcastEvent(campaignId, {
      kind: 'effort_wager_prompt',
      checkId,
      sdResult,
      sdDie,
      difficultyHint,
      availableGovernors,
      maxPossible,
      skillLevel,
      skillName,
      fateDie,
      fdMax,
    }, character.userId);

    // Broadcast check request notification to everyone
    broadcastEvent(campaignId, {
      kind: 'skill_check_request',
      checkId,
      targetCharacterId: character.id,
      targetCharacterName: character.name,
      skillName,
      skillLevel: isSkilled ? skillLevel : undefined,
      attributeName: isSkilled ? undefined : governorAttr,
      dr: input.dr,
      difficultyHint,
      requestedBy: session.user.username,
    });

    return NextResponse.json({
      checkId,
      sdDie,
      sdResult,
      difficultyHint,
      characterName: character.name,
      skillName,
    }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
