/**
 * Contested Check — GM initiates a contested skill check between two characters.
 *
 * Flow (all server-orchestrated):
 *   1. GM sends: attacker + defender character/skill info
 *   2. Server rolls attacker's SD, sends wager prompt to attacker
 *   3. Attacker wagers via /skill-check/wager → server detects contested link
 *   4. Server auto-rolls defender's SD, sends wager prompt to defender
 *   5. Defender wagers via /skill-check/wager → server resolves + broadcasts result
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { prisma } from '@/lib/db';
import { rollDie } from '@/lib/dice';
import { getSkillDieType, parseDie } from '@/lib/dice-utils';
import { storePendingCheck } from '@/lib/pending-checks';
import { broadcastEvent } from '@/lib/campaign-stream';
import type { GrowthCharacter } from '@/types/growth';

export const dynamic = 'force-dynamic';

const GOVERNOR_TO_PILLAR: Record<string, 'body' | 'spirit' | 'soul'> = {
  clout: 'body', celerity: 'body', constitution: 'body',
  flow: 'spirit', focus: 'spirit',
  willpower: 'soul', wisdom: 'soul', wit: 'soul',
};

function getDifficultyHint(dr: number, sdMax: number, fdMax: number): 'blue' | 'purple' | 'red' {
  const maxPossible = sdMax + fdMax;
  if (maxPossible === 0) return 'red';
  const ratio = dr / maxPossible;
  if (ratio <= 0.4) return 'blue';
  if (ratio <= 0.7) return 'purple';
  return 'red';
}

const ContestedSchema = z.object({
  attackerCharacterId: z.string(),
  attackerSkillName: z.string().optional(),
  attackerAttributeName: z.string().optional(),
  defenderCharacterId: z.string(),
  defenderSkillName: z.string().optional(),
  defenderAttributeName: z.string().optional(),
  defenderGovernors: z.array(z.string()),
  revealDR: z.boolean().optional().default(false),
});

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await requireAuth();
    const { id: campaignId } = await params;
    const body = await request.json();
    const input = ContestedSchema.parse(body);

    // Look up both characters
    const [attacker, defender] = await Promise.all([
      prisma.character.findUnique({ where: { id: input.attackerCharacterId }, include: { user: true } }),
      prisma.character.findUnique({ where: { id: input.defenderCharacterId }, include: { user: true } }),
    ]);
    if (!attacker || attacker.campaignId !== campaignId) {
      return NextResponse.json({ error: 'Attacker not found' }, { status: 404 });
    }
    if (!defender || defender.campaignId !== campaignId) {
      return NextResponse.json({ error: 'Defender not found' }, { status: 404 });
    }

    const attackerData = (typeof attacker.data === 'string' ? JSON.parse(attacker.data) : attacker.data) as GrowthCharacter;
    const defenderData = (typeof defender.data === 'string' ? JSON.parse(defender.data) : defender.data) as GrowthCharacter;

    // Resolve attacker skill
    let attackerSkillName: string | undefined;
    let attackerSkillLevel = 0;
    let attackerIsSkilled = false;
    let attackerGovernorAttr: string;

    if (input.attackerSkillName) {
      const skill = attackerData.skills.find(s => s.name.toLowerCase() === input.attackerSkillName!.toLowerCase());
      if (skill) {
        attackerSkillName = skill.name;
        attackerSkillLevel = skill.level;
        attackerIsSkilled = true;
        attackerGovernorAttr = (skill.governors?.[0]) || input.attackerAttributeName || 'willpower';
      } else {
        attackerSkillName = input.attackerSkillName;
        attackerGovernorAttr = input.attackerAttributeName || 'willpower';
      }
    } else {
      attackerGovernorAttr = input.attackerAttributeName!;
    }

    // Roll attacker's SD
    const attackerFateDie = attackerData.creation?.seed?.baseFateDie || 'd6';
    const attackerFdMax = parseDie(attackerFateDie);
    const attackerSdInfo = getSkillDieType(attackerSkillLevel);
    const attackerSdMax = attackerSdInfo.isFlat ? attackerSdInfo.flatBonus : attackerSdInfo.sides;
    let attackerSdResult: number;
    let attackerSdDie: string;
    if (attackerSdInfo.isFlat) {
      attackerSdResult = attackerSdInfo.flatBonus;
      attackerSdDie = `flat:${attackerSdInfo.flatBonus}`;
    } else {
      attackerSdResult = rollDie(attackerSdInfo.sides);
      attackerSdDie = `d${attackerSdInfo.sides}`;
    }

    // Build attacker's available governors
    const attackerSkillGovernors = attackerIsSkilled
      ? (attackerData.skills.find(s => s.name === attackerSkillName)?.governors || [attackerGovernorAttr])
      : [attackerGovernorAttr];
    const attackerAttrs = attackerData.attributes;
    const attackerAvailableGovernors = attackerSkillGovernors.map(name => {
      const pillar = GOVERNOR_TO_PILLAR[name.toLowerCase()] || 'body';
      const attr = attackerAttrs[name as keyof typeof attackerAttrs];
      if (!attr || typeof attr !== 'object') return { name, current: 0, pillar };
      const a = attr as { current: number };
      return { name, current: a.current, pillar };
    });

    const attackerMaxPossible = attackerFdMax + attackerSkillLevel;
    const checkId = crypto.randomUUID();

    // Resolve defender info for the contested link
    let defenderSkillName: string | undefined;
    let defenderSkillLevel = 0;
    let defenderIsSkilled = false;
    let defenderGovernorAttr: string;

    if (input.defenderSkillName) {
      const skill = defenderData.skills.find(s => s.name.toLowerCase() === input.defenderSkillName!.toLowerCase());
      if (skill) {
        defenderSkillName = skill.name;
        defenderSkillLevel = skill.level;
        defenderIsSkilled = true;
        defenderGovernorAttr = (skill.governors?.[0]) || input.defenderAttributeName || 'willpower';
      } else {
        defenderSkillName = input.defenderSkillName;
        defenderGovernorAttr = input.defenderAttributeName || 'willpower';
      }
    } else {
      defenderGovernorAttr = input.defenderAttributeName!;
    }

    const defenderFateDie = defenderData.creation?.seed?.baseFateDie || 'd6';

    // Auto-resolve timeout (90s)
    const timeoutHandle = setTimeout(() => {
      // Auto-resolve is complex for contested — just clean up
      const { removePendingCheck } = require('@/lib/pending-checks');
      removePendingCheck(checkId);
    }, 90_000);

    // Store attacker's pending check with contested link
    storePendingCheck({
      id: checkId,
      campaignId,
      characterId: attacker.id,
      characterName: attacker.name,
      targetUserId: attacker.userId,
      skillName: attackerSkillName,
      skillLevel: attackerSkillLevel,
      isSkilled: attackerIsSkilled,
      attributeName: attackerGovernorAttr,
      fateDie: attackerFateDie,
      sdDie: attackerSdDie,
      sdResult: attackerSdResult,
      dr: 1, // Placeholder — will be set by defender's total
      difficultyHint: 'purple', // Not shown for attacker in contested
      availableGovernors: attackerAvailableGovernors,
      maxUsefulEffort: 0,
      revealDR: input.revealDR,
      contestedWith: {
        defenderCharacterId: defender.id,
        defenderCharacterName: defender.name,
        defenderUserId: defender.userId,
        defenderSkillName,
        defenderAttributeName: defenderGovernorAttr,
        defenderSkillLevel,
        defenderIsSkilled,
        defenderGovernors: input.defenderGovernors,
        defenderFateDie,
      },
      requestedBy: session.user.username,
      createdAt: Date.now(),
      timeoutHandle,
    });

    // Send wager prompt to attacker
    broadcastEvent(campaignId, {
      kind: 'effort_wager_prompt',
      checkId,
      sdResult: attackerSdResult,
      sdDie: attackerSdDie,
      difficultyHint: 'purple', // Contested — no real DR hint for attacker
      availableGovernors: attackerAvailableGovernors,
      maxPossible: attackerMaxPossible,
      skillLevel: attackerSkillLevel,
      skillName: attackerSkillName,
      fateDie: attackerFateDie,
      fdMax: attackerFdMax,
    }, attacker.userId);

    // Broadcast notification to everyone
    broadcastEvent(campaignId, {
      kind: 'skill_check_request',
      checkId,
      targetCharacterId: attacker.id,
      targetCharacterName: attacker.name,
      skillName: attackerSkillName,
      skillLevel: attackerIsSkilled ? attackerSkillLevel : undefined,
      attributeName: attackerIsSkilled ? undefined : attackerGovernorAttr,
      dr: 0, // Contested — no fixed DR
      difficultyHint: 'purple',
      requestedBy: session.user.username,
    });

    return NextResponse.json({
      checkId,
      attackerName: attacker.name,
      defenderName: defender.name,
      contested: true,
    }, { status: 201 });
  } catch (error) {
    return errorResponse(error);
  }
}
