/**
 * AN ACT TAKES TIME (Michael 2026-11-07; TIME-LAW-2026-11-07.md, revised section).
 *
 *  - A round is 6 s everywhere. Attributes scale speed through the ACTION COUNT only (pillar levels / 75, sim/round/action-economy).
 *  - Actions are PILLAR-BOUND: reading is paid by Soul actions.
 *  - What one action does at ordinary pace is the simulation's estimate, recorded on the act (`data.perAction`) so it stays consistent.
 *  - Time passing ALLOWS the act: progress is credited lazily from the clock — whenever the world is next read — and what does not fit a
 *    beat carries over until it is done or the being does something else (interrupted). Every advance is appended to `data.log`.
 *
 * The first act on this law is READING a conversation (Michael: "when I open the text messages I'm going to read all of those, in
 * chronological order… unless something distracts me"). Each message gets its own read time, stamped when the being finishes it.
 * Pushing PAST pace (a skill check against a DR) waits for the skills talk.
 */
import { prisma } from '@/lib/db';
import { actionPools } from '@/sim/round/action-economy';
import { ROUND_SECONDS, secondsToCycles, type CalendarSpec } from '@/types/time';
import type { GrowthCharacter } from '@/types/growth';

type Ts = { unitsPerMetaCycle: number; calendar: CalendarSpec | null };

/** The simulation's ordinary estimate: words an ordinary reader takes in with ONE Soul action (≈240 words a minute at one Soul action a round). */
export const ORDINARY_WORDS_PER_SOUL_ACTION = 24;

export const wordCount = (s: string) => (s.trim().match(/\S+/g) ?? []).length;

export interface ReadQueueEntry { id: string; words: number }
export interface ReadProgress { finished: Array<{ id: string; atWords: number }>; done: number }

/**
 * Credit `words` of reading to a queue already `done` words in (oldest first). Returns the messages finished by this credit, each with the
 * cumulative word count at which it finished (for stamping its own read time), and the new total. Pure.
 */
export function creditReading(queue: ReadQueueEntry[], done: number, words: number): ReadProgress {
  const total = queue.reduce((a, q) => a + q.words, 0);
  const next = Math.min(total, done + Math.max(0, words));
  const finished: ReadProgress['finished'] = [];
  let edge = 0;
  for (const q of queue) {
    edge += q.words;
    if (edge > done && edge <= next) finished.push({ id: q.id, atWords: edge });
  }
  return { finished, done: next };
}

/** Words a being reads in one round at its own pace: Soul actions × the ordinary yield. Pure. */
export function wordsPerRound(sheet: Pick<GrowthCharacter, 'attributes'> | undefined, perAction = ORDINARY_WORDS_PER_SOUL_ACTION): number {
  return actionPools(sheet).soul * perAction;
}

async function timescaleOf(campaignId: string): Promise<Ts> {
  const row = await prisma.timescale.findFirst({ where: { campaignId }, select: { unitsPerMetaCycle: true, calendar: true } });
  let calendar: CalendarSpec | null = null;
  try { calendar = row?.calendar ? JSON.parse(row.calendar) : null; } catch { calendar = null; }
  return { unitsPerMetaCycle: row?.unitsPerMetaCycle ?? 1, calendar };
}

interface ReadData { thingId: string; senderId: string | null; queue: ReadQueueEntry[]; perRound: number; perAction: number; log: Array<{ at: number; done: number; finished: string[] }> }

const parse = (raw: string): ReadData => JSON.parse(raw) as ReadData;

/** Advance one open reading act to `nowCycle`: credit the time since it was last credited, stamp each finished message's read time. */
async function advanceReading(act: { id: string; campaignId: string; done: number; updatedCycle: number; data: string }, nowCycle: number, ts: Ts): Promise<{ finished: string[]; complete: boolean }> {
  if (nowCycle <= act.updatedCycle) return { finished: [], complete: false };
  const d = parse(act.data);
  const roundCycles = secondsToCycles(ROUND_SECONDS, ts);
  const rounds = (nowCycle - act.updatedCycle) / roundCycles;
  const p = creditReading(d.queue, act.done, rounds * d.perRound);
  // Each message's read time: when the reading reached its last word, at the being's pace.
  for (const f of p.finished) {
    const at = act.updatedCycle + ((f.atWords - act.done) / d.perRound) * roundCycles;
    await prisma.worldMessage.updateMany({ where: { id: f.id, readCycle: null }, data: { readCycle: at, noticedCycle: at } });
  }
  const total = d.queue.reduce((a, q) => a + q.words, 0);
  const complete = p.done >= total;
  const endedAt = complete ? act.updatedCycle + ((total - act.done) / d.perRound) * roundCycles : null;
  d.log.push({ at: nowCycle, done: p.done, finished: p.finished.map((f) => f.id) });
  await prisma.beingAct.update({
    where: { id: act.id },
    data: { done: p.done, updatedCycle: nowCycle, data: JSON.stringify(d), ...(complete ? { endedCycle: endedAt, endReason: 'done' } : {}) },
  });
  return { finished: p.finished.map((f) => f.id), complete };
}

/**
 * Bring every open act of the campaign up to `nowCycle` (time passing allows the act). Called by the readers of the world
 * (world-messages withMessages) before they look. Never throws.
 */
