/**
 * A SIGNAL IS A SHORT-LIVED STATE OF A THING (2026-11-02, the call that rang four minutes: Violet held a ringing phone to her
 * face and nobody — not she, not the caller — was told, as a fact of the world, that it was RINGING NOW and not answered).
 *
 * A `sound` that lands AT a thing a being holds is recorded on that thing's own data as `data.signal`:
 *   { text, since, until, by? }   (cycles; `by` = the character whose act caused it)
 * Nothing here is about phones: a ringing phone, a buzzing pager, a knocking box are all signals. The HOLDER is told it plainly
 * every beat while it lives; the one who CAUSED it is told it has not been answered. It ends when the holder answers it (the
 * adjudicator's `answer` effect), when the thing leaves the hand, or when `until` passes. Pure — no database here.
 */

export interface ItemSignal {
  text: string;
  /** Campaign cycle it began. */
  since: number;
  /** Campaign cycle it ends on its own. */
  until: number;
  /** The character whose act set it off (the caller). */
  by?: string;
}

type Data = Record<string, unknown>;

/** The live signal in an item's data at `nowCycle`; null when there is none, it is malformed, or it has run out. */
export function liveSignal(data: unknown, nowCycle: number): ItemSignal | null {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const s = (data as Data).signal;
  if (!s || typeof s !== 'object' || Array.isArray(s)) return null;
  const r = s as Record<string, unknown>;
  if (typeof r.text !== 'string' || !r.text.trim()) return null;
  const since = typeof r.since === 'number' ? r.since : 0;
  const until = typeof r.until === 'number' ? r.until : Number.POSITIVE_INFINITY;
  if (nowCycle >= until || nowCycle < since) return null;
  return { text: r.text.trim(), since, until, ...(typeof r.by === 'string' && r.by ? { by: r.by } : {}) };
}

/** The item's data with a signal set (a newer one replaces an older). Does not mutate. */
export function withSignal(data: unknown, signal: ItemSignal): Data {
  const base: Data = data && typeof data === 'object' && !Array.isArray(data) ? { ...(data as Data) } : {};
  base.signal = { text: signal.text.slice(0, 240), since: signal.since, until: signal.until, ...(signal.by ? { by: signal.by } : {}) };
  return base;
}

/** The item's data with its signal gone. Does not mutate. */
export function withoutSignal(data: unknown): Data {
  const base: Data = data && typeof data === 'object' && !Array.isArray(data) ? { ...(data as Data) } : {};
  delete base.signal;
  return base;
}

/**
 * WHO CAUSED A SIGNAL, and whether it is recorded at all (2026-11-02: a Watcher-narrated "Violet's phone rings" ran through
 * Violet's own adjudication, the phone was HERS, and no ringing state was written). A sound at a thing someone ELSE holds is
 * caused by the actor. A sound at a thing the ACTOR holds is the actor's own act only when the act was the actor's own; when the
 * Watcher narrated it (or any cause not the actor's), the actor is the one it happens TO: it is recorded, caused by whoever
 * already set that thing off (a call in progress keeps its caller), else by no one. Pure.
 */
export function signalCause(opts: { holderId: string | null; actorId: string; narrated?: boolean; existingBy?: string }): { record: boolean; by?: string } {
  if (!opts.holderId) return { record: false };
  if (opts.holderId !== opts.actorId) return { record: true, by: opts.actorId };
  if (!opts.narrated) return { record: false };
  return { record: true, ...(opts.existingBy && opts.existingBy !== opts.actorId ? { by: opts.existingBy } : {}) };
}

export interface SignalItem { name: string; holderId: string | null; data: unknown }

const bare = (name: string) => name.replace(/^(?:the|her|his|their)\s+/i, '');

/**
 * The plain lines a being is told this beat about signals: for a HOLDER, what its held thing is doing right now; for the one who
 * CAUSED it, that it is going and nobody has answered. Only what the record says, no invented detail. Pure.
 */
export function signalLines(items: SignalItem[], viewerId: string, nowCycle: number): string[] {
  const out: string[] = [];
  for (const it of items) {
    const sig = liveSignal(it.data, nowCycle);
    if (!sig) continue;
    if (it.holderId === viewerId) {
      out.push(`The ${bare(it.name)} you are holding: ${sig.text} — right now. It goes on until you answer it or it stops; answering it is your act, and so is leaving it.`);
    } else if (sig.by === viewerId) {
      out.push(`What you set off is still going: ${sig.text} It has not been answered.`);
    }
  }
  return out;
}
