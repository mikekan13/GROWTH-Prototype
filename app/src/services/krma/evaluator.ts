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
import type { GrowthCharacter, GrowthSeed, FateDie } from '@/types/growth';
import {
  EVALUATOR_VERSION,
  KV_PER_ATTRIBUTE_LEVEL,
  KV_PER_SKILL_LEVEL,
  KV_PER_MAGIC_SKILL_LEVEL,
  BODY_ATTRIBUTES,
  SPIRIT_ATTRIBUTES,
  SOUL_ATTRIBUTES,
  getAttributePillar,
  type TKVBreakdown,
  type DeathSplitManifest,
  type DeathSplitComponent,
} from '@/types/krma';

// ── KV Constants ──

/** Body resist costs 2 KV per point (passive defense premium) */
const KV_PER_BODY_RESIST = 2;

/** Fate Die KV — roughly doubling per step */
export const FATE_DIE_KV: Record<FateDie, number> = {
  'd4': 5,
  'd6': 10,
  'd8': 20,
  'd12': 40,
  'd20': 80,
};

/** Age floor rate for roots — minimum KV per year of life */
export const AGE_KV_PER_YEAR = 2;

/** Nectar/Thorn guardrail ranges by rarity */
export const TRAIT_KV_GUARDRAILS = {
  common:   { nectar: { min: 15, max: 25 }, thorn: { min: -20, max: -10 } },
  uncommon: { nectar: { min: 25, max: 40 }, thorn: { min: -35, max: -20 } },
  rare:     { nectar: { min: 40, max: 60 }, thorn: { min: -50, max: -35 } },
} as const;

// ── TKV Calculation ──

import { calculateItemKV, type HeldItemForTKV } from '@/lib/kv-calculator';

export function calculateTKV(character: GrowthCharacter, heldItems: HeldItemForTKV[] = []): TKVBreakdown {
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

  // Body resist
  const baseResist = character.vitals?.baseResist ?? 0;
  const bodyResist = {
    total: baseResist * KV_PER_BODY_RESIST,
    rate: KV_PER_BODY_RESIST,
  };

  // Traits (Nectars/Thorns/Blossoms) — KV is metadata-stamped at creation by Godhead.
  // We read the `kv` field if present on mechanicalEffect parse, otherwise 0.
  const traits = character.traits.map(t => ({
    name: t.name,
    kv: parseTraitKV(t),
    type: t.type,
    deathClassification: parseDeathClassification(t),
  }));
  const traitsTotal = traits.reduce((sum, t) => sum + t.kv, 0);

  // Held items contribute to TKV (per Mike 2026-05-13: "anything on a player sheet counts")
  const items = heldItems.map(it => {
    const raw = it.karmicValue;
    const kaiValue = typeof raw === 'bigint' ? Number(raw) : (typeof raw === 'number' ? raw : null);
    const kv = kaiValue && kaiValue > 0 ? kaiValue : calculateItemKV(it.data);
    return { id: it.id, name: it.name, kv, type: it.type };
  });
  const itemsTotal = items.reduce((sum, i) => sum + i.kv, 0);

  // ── Seed-contributed creation values (set by applyCreationGrants once GM applies mechanics) ──
  // Attribute augs — 1 KRMA per aug point (positive + negative, both count toward TKV)
  const augsTotal = Object.values(attrs).reduce((sum, a) => {
    const pos = (a as { augmentPositive?: number })?.augmentPositive ?? 0;
    const neg = (a as { augmentNegative?: number })?.augmentNegative ?? 0;
    return sum + pos + neg;
  }, 0);
  const augs = { total: augsTotal, rate: 1 };

  // Fate Die — from creation.seed.baseFateDie
  const dieKey = character.creation?.seed?.baseFateDie;
  const fateDieValue = dieKey ? (FATE_DIE_KV[dieKey] ?? 0) : 0;
  const fateDie = { die: dieKey ?? '', kv: fateDieValue };

  // Fated Age — ceil(years × 0.5)
  const creationFatedAge = character.creation?.fatedAge;
  const fatedAgeYears = creationFatedAge ?? character.fatedAge ?? 0;
  const fatedAgeValue = fatedAgeYears > 0 ? Math.ceil(fatedAgeYears * 0.5) : 0;
  const fatedAge = { years: fatedAgeYears, kv: fatedAgeValue };

  const total = body.subtotal + spirit.subtotal + soul.subtotal
    + skillsTotal + magicTotal + bodyResist.total + traitsTotal + itemsTotal
    + augsTotal + fateDieValue + fatedAgeValue;

  return {
    version: EVALUATOR_VERSION,
    total,
    body, spirit, soul,
    skills, skillsTotal,
    magicSkills, magicTotal,
    bodyResist,
    traits, traitsTotal,
    items, itemsTotal,
    augs, fateDie, fatedAge,
  };
}

