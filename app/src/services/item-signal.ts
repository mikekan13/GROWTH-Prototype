/**
 * A SIGNAL IS A SHORT-LIVED STATE OF A THING (2026-11-02, the call that rang four minutes: Violet held a ringing phone to her
 * face and nobody — not she, not the caller — was told, as a fact of the world, that it was RINGING NOW and not answered).
 *
 * A `sound` that lands AT a thing a being holds is recorded on that thing's own data:
 *   `data.signals`: a THREAD of { text, since, until, by? } (cycles; `by` = the character whose act caused it), newest last
 *   `data.signal`: a derived MIRROR of the most pressing one (a ringing call > an unread text > the newest read-unanswered text)
 * Finding 69 (2026-11-05): a second text used to REPLACE the first on the phone; a thing now holds a thread.
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
  /** Finding 60 (2026-11-05): the id of the SENDER's own thing this came from, so a reply goes back to that phone, not the first match. */
  fromItem?: string;
}

type Data = Record<string, unknown>;
type Raw = Record<string, unknown>;

function parseEntry(r: unknown, nowCycle: number | null): ItemSignal | null {
  if (!r || typeof r !== 'object' || Array.isArray(r)) return null;
  const x = r as Raw;
  if (typeof x.text !== 'string' || !x.text.trim()) return null;
  const since = typeof x.since === 'number' ? x.since : 0;
  const until = typeof x.until === 'number' ? x.until : Number.POSITIVE_INFINITY;
  if (nowCycle !== null && (nowCycle >= until || nowCycle < since)) return null;
  const kind = x.kind === 'call' || x.kind === 'text' || x.kind === 'other' ? x.kind : undefined;
  const state = x.state === 'ringing' || x.state === 'connected' || x.state === 'received' || x.state === 'read' ? x.state : undefined;
  return {
    text: x.text.trim(), since, until,
    ...(typeof x.by === 'string' && x.by ? { by: x.by } : {}),
    ...(kind ? { kind } : {}), ...(state ? { state } : {}),
    ...(typeof x.words === 'string' && x.words.trim() ? { words: x.words.trim().slice(0, 600) } : {}),
    ...(typeof x.fromItem === 'string' && x.fromItem ? { fromItem: x.fromItem } : {}),
  };
}

/** Every entry of the thread, oldest first; `nowCycle` null keeps expired ones too. A legacy single `data.signal` is a thread of one. */
function threadEntries(data: unknown, nowCycle: number | null): ItemSignal[] {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return [];
  const d = data as Data;
  const raw: unknown[] = Array.isArray(d.signals) ? d.signals : d.signal ? [d.signal] : [];
  return raw.map((r) => parseEntry(r, nowCycle)).filter((x): x is ItemSignal => !!x);
}

/** A message (text) waits for a reader and a reply; a call/other is a line. */
const isMessage = (s: ItemSignal) => s.kind === 'text' || s.state === 'received' || s.state === 'read';
const entryKey = (s: ItemSignal) => `${s.kind ?? ''}|${s.by ?? ''}|${s.since}|${s.words ?? ''}`;

/**
 * Finding 69 (2026-11-05): the MOST PRESSING of a thread, the one `data.signal` mirrors: a ringing/open call, then an unread
 * received text, then the newest read-unanswered text; the newest wins within a rank. Pure.
 */
export function mirrorOf(list: ItemSignal[]): ItemSignal | null {
  let best: ItemSignal | null = null;
  let bestRank = 99;
  for (const s of list) {
    const rank = s.state === 'received' ? 1 : s.state === 'read' ? 2 : 0;
    if (rank <= bestRank) { best = s; bestRank = rank; }
  }
  return best;
}

/** Finding 69: the whole live THREAD of a thing at `nowCycle` (oldest first, newest last). */
export function liveSignals(data: unknown, nowCycle: number): ItemSignal[] {
  return threadEntries(data, nowCycle);
}

