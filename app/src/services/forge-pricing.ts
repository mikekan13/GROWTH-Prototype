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

  const result: PricedBlueprint = { kv, breakdown };

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

/** Traits have NO formula — Kai grades. This returns the anchor default from
 *  structured rollModifiers when present (±5 per flat point), else 0 with a
 *  grade-me note. Thorns come out negative (liens). */
export function priceTrait(
  type: 'nectar' | 'thorn' | 'blossom',
  data: { rollModifiers?: Array<{ flat?: number }> },
): PricedBlueprint {
  const flats = (data.rollModifiers ?? [])
    .reduce((a, m) => a + Math.abs(m.flat ?? 0), 0);
  const magnitude = flats * TRAIT_ANCHOR_KV;
  const sign = type === 'thorn' ? -1 : 1;
  const kv = sign * magnitude;
  return {
    kv,
    breakdown: magnitude
      ? [`anchor: ${flats} flat mod point(s) × ${TRAIT_ANCHOR_KV} = ${sign < 0 ? '−' : '+'}${magnitude} (Kai re-grades with synergies)`]
      : ['no structured modifiers — Kai grades from rule text'],
  };
}

/** Items are graded, never formulaic (r-2026-04-22-15) — no auto price. */
export function priceBlueprintByType(type: string, data: Record<string, unknown>): PricedBlueprint | null {
  switch (type) {
    case 'seed': return priceSeed(data as SeedShape);
    case 'root':
    case 'branch': return priceRootBranch(type, data as RootBranchShape);
    case 'nectar':
    case 'thorn':
    case 'blossom': return priceTrait(type, data as { rollModifiers?: Array<{ flat?: number }> });
    default: return null; // item/skill/spell: Kai/chain grades case-by-case
  }
}