// ── Seed KV Calculation ──

export interface SeedKVBreakdown {
  attributes: number;
  frequency: number;
  bodyResist: number;
  fateDie: number;
  /** Net nectar/thorn value (manual/metadata) */
  traitNet: number;
  total: number;
}

/** Calculate the deterministic KV of a seed template */
export function calculateSeedKV(seed: GrowthSeed): SeedKVBreakdown {
  const attrValues = seed.attributes;
  const attributes =
    (attrValues.clout + attrValues.celerity + attrValues.constitution +
     attrValues.focus + attrValues.flow +
     attrValues.willpower + attrValues.wisdom + attrValues.wit) * KV_PER_ATTRIBUTE_LEVEL;

  const frequency = seed.frequency * KV_PER_ATTRIBUTE_LEVEL;
  const bodyResist = seed.baseResist * KV_PER_BODY_RESIST;
  const fateDie = FATE_DIE_KV[seed.baseFateDie] ?? 10;

  // Trait KV is stamped at authoring time — seeds store it in seedKV already
  // For recalculation, traitNet is the delta (total - deterministic components)
  const deterministicTotal = attributes + frequency + bodyResist + fateDie;
  const traitNet = seed.seedKV - deterministicTotal;

  return {
    attributes,
    frequency,
    bodyResist,
    fateDie,
    traitNet: isNaN(traitNet) ? 0 : traitNet,
    total: deterministicTotal + (isNaN(traitNet) ? 0 : traitNet),
  };
}

// ── Root Age Floor ──

export interface RootKVValidation {
  yearsAdded: number;
  minimumKV: number;
  actualKV: number;
  meetsFloor: boolean;
}

/** Validate that a root's KV meets the age-based minimum floor */
export function validateRootAgeFloor(yearsAdded: number, actualRootKV: number): RootKVValidation {
  const minimumKV = yearsAdded * AGE_KV_PER_YEAR;
  return {
    yearsAdded,
    minimumKV,
    actualKV: actualRootKV,
    meetsFloor: actualRootKV >= minimumKV,
  };
}

// ── Trait KV Guardrail Validation ──

export interface TraitKVValidation {
  traitName: string;
  traitType: 'nectar' | 'thorn';
  rarity: 'common' | 'uncommon' | 'rare';
  proposedKV: number;
  guardrailMin: number;
  guardrailMax: number;
  withinGuardrails: boolean;
}

/** Validate that a proposed nectar/thorn KV falls within guardrails */
export function validateTraitKV(
  traitName: string,
  traitType: 'nectar' | 'thorn',
  rarity: 'common' | 'uncommon' | 'rare',
  proposedKV: number,
): TraitKVValidation {
  const range = TRAIT_KV_GUARDRAILS[rarity][traitType];
  return {
    traitName,
    traitType,
    rarity,
    proposedKV,
    guardrailMin: range.min,
    guardrailMax: range.max,
    withinGuardrails: proposedKV >= range.min && proposedKV <= range.max,
  };
}

