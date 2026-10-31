/**
 * TIME JUMPS REQUIRE SIMULATION FOR ALL CHARACTERS (Mike 2026-10-24). A GM
 * line that states a span ("two hours go by", "3 days pass") moves the clock
 * (table-clock) — and the skipped stretch has to be LIVED by every character,
 * not just skipped over. HW3's "3 days go by" left Violet with the clock's
 * "about three days since you spoke" and nothing in the days; it was rolled
 * back for this.
 *
 * 2026-10-31 (Michael: "much of the simulation will be done when time moves
 * like this"): the stretch is lived by services/stretch-live — the clock walks
 * the span in windows and every crystallized character does what is due in
 * each (routines in their hour, intentions, an account of the day, sleep).
 * This module keeps the table's entry (a stated span long enough) and the
 * per-being line the table posts. The clock has already been moved by
 * table-clock when the table calls this, so the walker is asked to live the
 * span from where the clock WAS: it is wound back to the start first.
 */
import 'server-only';
import { prisma } from '@/lib/db';
import { isDayaEnabled } from '@/daya/events';
import { spanInWords, type ClockAdvance } from '@/services/table-clock';
import { ensureDefaultTimescale } from '@/services/time';
import { secondsToCycles, type CalendarSpec } from '@/types/time';
import type { StretchActor } from '@/services/stretch-live';

/** Below this a stated span is a pause in the scene, not a stretch to live through. Equal to stretch-live's STRETCH_MIN_SECONDS. */
export const TIMESKIP_MIN_SECONDS = 60 * 60;

export interface StatedStretch {
  seconds: number;
  span: string;
}

/** Pure: does this clock advance call for simulation? A stated span of at least TIMESKIP_MIN_SECONDS. */
export function statedStretchOf(adv: Pick<ClockAdvance, 'seconds' | 'source' | 'skipped'>): StatedStretch | null {
  if (adv.skipped || adv.source !== 'stated' || adv.seconds < TIMESKIP_MIN_SECONDS) return null;
  return { seconds: adv.seconds, span: spanInWords(adv.seconds) };
}

export interface StretchOutcome {
  characterId: string;
  name: string;
  status: string;
  line: string;
}

/**
 * Live the stretch for every crystallized character in the campaign and post each one's days to the table. The table
 * clock already moved by the stated span: wind it back to the start so the walker can walk it. Never throws.
 */
export async function simulateStatedStretch(
  campaignId: string,
  actor: StretchActor,
  stretch: StatedStretch,
  narration: string,
): Promise<StretchOutcome[]> {
  if (!isDayaEnabled()) return [];
  try {
    const ts = (await ensureDefaultTimescale(campaignId)) as { unitsPerMetaCycle: number; calendar: CalendarSpec | null };
    const back = secondsToCycles(stretch.seconds, ts);
    await prisma.campaign.update({ where: { id: campaignId }, data: { currentCycle: { decrement: back } } });
    // Loaded here, not at the top: the walker pulls the whole ensemble in with it, and the table should not carry that on import.
    const { liveStretch } = await import('@/services/stretch-live');
    const report = await liveStretch(campaignId, actor, { seconds: stretch.seconds, narration: narration.trim() || undefined, source: 'table' });
    return report.lived.map((l) => ({ characterId: l.characterId, name: l.name, status: l.status, line: l.line }));
  } catch (err) {
    console.warn('[table-timeskip] the stretch could not be lived (non-fatal):', err instanceof Error ? err.message : err);
    return [];
  }
}
