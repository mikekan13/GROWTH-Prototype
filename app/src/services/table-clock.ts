/**
 * The table keeps time (Mike 2026-10-07 ruling; 2026-10-24: "I thought the
 * clock was already implemented"). Every registered line and act at the table
 * advances the campaign clock — the span the GM states when the GM states one
 * ("two hours pass"), else the sim's own estimate of how long the act takes.
 * Encounters keep their own clock (6 s a round): while one is ACTIVE the
 * table clock defers to it.
 *
 * Also here: what a being knows about time — the local hour, and how long it
 * has been since it last spoke or acted (its own memory rows carry the
 * cycle), so the idle span is something it perceives.
 */
import 'server-only';
import { prisma } from '@/lib/db';
import { advanceClockBySim, flushSimClock, ensureDefaultTimescale } from '@/services/time';
import { cycleToLocalDate, localUnitsToCycles, type CalendarSpec } from '@/types/time';
import { lineDuration, type ActKind, type LineDuration } from '@/lib/stated-duration';

export interface ClockAdvance extends LineDuration {
  skipped?: 'encounter' | 'nothing';
  currentCycle: number;
}

type Timescale = { unitsPerMetaCycle: number; calendar: CalendarSpec | null; unitName: string };

/** Meta cycles → seconds of game time, the inverse of types/time secondsToCycles. Pure. */
export function cyclesToSeconds(cycles: number, ts: { unitsPerMetaCycle: number; calendar: CalendarSpec | null }): number {
  const perHour = localUnitsToCycles(1, 'hour', ts);
  return perHour > 0 ? (cycles / perHour) * 3600 : 0;
}

/** "a few seconds" / "about two minutes" / "nearly an hour" / "most of a day". Pure. */
export function spanInWords(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  if (s < 10) return 'a few seconds';
  if (s < 45) return `about ${Math.round(s / 5) * 5} seconds`;
  if (s < 90) return 'about a minute';
  if (s < 3600) { const m = Math.round(s / 60); return `about ${m} minute${m === 1 ? '' : 's'}`; }
  if (s < 5400) return 'about an hour';
  if (s < 86400) { const h = Math.round(s / 3600); return `about ${h} hour${h === 1 ? '' : 's'}`; }
  const d = Math.round(s / 86400);
  return d === 1 ? 'about a day' : `about ${d} days`;
}

async function liveEncounter(campaignId: string): Promise<boolean> {
  const enc = await prisma.encounter.findFirst({ where: { campaignId, status: 'ACTIVE' }, select: { id: true } });
  return !!enc;
}

/**
 * Advance the clock for one table line or act. Returns what it did; never
 * throws for the caller's sake (a clock hiccup must not stop the table).
 */
export async function advanceClockForLine(campaignId: string, kind: ActKind, text: string): Promise<ClockAdvance> {
  const fallback = async (skipped: ClockAdvance['skipped']): Promise<ClockAdvance> => {
    const c = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { currentCycle: true } }).catch(() => null);
    return { seconds: 0, source: 'plausible', skipped, currentCycle: c?.currentCycle ?? 0 };
  };
  try {
    if (!text.trim()) return fallback('nothing');
    if (await liveEncounter(campaignId)) return fallback('encounter');
    const ts = (await ensureDefaultTimescale(campaignId)) as Timescale;
    const now = (await prisma.campaign.findUnique({ where: { id: campaignId }, select: { currentCycle: true } }))?.currentCycle ?? 0;
    const localHour = cycleToLocalDate(now, ts).hour ?? 12;
    const d = lineDuration(kind, text, { localHour });
    if (d.seconds <= 0) return fallback('nothing');
    if (d.source === 'stated') console.log(`[table-clock] ${kind}: the line states ${d.seconds}s — the clock moves by it`);
    const r = await advanceClockBySim(campaignId, d.seconds, `table:${kind}${d.source === 'stated' ? ':stated' : ''}`);
    // A stated jump is a scene break: write it down now, with its sweeps, rather than batching it with the small stuff.
    if (d.source === 'stated' && d.seconds >= 60) await flushSimClock(campaignId).catch(() => null);
    return { ...d, currentCycle: r.currentCycle };
  } catch (err) {
    console.warn('[table-clock] advance failed (non-fatal):', err instanceof Error ? err.message : err);
    return fallback('nothing');
  }
}

/** The campaign's clock now, and its local hour. */
export async function clockNow(campaignId: string): Promise<{ cycle: number; localHour: number; ts: Timescale }> {
  const ts = (await ensureDefaultTimescale(campaignId)) as Timescale;
  const cycle = (await prisma.campaign.findUnique({ where: { id: campaignId }, select: { currentCycle: true } }))?.currentCycle ?? 0;
  return { cycle, localHour: cycleToLocalDate(cycle, ts).hour ?? 12, ts };
}

/**
 * The clock when this being itself last spoke or acted: its newest own memory
 * row (dialogue = its words, action / adjudication = its deeds). Null when it
 * has never done anything on the record.
 */
export async function lastOwnCycle(entityDaId: string): Promise<number | null> {
  const row = await prisma.dayaMemoryEntry.findFirst({
    where: { entityId: entityDaId, source: { in: ['dialogue', 'action', 'adjudication'] } },
    orderBy: [{ narrativeCycle: 'desc' }, { realTime: 'desc' }],
    select: { narrativeCycle: true },
  }).catch(() => null);
  return row?.narrativeCycle ?? null;
}

/**
 * How long, in the world, since this being last spoke or acted — in words for
 * its prompts, or null when it has not yet acted or the clock has not moved.
 */
export async function sinceOwnInWords(campaignId: string, entityDaId: string, lastKnownCycle?: number | null): Promise<string | null> {
  try {
    const { cycle, ts } = await clockNow(campaignId);
    const last = lastKnownCycle ?? (await lastOwnCycle(entityDaId));
    if (last === null || last === undefined) return null;
    const seconds = cyclesToSeconds(cycle - last, ts);
    if (seconds < 5) return null;
    return spanInWords(seconds);
  } catch {
    return null;
  }
}

/** The hour as a being would say it: "early morning", "late at night". Pure. */
export function hourInWords(hour: number): string {
  const h = ((Math.floor(hour) % 24) + 24) % 24;
  if (h < 4) return 'the small hours of the night';
  if (h < 7) return 'early morning, before most people are up';
  if (h < 11) return 'morning';
  if (h < 13) return 'around midday';
  if (h < 17) return 'afternoon';
  if (h < 20) return 'evening';
  if (h < 23) return 'night';
  return 'late at night';
}