// ── Death Split Calculation ──
//
// Transformation model (locked Mike 2026-05-19): the character is NOT destroyed
// on death — they continue as a ghost form. The split:
//   • Body attrs/skills/body-pillared traits/body resist → stripped, KRMA → GM
//   • Soul attrs + soul-governed skills → halved; lost half KRMA → Lady Death
//   • Frequency capacity (max level) → 0; full KRMA value → Lady Death
//   • Spirit (Flow, Focus) attrs/skills/magic skills → kept on character
//   • Non-body traits (spirit/soul pillar) → kept on character
//
// "kept" entries do NOT appear in the manifest's transfer totals — they
// stay on the character wallet. They DO appear as components with
// destination 'kept' for audit/UI rendering.

export function calculateDeathSplit(character: GrowthCharacter, tkv: TKVBreakdown): DeathSplitManifest {
  const components: DeathSplitComponent[] = [];
  let toCampaign = 0;
  // toPlayer kept for back-compat with the manifest type — the new
  // transformation model leaves all "kept" KRMA on the character wallet,
  // not transferred to the player. We always set toPlayer = 0 here.
  const toPlayer = 0;
  let toLadyDeath = 0;

  // Body attributes → 100% to campaign
  for (const attr of BODY_ATTRIBUTES) {
    const kv = tkv.body[attr];
    if (kv > 0) {
      components.push({
        source: `attribute:${attr}`,
        kv,
        destination: 'campaign',
        reason: `Body attribute → stripped to GM`,
      });
      toCampaign += kv;
    }
  }

  // Soul attributes → halved, the lost half → Lady Death; remaining half stays on character
  for (const attr of SOUL_ATTRIBUTES) {
    const kv = tkv.soul[attr];
    if (kv > 0) {
      const lost = Math.floor(kv / 2);
      const kept = kv - lost;
      if (lost > 0) {
        components.push({
          source: `attribute:${attr}`,
          kv: lost,
          destination: 'lady_death',
          reason: `Soul attribute → half stripped to Lady Death`,
        });
        toLadyDeath += lost;
      }
      if (kept > 0) {
        components.push({
          source: `attribute:${attr}`,
          kv: kept,
          destination: 'kept',
          reason: `Soul attribute → half retained on ghost`,
        });
      }
    }
  }

  // Spirit Flow + Focus → kept (NOT transferred). Recorded as components for UI clarity.
  // (SPIRIT_ATTRIBUTES already excludes 'frequency' by design — frequency
  // capacity is handled separately and routes to Lady Death.)
  for (const attr of SPIRIT_ATTRIBUTES) {
    const kv = tkv.spirit[attr as keyof typeof tkv.spirit] as number;
    if (kv > 0) {
      components.push({
        source: `attribute:${attr}`,
        kv,
        destination: 'kept',
        reason: `Spirit ${attr} → retained on ghost`,
      });
    }
  }

  // Frequency CAPACITY → Lady Death. The KV reflects level (max), not current pool.
  const freqKV = tkv.spirit.frequency;
  if (freqKV > 0) {
    components.push({
      source: 'attribute:frequency',
      kv: freqKV,
      destination: 'lady_death',
      reason: 'Frequency capacity → Lady Death (ghost has no Frequency)',
    });
    toLadyDeath += freqKV;
  }

  // Skills — body-governed strip; soul-governed halve; pure-spirit kept; mixed
  // body-soul defaults to stripping (body presence dominates by canon — body
  // is the more aggressive rule).
  for (const skill of tkv.skills) {
    const split = calculateSkillSplit(skill.name, skill.kv, skill.governors);
    components.push(...split.components);
    toCampaign += split.toCampaign;
    toLadyDeath += split.toLadyDeath;
  }

  // Magic school skills — Spirit-pillar (Flow/Focus governed) → kept on ghost.
  for (const ms of tkv.magicSkills) {
    if (ms.kv > 0) {
      components.push({
        source: `magic:${ms.school}`,
        kv: ms.kv,
        destination: 'kept',
        reason: 'Magic school (Spirit-governed) → retained on ghost',
      });
    }
  }

  // Traits routed by their explicit `pillar` tag (locked Mike 2026-05-19).
  // Legacy un-tagged traits default to spirit (the safe-kept bucket).
  for (const trait of tkv.traits) {
    if (trait.kv === 0) continue;
    const pillar = (trait as { pillar?: 'body' | 'spirit' | 'soul' }).pillar ?? 'spirit';
    if (pillar === 'body') {
      components.push({
        source: `trait:${trait.name}`,
        kv: trait.kv,
        destination: 'campaign',
        reason: `${trait.type} (body) → stripped to GM`,
      });
      toCampaign += trait.kv;
    } else if (pillar === 'soul') {
      const lost = Math.floor(trait.kv / 2);
      const kept = trait.kv - lost;
      if (lost > 0) {
        components.push({
          source: `trait:${trait.name}`,
          kv: lost,
          destination: 'lady_death',
          reason: `${trait.type} (soul) → half to Lady Death`,
        });
        toLadyDeath += lost;
      }
      if (kept > 0) {
        components.push({
          source: `trait:${trait.name}`,
          kv: kept,
          destination: 'kept',
          reason: `${trait.type} (soul) → half retained on ghost`,
        });
      }
    } else {
      components.push({
        source: `trait:${trait.name}`,
        kv: trait.kv,
        destination: 'kept',
        reason: `${trait.type} (spirit) → retained on ghost`,
      });
    }
  }

  // Body resist KV → stripped to campaign (a body property)
  if (tkv.bodyResist.total > 0) {
    components.push({
      source: 'bodyResist',
      kv: tkv.bodyResist.total,
      destination: 'campaign',
      reason: 'Body resist → stripped to GM',
    });
    toCampaign += tkv.bodyResist.total;
  }

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
    `bodyResist:${KV_PER_BODY_RESIST}`,
    `fateDie:${JSON.stringify(FATE_DIE_KV)}`,
    `ageFloor:${AGE_KV_PER_YEAR}`,
  ].join('|');
  return crypto.createHash('sha256').update(data).digest('hex');
}

