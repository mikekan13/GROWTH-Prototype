/**
 * query_time_metrics — JEWL queries his own time data.
 *
 * The TIME block in the system prompt gives him the current snapshot. This
 * tool gives him history: how long sessions ran, how much was prepped
 * between them, how long a recent encounter actually took. Per Mike's
 * 2026-06-17 directive: JEWL should be able to estimate content time and
 * track session/prep duration metrics.
 */

import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { registerJewlTool } from './registry';
import type { JewlTool, JewlToolHandlerResult, JewlToolContext } from './types';

const queryTimeMetricsSchema = z.object({
  /**
   * What window of history to summarize.
   * - 'session-history' → the last N sessions, with start/end/duration/event-count.
   * - 'current-session' → live stats for the active session (running duration, event count by type).
   * - 'prep-windows'    → the time gaps between sessions (treat as prep effort).
   * - 'recent-activity' → the last N minutes of CopilotMessage + CampaignEvent activity (great for "how long has this encounter been running?").
   */
  scope: z.enum(['session-history', 'current-session', 'prep-windows', 'recent-activity']),
  /** How many rows / how many minutes back. Capped to a sane max per scope. */
  count: z.number().int().positive().max(50).default(10),
});

export const queryTimeMetricsTool: JewlTool = {
  name: 'query_time_metrics',
  description:
    'Query time-based metrics for this campaign. Scope picks which window: ' +
    "'session-history' returns the last N GameSessions with duration + event " +
    "count; 'current-session' returns running stats for the active session; " +
    "'prep-windows' returns the gaps between sessions (read as prep effort); " +
    "'recent-activity' returns minute-by-minute activity counts for the last " +
    'N minutes (great for "how long has this encounter been running?" and ' +
    'similar pacing questions). Use this before quoting numbers like ' +
    '"sessions usually run 3 hours" — verify against the data.',
  inputSchema: queryTimeMetricsSchema,
  handler: async (input, ctx: JewlToolContext): Promise<JewlToolHandlerResult> => {
    const parsed = queryTimeMetricsSchema.parse(input);
    const now = new Date();

    if (parsed.scope === 'session-history') {
      const sessions = await prisma.gameSession.findMany({
        where: { campaignId: ctx.campaignId, endedAt: { not: null } },
        orderBy: { number: 'desc' },
        take: parsed.count,
        select: {
          id: true,
          number: true,
          name: true,
          startedAt: true,
          endedAt: true,
        },
      });

      const eventCountsBySession = await Promise.all(
        sessions.map(s =>
          prisma.campaignEvent.count({ where: { sessionId: s.id } }),
        ),
      );

      const out = sessions.map((s, i) => {
        const durationMs = (s.endedAt!.getTime() - s.startedAt.getTime());
        return {
          number: s.number,
          name: s.name,
          startedAt: s.startedAt.toISOString(),
          endedAt: s.endedAt!.toISOString(),
          durationSeconds: Math.round(durationMs / 1000),
          eventCount: eventCountsBySession[i],
        };
      });

      return {
        output: {
          scope: 'session-history',
          count: out.length,
          sessions: out,
        },
      };
    }

    if (parsed.scope === 'current-session') {
      const active = await prisma.gameSession.findFirst({
        where: { campaignId: ctx.campaignId, endedAt: null },
        orderBy: { number: 'desc' },
        select: { id: true, number: true, name: true, startedAt: true },
      });
      if (!active) {
        return {
          output: {
            scope: 'current-session',
            active: false,
            note: 'No active session right now (between-sessions / prep mode).',
          },
        };
      }
      const events = await prisma.campaignEvent.findMany({
        where: { sessionId: active.id },
        select: { type: true, createdAt: true },
      });
      const byType: Record<string, number> = {};
      for (const e of events) byType[e.type] = (byType[e.type] || 0) + 1;
      const elapsedSeconds = Math.round(
        (now.getTime() - active.startedAt.getTime()) / 1000,
      );
      return {
        output: {
          scope: 'current-session',
          active: true,
          number: active.number,
          name: active.name,
          startedAt: active.startedAt.toISOString(),
          elapsedSeconds,
          eventCount: events.length,
          eventsByType: byType,
        },
      };
    }

    if (parsed.scope === 'prep-windows') {
      // Pull the last `count` sessions, then compute the gap between
      // session N's endedAt and session N+1's startedAt.
      const sessions = await prisma.gameSession.findMany({
        where: { campaignId: ctx.campaignId },
        orderBy: { number: 'asc' },
        take: parsed.count + 1,
        select: { number: true, startedAt: true, endedAt: true },
      });
      const windows: Array<{
        afterSession: number;
        prepDurationMinutes: number;
        prepEndedAt: string;
      }> = [];
      for (let i = 0; i < sessions.length - 1; i++) {
        const prev = sessions[i];
        const next = sessions[i + 1];
        if (!prev.endedAt) continue;
        windows.push({
          afterSession: prev.number,
          prepDurationMinutes: Math.round(
            (next.startedAt.getTime() - prev.endedAt.getTime()) / 60000,
          ),
          prepEndedAt: next.startedAt.toISOString(),
        });
      }
      return {
        output: {
          scope: 'prep-windows',
          count: windows.length,
          windows,
        },
      };
    }

    // recent-activity: count CopilotMessage + CampaignEvent rows per minute
    // bucket for the last `count` minutes. Useful for "how long has this
    // encounter been running" / "is the pace dropping" questions.
    const lookback = Math.min(parsed.count, 30); // cap at 30 buckets to keep payload small
    const start = new Date(now.getTime() - lookback * 60_000);
    const [messages, events] = await Promise.all([
      prisma.copilotMessage.findMany({
        where: { campaignId: ctx.campaignId, createdAt: { gte: start } },
        select: { createdAt: true, role: true },
      }),
      prisma.campaignEvent.findMany({
        where: { campaignId: ctx.campaignId, createdAt: { gte: start } },
        select: { createdAt: true, type: true },
      }),
    ]);
    const buckets: Array<{
      minute: number;
      iso: string;
      userMessages: number;
      assistantMessages: number;
      events: number;
    }> = [];
    for (let i = 0; i < lookback; i++) {
      const bucketStart = new Date(start.getTime() + i * 60_000);
      const bucketEnd = new Date(bucketStart.getTime() + 60_000);
      const userCount = messages.filter(
        m => m.role === 'user' && m.createdAt >= bucketStart && m.createdAt < bucketEnd,
      ).length;
      const asstCount = messages.filter(
        m => m.role === 'assistant' && m.createdAt >= bucketStart && m.createdAt < bucketEnd,
      ).length;
      const eventCount = events.filter(
        e => e.createdAt >= bucketStart && e.createdAt < bucketEnd,
      ).length;
      buckets.push({
        minute: lookback - i,
        iso: bucketStart.toISOString(),
        userMessages: userCount,
        assistantMessages: asstCount,
        events: eventCount,
      });
    }
    return {
      output: {
        scope: 'recent-activity',
        windowMinutes: lookback,
        buckets,
      },
    };
  },
};

registerJewlTool(queryTimeMetricsTool);
