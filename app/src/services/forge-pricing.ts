/**
 * Forge blueprint pricing — the LOCKED KV formulas, shared by Kai's
 * evaluate_blueprint (godhead chain) and JEWL's propose_forge_blueprint
 * (so drafts arrive pre-priced; Kai's grade supersedes JEWL's suggestion —
 * [[jewl-suggests-godheads-decide-2026-08-17]]).
 *
 * Sources (audit 2026-08-17, FORGE-AUDIT-2026-08-17.md):
 * - Seed_KV_Formulas.md (LOCKED 2026-05-08/09):
 *     seedKV = augs×1 + frequencyBudget×1 + baseResist×2 + fateDieKV
 *            + ceil(fatedAge × 0.5) + skill costs + nectar grades − thorn liens
 * - CANON_CORE §4 (r-2026-04-22-10/-11):
 *     root/branch KV = attribute levels + skill levels + net trait KV
 *     (NO age term); root frequency cost = max(0, KV − breakeven),
 *     breakeven = 100 + (startAge − 18) × 5; max root start age 25.
 * - Traits: Kai-graded, NO formula. Anchor: +1 flat mod ≈ 5 KV. Thorns are
 *   NEGATIVE liens (negatives-only-in-thorns). The ±5 per-trait default here
 *   is the anchor placeholder Kai overrides, never a formula claim.
 * - Skills: 1 KRMA × level (2× magic — magic detection not yet wired; callers
 *   pass isMagic when known).
 */

import { FATE_DIE_KV } from '@/lib/kv-calculator';

const TRAIT_ANCHOR_KV = 5;

export interface PricedBlueprint {
  kv: number;
  /** Human-readable component breakdown, for Kai's note and the Workshop. */
  breakdown: string[];
  /** Root-only: locked frequency-cost rule output (informational). */
  frequencyCost?: number;
}

/** Seed trait entry: legacy bare name, or the accounted-for form with its
 *  Kai grade (Mike ruling 2026-08-18: seed traits fold into seedKV). */
type SeedTraitRef = string | { name: string; kv?: number };

interface SeedShape {
  attributes?: Record<string, number>;
  frequency?: number;
  baseFateDie?: string;
  fatedAge?: number;
  baseResist?: number;
  skills?: unknown[];
  nectars?: SeedTraitRef[];
  thorns?: SeedTraitRef[];
}

function normalizeTraitRefs(refs: SeedTraitRef[] | undefined): Array<{ name: string; kv: number | null }> {
  return (refs ?? []).map(r =>
    typeof r === 'string'
      ? { name: r, kv: null }
      : { name: r.name, kv: typeof r.kv === 'number' ? r.kv : null },
  );
}

interface RootBranchShape {
  attributes?: Record<string, number>;
  skills?: Array<{ level?: number; isMagic?: boolean }>;
  nectars?: string[];
  thorns?: string[];
  ageAdded?: number;
  frequency?: number;
  possessions?: Array<{ name?: string; kv?: number }>;
  kits?: Array<{ name?: string; kvBudget?: number }>;
  allocatableSkills?: Array<{ levels?: number }>;
}

function sumPositive(values: Record<string, number> | undefined): number {
  if (!values) return 0;
  return Object.values(values).reduce((a, v) => a + Math.max(0, v || 0), 0);
}

export function priceSeed(data: SeedShape): PricedBlueprint {
  const breakdown: string[] = [];
  let kv = 0;

  const augs = sumPositive(data.attributes);
  if (augs) { kv += augs; breakdown.push(`attribute augs ${augs}`); }

  const freq = Math.max(0, data.frequency ?? 0);
  if (freq) { kv += freq; breakdown.push(`frequency budget ${freq}`); }

  if (typeof data.baseResist === 'number' && data.baseResist > 0) {
    kv += data.baseResist * 2;
    breakdown.push(`base resist ${data.baseResist}×2 = ${data.baseResist * 2}`);
  }

  if (data.baseFateDie && FATE_DIE_KV[data.baseFateDie]) {
    kv += FATE_DIE_KV[data.baseFateDie];
    breakdown.push(`fate die ${data.baseFateDie} = ${FATE_DIE_KV[data.baseFateDie]}`);
  }

  if (typeof data.fatedAge === 'number' && data.fatedAge > 0) {
    const ageKv = Math.ceil(data.fatedAge * 0.5);
    kv += ageKv;
    breakdown.push(`fated age ${data.fatedAge} → ${ageKv}`);
  }

  // Seed skills are name-strings (rare, cap d4/level 4). Without levels we
  // can't price them — Kai grades manually when present.
  if ((data.skills?.length ?? 0) > 0) breakdown.push(`${data.skills!.length} starting skill(s) — Kai grades manually`);

  // Traits are accounted-for line items: use the carried grade when present,
  // fall back to the ±5 anchor for ungraded legacy names.
  for (const n of normalizeTraitRefs(data.nectars)) {
    const grade = n.kv ?? TRAIT_ANCHOR_KV;
    kv += Math.abs(grade);
    breakdown.push(n.kv != null
      ? `nectar "${n.name}" +${Math.abs(grade)}`
      : `nectar "${n.name}" anchor +${TRAIT_ANCHOR_KV} (UNGRADED — Kai must grade)`);
  }
  for (const t of normalizeTraitRefs(data.thorns)) {
    const grade = t.kv ?? TRAIT_ANCHOR_KV;
    kv -= Math.abs(grade);
    breakdown.push(t.kv != null
      ? `thorn lien "${t.name}" −${Math.abs(grade)}`
      : `thorn lien "${t.name}" anchor −${TRAIT_ANCHOR_KV} (UNGRADED — Kai must grade)`);
  }

  return { kv, breakdown };
}

