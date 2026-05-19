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
  type TKVBreakdown,
} from '@/types/krma';

/** Body Resist costs 2 KRMA per point */
const KV_PER_BODY_RESIST = 2;

/** Fate Die KV — roughly doubling per step */
export const FATE_DIE_KV: Record<string, number> = {
  'd4': 5, 'd6': 10, 'd8': 20, 'd12': 40, 'd20': 80,
};

// ── Character TKV ──

export interface HeldItemForTKV {
  id?: string;
  name: string;
  type?: string;
  data: GrowthWorldItem;
  /** Optional Kai-graded value override (BigInt or number). If provided, takes precedence over calculateItemKV. */
  karmicValue?: number | bigint | null;
}

export function calculateCharacterTKV(character: GrowthCharacter, heldItems: HeldItemForTKV[] = []): TKVBreakdown {
  const attrs = character.attributes ?? ({} as GrowthCharacter['attributes']);
  // Null-safe accessor: returns the attribute's level (or 0 if the attribute is missing).
  const lvl = (a: { level?: number } | null | undefined): number => (a?.level ?? 0);

  const body = {
    clout: lvl(attrs.clout) * KV_PER_ATTRIBUTE_LEVEL,
    celerity: lvl(attrs.celerity) * KV_PER_ATTRIBUTE_LEVEL,
    constitution: lvl(attrs.constitution) * KV_PER_ATTRIBUTE_LEVEL,
    subtotal: 0,
  };
  body.subtotal = body.clout + body.celerity + body.constitution;

  const spirit = {
    flow: lvl(attrs.flow) * KV_PER_ATTRIBUTE_LEVEL,
    frequency: lvl(attrs.frequency) * KV_PER_ATTRIBUTE_LEVEL,
    focus: lvl(attrs.focus) * KV_PER_ATTRIBUTE_LEVEL,
    subtotal: 0,
  };
  spirit.subtotal = spirit.flow + spirit.frequency + spirit.focus;

  const soul = {
    willpower: lvl(attrs.willpower) * KV_PER_ATTRIBUTE_LEVEL,
    wisdom: lvl(attrs.wisdom) * KV_PER_ATTRIBUTE_LEVEL,
    wit: lvl(attrs.wit) * KV_PER_ATTRIBUTE_LEVEL,
    subtotal: 0,
  };
  soul.subtotal = soul.willpower + soul.wisdom + soul.wit;

  const skills = (character.skills ?? []).map(s => ({
    name: s.name,
    kv: (s.level ?? 0) * KV_PER_SKILL_LEVEL,
    governors: (s.governors as string[]) ?? [],
  }));
  const skillsTotal = skills.reduce((sum, s) => sum + s.kv, 0);

  const magicSkills: Array<{ school: string; kv: number }> = [];
  const magic = character.magic ?? { mercy: { skillLevels: {} }, severity: { skillLevels: {} }, balance: { skillLevels: {} } };
  const magicPillars = [magic.mercy, magic.severity, magic.balance];
  for (const pillar of magicPillars) {
    if (!pillar) continue;
    if (pillar.skillLevels) {
      for (const [school, level] of Object.entries(pillar.skillLevels)) {
        if (level && level > 0) {
          magicSkills.push({ school, kv: level * KV_PER_MAGIC_SKILL_LEVEL });
        }
      }
    }
  }
  const magicTotal = magicSkills.reduce((sum, s) => sum + s.kv, 0);

  const bodyResistValue = (character.vitals?.baseResist ?? 0) * KV_PER_BODY_RESIST;
  const bodyResist = { total: bodyResistValue, rate: KV_PER_BODY_RESIST };

  const traits = (character.traits ?? []).map(t => ({
    name: t.name,
    kv: parseTraitKV(t),
    type: t.type,
    deathClassification: parseDeathClassification(t),
  }));
  const traitsTotal = traits.reduce((sum, t) => sum + t.kv, 0);

  const items = heldItems.map(it => {
    const raw = it.karmicValue;
    const kaiValue = typeof raw === 'bigint' ? Number(raw) : (typeof raw === 'number' ? raw : null);
    const kv = kaiValue && kaiValue > 0 ? kaiValue : calculateItemKV(it.data);
    return { id: it.id, name: it.name, kv, type: it.type };
  });
  const itemsTotal = items.reduce((sum, i) => sum + i.kv, 0);

  // ── Seed-contributed values (only counted if creation mechanics have been applied) ──
  // Attribute augs: each aug point = 1 KRMA per locked formula (Seed_KV_Formulas.md)
  const augsTotal = Object.values(attrs).reduce((sum, a) => {
    const pos = (a as { augmentPositive?: number })?.augmentPositive ?? 0;
    const neg = (a as { augmentNegative?: number })?.augmentNegative ?? 0;
    return sum + pos + neg;
  }, 0);
  const augs = { total: augsTotal, rate: 1 };

  // Fate Die: d4=5, d6=10, d8=20, d12=40, d20=80 from creation.seed.baseFateDie
  const dieKey = character.creation?.seed?.baseFateDie;
  const fateDieValue = dieKey ? (FATE_DIE_KV[dieKey] ?? 0) : 0;
  const fateDie = { die: dieKey ?? '', kv: fateDieValue };

  // Fated Age: ceil(years * 0.5) per locked Approach 2 formula
  // Pull from creation.fatedAge (set by applyCreationGrants) or character.fatedAge
  const creationFatedAge = character.creation?.fatedAge;
  const fatedAgeYears = creationFatedAge ?? character.fatedAge ?? 0;
  const fatedAgeValue = fatedAgeYears > 0 ? Math.ceil(fatedAgeYears * 0.5) : 0;
  const fatedAge = { years: fatedAgeYears, kv: fatedAgeValue };

  const total = body.subtotal + spirit.subtotal + soul.subtotal
    + skillsTotal + magicTotal + bodyResistValue + traitsTotal + itemsTotal
    + augsTotal + fateDieValue + fatedAgeValue;

  return {
    version: 1,
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

// ── Entity KV Helpers ──

/** Calculate KV for a world item. Uses the item's explicit `value` if set; falls back to a rarity-based placeholder. */
export function calculateItemKV(item: GrowthWorldItem): number {
  // Condition multiplier per Equipment_Conditions.md ruling r-2026-04-22-12:
  // 4 Indestructible & 3 Undamaged = full effectiveness, 2 Worn ≈ 75%, 1 Broken ≈ 25%, 0 Destroyed = 0.
  const condition = item.condition ?? 3;
  const conditionMultiplier =
    condition >= 3 ? 1.0 :
    condition === 2 ? 0.75 :
    condition === 1 ? 0.25 :
    0;

  // Item Abilities — KV is hidden from UI but folds into the item's total KV
  // (Mike 2026-05-14: "Item abilities won't display their kv. that will just be processed
  // and added to the kv of the item in the background.")
  const abilitiesKV = (item.itemAbilities ?? []).reduce(
    (sum, ab) => sum + (typeof ab.kv === 'number' ? ab.kv : 0),
    0,
  );

  // Prefer the item's explicit value (the authored KV) when set; the rarity placeholder
  // is only used for items that lack a value.
  let base: number;
  if (typeof item.value === 'number' && item.value > 0) {
    base = item.value;
  } else if (typeof item.rarity === 'number') {
    // Canon 1-10 tier placeholder
    base = Math.max(1, item.rarity);
  } else {
    const rarityKV: Record<string, number> = {
      common: 1, uncommon: 3, rare: 5, very_rare: 10, legendary: 20, artifact: 50,
    };
    base = rarityKV[item.rarity || 'common'] ?? 1;
  }

  return Math.max(0, Math.round(base * conditionMultiplier) + abilitiesKV);
}

/** Calculate KV for a location (placeholder — manual values until AI grading) */
export function calculateLocationKV(location: GrowthLocation): number {
  // Danger + features + connections = rough KV
  const dangerKV = (location.dangerLevel ?? 1) * 2;
  const featureKV = (location.features?.length ?? 0) * 2;
  const connectionKV = (location.connections?.length ?? 0);

  return Math.max(1, dangerKV + featureKV + connectionKV);
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