export async function advanceOpenActs(campaignId: string, nowCycle: number): Promise<void> {
  try {
    const open = await prisma.beingAct.findMany({ where: { campaignId, endedCycle: null, kind: 'read' } });
    if (!open.length) return;
    const ts = await timescaleOf(campaignId);
    for (const a of open) await advanceReading(a, nowCycle, ts);
  } catch (err) {
    console.warn('[being-acts] acts not advanced (non-fatal):', err instanceof Error ? err.message : err);
  }
}

/**
 * The being turned to something else: what it was in the middle of is credited up to now and ends `interrupted`, progress kept.
 * Never throws.
 */
export async function interruptActs(campaignId: string, characterId: string, nowCycle: number, why: string): Promise<number> {
  try {
    const open = await prisma.beingAct.findMany({ where: { campaignId, characterId, endedCycle: null } });
    if (!open.length) return 0;
    const ts = await timescaleOf(campaignId);
    let n = 0;
    for (const a of open) {
      const r = a.kind === 'read' ? await advanceReading(a, nowCycle, ts) : { complete: false };
      if (r.complete) continue;
      const d = JSON.parse(a.data) as Record<string, unknown>;
      await prisma.beingAct.update({ where: { id: a.id }, data: { endedCycle: nowCycle, endReason: 'interrupted', data: JSON.stringify({ ...d, interruptedBy: why }) } });
      n++;
    }
    if (n) console.log(`[being-acts] ${characterId}: ${n} act(s) interrupted — ${why}`);
    return n;
  } catch (err) {
    console.warn('[being-acts] interrupt failed (non-fatal):', err instanceof Error ? err.message : err);
    return 0;
  }
}

/**
 * OPENING A CONVERSATION, AT PACE: every unread message on the thing from that sender (oldest first) becomes one reading act. The beat
 * in which the being chose to read is credited at once — one round before now, never before the first message arrived — and the rest
 * carries over as world time passes. Returns the messages finished now (oldest first) and how far into the next one it is.
 * An open reading act on the same thing is resumed, not restarted.
 */
export async function readAtPace(campaignId: string, characterId: string, thingId: string, nowCycle: number, senderId?: string | null): Promise<{ read: Array<{ id: string; content: string; senderId: string | null }>; partial: { id: string; content: string; wordsRead: number } | null; actId: string | null }> {
  const ts = await timescaleOf(campaignId);
  const roundCycles = secondsToCycles(ROUND_SECONDS, ts);
  let act = await prisma.beingAct.findFirst({ where: { campaignId, characterId, kind: 'read', endedCycle: null } });
  const before = new Set<string>();
  if (!act) {
    const unread = await prisma.worldMessage.findMany({
      where: { campaignId, recipientThingId: thingId, readCycle: null, settledCycle: null, deliveredCycle: { lte: nowCycle } },
      orderBy: { sentCycle: 'asc' }, select: { id: true, content: true, senderId: true, deliveredCycle: true },
    });
    if (!unread.length) return { read: [], partial: null, actId: null };
    const who = senderId !== undefined ? senderId : unread[unread.length - 1].senderId;
    const convo = unread.filter((m) => m.senderId === who);
    const sheet = await prisma.character.findUnique({ where: { id: characterId }, select: { data: true } });
    let parsed: Pick<GrowthCharacter, 'attributes'> | undefined;
    try { parsed = sheet?.data ? JSON.parse(sheet.data) : undefined; } catch { parsed = undefined; }
    const perRound = Math.max(1, wordsPerRound(parsed));
    const start = Math.max(nowCycle - roundCycles, convo[0].deliveredCycle ?? nowCycle);
    const data: ReadData = { thingId, senderId: who, queue: convo.map((m) => ({ id: m.id, words: Math.max(1, wordCount(m.content)) })), perRound, perAction: ORDINARY_WORDS_PER_SOUL_ACTION, log: [] };
    act = await prisma.beingAct.create({ data: {
      campaignId, characterId, kind: 'read', pillar: 'soul', unit: 'words', total: data.queue.reduce((a, q) => a + q.words, 0),
      startedCycle: start, updatedCycle: start, data: JSON.stringify(data),
    } });
  } else {
    for (const q of parse(act.data).queue) {
      const m = await prisma.worldMessage.findUnique({ where: { id: q.id }, select: { readCycle: true } });
      if (m?.readCycle != null) before.add(q.id);
    }
  }
  await advanceReading(act, nowCycle, ts);
  const fresh = await prisma.beingAct.findUnique({ where: { id: act.id } });
  const d = parse(fresh!.data);
  const rows = await prisma.worldMessage.findMany({ where: { id: { in: d.queue.map((q) => q.id) } }, select: { id: true, content: true, senderId: true, readCycle: true } });
  const byId = new Map(rows.map((r) => [r.id, r]));
  const read = d.queue.map((q) => byId.get(q.id)!).filter((m) => m && m.readCycle != null && !before.has(m.id)).map((m) => ({ id: m.id, content: m.content, senderId: m.senderId }));
  let partial: { id: string; content: string; wordsRead: number } | null = null;
  if (fresh!.endedCycle == null) {
    let edge = 0;
    for (const q of d.queue) {
      if (fresh!.done < edge + q.words) {
        const into = Math.floor(fresh!.done - edge);
        const m = byId.get(q.id);
        if (m && into > 0) partial = { id: q.id, content: m.content.split(/\s+/).slice(0, into).join(' '), wordsRead: into };
        break;
      }
      edge += q.words;
    }
  }
  return { read, partial, actId: act.id };
}
