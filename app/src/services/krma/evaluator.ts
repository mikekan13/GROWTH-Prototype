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

import { calculateCharacterTKV, type HeldItemForTKV } from '@/lib/kv-calculator';

/**
 * Server-authoritative TKV. Single source of truth = the browser-safe pure
 * implementation in lib/kv-calculator, so the character sheet (which computes
 * TKV live in the browser) and the ledger (which charges it) can NEVER
 * disagree. The server side keeps only the crypto-bearing evaluator identity
 * (hashEvaluator, below) and the seed/death logic. Behavior parity is locked
 * by lib/kv-calculator.test.ts.
 */
export function calculateTKV(character: GrowthCharacter, heldItems: HeldItemForTKV[] = []): TKVBreakdown {
  return calculateCharacterTKV(character, heldItems);
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

  // Soul attributes → halved: floor(½) stripped to the GM, the MAJORITY (ceil ½)
  // stays on the ghost's Spirit package (corrected canon 2026-07-13 — Lady Death
  // takes ONLY Frequency; the soul half goes to the GM like body does).
  for (const attr of SOUL_ATTRIBUTES) {
    const kv = tkv.soul[attr];
    if (kv > 0) {
      const lost = Math.floor(kv / 2);
      const kept = kv - lost;
      if (lost > 0) {
        components.push({
          source: `attribute:${attr}`,
          kv: lost,
          destination: 'campaign',
          reason: `Soul attribute → half stripped to GM`,
        });
        toCampaign += lost;
      }
      if (kept > 0) {
        components.push({
          source: `attribute:${attr}`,
          kv: kept,
          destination: 'kept',
          reason: `Soul attribute → majority retained on ghost`,
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
    // Blossoms are temporary Godhead-bestowed buffs — on death they simply
    // vanish and their KRMA returns to the Godhead who bestowed them (canon
    // 2026-07-13). They never route to GM/Lady Death/ghost. (The actual
    // return-to-Godhead transfer is execution-side — see death-split memory.)
    if (trait.type === 'blossom') continue;
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
      // Soul → floor(½) to GM, majority retained (corrected 2026-07-13; was Lady Death).
      const lost = Math.floor(trait.kv / 2);
      const kept = trait.kv - lost;
      if (lost > 0) {
        components.push({
          source: `trait:${trait.name}`,
          kv: lost,
          destination: 'campaign',
          reason: `${trait.type} (soul) → half to GM`,
        });
        toCampaign += lost;
      }
      if (kept > 0) {
        components.push({
          source: `trait:${trait.name}`,
          kv: kept,
          destination: 'kept',
          reason: `${trait.type} (soul) → majority retained on ghost`,
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
  const shares = splitSkillShares(kv, governors);
  if (shares.length === 0) {
    return { toCampaign: 0, toLadyDeath: 0, components: [] };
  }
  let toCampaign = 0;
  const components: DeathSplitComponent[] = [];
  for (const s of shares) {
    if (s.toGM > 0) {
      toCampaign += s.toGM;
      components.push({
        source: `skill:${name}:${s.governor}`,
        kv: s.toGM,
        destination: 'campaign',
        reason: `${s.pillar}-governed skill share → to GM`,
      });
    }
    if (s.kept > 0) {
      components.push({
        source: `skill:${name}:${s.governor}`,
        kv: s.kept,
        destination: 'kept',
        reason: `${s.pillar}-governed skill share → retained on ghost`,
      });
    }
  }
  // Skills never route to Lady Death — she takes only Frequency (canon 2026-07-13).
  return { toCampaign, toLadyDeath: 0, components };
}

// ── Per-governor skill share split (corrected canon 2026-07-13) ──
//
// A skill's value/levels divide evenly across its governors; each share then
// follows its governor's pillar rule:
//   • Body   → 100% to GM
//   • Soul   → floor(½) to GM, the majority (ceil ½) retained on the ghost
//   • Spirit → 100% retained on the ghost
// Uneven division favors the Spirit package: extra unit(s) go to the governor
// that retains the most (spirit > soul > body). Because KV_PER_SKILL_LEVEL = 1,
// `total` is interchangeably KV or levels for non-magic skills — so both the
// KRMA split (here) and the ghost's resulting skill level
// (transformCharacterToGhost) derive from this one function and cannot drift.

export interface SkillGovernorShare {
  governor: string;
  pillar: 'body' | 'soul' | 'spirit' | 'unknown';
  share: number;
  toGM: number;
  kept: number;
}

export function splitSkillShares(total: number, governors: string[]): SkillGovernorShare[] {
  if (total <= 0 || governors.length === 0) return [];
  const n = governors.length;
  const pillars: SkillGovernorShare['pillar'][] = governors.map(g => {
    const p = getAttributePillar(g);
    return p === 'body' || p === 'soul' || p === 'spirit' ? p : 'unknown';
  });

  const base = Math.floor(total / n);
  let remainder = total - base * n;
  const shares = pillars.map(() => base);
  // Extra unit(s) go to the highest-retention governor (spirit > soul > body/unknown).
  const retentionRank = (p: SkillGovernorShare['pillar']) =>
    p === 'spirit' ? 3 : p === 'soul' ? 2 : p === 'unknown' ? 1 : 0;
  const order = pillars.map((_, i) => i).sort((a, b) => retentionRank(pillars[b]) - retentionRank(pillars[a]));
  for (const idx of order) {
    if (remainder <= 0) break;
    shares[idx] += 1;
    remainder -= 1;
  }

  return pillars.map((pillar, i) => {
    const share = shares[i];
    let toGM = 0;
    let kept = 0;
    if (pillar === 'body') {
      toGM = share;
    } else if (pillar === 'soul') {
      toGM = Math.floor(share / 2);
      kept = share - toGM;
    } else {
      kept = share; // spirit or unknown → retained on the ghost
    }
    return { governor: governors[i], pillar, share, toGM, kept };
  });
}
