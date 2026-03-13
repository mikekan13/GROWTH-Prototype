/**
 * KRMA KV Evaluator — Deterministic Track
 *
 * Calculates TKV (Total Karmic Value) from character data using
 * a versioned, pure function. No randomness, no side effects.
 *
 * The non-deterministic track (God of Chaos and Balance AI agent)
 * is a separate system — it stamps KV on traits at creation time.
 */
import crypto from 'crypto';
import type { GrowthCharacter } from '@/types/growth';
import {
  EVALUATOR_VERSION,
  KV_PER_ATTRIBUTE_LEVEL,
  KV_PER_SKILL_LEVEL,
  KV_PER_MAGIC_SKILL_LEVEL,
  WTH_COSTS,
  BODY_ATTRIBUTES,
  SPIRIT_ATTRIBUTES,
  SOUL_ATTRIBUTES,
  getAttributePillar,
  type TKVBreakdown,
  type DeathSplitManifest,
  type DeathSplitComponent,
} from '@/types/krma';

// ── TKV Calculation ──

export function calculateTKV(character: GrowthCharacter): TKVBreakdown {
  const attrs = character.attributes;

  // Body attributes
  const body = {
    clout: attrs.clout.level * KV_PER_ATTRIBUTE_LEVEL,
    celerity: attrs.celerity.level * KV_PER_ATTRIBUTE_LEVEL,
    constitution: attrs.constitution.level * KV_PER_ATTRIBUTE_LEVEL,
    subtotal: 0,
  };
  body.subtotal = body.clout + body.celerity + body.constitution;

  // Spirit attributes
  const spirit = {
    flow: attrs.flow.level * KV_PER_ATTRIBUTE_LEVEL,
    frequency: attrs.frequency.level * KV_PER_ATTRIBUTE_LEVEL,
    focus: attrs.focus.level * KV_PER_ATTRIBUTE_LEVEL,
    subtotal: 0,
  };
  spirit.subtotal = spirit.flow + spirit.frequency + spirit.focus;

  // Soul attributes
  const soul = {
    willpower: attrs.willpower.level * KV_PER_ATTRIBUTE_LEVEL,
    wisdom: attrs.wisdom.level * KV_PER_ATTRIBUTE_LEVEL,
    wit: attrs.wit.level * KV_PER_ATTRIBUTE_LEVEL,
    subtotal: 0,
  };
  soul.subtotal = soul.willpower + soul.wisdom + soul.wit;

  // Skills
  const skills = character.skills.map(s => ({
    name: s.name,
    kv: s.level * KV_PER_SKILL_LEVEL,
    governors: s.governors as string[],
  }));
  const skillsTotal = skills.reduce((sum, s) => sum + s.kv, 0);

  // Magic school skills
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

  // WTH levels
  const wthLevels = {
    wealth: WTH_COSTS[character.levels.wealthLevel] ?? 0,
    tech: WTH_COSTS[character.levels.techLevel] ?? 0,
    health: WTH_COSTS[character.levels.healthLevel] ?? 0,
    subtotal: 0,
  };
  wthLevels.subtotal = wthLevels.wealth + wthLevels.tech + wthLevels.health;

  // Traits (Nectars/Thorns/Blossoms) — KV is metadata-stamped at creation by Godhead.
  // We read the `kv` field if present on mechanicalEffect parse, otherwise 0.
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
    version: EVALUATOR_VERSION,
    total,
    body, spirit, soul,
    skills, skillsTotal,
    magicSkills, magicTotal,
    wthLevels,
    traits, traitsTotal,
  };
}

// ── Death Split Calculation ──

export function calculateDeathSplit(character: GrowthCharacter, tkv: TKVBreakdown): DeathSplitManifest {
  const components: DeathSplitComponent[] = [];
  let toCampaign = 0;
  let toPlayer = 0;
  let toLadyDeath = 0;

  // Body attributes → 100% to campaign (GM)
  for (const attr of BODY_ATTRIBUTES) {
    const kv = tkv.body[attr];
    if (kv > 0) {
      components.push({
        source: `attribute:${attr}`,
        kv,
        destination: 'campaign',
        reason: `Body attribute → 100% to GM`,
      });
      toCampaign += kv;
    }
  }

  // Soul attributes → halved (50% campaign, 50% player)
  for (const attr of SOUL_ATTRIBUTES) {
    const kv = tkv.soul[attr];
    if (kv > 0) {
      const half = Math.floor(kv / 2);
      const remainder = kv - half;
      components.push({
        source: `attribute:${attr}`,
        kv: half,
        destination: 'campaign',
        reason: `Soul attribute → 50% to GM`,
      });
      components.push({
        source: `attribute:${attr}`,
        kv: remainder,
        destination: 'player',
        reason: `Soul attribute → 50% to player Spirit Package`,
      });
      toCampaign += half;
      toPlayer += remainder;
    }
  }

  // Spirit attributes (Flow, Focus) → 100% to player
  for (const attr of SPIRIT_ATTRIBUTES) {
    const kv = tkv.spirit[attr as keyof typeof tkv.spirit] as number;
    if (kv > 0) {
      components.push({
        source: `attribute:${attr}`,
        kv,
        destination: 'player',
        reason: `Spirit attribute → 100% to player Spirit Package`,
      });
      toPlayer += kv;
    }
  }

  // Frequency → 100% to Lady Death
  const freqKV = tkv.spirit.frequency;
  if (freqKV > 0) {
    components.push({
      source: 'attribute:frequency',
      kv: freqKV,
      destination: 'lady_death',
      reason: 'Frequency → Lady Death tax',
    });
    toLadyDeath += freqKV;
  }

  // Skills — split by governing attributes
  for (const skill of tkv.skills) {
    const split = calculateSkillSplit(skill.name, skill.kv, skill.governors);
    components.push(...split.components);
    toCampaign += split.toCampaign;
    toPlayer += split.toPlayer;
  }

  // Magic school skills — governed by Flow (mercy), Focus (severity), or both (balance)
  // All Spirit-governed → 100% to player
  for (const ms of tkv.magicSkills) {
    if (ms.kv > 0) {
      components.push({
        source: `magic:${ms.school}`,
        kv: ms.kv,
        destination: 'player',
        reason: 'Magic skill (Spirit-governed) → 100% to player',
      });
      toPlayer += ms.kv;
    }
  }

  // Traits (Nectars/Thorns) — kept or destroyed per classification
  for (const trait of tkv.traits) {
    if (trait.kv === 0) continue;
    const classification = trait.deathClassification ?? 'destroyed';
    if (classification === 'kept') {
      components.push({
        source: `trait:${trait.name}`,
        kv: trait.kv,
        destination: 'player',
        reason: `${trait.type} (kept) → retained in Spirit Package`,
      });
      toPlayer += trait.kv;
    } else {
      components.push({
        source: `trait:${trait.name}`,
        kv: trait.kv,
        destination: 'campaign',
        reason: `${trait.type} (destroyed) → KV returned to GM`,
      });
      toCampaign += trait.kv;
    }
  }

  // WTH level costs are meta-progression — they don't split on death
  // (WTH levels persist across campaigns/deaths via the Spirit Package)
  // The KV cost is part of the character's locked investment but doesn't transfer as KRMA

  return { toCampaign, toPlayer, toLadyDeath, components };
}

