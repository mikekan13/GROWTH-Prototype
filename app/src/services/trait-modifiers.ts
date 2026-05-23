/**
 * Trait Modifier Service — sums roll-affecting effects from a character's
 * Nectars / Blossoms / Thorns into a single bonus applied during skill checks.
 *
 * Contract:
 *   - Caller passes the character + skill/governor context.
 *   - Returns `{ totalFlat, sources }` — the sum that should be added to
 *     the SD + FD + effort tally, plus a list of contributing traits so
 *     the result broadcast can surface them ("+2 from Sword's Edge").
 *
 * Matching rules:
 *   - A modifier with NO skillNamePattern AND NO governorAttribute → applies always.
 *   - A modifier with skillNamePattern → applies if the rolled skill name
 *     contains the pattern (case-insensitive substring).
 *   - A modifier with governorAttribute → applies if the rolled check's
 *     primary governor matches (case-insensitive).
 *   - If BOTH constraints set, BOTH must match.
 *
 * Notes:
 *   - Blossoms decay at session end (separate concern); this service
 *     trusts whatever is on the character now.
 *   - Thorns produce negative flat values authored at trait creation.
 *   - Free-text `mechanicalEffect` is NOT parsed here. Only `rollModifiers`
 *     entries fire. Kai authors `rollModifiers` when generating traits;
 *     the prose description stays in `mechanicalEffect` for humans.
 */

import type { GrowthCharacter, GrowthTrait, RollModifier } from '@/types/growth';

export interface TraitModifierContribution {
  traitName: string;
  traitType: 'nectar' | 'blossom' | 'thorn';
  flat: number;
  label?: string;
}

export interface TraitModifierResult {
  totalFlat: number;
  sources: TraitModifierContribution[];
}

export interface TraitModifierContext {
  /** Name of the skill being rolled, if any (case-insensitive substring match). */
  skillName?: string;
  /** Primary governor attribute on this check (case-insensitive match). */
  governorAttribute?: string;
}

function modifierMatches(mod: RollModifier, ctx: TraitModifierContext): boolean {
  if (mod.skillNamePattern) {
    if (!ctx.skillName) return false;
    if (!ctx.skillName.toLowerCase().includes(mod.skillNamePattern.toLowerCase())) return false;
  }
  if (mod.governorAttribute) {
    if (!ctx.governorAttribute) return false;
    if (mod.governorAttribute.toLowerCase() !== ctx.governorAttribute.toLowerCase()) return false;
  }
  return true;
}

export function gatherTraitModifiers(
  character: GrowthCharacter | { traits?: GrowthTrait[] },
  ctx: TraitModifierContext,
): TraitModifierResult {
  const traits = character.traits ?? [];
  const sources: TraitModifierContribution[] = [];

  for (const trait of traits) {
    if (!trait.rollModifiers || trait.rollModifiers.length === 0) continue;
    for (const mod of trait.rollModifiers) {
      if (!modifierMatches(mod, ctx)) continue;
      sources.push({
        traitName: trait.name,
        traitType: trait.type,
        flat: mod.flat,
        label: mod.label,
      });
    }
  }

  const totalFlat = sources.reduce((sum, s) => sum + s.flat, 0);
  return { totalFlat, sources };
}