export function priceRootBranch(type: 'root' | 'branch', data: RootBranchShape): PricedBlueprint {
  const breakdown: string[] = [];
  let kv = 0;

  const levels = sumPositive(data.attributes);
  if (levels) { kv += levels; breakdown.push(`attribute levels ${levels}`); }

  let skillKv = 0;
  for (const s of data.skills ?? []) {
    const lvl = Math.max(0, s.level ?? 0);
    skillKv += s.isMagic ? lvl * 2 : lvl;
  }
  if (skillKv) { kv += skillKv; breakdown.push(`skill levels ${skillKv}`); }

  const nectarKv = (data.nectars?.length ?? 0) * TRAIT_ANCHOR_KV;
  if (nectarKv) { kv += nectarKv; breakdown.push(`${data.nectars!.length} nectar(s) anchor +${nectarKv} (Kai re-grades)`); }

  const thornKv = (data.thorns?.length ?? 0) * TRAIT_ANCHOR_KV;
  if (thornKv) { kv -= thornKv; breakdown.push(`${data.thorns!.length} thorn lien(s) anchor −${thornKv} (Kai re-grades)`); }

  // Block grants (rulings 2026-08-24/25 #13/#15/#16): possessions at their
  // stated KV; kits at their draw-down budget; allocatable skill levels at
  // the 1 KRMA/level rate (Kai may add a flexibility premium).
  const possKv = (data.possessions ?? []).reduce((a, p) => a + Math.max(0, p.kv ?? 0), 0);
  if (possKv) { kv += possKv; breakdown.push(`possession grant(s) +${possKv}`); }
  const kitKv = (data.kits ?? []).reduce((a, k) => a + Math.max(0, k.kvBudget ?? 0), 0);
  if (kitKv) { kv += kitKv; breakdown.push(`kit budget(s) +${kitKv}`); }
  const allocKv = (data.allocatableSkills ?? []).reduce((a, g) => a + Math.max(0, g.levels ?? 0), 0);
  if (allocKv) { kv += allocKv; breakdown.push(`allocatable skill level(s) +${allocKv} (Kai may premium)`); }

  // Negative frequency is a LEVER (Mike ruling 2026-08-24 #1/#14): it
  // reduces the block's net price, which forces the author to service the
  // debt with compensating content to stay in the 3-15 KV/yr band — "the
  // block is stronger for bearing it."
  const freq = data.frequency ?? 0;
  if (freq < 0) {
    kv += freq;
    breakdown.push(`frequency ${freq} lever — service with ~${Math.abs(freq)} KV of compensating content (block stronger for bearing the debt)`);
  }

  const result: PricedBlueprint = { kv, breakdown };

  // Density gauge (net price per year — ruling 2026-08-25 #14: the band
  // applies to the NET, blocks balance internally).
  if (typeof data.ageAdded === 'number' && data.ageAdded > 0) {
    const perYear = kv / data.ageAdded;
    if (perYear < 3 || perYear > 15) {
      breakdown.push(`⚠ density ${perYear.toFixed(1)} KV/yr is outside the 3-15 band — balance the block's levers`);
    }
  }

  // Root frequency-cost rule (r-2026-04-22-10/-11). ageAdded semantics for
  // branches are still under review (audit R2) — only roots get this.
  if (type === 'root' && typeof data.ageAdded === 'number' && data.ageAdded >= 0) {
    const startAge = data.ageAdded;
    const breakeven = 100 + (startAge - 18) * 5;
    result.frequencyCost = Math.max(0, kv - breakeven);
    breakdown.push(`frequency cost max(0, ${kv} − ${breakeven}) = ${result.frequencyCost}`);
  }

  return result;
}

interface PriceModShape { flat?: number; pillar?: string; allChecks?: boolean }
interface TraitPriceShape {
  rollModifiers?: PriceModShape[];
  effects?: Array<{
    kind?: string;
    name?: string;
    modifiers?: PriceModShape[];
    spawnsBlossom?: string;
  }>;
  declaredKv?: number;
  declaredKvRationale?: string;
}

