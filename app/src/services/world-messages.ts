/**
 * A MESSAGE IS A RECORD (Michael 2026-11-07: "a text message shouldn't just be a text message and from who — it should have a
 * timestamp and everything else a normal text message would have… GROWTH is essentially just massive spreadsheets"; and "this isn't
 * just texts but should be flexible enough to handle any sort of messaging system. Spells, etc.").
 *
 * Every message by any medium lives in `WorldMessage`, one row each, every moment stamped (sent, delivered, noticed, read, settled)
 * and never overwritten. A thing's live thread is DERIVED from those rows: `withMessages` lays them onto each thing's data as the same
 * `signals` entries the rest of the engine already reads (item-signal.ts), so the readers stay pure and the record stays one.
 *
 * How a person reads (Michael, same day: "if someone sends five text messages rapidly… when I open the text messages I'm going to read
 * all of those, in chronological order"): opening a conversation reads EVERY unread message in it, oldest first. The notice shows who
 * and how many, never the words. Being together in one place moves an open exchange on (met in person).
 *
 * Messages that land in a MIND (recipientThingId null: a thought, a sending spell with no focus) are recorded the same way; nothing
 * sends them yet.
 */
import { prisma } from '@/lib/db';
import type { ItemSignal } from './item-signal';
import { secondsToCycles, type CalendarSpec } from '@/types/time';
import { cyclesToSeconds, spanInWords } from './table-clock';

type Ts = { unitsPerMetaCycle: number; calendar: CalendarSpec | null };

/** How long a read, unanswered message keeps waiting on the reader's mind (world time). */
export const READ_WAIT_SECONDS = 7200;

export interface MessageRow {
  id: string;
  medium: string;
  senderId: string | null;
  senderThingId: string | null;
  recipientId: string;
  recipientThingId: string | null;
  content: string;
  notice: string;
  sentCycle: number;
  deliveredCycle: number | null;
  readCycle: number | null;
  settledCycle: number | null;
}

/**
 * One row as a live thread entry at `nowCycle`, or null when it is not live (not delivered yet, settled, or read and waited out).
 * Unread → `received` (waits with no end of its own); read → `read` until the wait runs out. Pure.
 */
export function messageAsSignal(m: MessageRow, nowCycle: number, ts: Ts, opts?: { fromName?: string | null; receiptsOff?: boolean }): ItemSignal | null {
  if (m.deliveredCycle === null || nowCycle < m.deliveredCycle) return null;
  if (m.settledCycle !== null && m.settledCycle <= nowCycle) return null;
  const read = m.readCycle !== null && m.readCycle <= nowCycle;
  const until = read ? m.readCycle! + secondsToCycles(READ_WAIT_SECONDS, ts) : Number.POSITIVE_INFINITY;
  if (nowCycle >= until) return null;
  return {
    text: m.notice || 'A message comes in.',
    since: m.deliveredCycle,
    until,
    ...(m.senderId ? { by: m.senderId } : {}),
    kind: 'text',
    state: read ? 'read' : 'received',
    words: m.content,
    ...(m.senderThingId ? { fromItem: m.senderThingId } : {}),
    messageId: m.id,
    medium: m.medium,
    ago: spanInWords(cyclesToSeconds(Math.max(0, nowCycle - m.deliveredCycle), ts)),
    ...(opts?.fromName ? { fromName: opts.fromName } : {}),
    ...(opts?.receiptsOff ? { receiptsOff: true } : {}),
  };
}

const parse = (raw: unknown): Record<string, unknown> => {
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) return { ...(raw as Record<string, unknown>) };
  if (typeof raw !== 'string' || !raw) return {};
  try { const d = JSON.parse(raw); return d && typeof d === 'object' && !Array.isArray(d) ? d : {}; } catch { return {}; }
};

/** A thing tells the sender it was read unless its data says `readReceipts: false` (a setting of the device, on by default). */
export function sendsReadReceipts(data: unknown): boolean {
  return parse(data).readReceipts !== false;
}