// ── Evaluator Identity ──

/** Hash of the evaluator version + all weight constants. Stored in transaction metadata. */
export function hashEvaluator(): string {
  const data = [
    `version:${EVALUATOR_VERSION}`,
    `attrLevel:${KV_PER_ATTRIBUTE_LEVEL}`,
    `skillLevel:${KV_PER_SKILL_LEVEL}`,
    `magicLevel:${KV_PER_MAGIC_SKILL_LEVEL}`,
    `wth:${JSON.stringify(WTH_COSTS)}`,
  ].join('|');
  return crypto.createHash('sha256').update(data).digest('hex');
}

// ── Internal Helpers ──

function calculateSkillSplit(
  name: string,
  kv: number,
  governors: string[],
): { toCampaign: number; toPlayer: number; components: DeathSplitComponent[] } {
  if (kv === 0 || governors.length === 0) {
    return { toCampaign: 0, toPlayer: 0, components: [] };
  }

  // Classify each governor by pillar
  const pillars = governors.map(g => getAttributePillar(g));
  const hasBody = pillars.includes('body');
  const hasSoul = pillars.includes('soul');
  const hasSpirit = pillars.includes('spirit');

  // Purely one pillar
  if (!hasBody && !hasSoul && hasSpirit) {
    return {
      toCampaign: 0,
      toPlayer: kv,
      components: [{
        source: `skill:${name}`,
        kv,
        destination: 'player',
        reason: 'Spirit-governed skill → 100% to player',
      }],
    };
  }

  if (hasBody && !hasSoul && !hasSpirit) {
    return {
      toCampaign: kv,
      toPlayer: 0,
      components: [{
        source: `skill:${name}`,
        kv,
        destination: 'campaign',
        reason: 'Body-governed skill → 100% to GM',
      }],
    };
  }

  if (!hasBody && hasSoul && !hasSpirit) {
    // Soul-governed → halved like soul attributes
    const half = Math.floor(kv / 2);
    const remainder = kv - half;
    return {
      toCampaign: half,
      toPlayer: remainder,
      components: [
        { source: `skill:${name}`, kv: half, destination: 'campaign', reason: 'Soul-governed skill → 50% to GM' },
        { source: `skill:${name}`, kv: remainder, destination: 'player', reason: 'Soul-governed skill → 50% to player' },
      ],
    };
  }

  // Mixed governors → halved (conservative default)
  const half = Math.floor(kv / 2);
  const remainder = kv - half;
  return {
    toCampaign: half,
    toPlayer: remainder,
    components: [
      { source: `skill:${name}`, kv: half, destination: 'campaign', reason: 'Mixed-governed skill → 50% to GM' },
      { source: `skill:${name}`, kv: remainder, destination: 'player', reason: 'Mixed-governed skill → 50% to player' },
    ],
  };
}

/** Extract KV from a trait. Traits get KV stamped by Godhead at creation (stored in mechanicalEffect or a future kv field). */
function parseTraitKV(trait: { mechanicalEffect?: string }): number {
  // Look for a KV annotation in mechanicalEffect like "KV:5" or "[5 KV]"
  if (!trait.mechanicalEffect) return 0;
  const match = trait.mechanicalEffect.match(/(?:KV[:\s]*|^\[?\s*)(\d+)\s*(?:KV\]?)?/i);
  return match ? parseInt(match[1], 10) : 0;
}

/** Extract death classification from trait metadata */
function parseDeathClassification(trait: { mechanicalEffect?: string; type: string }): 'kept' | 'destroyed' {
  // Look for death classification annotation: "death:kept" or "death:destroyed"
  if (trait.mechanicalEffect) {
    if (/death:\s*kept/i.test(trait.mechanicalEffect)) return 'kept';
    if (/death:\s*destroyed/i.test(trait.mechanicalEffect)) return 'destroyed';
  }
  // Default: nectars are destroyed, thorns are kept (thorns represent scars/lessons)
  return trait.type === 'thorn' ? 'kept' : 'destroyed';
}
