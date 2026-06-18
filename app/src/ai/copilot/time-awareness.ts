/**
 * Time awareness for JEWL — both clocks, every dispatch.
 *
 * JEWL has two clocks to reason about:
 *   1. Real (wall) time — the GM's actual clock. Drives prep duration,
 *      session length, time-since-last-activity, content-duration estimates.
 *   2. Campaign clock — the in-fiction clock stored in meta cycles on
 *      Campaign.currentCycle (see [[time-system-design-2026-06-08]]).
 *
 * On every dispatch we inject a TIME block describing both clocks plus the
 * active GameSession (if any) so JEWL can talk about pacing, prep effort,
 * and content length without guessing. He also gets a `query_time_metrics`
 * tool for richer historical aggregates.
 *
 * Per Mike's directive 2026-06-17: every log JEWL gets must be timestamped
 * so he can record metrics on prep, session, and content time.
 */

import 'server-only';
import { prisma } from '@/lib/db';

const PREP_LOOKBACK_HOURS = 24;

interface ActiveSessionInfo {
  id: string;
  number: number;
  name: string | null;
  startedAtIso: string;
  elapsedSeconds: number;
}

export interface TimeAwarenessSnapshot {
  realIso: string;
  campaignClockCycle: number;
  activeSession: ActiveSessionInfo | null;
  lastUserActivitySecondsAgo: number | null;
  lastAssistantActivitySecondsAgo: number | null;
  prepWindowMinutes: number | null;
}

/**
 * Pull every fact JEWL needs to reason about time in one query batch.
 * Returns a structured snapshot; `formatTimeAwarenessBlock` turns it into
 * the system-prompt text block.
 */
export async function loadTimeAwareness(
  campaignId: string,
): Promise<TimeAwarenessSnapshot> {
  const now = new Date();
  const sinceWindow = new Date(now.getTime() - PREP_LOOKBACK_HOURS * 3600 * 1000);

  const [campaign, activeSession, lastUser, lastAssistant] = await Promise.all([
    prisma.campaign.findUnique({
      where: { id: campaignId },
      select: { currentCycle: true },
    }),
    prisma.gameSession.findFirst({
      where: { campaignId, endedAt: null },
      orderBy: { number: 'desc' },
      select: { id: true, number: true, name: true, startedAt: true },
    }),
    prisma.copilotMessage.findFirst({
      where: { campaignId, role: 'user', createdAt: { gte: sinceWindow } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
    prisma.copilotMessage.findFirst({
      where: { campaignId, role: 'assistant', createdAt: { gte: sinceWindow } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
    }),
  ]);

  // "Prep window" — time since the last session ended, OR null if there's
  // an active session OR no past session exists. Quick directional signal
  // for "how long has the GM been prepping since last play."
  let prepWindowMinutes: number | null = null;
  if (!activeSession) {
    const lastEnded = await prisma.gameSession.findFirst({
      where: { campaignId, endedAt: { not: null } },
      orderBy: { endedAt: 'desc' },
      select: { endedAt: true },
    });
    if (lastEnded?.endedAt) {
      prepWindowMinutes = Math.round(
        (now.getTime() - lastEnded.endedAt.getTime()) / 60000,
      );
    }
  }

  return {
    realIso: now.toISOString(),
    campaignClockCycle: campaign?.currentCycle ?? 0,
    activeSession: activeSession
      ? {
          id: activeSession.id,
          number: activeSession.number,
          name: activeSession.name,
          startedAtIso: activeSession.startedAt.toISOString(),
          elapsedSeconds: Math.round(
            (now.getTime() - activeSession.startedAt.getTime()) / 1000,
          ),
        }
      : null,
    lastUserActivitySecondsAgo: lastUser
      ? Math.round((now.getTime() - lastUser.createdAt.getTime()) / 1000)
      : null,
    lastAssistantActivitySecondsAgo: lastAssistant
      ? Math.round((now.getTime() - lastAssistant.createdAt.getTime()) / 1000)
      : null,
    prepWindowMinutes,
  };
}

/** Compose the TIME block for JEWL's system context. */
export function formatTimeAwarenessBlock(snap: TimeAwarenessSnapshot): string {
  const lines: string[] = [
    '=== TIME ===',
    `Real time now: ${snap.realIso}`,
    `Campaign clock: cycle ${snap.campaignClockCycle.toFixed(2)} (meta cycles since this campaign's genesis; 1 cycle ≈ 1 in-fiction unit per the campaign's Timescale)`,
  ];
  if (snap.activeSession) {
    const elapsed = formatDuration(snap.activeSession.elapsedSeconds);
    const name = snap.activeSession.name ? `"${snap.activeSession.name}"` : '(unnamed)';
    lines.push(
      `Active session: #${snap.activeSession.number} ${name} — running for ${elapsed} (started ${snap.activeSession.startedAtIso})`,
    );
  } else {
    lines.push('Active session: none (between-sessions / prep mode)');
    if (snap.prepWindowMinutes !== null) {
      lines.push(
        `Time since last session ended: ${formatDurationFromMinutes(snap.prepWindowMinutes)} — read as "prep window" for this campaign`,
      );
    }
  }
  if (snap.lastUserActivitySecondsAgo !== null) {
    lines.push(
      `Last GM/player input: ${formatDuration(snap.lastUserActivitySecondsAgo)} ago`,
    );
  }
  if (snap.lastAssistantActivitySecondsAgo !== null) {
    lines.push(
      `Your last reply: ${formatDuration(snap.lastAssistantActivitySecondsAgo)} ago`,
    );
  }
  lines.push(
    'Every log line you see below carries an ISO timestamp in brackets. Use these to reason about pacing, prep effort, and content duration.',
  );
  return lines.join('\n');
}

function formatDuration(seconds: number): string {
  if (seconds < 0) return '0s';
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return s ? `${m}m ${s}s` : `${m}m`;
  }
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return m ? `${h}h ${m}m` : `${h}h`;
}

function formatDurationFromMinutes(minutes: number): string {
  return formatDuration(minutes * 60);
}
