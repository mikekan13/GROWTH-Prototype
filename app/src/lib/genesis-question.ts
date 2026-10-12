/**
 * Fallback detector (2026-10-12): JEWL's questions to the GM belong in
 * raise_prod at every genesis stage — never in a report or free text, where
 * the GM would have to go to the Log to find them. When a genesis report or
 * blocked reason still carries one, `[genesis] question-outside-prod` is
 * logged so regressions are seen. Pure; heuristic.
 *
 * Heuristic: a sentence that ends in "?" and addresses the GM ("you"/"your").
 */

/** Fixed prefix of the blocked reason while the GM holds the prods — in the
 *  PRODDING stage, and "blocked-on-prod" in any later stage, where the open
 *  prod ids follow in brackets: `waiting on the GM — prods [id1,id2]`. */
export const PRODS_BLOCKED_REASON = 'waiting on the GM — prods';

export function prodsBlockedReason(prodIds: string[]): string {
  return prodIds.length ? `${PRODS_BLOCKED_REASON} [${prodIds.join(',')}]` : PRODS_BLOCKED_REASON;
}

export function isProdsBlocked(reason: string | null | undefined): boolean {
  return !!reason && reason.startsWith(PRODS_BLOCKED_REASON);
}

/** The prod ids a blocked-on-prod reason names (empty when none). */
export function blockedProdIds(reason: string | null | undefined): string[] {
  if (!isProdsBlocked(reason)) return [];
  const m = /\[([^\]]*)\]/.exec(reason!);
  return m ? m[1].split(',').map(s => s.trim()).filter(Boolean) : [];
}

/** The first sentence in `text` that reads as a question to the GM, or null. */
export function findGmQuestion(text: string | null | undefined): string | null {
  if (!text) return null;
  // Split on sentence ends, keeping the terminator; newlines also break.
  const sentences = text.replace(/\*\*/g, '').split(/(?<=[.?!])\s+|\n+/);
  for (const raw of sentences) {
    const s = raw.trim();
    if (!s.endsWith('?')) continue;
    if (/\byou(r|rs)?\b/i.test(s)) return s;
  }
  // A question that addresses the GM in an earlier clause ("One word from
  // you: is it X or Y?") — "you" anywhere in a line that holds a "?".
  for (const line of text.split(/\n+/)) {
    if (line.includes('?') && /\byou(r|rs)?\b/i.test(line)) {
      const q = line.slice(0, line.lastIndexOf('?') + 1).trim();
      if (q) return q;
    }
  }
  return null;
}

/** Log `[genesis] question-outside-prod` when `text` holds a GM question.
 *  Returns the question found (or null). Never throws. */
export function warnQuestionOutsideProd(sessionId: string, text: string | null | undefined, where: string): string | null {
  const q = findGmQuestion(text);
  if (q) {
    // eslint-disable-next-line no-console
    console.warn(`[genesis] question-outside-prod session=${sessionId} (${where}): ${q.slice(0, 200)}`);
  }
  return q;
}