/** Traits have NO formula — Kai grades. This anchors from structured
 *  modifiers at ±5 KV per NET flat point (2026-08-25 fix: penalties
 *  subtract — the old abs-sum priced a +2/+2/−1/−1 blossom at +30).
 *  Signs come from the modifiers themselves; a thorn prices negative
 *  because its mods are negative. Blossom KV is a MEASUREMENT only —
 *  internal pricing (Mike ruling 2026-08-25): reflected in the spawner's
 *  grade, never a standalone purchase. declaredKv covers effects the
 *  formula cannot see (dice-adds, checks, information grants). */
export function priceTrait(
  type: 'nectar' | 'thorn' | 'blossom',
  data: TraitPriceShape,
): PricedBlueprint {
  const breakdown: string[] = [];

  // Breadth weight (compliance pass 2026-08-26): a point that lands on
  // every roll is worth more than one on a single governor. Anchor
  // weights — attribute/skill ×1, pillar ×2, all-checks ×3. Kai re-grades.
  const weighted = (m: { flat?: number; pillar?: string; allChecks?: boolean }) =>
    (m.flat ?? 0) * (m.allChecks ? 3 : m.pillar ? 2 : 1);
  const legacyNet = (data.rollModifiers ?? []).reduce((a, m) => a + weighted(m), 0);
  let effectsNet = 0;
  let unpriceable = 0;
  for (const e of data.effects ?? []) {
    const mods = e.modifiers ?? [];
    if (mods.length) effectsNet += mods.reduce((a, m) => a + weighted(m), 0);
    else unpriceable++;
    if (e.spawnsBlossom) {
      breakdown.push(`spawns blossom "${e.spawnsBlossom}" — its measured KV folds into THIS grade (internal pricing)`);
    }
  }
  const netPoints = legacyNet + effectsNet;
  let kv = netPoints * TRAIT_ANCHOR_KV;

  if (netPoints !== 0) {
    breakdown.unshift(`anchor: net ${netPoints > 0 ? '+' : ''}${netPoints} flat point(s) × ${TRAIT_ANCHOR_KV} = ${kv > 0 ? '+' : ''}${kv} (Kai re-grades with synergies)`);
  }
  if (type === 'thorn' && kv > 0) {
    breakdown.push('⚠ thorn priced net-POSITIVE — thorns are liens (negatives-only); Kai must review');
  }
  if (type === 'nectar' && kv < 0) {
    breakdown.push('⚠ nectar priced net-NEGATIVE — negatives belong in thorns; Kai must review');
  }

  // Author-declared value for what the formula can't see.
  if (typeof data.declaredKv === 'number' && (netPoints === 0 || unpriceable > 0)) {
    if (netPoints === 0) kv = data.declaredKv;
    else { kv += data.declaredKv; }
    breakdown.push(`author-declared ${data.declaredKv > 0 ? '+' : ''}${data.declaredKv} KV${data.declaredKvRationale ? ` (${data.declaredKvRationale})` : ''} — Kai must grade`);
  } else if (netPoints === 0 && (data.effects?.length || data.rollModifiers?.length)) {
    breakdown.push('modifiers net to zero — Kai grades from rule text');
  } else if (netPoints === 0) {
    breakdown.push('no structured modifiers — declare an intended KV with rationale (never leave a valuable trait at 0); Kai grades');
  }

  if (type === 'blossom') {
    breakdown.push('blossom KV = measurement only — INTERNAL pricing, reflected in the spawner’s grade, not a standalone purchase');
  }

  return { kv, breakdown };
}

/** Items are graded, never formulaic (r-2026-04-22-15) — no auto price,
 *  but an author-declared KV rides along for Kai when present. */
export function priceBlueprintByType(type: string, data: Record<string, unknown>): PricedBlueprint | null {
  switch (type) {
    case 'seed': return priceSeed(data as SeedShape);
    case 'root':
    case 'branch': return priceRootBranch(type, data as RootBranchShape);
    case 'nectar':
    case 'thorn':
    case 'blossom': return priceTrait(type, data as TraitPriceShape);
    default: {
      // Kit items price at their draw-down budget (r-2026-08-24-16) — the
      // budget IS the value; contents resolve on observation.
      const item = data as { itemType?: string; kvBudget?: number };
      if (type === 'item' && item.itemType === 'kit' && typeof item.kvBudget === 'number') {
        return {
          kv: item.kvBudget,
          breakdown: [`kit budget ${item.kvBudget} KV — draw-down pool, contents resolve on plausible demand (r-2026-08-24-16)`],
        };
      }
      // item/skill/spell: Kai/chain grades case-by-case.
      const declared = (data as { declaredKv?: number; declaredKvRationale?: string });
      if (typeof declared.declaredKv === 'number') {
        return {
          kv: declared.declaredKv,
          breakdown: [`author-declared ${declared.declaredKv} KV${declared.declaredKvRationale ? ` (${declared.declaredKvRationale})` : ''} — Kai must grade`],
        };
      }
      return null;
    }
  }
}
