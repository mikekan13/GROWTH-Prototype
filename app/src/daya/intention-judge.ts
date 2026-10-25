/**
 * The local lane reads a being's act against its pending intentions: which did it carry out? The editor-and-security
 * model's job (Mike 2026-10-25: "the local model is just compiling"). Short, bounded, never throws — an unreachable
 * lane means only the words decide (intentions.actCompletes).
 */
import 'server-only';
import { routedChatText } from '@/ai/network/chat';
import { laneReadiness } from '@/daya/l1-endpoint';

const JUDGE_TIMEOUT_MS = 8_000;

const SYSTEM = `You read what a character just did against the things the character meant to do.
Answer with JSON only: {"done": [ids]} — the ids of the intentions this act carried out, fully or in the plain sense of it. An act that merely moves toward an intention is not done. When none, {"done": []}.`;

export async function judgeIntentionsDone(campaignId: string | null, pending: Array<{ id: string; description: string }>, act: string): Promise<string[]> {
  try {
    const ready = await laneReadiness();
    if (ready.phase !== 'ready') return [];
    const user = ['ACT:', act, '', 'INTENTIONS:', ...pending.map((p) => `- [${p.id}] ${p.description}`)].join('\n');
    const res = await Promise.race([
      routedChatText({ caller: 'intention-judge', lane: 'local', campaignId: campaignId ?? undefined, contentClass: 'fiction' }, { system: SYSTEM, user, maxTokens: 120, temperature: 0, timeoutMs: JUDGE_TIMEOUT_MS }),
      new Promise<null>((r) => setTimeout(() => r(null), JUDGE_TIMEOUT_MS + 500)),
    ]);
    if (!res) return [];
    const t = res.text.replace(/```(?:json)?/g, '').trim();
    const start = t.indexOf('{'); const end = t.lastIndexOf('}');
    if (start < 0 || end <= start) return [];
    const parsed = JSON.parse(t.slice(start, end + 1)) as { done?: unknown };
    return Array.isArray(parsed.done) ? parsed.done.filter((x): x is string => typeof x === 'string') : [];
  } catch (err) {
    console.warn('[intention-judge] no verdict (non-fatal):', err instanceof Error ? err.message : err);
    return [];
  }
}
