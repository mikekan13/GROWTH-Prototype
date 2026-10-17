/**
 * GRO.vine slots — pure. Slots are a SEED stat (avg 3; the Human seed's
 * "Ambitious" nectar +1 → 4). `grovineSlots` is read when present, else 3;
 * +1 for Ambitious; capped by MAX_ACTIVE_GOALS. Lives in lib so the genesis
 * stage check can read it without the goal service's import graph.
 */
export const MAX_ACTIVE_GOALS = 5;
export const DEFAULT_VINE_SLOTS = 3;

/** Vine slots a seed grants. */
export function vineSlotsForSeed(seedData: Record<string, unknown> | null): number {
  const base = typeof seedData?.grovineSlots === 'number' && seedData.grovineSlots > 0 ? Math.floor(seedData.grovineSlots) : DEFAULT_VINE_SLOTS;
  const nectars = Array.isArray(seedData?.nectars) ? seedData.nectars : [];
  const ambitious = nectars.some(n => (typeof n === 'string' ? n : (n as { name?: unknown })?.name) === 'Ambitious');
  return Math.min(MAX_ACTIVE_GOALS, base + (ambitious ? 1 : 0));
}
