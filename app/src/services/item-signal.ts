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

export type SignalKind = 'call' | 'text' | 'other';
/** ringing: going, unanswered · connected: answered, a line open both ways · received: a message landed, unread until answered. */
export type SignalState = 'ringing' | 'connected' | 'received' | 'read';
/** read: the message was opened (Day 8, 2026-11-05) — its words are the reader's, and it waits for an answer until they write back or let it be. */

export interface ItemSignal {
  text: string;
  /** Campaign cycle it began. */
  since: number;
  /** Campaign cycle it ends on its own. */
  until: number;
  /** The character whose act set it off (the caller). */
  by?: string;
  /** Day 6 (2026-11-04, "a hard fail on phones"): a call or a text is a THING in the ledger, with a state the holder perceives on every change. */
  kind?: SignalKind;
  state?: SignalState;
  /** The words a message carries, exactly as written. */
  words?: string;
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
  const kind = r.kind === 'call' || r.kind === 'text' || r.kind === 'other' ? r.kind : undefined;
  const state = r.state === 'ringing' || r.state === 'connected' || r.state === 'received' || r.state === 'read' ? r.state : undefined;
  return {
    text: r.text.trim(), since, until,
    ...(typeof r.by === 'string' && r.by ? { by: r.by } : {}),
    ...(kind ? { kind } : {}), ...(state ? { state } : {}),
    ...(typeof r.words === 'string' && r.words.trim() ? { words: r.words.trim().slice(0, 600) } : {}),
  };
}

/** The same signal in another state (answered: connected, no end of its own). Does not mutate. */
export function signalInState(sig: ItemSignal, state: SignalState): ItemSignal {
  return { ...sig, state, ...(state === 'connected' || state === 'read' ? { until: Number.POSITIVE_INFINITY } : {}) };
}

/**
 * THE PARTIES ON A LINE (session 5, 2026-11-04: Violet answered and "Hello" reached nobody — the map decided who could hear).
 * For every connected signal: the holder of the sounding thing and the one who set it off. Pure.
 */
export function connectedParties(items: Array<{ holderId: string | null; data: unknown }>, nowCycle: number): Array<{ holderId: string; by: string }> {
  const out: Array<{ holderId: string; by: string }> = [];
  for (const it of items) {
    const sig = liveSignal(it.data, nowCycle);
    if (sig?.state === 'connected' && it.holderId && sig.by) out.push({ holderId: it.holderId, by: sig.by });
  }
  return out;
}

/** True when `a` and `b` are the two parties of one connected signal. Pure. */
export function onTheLine(parties: Array<{ holderId: string; by: string }>, a: string, b: string): boolean {
  return a !== b && parties.some((p) => (p.holderId === a && p.by === b) || (p.holderId === b && p.by === a));
}

/**
 * What a signal IS to one side, from the ledger alone (the record's STILL GOING line). The holder's phone is "my phone";
 * the caller is told of the other's thing. Pure.
 */
export function signalTextFor(sig: ItemSignal, side: 'holder' | 'caller', other?: string | null): string {
  const who = other ?? (side === 'holder' ? 'someone' : 'them');
  if (sig.state === 'connected') return side === 'holder' ? `You are on the line with ${who}: the call is answered and open.` : `${who} answered: you are on the line with ${who}.`;
  if (sig.state === 'received') return side === 'holder' ? `${sig.text} It reads: "${sig.words ?? '…'}"` : `Your message reached ${who}.${sig.words ? ` It said: "${sig.words}"` : ''} Nothing has come back yet.`;
  if (sig.state === 'read') return side === 'holder' ? `${who}'s message, read${sig.words ? `: "${sig.words}"` : ''}. You have not written back.` : `${who} read your message.${sig.words ? ` It said: "${sig.words}"` : ''} Nothing has come back yet.`;
  return side === 'holder' ? `${sig.text} It is ringing now and not answered.` : `${sig.text} It is still going; nobody has answered it.`;
}

/** The item's data with a signal set (a newer one replaces an older). Does not mutate. */
export function withSignal(data: unknown, signal: ItemSignal): Data {
  const base: Data = data && typeof data === 'object' && !Array.isArray(data) ? { ...(data as Data) } : {};
  base.signal = {
    text: signal.text.slice(0, 240), since: signal.since, until: Number.isFinite(signal.until) ? signal.until : null,
    ...(signal.by ? { by: signal.by } : {}), ...(signal.kind ? { kind: signal.kind } : {}), ...(signal.state ? { state: signal.state } : {}),
    ...(signal.words ? { words: signal.words.slice(0, 600) } : {}),
  };
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
      if (sig.state === 'connected') out.push(`The ${bare(it.name)} you are holding: the call is answered and open. What you say reaches the one on the line, and what they say reaches you, until one of you hangs up.`);
      else if (sig.state === 'received') out.push(`The ${bare(it.name)} you are holding: a message has come in. It reads: "${sig.words ?? '…'}". Whoever sent it cannot hear you; writing back is your act.`);
      else out.push(`The ${bare(it.name)} you are holding: ${sig.text} — right now. It goes on until you answer it or it stops; answering it is your act, and so is leaving it. Whoever set it off cannot hear you until you answer it. It does not tell you who set it off: you know who only if your memory or the world's facts say so.`);
    } else if (sig.by === viewerId) {
      if (sig.state === 'connected') out.push(`What you set off was answered: you are on the line. What you say reaches them now.`);
      else if (sig.state === 'received') out.push(`Your message reached them.${sig.words ? ` It said: "${sig.words}".` : ''} Nothing has come back yet.`);
      else out.push(`What you set off is still going: ${sig.text} It has not been answered.`);
    }
  }
  return out;
}
