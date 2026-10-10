/**
 * Copilot history reader.
 *
 * The write path (`sendCopilotMessage`) has been retired in favor of
 * `dispatchPrompt` in `runtime.ts`, which is the single source of truth for
 * JEWL message handling (source-pluggable: text, canvas, voice, autonomous).
 *
 * Only the read helper survives — used by `/api/campaigns/[id]/copilot/history`
 * to render past messages (including legacy ones with action blocks).
 *
 * PRIVATE PER USER (Mike 2026-10-08) — see `history-privacy.ts`.
 */

import 'server-only';
import { prisma } from '@/lib/db';
import { copilotHistoryWhere, type CopilotHistoryViewer } from './history-privacy';

export async function getCopilotHistory(
  campaignId: string,
  viewer: CopilotHistoryViewer,
  limit: number = 50,
) {
  const recent = await prisma.copilotMessage.findMany({
    where: copilotHistoryWhere(campaignId, viewer),
    orderBy: { createdAt: 'desc' },
    take: limit,
    select: {
      id: true,
      role: true,
      content: true,
      username: true,
      actions: true,
      createdAt: true,
    },
  });
  const messages = recent.reverse();

  return messages.map(m => ({
    ...m,
    actions: parseCopilotActions(m.actions),
  }));
}

/**
 * The column is a JSON string, and most rows hold prompt metadata
 * (`{"source":"GM_TEXT","canvasAction":null}`), not an action list. The chat
 * renders `actions` as an array — anything else becomes [].
 */
export function parseCopilotActions(raw: string | null | undefined): unknown[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