// ── Internal Helpers ──

function calculateSkillSplit(
  name: string,
  kv: number,
  governors: string[],
): { toCampaign: number; toLadyDeath: number; components: DeathSplitComponent[] } {
  if (kv === 0 || governors.length === 0) {
    return { toCampaign: 0, toLadyDeath: 0, components: [] };
  }

  const pillars = governors.map(g => getAttributePillar(g));
  const hasBody = pillars.includes('body');
  const hasSoul = pillars.includes('soul');
  const hasSpirit = pillars.includes('spirit');

  // Body presence ⇒ strip entirely. Body wins on mixed governors (per canon —
  // body is the most aggressive rule, applied first).
  if (hasBody) {
    return {
      toCampaign: kv,
      toLadyDeath: 0,
      components: [{
        source: `skill:${name}`,
        kv,
        destination: 'campaign',
        reason: 'Body-governed skill → stripped to GM',
      }],
    };
  }

  // Soul presence (no body) ⇒ halve to Lady Death, retain rest.
  if (hasSoul) {
    const lost = Math.floor(kv / 2);
    const kept = kv - lost;
    const comps: DeathSplitComponent[] = [];
    if (lost > 0) {
      comps.push({ source: `skill:${name}`, kv: lost, destination: 'lady_death', reason: 'Soul-governed skill → half to Lady Death' });
    }
    if (kept > 0) {
      comps.push({ source: `skill:${name}`, kv: kept, destination: 'kept', reason: 'Soul-governed skill → half retained on ghost' });
    }
    return { toCampaign: 0, toLadyDeath: lost, components: comps };
  }

  // Pure Spirit governance ⇒ kept on ghost.
  if (hasSpirit) {
    return {
      toCampaign: 0,
      toLadyDeath: 0,
      components: [{
        source: `skill:${name}`,
        kv,
        destination: 'kept',
        reason: 'Spirit-governed skill → retained on ghost',
      }],
    };
  }

  // Unknown governor (shouldn't happen) — keep, log via reason.
  return {
    toCampaign: 0,
    toLadyDeath: 0,
    components: [{
      source: `skill:${name}`,
      kv,
      destination: 'kept',
      reason: 'Unclassified skill governor — retained by default',
    }],
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
