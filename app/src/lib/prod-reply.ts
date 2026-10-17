/** Matching a Watcher's plain chat reply to the genesis prod it answers. Pure. */
const REPLY_STOP = new Set(['about', 'after', 'again', 'also', 'and', 'because', 'been', 'before', 'being', 'does', 'from', 'have', 'into', 'just', 'more', 'only', 'or', 'over', 'should', 'some', 'than', 'that', 'their', 'them', 'then', 'there', 'they', 'this', 'what', 'when', 'where', 'which', 'while', 'will', 'with', 'would', 'your']);
const replyWords = (s: string) => new Set((s.toLowerCase().match(/[a-z']{4,}/g) ?? []).filter(w => !REPLY_STOP.has(w)));

/**
 * Which OPEN prod a chat reply answers (2026-10-17: Kristopher's genesis asked
 * about his first marriage, then what he wants; Mike answered the marriage and
 * the reply landed on the newest prod, leaving the marriage open and the
 * session stuck). The prod sharing the most words with the reply wins; a tie
 * or no overlap goes to the one asked FIRST — people answer in order. Pure.
 */
export function pickProdForReply<T extends { question: string; why?: string | null; createdAt: Date }>(open: T[], text: string): T | null {
  if (!open.length) return null;
  const said = replyWords(text);
  const byAsked = [...open].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
  let best = byAsked[0];
  let bestScore = -1;
  for (const p of byAsked) {
    const asked = replyWords(`${p.question} ${p.why ?? ''}`);
    let score = 0;
    for (const w of said) if (asked.has(w)) score++;
    if (score > bestScore) { best = p; bestScore = score; }
  }
  return best;
}