/** The most pressing live signal in an item's data at `nowCycle` (the mirror of the thread); null when there is none or it has run out. */
export function liveSignal(data: unknown, nowCycle: number): ItemSignal | null {
  return mirrorOf(liveSignals(data, nowCycle));
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
    for (const sig of liveSignals(it.data, nowCycle)) {
      if (sig.state === 'connected' && it.holderId && sig.by) out.push({ holderId: it.holderId, by: sig.by });
    }
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

const bare = (name: string) => name.replace(/^(?:the|her|his|their)\s+/i, '');
const NUM_WORDS = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight'];
const numWord = (n: number) => NUM_WORDS[n] ?? String(n);
const q = (w: string | undefined) => `"${w ?? '…'}"`;

/**
 * Finding 69: what a THREAD is to one side. One message (or a call) reads as `signalTextFor`; several messages from one sender
 * are counted, the newest first. For the holder: `Two messages from Kristopher on the phone, the newest unread: "…" — the
 * earlier one, read: "…", not written back.` For the sender's far side: how many were read and how many are unanswered. Pure.
 * `opts.thing` names the thing (holder: "on the Personal phone"; sender: where it reached, e.g. "Violet's phone").
 */
export function threadTextFor(thread: ItemSignal[], side: 'holder' | 'caller', other?: string | null, opts?: { thing?: string }): string {
  if (!thread.length) return '';
  const msgs = thread.filter(isMessage);
  const calls = thread.filter((s) => !isMessage(s));
  const parts: string[] = [];
  if (calls.length) parts.push(signalTextFor(mirrorOf(calls)!, side, other));
  const groups = new Map<string, ItemSignal[]>();
  for (const m of msgs) groups.set(m.by ?? '', [...(groups.get(m.by ?? '') ?? []), m]);
  const on = side === 'holder' && opts?.thing ? ` on the ${bare(opts.thing)}` : '';
  for (const g of groups.values()) {
    const who = other ?? (side === 'holder' ? 'someone' : 'them');
    if (g.length === 1) {
      const t = signalTextFor(g[0], side, other);
      parts.push(on && g[0].state === 'read' ? t.replace(/message, read/, `message${on}, read`) : on && g[0].state === 'received' ? `${t.replace(/\.?\s*It reads:/, `${on}. It reads:`)}` : t);
      continue;
    }
    const newest = g[g.length - 1];
    const earlier = g.slice(0, -1).reverse();
    if (side === 'holder') {
      const head = `${numWord(g.length)} messages from ${who}${on}`;
      const allRead = earlier.every((e) => e.state === 'read');
      if (newest.state === 'received') {
        parts.push(`${head}, the newest unread: ${q(newest.words)} — the earlier ${earlier.length === 1 ? 'one' : 'ones'}${allRead ? ', read' : ''}: ${earlier.map((e) => q(e.words)).join('; ')}${allRead ? ', not written back' : ''}.`);
      } else {
        parts.push(`${head}, ${allRead ? 'all read' : 'the newest read'} and not written back; newest first: ${[newest, ...earlier].map((e) => q(e.words)).join('; ')}.`);
      }
    } else {
      const read = g.filter((e) => e.state === 'read').length;
      parts.push(`Your ${g.length} messages reached ${opts?.thing ?? who}: ${read} read, ${g.length - read} not yet read. The newest said: ${q(newest.words)}. Nothing has come back yet.`);
    }
  }
  return parts.join(' ');
}

const STORE_CAP = 12;
function storeEntry(signal: ItemSignal): Record<string, unknown> {
  return {
    text: signal.text.slice(0, 240), since: signal.since, until: Number.isFinite(signal.until) ? signal.until : null,
    ...(signal.by ? { by: signal.by } : {}), ...(signal.kind ? { kind: signal.kind } : {}), ...(signal.state ? { state: signal.state } : {}),
    ...(signal.words ? { words: signal.words.slice(0, 600) } : {}),
    ...(signal.fromItem ? { fromItem: signal.fromItem } : {}),
  };
}

function baseOf(data: unknown): Data {
  return data && typeof data === 'object' && !Array.isArray(data) ? { ...(data as Data) } : {};
}

/** Write a thread: `signals` (newest last) and `signal`, the mirror of the most pressing one. An empty thread clears both. */
function writeThread(base: Data, list: ItemSignal[]): Data {
  const kept = list.slice(-STORE_CAP);
  if (!kept.length) { delete base.signal; delete base.signals; return base; }
  base.signals = kept.map(storeEntry);
  base.signal = storeEntry(mirrorOf(kept)!);
  return base;
}

/**
 * The item's data with a signal set. Does not mutate. Finding 69 (2026-11-05): a thing holds a THREAD. A message APPENDS (the same
 * message in a new state replaces itself); a call or other signal replaces only an earlier one from the same caller.
 */
export function withSignal(data: unknown, signal: ItemSignal): Data {
  const base = baseOf(data);
  const key = entryKey(signal);
  const list = threadEntries(base, null)
    .filter((e) => e.until >= signal.since)
    .filter((e) => entryKey(e) !== key && (isMessage(signal) || isMessage(e) || (e.by ?? '') !== (signal.by ?? '')));
  list.push({ ...signal, text: signal.text.slice(0, 240) });
  return writeThread(base, list);
}

/** Without that one signal (matched as `withSignal` matches it); the rest of the thread stays. Does not mutate. */
export function withoutOneSignal(data: unknown, signal: ItemSignal): Data {
  const base = baseOf(data);
  const key = entryKey(signal);
  return writeThread(base, threadEntries(base, null).filter((e) => entryKey(e) !== key));
}

/** Without the signals `senderId` set off (a stopped call); what others sent stays. Does not mutate. */
export function withoutSignalsBy(data: unknown, senderId: string): Data {
  const base = baseOf(data);
  return writeThread(base, threadEntries(base, null).filter((e) => e.by !== senderId));
}

/**
 * Finding 69: reading. The newest unread message becomes `read` (kept until `readUntil`); with `all`, every unread one from that
 * sender does ("reads the messages"). Returns the messages read, oldest first. Pure.
 */
export function markRead(data: unknown, nowCycle: number, readUntil: number, opts?: { all?: boolean }): { data: Data; read: ItemSignal[] } {
  const base = baseOf(data);
  const all = threadEntries(base, null);
  const unread = all.filter((e) => e.state === 'received' && isMessage(e) && nowCycle >= e.since && nowCycle < e.until);
  if (!unread.length) return { data: base, read: [] };
  const newest = unread[unread.length - 1];
  const targets = opts?.all ? unread.filter((e) => e.by === newest.by) : [newest];
  const keys = new Set(targets.map(entryKey));
  const next = all.map((e) => (keys.has(entryKey(e)) && e.state === 'received' ? { ...signalInState(e, 'read'), until: readUntil } : e));
  return { data: writeThread(base, next), read: targets };
}

/** A REPLY to `senderId`: every READ message from them settles. Finding 84 (2026-11-05): a being cannot answer what it has not read, so `received` ones stay. Returns how many. Does not mutate. */
export function settleFrom(data: unknown, senderId: string, nowCycle: number): { data: Data; settled: number } {
  const base = baseOf(data);
  const all = threadEntries(base, null);
  const gone = all.filter((e) => e.by === senderId && e.state === 'read' && nowCycle >= e.since && nowCycle < e.until);
  if (!gone.length) return { data: base, settled: 0 };
  return { data: writeThread(base, all.filter((e) => !gone.includes(e))), settled: gone.length };
}

/**
 * Finding 62 (2026-11-05): a text's words are the SENDER's. An intent carries them after "The words X put into it, exactly:" (only the
 * actor's own quotes travel there); any other quote on the line is someone else's speech and never fills a text. Pure.
 */
export function actorWordsFromIntent(intent: string | undefined): string | undefined {
  const m = /put into it, exactly:\s*["“]([^"”]{2,600})["”]/i.exec(intent ?? '');
  return m?.[1]?.trim() || undefined;
}

/** The item's data with its whole thread gone. Does not mutate. */
export function withoutSignal(data: unknown): Data {
  const base = baseOf(data);
  delete base.signal; delete base.signals;
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

/**
 * The plain lines a being is told this beat about signals: for a HOLDER, what its held thing is doing right now; for the one who
 * CAUSED it, that it is going and nobody has answered. Only what the record says, no invented detail. Pure.
 */
export function signalLines(items: SignalItem[], viewerId: string, nowCycle: number): string[] {
  const out: string[] = [];
  for (const it of items) {
    const thread = liveSignals(it.data, nowCycle);
    const sig = mirrorOf(thread);
    if (!sig) continue;
    if (it.holderId === viewerId) {
      const unread = thread.filter((s) => s.state === 'received');
      if (sig.state === 'connected') out.push(`The ${bare(it.name)} you are holding: the call is answered and open. What you say reaches the one on the line, and what they say reaches you, until one of you hangs up.`);
      else if (sig.state === 'received') out.push(`The ${bare(it.name)} you are holding: ${unread.length > 1 ? `${unread.length} messages have come in, the newest reads: "${sig.words ?? '…'}"` : `a message has come in. It reads: "${sig.words ?? '…'}"`}. Whoever sent it cannot hear you; writing back is your act.`);
      else out.push(`The ${bare(it.name)} you are holding: ${sig.text} — right now. It goes on until you answer it or it stops; answering it is your act, and so is leaving it. Whoever set it off cannot hear you until you answer it. It does not tell you who set it off: you know who only if your memory or the world's facts say so.`);
    } else {
      const mine = mirrorOf(thread.filter((s) => s.by === viewerId));
      if (!mine) continue;
      if (mine.state === 'connected') out.push(`What you set off was answered: you are on the line. What you say reaches them now.`);
      else if (mine.state === 'received') out.push(`Your message reached them.${mine.words ? ` It said: "${mine.words}".` : ''} Nothing has come back yet.`);
      else out.push(`What you set off is still going: ${mine.text} It has not been answered.`);
    }
  }
  return out;
}

/**
 * Finding 60 (2026-11-05): a REPLY goes back to the phone the message came from. Of the replier's own things, the one carrying a live
 * received/read message from `receiverId` that names a `fromItem` gives that item id (the newest such message); null when none. Pure.
 */
export function replyTargetItem(mine: Array<{ data: unknown }>, receiverId: string, nowCycle: number): string | null {
  let best: { at: number; id: string } | null = null;
  for (const it of mine) {
    for (const sig of liveSignals(it.data, nowCycle)) {
      if (sig.by === receiverId && (sig.state === 'received' || sig.state === 'read') && sig.fromItem && (!best || sig.since >= best.at)) best = { at: sig.since, id: sig.fromItem };
    }
  }
  return best?.id ?? null;
}

/**
 * Finding 60 (2026-11-05): WHICH of the sender's things a message went out from. (a) the act names it ("on the personal phone") -
 * the longest name contained in the act; (b) else the thing last used with the receiver (its newest signal involving them);
 * (c) else the only thing with any signal history; (d) else the only thing held; (e) else undefined. Pure.
 */
export function pickFromItem(held: Array<{ id: string; name: string; data: unknown }>, receiverId: string | null, actText: string | undefined): string | undefined {
  if (!held.length) return undefined;
  const text = (actText ?? '').toLowerCase();
  if (text) {
    let best: { id: string; len: number } | null = null;
    for (const h of held) {
      const n = bare(h.name).trim().toLowerCase();
      if (n.length >= 3 && text.includes(n) && (!best || n.length > best.len)) best = { id: h.id, len: n.length };
    }
    if (best) return best.id;
  }
  const hist = held.map((h) => ({ id: h.id, list: threadEntries(h.data, null) })).filter((h) => h.list.length);
  if (receiverId) {
    let top = -1;
    let ids: string[] = [];
    for (const h of hist) {
      const at = Math.max(-1, ...h.list.filter((e) => e.by === receiverId).map((e) => e.since));
      if (at < 0) continue;
      if (at > top) { top = at; ids = [h.id]; } else if (at === top) ids.push(h.id);
    }
    if (ids.length === 1) return ids[0];
  }
  if (hist.length === 1) return hist[0].id;
  if (held.length === 1) return held[0].id;
  return undefined;
}
