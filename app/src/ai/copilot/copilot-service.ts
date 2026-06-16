/**
 * Copilot history reader.
 *
 * The write path (`sendCopilotMessage`) has been retired in favor of
 * `dispatchPrompt` in `runtime.ts`, which is the single source of truth for
 * JEWL message handling (source-pluggable: text, canvas, voice, autonomous).
 *
 * Only the read helper survives — used by `/api/campaigns/[id]/copilot/history`
 * to render past messages (including legacy ones with action blocks).
 */

import 'server-only';
import { prisma } from '@/lib/db';

export async function getCopilotHistory(campaignId: string, limit: number = 50) {
  const messages = await prisma.copilotMessage.findMany({
    where: { campaignId },
    orderBy: { createdAt: 'asc' },
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

  return messages.map(m => ({
    ...m,
    actions: m.actions ? JSON.parse(m.actions) : [],
  }));
}