/** True for a legacy message entry stored on a thing's own data (before the record): a text, received or read. */
function isLegacyMessage(r: unknown): boolean {
  const x = r as Record<string, unknown> | null;
  return !!x && (x.kind === 'text' || x.state === 'received' || x.state === 'read');
}

/**
 * EXCHANGES MET IN PERSON (handoff 11-06, open item 1: "read and not written back" stayed going forever and steered Violet into hearing
 * his laugh through a phone). When the sender and the recipient of a read, open message stand in the same place, the exchange has
 * moved on: it settles as `met`. Unread ones stay unread (nobody read them for her). Never throws.
 */
export async function settleMetInPerson(campaignId: string, nowCycle: number): Promise<number> {
  try {
    const open = await prisma.worldMessage.findMany({ where: { campaignId, settledCycle: null, readCycle: { not: null }, senderId: { not: null } }, select: { id: true, senderId: true, recipientId: true } });
    if (!open.length) return 0;
    const ids = [...new Set(open.flatMap((m) => [m.senderId!, m.recipientId]))];
    const edges = await prisma.entityRelationship.findMany({ where: { campaignId, relationshipType: 'located_at', sourceType: 'CHARACTER', sourceId: { in: ids } }, select: { sourceId: true, targetId: true } });
    const at = new Map<string, Set<string>>();
    for (const e of edges) at.set(e.sourceId, (at.get(e.sourceId) ?? new Set<string>()).add(e.targetId));
    const together = (a: string, b: string) => [...(at.get(a) ?? [])].some((p) => at.get(b)?.has(p));
    const met = open.filter((m) => together(m.senderId!, m.recipientId)).map((m) => m.id);
    if (!met.length) return 0;
    await prisma.worldMessage.updateMany({ where: { id: { in: met } }, data: { settledCycle: nowCycle, settledReason: 'met' } });
    console.log(`[world-messages] ${met.length} read message(s) settled: sender and reader are in the same place`);
    return met.length;
  } catch (err) {
    console.warn('[world-messages] met-in-person check failed (non-fatal):', err instanceof Error ? err.message : err);
    return 0;
  }
}

/**
 * The things with their messages laid on. Each item's data comes back PARSED, any legacy message entries on its own data dropped,
 * and the live rows from `WorldMessage` added to `signals`. Calls and other signals on the item's data stay as they are. Every
 * reader of a thing's thread loads through here. Never throws (a failure leaves the items' own data, parsed).
 */
export async function withMessages<T extends { id: string; data: unknown }>(campaignId: string, items: T[], nowCycle?: number): Promise<Array<Omit<T, 'data'> & { data: Record<string, unknown> }>> {
  const base = items.map((it) => {
    const d = parse(it.data);
    const raw: unknown[] = Array.isArray(d.signals) ? d.signals : d.signal ? [d.signal] : [];
    const own = raw.filter((r) => !isLegacyMessage(r));
    delete d.signal;
    if (own.length) d.signals = own; else delete d.signals;
    return { ...it, data: d };
  });
  if (!items.length) return base;
  try {
    const cycle = nowCycle ?? (await prisma.campaign.findUnique({ where: { id: campaignId }, select: { currentCycle: true } }))?.currentCycle ?? 0;
    await settleMetInPerson(campaignId, cycle);
    const rows = await prisma.worldMessage.findMany({ where: { campaignId, recipientThingId: { in: items.map((i) => i.id) }, settledCycle: null }, orderBy: { sentCycle: 'asc' } });
    if (!rows.length) return base;
    const { ensureDefaultTimescale } = await import('./time');
    const ts = (await ensureDefaultTimescale(campaignId)) as Ts;
    const senders = [...new Set(rows.map((r) => r.senderId).filter((x): x is string => !!x))];
    const names = new Map((await prisma.character.findMany({ where: { id: { in: senders } }, select: { id: true, name: true } })).map((c) => [c.id, c.name.split(/\s+/)[0]]));
    return base.map((it) => {
      const mine = rows.filter((r) => r.recipientThingId === it.id);
      if (!mine.length) return it;
      // Read receipts belong to the READER's thing: Violet's phone decides whether Kristopher's says "read".
      const receiptsOff = !sendsReadReceipts(it.data);
      const live = mine.map((r) => messageAsSignal(r, cycle, ts, { fromName: r.senderId ? names.get(r.senderId) ?? null : null, receiptsOff })).filter((s): s is ItemSignal => !!s);
      if (!live.length) return it;
      const signals = [...((it.data.signals as unknown[]) ?? []), ...live];
      return { ...it, data: { ...it.data, signals } };
    });
  } catch (err) {
    console.warn('[world-messages] messages not laid on (non-fatal):', err instanceof Error ? err.message : err);
    return base;
  }
}

