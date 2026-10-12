/**
 * Local-lane warm ping (2026-10-12).
 *
 * The local text lane is a scale-to-zero serverless endpoint with a ~340 s
 * cold start. When a Watcher opens a campaign we fire ONE minimal request so
 * the worker is (likely) warm by the time the table needs it. Fire-and-forget:
 * never awaited by callers, never throws, never logs response bodies.
 *
 * Dedupe: at most one ping per campaign per 10 minutes (in-memory, per
 * server process). No-op when AI_LOCAL_BASE_URL is unset.
 */

const WARM_DEDUPE_MS = 10 * 60 * 1000;
const lastPing = new Map<string, number>();

/** Test hook — forget all dedupe state. */
export function _resetLocalWarm(): void {
  lastPing.clear();
}

export function warmLocalLane(campaignId: string, now: number = Date.now()): void {
  const baseUrl = process.env.AI_LOCAL_BASE_URL?.trim();
  if (!baseUrl) return;

  const prev = lastPing.get(campaignId);
  if (prev !== undefined && now - prev < WARM_DEDUPE_MS) {
    console.log('[local-warm] skipped (recent)');
    return;
  }
  lastPing.set(campaignId, now);

  const model = process.env.AI_LOCAL_MODEL?.trim() || process.env.DAYA_L1_MODEL?.trim() || 'local';
  const apiKey = process.env.AI_LOCAL_API_KEY?.trim();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (apiKey) headers.Authorization = `Bearer ${apiKey}`;

  try {
    fetch(`${baseUrl.replace(/\/+$/, '')}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'ping' }],
        max_tokens: 1,
        chat_template_kwargs: { enable_thinking: false },
      }),
    })
      .then(res => {
        if (res.ok) console.log(`[local-warm] pinged campaign ${campaignId}`);
        else console.log(`[local-warm] failed: ${res.status}`);
        // Drain/discard the body without reading it into logs.
        res.body?.cancel().catch(() => {});
      })
      .catch(() => {
        // A cold start can outlive the HTTP connection — the request still
        // wakes the worker. Status unknown.
        console.log('[local-warm] failed: network');
      });
  } catch {
    console.log('[local-warm] failed: network');
  }
}
