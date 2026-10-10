/**
 * JEWL history is private per user (Mike 2026-10-08: "not only is the JEWL
 * history private per user"). Pure rules, no DB:
 *
 * - `replyRecipientId` — who a JEWL reply is addressed to; `runtime.ts`
 *   stamps it on the assistant row's `userId`.
 * - `copilotHistoryWhere` — the Prisma filter the history route serves:
 *   the viewer's own rows + JEWL's replies to them. Rows with no userId
 *   (legacy replies, before 2026-10-08) cannot be attributed: ADMIN only.
 *   It is the query form of `lib/permissions.ts#canSeeCopilotRow`.
 */

import type { JewlPrompt } from './prompts/types';

export interface CopilotHistoryViewer {
  id: string;
  role: string;
}

/**
 * A human prompt's reply goes to that human. JEWL's own triggers (autonomous
 * tick, forge watch, work cycle — the actor is JEWL himself) report to the
 * campaign's Watcher, the one JEWL works for.
 */
export function replyRecipientId(
  prompt: Pick<JewlPrompt, 'source' | 'actorId'>,
  gmUserId: string | null | undefined,
): string | null {
  const jewlOriginated =
    prompt.source === 'JEWL_AUTONOMOUS_TICK' ||
    prompt.source === 'JEWL_WORK_CYCLE';
  if (jewlOriginated) return gmUserId ?? null;
  return prompt.actorId || null;
}

export function copilotHistoryWhere(campaignId: string, viewer: CopilotHistoryViewer) {
  return {
    campaignId,
    OR: viewer.role === 'ADMIN'
      ? [{ userId: viewer.id }, { userId: null }]
      : [{ userId: viewer.id }],
  };
}
