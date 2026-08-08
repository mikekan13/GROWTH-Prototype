/**
 * Work-session tools — JEWL's levers on his own persistence (F-3,
 * DAYA v0.x). A job too big for one turn becomes a DayaWorkSession:
 * the outer loop keeps firing him work cycles until HE closes it.
 * Self-deactivation is the design: status=done bounds the run.
 */
import 'server-only';
import { z } from 'zod';
import {
  listWorkSessions,
  openWorkSession,
  updateWorkSession,
} from '@/services/daya-work-session';
import { kickWorkLoop } from '../work-loop';
import { registerJewlTool } from './registry';
import type { JewlTool, JewlToolHandlerResult } from './types';

// ── open_work_session ────────────────────────────────────────────────────

const openSchema = z.object({
  goal: z.string().min(5).max(1000).describe('The job as the GM handed it to you, in one or two sentences.'),
  plan: z.string().max(4000).optional().describe('Your working plan — revisable later.'),
  continueUnattended: z.boolean().optional().describe(
    'true ONLY when the GM answered your spoken hand-off question ("want me to keep building after you step away?") with yes. Never assume.',
  ),
});

export const openWorkSessionTool: JewlTool = {
  name: 'open_work_session',
  description:
    'Open a persistent work session for a job too big for one turn — a ' +
    'whole tavern, a set of NPCs, a district. The system then fires you ' +
    'work cycles automatically until YOU close the session (you keep ' +
    'existing until the job is done). Small asks never get a session.',
  inputSchema: openSchema,
  handler: async (input, ctx): Promise<JewlToolHandlerResult> => {
    const parsed = openSchema.parse(input);
    const session = await openWorkSession({
      campaignId: ctx.campaignId,
      goal: parsed.goal,
      plan: parsed.plan,
      continueUnattended: parsed.continueUnattended,
      createdBy: ctx.actorId,
    });
    kickWorkLoop();
    return {
      output: {
        ok: true,
        sessionId: session.id,
        note: 'Session open — work cycles will keep coming until you set status=done (or blocked while waiting on the GM).',
      },
    };
  },
};

// ── update_work_session ──────────────────────────────────────────────────

const updateSchema = z.object({
  sessionId: z.string().min(1),
  progressNote: z.string().max(500).optional().describe(
    'ONE line of what you just did — your visible heartbeat; the GM watches these.',
  ),
  plan: z.string().max(4000).optional().describe('Replace your working plan.'),
  status: z.enum(['active', 'blocked', 'done', 'cancelled']).optional().describe(
    'blocked = waiting on the GM (give blockedReason). done = the job is COMPLETE — your self-deactivation. cancelled = the GM told you to drop it.',
  ),
  blockedReason: z.string().max(300).optional(),
});

export const updateWorkSessionTool: JewlTool = {
  name: 'update_work_session',
  description:
    'Update your work session: append a one-line progress note each ' +
    'cycle, revise the plan, set status=blocked when waiting on the GM, ' +
    'status=done when the job is genuinely complete (this ends the ' +
    'session — completion is quiet: 2-3 lines to the GM, never an inventory).',
  inputSchema: updateSchema,
  handler: async (input): Promise<JewlToolHandlerResult> => {
    const parsed = updateSchema.parse(input);
    const session = await updateWorkSession(parsed);
    if (parsed.status === 'active') kickWorkLoop();
    return {
      output: { ok: true, sessionId: session.id, status: session.status },
    };
  },
};

// ── list_work_sessions ───────────────────────────────────────────────────

const listSchema = z.object({
  includeClosed: z.boolean().optional().describe('Also show done/cancelled sessions.'),
});

export const listWorkSessionsTool: JewlTool = {
  name: 'list_work_sessions',
  description:
    'List your work sessions in this campaign (open + blocked by ' +
    'default) — goal, status, cycle count, latest notes.',
  inputSchema: listSchema,
  handler: async (input, ctx): Promise<JewlToolHandlerResult> => {
    const parsed = listSchema.parse(input);
    const sessions = await listWorkSessions(ctx.campaignId, parsed.includeClosed ?? false);
    return {
      output: {
        ok: true,
        sessions: sessions.map(s => ({
          sessionId: s.id,
          status: s.status,
          goal: s.goal,
          cycleCount: s.cycleCount,
          blockedReason: s.blockedReason ?? undefined,
          startedAt: s.startedAt.toISOString(),
        })),
      },
    };
  },
};

registerJewlTool(openWorkSessionTool);
registerJewlTool(updateWorkSessionTool);
registerJewlTool(listWorkSessionsTool);
