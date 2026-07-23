/**
 * Spell Grant — teaches a godhead/GM-authored Woven spell (ForgeItem type
 * 'spell') to a character: it lands in magic.<pillar>.knownSpells, where
 * <pillar> comes from the spell's PRIMARY school (r-2026-07-22-01 #4/#5;
 * schema signed off r-2026-07-23-01).
 *
 * Pipeline position: player request (createPlayerRequest 'spell', intent
 * only) → GM approve (draft ForgeItem) → godhead chain authors mechanics
 * (forge-authoring TYPE_SCHEMAS.spell) → GM teaches it here. Completeness
 * is enforced HERE (dr + manaCost required), so requests can stay
 * intent-only upstream.
 *
 * KRMA: deliberately NO ledger movement. The nectar golden path pays
 * godhead→character because bestowal is a REWARD; a player-requested spell
 * is not, and no ruling prices spell-learning (mana is system-priced at
 * CAST time instead). Flagged in NEEDS-MIKE — add the transfer here if
 * Mike rules spells carry KV at learn time.
 */

import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { NotFoundError, ForbiddenError, ValidationError } from '@/lib/errors';
import { broadcastEvent } from '@/lib/campaign-stream';
import { getMagicCastingConfig } from './economy-config';
import { forgeSpellDataSchema } from './forge';
import type { GrowthCharacter, GrowthSpell, MagicSchool } from '@/types/growth';
import { MAGIC_SCHOOLS } from '@/types/growth';

export const learnSpellSchema = z.object({
  characterId: z.string().min(1),
  forgeItemId: z.string().min(1),
});

export type LearnSpellRequest = z.infer<typeof learnSpellSchema>;

export interface LearnSpellResult {
  characterId: string;
  spell: GrowthSpell;
  pillar: 'mercy' | 'severity' | 'balance';
}

export async function learnSpell(
  userId: string,
  userRole: string,
  input: LearnSpellRequest,
): Promise<LearnSpellResult> {
  const validated = learnSpellSchema.parse(input);

  const character = await prisma.character.findUnique({
    where: { id: validated.characterId },
    include: { campaign: { select: { gmUserId: true } } },
  });
  if (!character) throw new NotFoundError('Character not found');
  // Teaching is a GM confirm step (the 4-party sign-off layers on later) —
  // stricter than canEditCharacter, which would let the player self-teach.
  const isGM = character.campaign?.gmUserId === userId;
  if (!isGM && userRole !== 'ADMIN') {
    throw new ForbiddenError('Only the campaign GM can teach a spell');
  }

  const forgeItem = await prisma.forgeItem.findUnique({
    where: { id: validated.forgeItemId },
  });
  if (!forgeItem) throw new NotFoundError('Forge item not found');
  if (forgeItem.type !== 'spell') {
    throw new ValidationError(`Forge item is a ${forgeItem.type}, not a spell`);
  }
  if (character.campaignId && forgeItem.campaignId !== character.campaignId) {
    throw new ForbiddenError('Spell belongs to a different campaign');
  }

  const data = forgeSpellDataSchema.parse(JSON.parse(forgeItem.data));
  if (!data.dr || data.manaCost === undefined) {
    throw new ValidationError(
      'Spell mechanics incomplete — the godhead chain must author dr and manaCost before it can be taught',
    );
  }

  const school = data.school as MagicSchool;
  const pillar = MAGIC_SCHOOLS[school].pillar;
  const config = await getMagicCastingConfig();

  const spell: GrowthSpell = {
    name: forgeItem.name,
    school,
    description: data.description,
    castingMethod: 'weaving',
    schools: (data.schools as MagicSchool[] | undefined) ?? [school],
    dr: data.dr,
    manaCost: data.manaCost,
    failureConditions: data.failureConditions,
    persistentEffects: data.persistentEffects,
    requiresSystemReview: data.dr.total >= config.systemEngagementDR,
  };

  const charData = JSON.parse(character.data) as GrowthCharacter;
  charData.magic ??= {
    mercy: { schools: [], knownSpells: [] },
    severity: { schools: [], knownSpells: [] },
    balance: { schools: [], knownSpells: [] },
  };
  const block = charData.magic[pillar];
  block.knownSpells ??= [];
  if (block.knownSpells.some((s) => s.name.toLowerCase() === spell.name.toLowerCase())) {
    throw new ValidationError(`${character.name} already knows "${spell.name}"`);
  }
  block.knownSpells.push(spell);

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

  return { characterId: character.id, spell, pillar };
}