/** Record a message as sent and delivered now (instant media). Returns the row id. */
export async function recordMessage(input: {
  campaignId: string; medium: string; senderId: string | null; senderThingId?: string | null; recipientId: string; recipientThingId: string | null;
  content: string; contentKind?: string; notice: string; cycle: number; deliveredCycle?: number | null; replyToId?: string | null; durationSeconds?: number; data?: Record<string, unknown>;
}): Promise<string> {
  const row = await prisma.worldMessage.create({
    data: {
      campaignId: input.campaignId, medium: input.medium, senderId: input.senderId, senderThingId: input.senderThingId ?? null,
      recipientId: input.recipientId, recipientThingId: input.recipientThingId, content: input.content, contentKind: input.contentKind ?? 'words',
      notice: input.notice, sentCycle: input.cycle, deliveredCycle: input.deliveredCycle === undefined ? input.cycle : input.deliveredCycle,
      ...(input.replyToId ? { replyToId: input.replyToId } : {}), ...(input.durationSeconds ? { durationSeconds: input.durationSeconds } : {}),
      data: JSON.stringify(input.data ?? {}),
    },
  });
  return row.id;
}

/**
 * OPENING A CONVERSATION (Michael 2026-11-07): every unread message on the thing from that sender is read, oldest first, in one act.
 * With no sender named, the conversation is the one holding the newest unread message. Returns what was read, oldest first.
 */
export async function readConversation(campaignId: string, thingId: string, cycle: number, senderId?: string | null): Promise<Array<{ id: string; content: string; senderId: string | null }>> {
  const unread = await prisma.worldMessage.findMany({
    where: { campaignId, recipientThingId: thingId, readCycle: null, settledCycle: null, deliveredCycle: { lte: cycle } },
    orderBy: { sentCycle: 'asc' },
    select: { id: true, content: true, senderId: true },
  });
  if (!unread.length) return [];
  const who = senderId !== undefined ? senderId : unread[unread.length - 1].senderId;
  const convo = unread.filter((m) => m.senderId === who);
  await prisma.worldMessage.updateMany({ where: { id: { in: convo.map((m) => m.id) } }, data: { readCycle: cycle, noticedCycle: cycle } });
  return convo;
}

/** The newest read, open message from `otherId` to `replierId` — what a reply answers. */
export async function openMessageFrom(campaignId: string, replierId: string, otherId: string): Promise<string | null> {
  const m = await prisma.worldMessage.findFirst({ where: { campaignId, recipientId: replierId, senderId: otherId, readCycle: { not: null }, settledCycle: null }, orderBy: { sentCycle: 'desc' }, select: { id: true } });
  return m?.id ?? null;
}

/** A REPLY (finding 51/84): every READ, open message from `otherId` to `replierId` settles as answered. Unread ones stay. */
export async function settleReplied(campaignId: string, replierId: string, otherId: string, cycle: number): Promise<number> {
  const res = await prisma.worldMessage.updateMany({
    where: { campaignId, recipientId: replierId, senderId: otherId, readCycle: { not: null }, settledCycle: null },
    data: { settledCycle: cycle, settledReason: 'replied' },
  });
  return res.count;
}
