/**
 * Event-driven dream trigger (2026-09-20) — the Smallville importance
 * counter, in GROWTH units. Every ledger write adds its salience (0..1,
 * scaled ×10 to Smallville's 1–10 poignancy) to the entity's dreamPressure;
 * at DREAM_PRESSURE_THRESHOLD the entity dreams and the counter resets.
 * Busy, intense stretches consolidate more; quiet ones less. No clock — the
 * interval sweep (scheduler.ts) remains only as a fallback.
 */
import 'server-only';
import { prisma } from '@/lib/db';

/** Smallville's 150 over 1–10 poignancy ≈ fifteen maximally salient events. Tunable. */
export const DREAM_PRESSURE_THRESHOLD = Number(process.env.DAYA_DREAM_PRESSURE_THRESHOLD ?? 150);

export function pressureDelta(salience: number): number {
  return Math.max(0, Math.min(1, salience)) * 10;
}

/**
 * Add one memory's salience to the entity's pressure; fire a dream tick when
 * the threshold is crossed. Safe to call fire-and-forget: never throws.
 */
export async function accumulateDreamPressure(entityId: string, salience: number): Promise<{ pressure: number; fired: boolean }> {
  try {
    const delta = pressureDelta(salience);
    if (delta <= 0) {
      const e = await prisma.dayaEntity.findUnique({ where: { id: entityId }, select: { dreamPressure: true } });
      return { pressure: e?.dreamPressure ?? 0, fired: false };
    }
    const updated = await prisma.dayaEntity.update({
      where: { id: entityId },
      data: { dreamPressure: { increment: delta } },
      select: { dreamPressure: true, characterId: true },
    });
    if (updated.dreamPressure < DREAM_PRESSURE_THRESHOLD) return { pressure: updated.dreamPressure, fired: false };
    // Reset FIRST (atomic decrement of what we saw), then dream — a failed
    // dream must not leave the counter pinned above threshold forever.
    await prisma.dayaEntity.update({ where: { id: entityId }, data: { dreamPressure: { decrement: updated.dreamPressure } } });
    // scheduler.ts registers the dream_tick handler on import; events.ts alone has no fallback for it.
    await import('@/daya/scheduler');
    const { wake } = await import('@/daya/events');
    await wake({ kind: 'dream_tick', entityId: updated.characterId });
    return { pressure: 0, fired: true };
  } catch (err) {
    console.warn('[daya] dream pressure update failed', err);
    return { pressure: 0, fired: false };
  }
}
