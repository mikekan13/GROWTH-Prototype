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
import { GENESIS_CHAT_USERNAME } from '@/services/character-genesis-progress';
import { isWithheldRow, WITHHELD_STRING } from '@/lib/withheld';

export async function getCopilotHistory(
  campaignId: string,
  viewer: CopilotHistoryViewer,
  limit: number = 50,
) {
  const recent = await prisma.copilotMessage.findMany({
    where: {
      ...copilotHistoryWhere(campaignId, viewer),
      // Hide legacy persisted STT markers ("[empty transcript]") — filter, not delete.
      AND: [
        { NOT: { AND: [{ username: '[ambient]' }, { content: { startsWith: '[' } }, { content: { endsWith: ']' } }] } },
        // Genesis work-cycle reports live in the Log, not the chat (Mike 2026-10-11).
        { OR: [{ username: null }, { username: { not: GENESIS_CHAT_USERNAME } }] },
      ],
    },
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

  // Lawfulness: a withheld row (only ever its sender's — the history is per
  // user) shows as the withheld string; the original is ADMIN-only via the flag.
  return messages.map(m => ({
    ...m,
    content: isWithheldRow(m) ? WITHHELD_STRING : m.content,
    actions: parseCopilotActions(m.actions),
    workLink: parseGenesisWorkLink(m.actions),
  }));
}

/**
 * A genesis chat line (status / mid-build prod) is tappable for the Watcher:
 * it opens JEWL's work screen on that session (2026-10-12 — the question is
 * answered there, never "in the Log"). Null for every other row.
 */
export function parseGenesisWorkLink(raw: string | null | undefined): { sessionId: string; characterId: string | null; prodId: string | null } | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw) as Record<string, unknown> | null;
    if (!v || Array.isArray(v) || typeof v !== 'object') return null;
    if ((v.source !== 'GENESIS_STATUS' && v.source !== 'GENESIS_PROD') || typeof v.sessionId !== 'string') return null;
    return {
      sessionId: v.sessionId,
      characterId: typeof v.characterId === 'string' ? v.characterId : null,
      prodId: typeof v.prodId === 'string' ? v.prodId : null,
    };
  } catch {
    return null;
  }
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
