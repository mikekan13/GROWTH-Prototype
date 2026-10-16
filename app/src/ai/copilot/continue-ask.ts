/**
 * A chat ask never dies at the cap (Mike 2026-10-16: "why did he stop").
 * When a GM_TEXT dispatch runs out of tool rounds while the model still
 * wanted tools, the runtime opens a DayaWorkSession (continueUnattended) and
 * the work loop finishes the job. Pure decision + text helpers; the runtime
 * does the I/O.
 */

export interface ContinueDecisionInput {
  source: string;
  kind: string;
  rounds: number;
  maxToolIterations: number;
  lastStopReason?: string;
  /** The final round dispatched at least one tool (the model was mid-work). */
  lastRoundHadTools: boolean;
}

/** Only a human chat ask (TABLE_CHAT from GM_TEXT) that hit the cap mid-work continues. */
export function shouldContinueAsWorkSession(i: ContinueDecisionInput): boolean {
  if (i.source !== 'GM_TEXT' || i.kind !== 'TABLE_CHAT') return false;
  if (i.rounds < i.maxToolIterations) return false;
  if (!i.lastRoundHadTools) return false;
  return i.lastStopReason === 'tool_use' || i.lastStopReason === 'max_tokens';
}

export const CONTINUATION_GOAL_CHARS = 120;
export const CONTINUING_NOTE = '(continuing in the background)';

/** "Continue: <first 120 chars of the ask>" — the work session's goal line. */
export function continuationGoal(ask: string): string {
  const t = ask.replace(/\s+/g, ' ').trim();
  return `Continue: ${t.length > CONTINUATION_GOAL_CHARS ? `${t.slice(0, CONTINUATION_GOAL_CHARS)}…` : t}`;
}

/** The reply with the background note appended once. */
export function withContinuingNote(reply: string): string {
  if (reply.includes(CONTINUING_NOTE)) return reply;
  return `${reply.trim()}\n\n${CONTINUING_NOTE}`.trim();
}
