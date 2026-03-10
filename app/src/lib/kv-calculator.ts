/**
 * Client-side KV Calculator — Pure functions for TKV calculation
 *
 * Mirrors the server-side evaluator (services/krma/evaluator.ts) but
 * without Node.js crypto dependency, so it can run in the browser.
 */
import type { GrowthCharacter } from '@/types/growth';
import type { GrowthWorldItem } from '@/types/item';
import type { GrowthLocation } from '@/types/location';
import {
  KV_PER_ATTRIBUTE_LEVEL,
  KV_PER_SKILL_LEVEL,
  KV_PER_MAGIC_SKILL_LEVEL,
  WTH_COSTS,
  type TKVBreakdown,
} from '@/types/krma';

// ── Character TKV ──

export function calculateCharacterTKV(character: GrowthCharacter): TKVBreakdown {
  const attrs = character.attributes;

  const body = {
    clout: attrs.clout.level * KV_PER_ATTRIBUTE_LEVEL,
    celerity: attrs.celerity.level * KV_PER_ATTRIBUTE_LEVEL,
    constitution: attrs.constitution.level * KV_PER_ATTRIBUTE_LEVEL,
    subtotal: 0,
  };
  body.subtotal = body.clout + body.celerity + body.constitution;

  const spirit = {
    flow: attrs.flow.level * KV_PER_ATTRIBUTE_LEVEL,
    frequency: attrs.frequency.level * KV_PER_ATTRIBUTE_LEVEL,
    focus: attrs.focus.level * KV_PER_ATTRIBUTE_LEVEL,
    subtotal: 0,
  };
  spirit.subtotal = spirit.flow + spirit.frequency + spirit.focus;

  const soul = {
    willpower: attrs.willpower.level * KV_PER_ATTRIBUTE_LEVEL,
    wisdom: attrs.wisdom.level * KV_PER_ATTRIBUTE_LEVEL,
    wit: attrs.wit.level * KV_PER_ATTRIBUTE_LEVEL,
    subtotal: 0,
  };
  soul.subtotal = soul.willpower + soul.wisdom + soul.wit;

  const skills = character.skills.map(s => ({
    name: s.name,
    kv: s.level * KV_PER_SKILL_LEVEL,
    governors: s.governors as string[],
  }));
  const skillsTotal = skills.reduce((sum, s) => sum + s.kv, 0);

  const magicSkills: Array<{ school: string; kv: number }> = [];
  const magicPillars = [character.magic.mercy, character.magic.severity, character.magic.balance];
  for (const pillar of magicPillars) {
    if (pillar.skillLevels) {
      for (const [school, level] of Object.entries(pillar.skillLevels)) {
        if (level && level > 0) {
          magicSkills.push({ school, kv: level * KV_PER_MAGIC_SKILL_LEVEL });
        }
      }
    }
  }
  const magicTotal = magicSkills.reduce((sum, s) => sum + s.kv, 0);

  const wthLevels = {
    wealth: WTH_COSTS[character.levels.wealthLevel] ?? 0,
    tech: WTH_COSTS[character.levels.techLevel] ?? 0,
    health: WTH_COSTS[character.levels.healthLevel] ?? 0,
    subtotal: 0,
  };
  wthLevels.subtotal = wthLevels.wealth + wthLevels.tech + wthLevels.health;

  const traits = character.traits.map(t => ({
    name: t.name,
    kv: parseTraitKV(t),
    type: t.type,
    deathClassification: parseDeathClassification(t),
  }));
  const traitsTotal = traits.reduce((sum, t) => sum + t.kv, 0);

  const total = body.subtotal + spirit.subtotal + soul.subtotal
    + skillsTotal + magicTotal + wthLevels.subtotal + traitsTotal;

  return {
    version: 1,
    total,
    body, spirit, soul,
    skills, skillsTotal,
    magicSkills, magicTotal,
    wthLevels,
    traits, traitsTotal,
  };
}

// ── Entity KV Helpers ──

/** Calculate KV for a world item (placeholder — manual values until AI grading) */
export function calculateItemKV(item: GrowthWorldItem): number {
  // Rarity-based placeholder KV
  const rarityKV: Record<string, number> = {
    common: 1,
    uncommon: 3,
    rare: 5,
    very_rare: 10,
    legendary: 20,
    artifact: 50,
  };
  const base = rarityKV[item.rarity || 'common'] ?? 1;

  // Condition modifier (4=full, 1=destroyed)
  const conditionMultiplier = (item.condition ?? 4) / 4;

  return Math.max(1, Math.round(base * conditionMultiplier));
}

/** Calculate KV for a location (placeholder — manual values until AI grading) */
export function calculateLocationKV(location: GrowthLocation): number {
  // Danger + wealth + features = rough KV
  const dangerKV = (location.dangerLevel ?? 1) * 2;
  const wealthKV = (location.wealthLevel ?? 1);
  const featureKV = (location.features?.length ?? 0) * 2;
  const connectionKV = (location.connections?.length ?? 0);

  return Math.max(1, dangerKV + wealthKV + featureKV + connectionKV);
}

// ── Internal Helpers ──

function parseTraitKV(trait: { mechanicalEffect?: string }): number {
  if (!trait.mechanicalEffect) return 0;
  const match = trait.mechanicalEffect.match(/(?:KV[:\s]*|^\[?\s*)(\d+)\s*(?:KV\]?)?/i);
  return match ? parseInt(match[1], 10) : 0;
}

function parseDeathClassification(trait: { mechanicalEffect?: string; type: string }): 'kept' | 'destroyed' {
  if (trait.mechanicalEffect) {
    if (/death:\s*kept/i.test(trait.mechanicalEffect)) return 'kept';
    if (/death:\s*destroyed/i.test(trait.mechanicalEffect)) return 'destroyed';
  }
  return trait.type === 'thorn' ? 'kept' : 'destroyed';
}
