/**
 * ITEM KV IS DECIMAL (Mike 2026-10-16): "KV IS the price… SUB-1 KRMA items
 * are allowed — materials already account for that down to like the 13th
 * decimal place." An onion is 0.02 KV, a couch 2, a phone 10.
 *
 *   source of truth  = item data `value` (a number, KRMA, may be fractional)
 *   legacy mirror    = ForgeItem.karmicValue (BigInt) = Math.round(value)
 *
 * Readers call `itemKvOf` so a 0.02 KV onion is never read as 0 (the
 * rounded mirror) and an ungraded archetype still falls back to its mirror.
 * Pure — no DB.
 */

/** Item KV from its data (`value`, legacy `kv`), else the BigInt mirror. Never negative. */
export function itemKvOf(data: Record<string, unknown> | null | undefined, karmicValue?: bigint | number | null): number {
  const d = data ?? {};
  const num = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x > 0 ? x : null);
  // A positive `value` wins; a 0/absent value defers to a graded mirror
  // (legacy stock rows carry value 0 beside a karmicValue of 10).
  return num(d.value) ?? num(d.kv) ?? num(karmicValue != null ? Number(karmicValue) : null) ?? 0;
}

/** The legacy integer mirror of a decimal KV (ForgeItem.karmicValue). */
export function kvMirror(kv: number): bigint {
  return BigInt(Math.round(Math.max(0, Number.isFinite(kv) ? kv : 0)));
}

/** KV rounded for display (2 places): 0.0249 → 0.02, 2 → 2. */
export function roundKv(kv: number): number {
  return Math.round(kv * 100) / 100;
}

/**
 * KV of one owned INSTANCE: its archetype's KV when it has one (instance
 * `value` may be narrative paint — genesis once wrote 400 on a laptop),
 * else its own data; × quantity for loose consumables (6 eggs). Pure.
 */
export function instanceKvOf(
  instanceData: Record<string, unknown>,
  archetype?: { data?: Record<string, unknown> | null; karmicValue?: bigint | number | null } | null,
): number {
  const per = archetype ? itemKvOf(archetype.data ?? null, archetype.karmicValue) : itemKvOf(instanceData);
  const q = typeof instanceData.quantity === 'number' && instanceData.quantity > 1 ? instanceData.quantity : 1;
  return per * q;
}

/** A holder's kit, read defensively from item data (null when it has none). */
export function readKit(data: Record<string, unknown>): { kvBudget: number; contents: string; spentKv: number; resolvedItemIds: string[] } | null {
  const k = data.kit as Record<string, unknown> | undefined;
  if (!k || typeof k !== 'object' || typeof k.kvBudget !== 'number') return null;
  return {
    kvBudget: Math.max(0, k.kvBudget),
    contents: typeof k.contents === 'string' ? k.contents : '',
    spentKv: typeof k.spentKv === 'number' ? Math.max(0, k.spentKv) : 0,
    resolvedItemIds: Array.isArray(k.resolvedItemIds) ? k.resolvedItemIds.filter((x): x is string => typeof x === 'string') : [],
  };
}

/** A kit line that reads as a wardrobe (Mike 2026-10-16: the wardrobe is a kit). */
export const WARDROBE_KIT_RE = /\b(wardrobe|clothes|clothing|outfits?|jeans|trousers|sweaters?|shirts?|blouses?|dress(es)?|skirts?|boots?|shoes|socks|underwear|coats?|jackets?)\b/i;
