/**
 * PER-VIEWER FEED — perception build unit 9 (Mike 2026-10-08 ruling-feed-per-viewer;
 * 2026-10-09 Q6 "the terminal window is essentially just another way to present
 * the entire memory of an entity").
 *
 * Behind PERCEPTION_FEED (default OFF). The campaign's own Watcher and ADMIN keep
 * the truth record (lib/permissions seesTruthRecord). Anyone else in the campaign
 * (a Trailblazer) reads THEIR CHARACTER'S feed:
 *   - their character's noticed memory rows, each rendered by services/visible-form
 *     (renderViewerFeed) and laid out in the feed's existing payload shape
 *     (declaration narration / chat character rows), in time order;
 *   - their own lines (chat as their character, their own player actions) in full;
 *   - session markers (no diegetic text).
 * A line with no memory row does not appear — no trace row. The server builds the
 * whole response from the memory; truth text of an unperceived event never leaves.
 */
import 'server-only';
import { prisma } from '@/lib/db';
import { seesTruthRecord } from '@/lib/permissions';
import { perceptionFeedOn } from '@/lib/perception-feed';
import { entityToken, GAP } from '@/lib/perceived-text';
import { renderViewerFeed, VISIBLE_FORM_TUNING, type VisibleForm, type VisiblePiece, type VisibleRow, type VisibleEntity } from '@/services/visible-form';
import type { TerminalActor, TerminalEventType, TerminalPayload, PerceivedEntityRef } from '@/types/terminal';

export type FeedViewer =
  | { mode: 'truth' }
  | { mode: 'perceived'; userId: string; characterId: string | null };

/** Who reads what. Flag off → everyone reads the truth record exactly as before. */
export async function feedViewerFor(campaignId: string, user: { id: string; role: string }): Promise<FeedViewer> {
  if (!perceptionFeedOn()) return { mode: 'truth' };
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { gmUserId: true } });
  if (!campaign || seesTruthRecord(user.id, user.role, campaign)) return { mode: 'truth' };
  const ch = await prisma.character.findFirst({
    where: { campaignId, userId: user.id, entityType: 'PLAYER_CHARACTER' },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  return { mode: 'perceived', userId: user.id, characterId: ch?.id ?? null };
}

/** One feed row in the shape queryCampaignEvents returns (the client wraps it the same way). */
export interface FeedApiEvent {
  id: string;
  campaignId: string;
  sessionId: string | null;
  type: TerminalEventType;
  actor: TerminalActor;
  actorUserId: string;
  actorName: string;
  characterId: string | null;
  characterName: string | null;
  payload: TerminalPayload;
  createdAt: string;
}

// ── VisibleForm → the feed's payload shape (pure) ─────────────────────────

/** Pieces → payload text: {gap} and {@id|label} tokens inline. Pure. */
export function piecesToText(pieces: VisiblePiece[]): string {
  return pieces.map((p) => (p.kind === 'text' ? p.text : p.kind === 'gap' ? GAP : entityToken(p.entityId, p.text))).join('');
}

/** A character row's segments → the feed's markup (::action:: "speech" ((thought))). Pure. */
export function segmentsToMessage(row: Extract<VisibleRow, { type: 'character' }>): string {
  return row.segments.map((s) => {
    const t = piecesToText(s.pieces);
    if (s.kind === 'speech') return `"${t.replace(/["“”]/g, '\'')}"`;
    if (s.kind === 'thought') return `((${t.replace(/\)\)/g, ')')}))`;
    return `::${t.replace(/::/g, ':')}::`;
  }).join(' ');
}

/** The tooltip's view of an entity: label + known aspect NAMES (never a level). Pure. */
export function entityRef(e: VisibleEntity, viewerId: string): PerceivedEntityRef {
  const identity = e.known.find((k) => k.aspectKind === 'identity')?.fidelity ?? 0;
  return { id: e.id, kind: e.kind, label: e.label, known: e.known.map((k) => k.aspectKind), named: e.id === viewerId || identity >= VISIBLE_FORM_TUNING.nameAt };
}

/**
 * One perceived memory → feed rows. Narration → a declaration game_event whose
 * split is already made (narration + no speech), so feed-rows reads it as one
 * narration row; a character row → a chat row with the viewer's label as the
 * name. No account names ride along (actorName '' — voicedBy stays empty). Pure.
 */
export function formToFeedEvents(form: VisibleForm, meta: { campaignId: string; viewerId: string; at: Date; cycle?: number; sessionId: string | null }): FeedApiEvent[] {
  const perceived = { memoryId: form.memoryId, entities: form.entities.map((e) => entityRef(e, meta.viewerId)) };
  const cycle = typeof meta.cycle === 'number' ? { cycle: meta.cycle } : {};
  return form.rows.map((row, i): FeedApiEvent => {
    const base = { id: `pm-${form.memoryId}-${i}`, campaignId: meta.campaignId, sessionId: meta.sessionId, actorUserId: '', actorName: '', createdAt: new Date(meta.at.getTime() + i).toISOString() };
    if (row.type === 'narration') {
      const text = piecesToText(row.pieces);
      return { ...base, type: 'game_event', actor: 'gm', characterId: null, characterName: null, payload: { kind: 'game_event', eventType: 'declaration', description: text, narration: text, speech: [], ...cycle, perceived } };
    }
    return { ...base, type: 'chat', actor: 'system', characterId: row.speakerId, characterName: row.name, payload: { kind: 'chat', message: segmentsToMessage(row), ...cycle, perceived } };
  });
}

// ── The query ─────────────────────────────────────────────────────────────

export interface PerceivedFeedQuery {
  campaignId: string;
  viewer: Extract<FeedViewer, { mode: 'perceived' }>;
  types?: string[];
  sessionId?: string | null;
  after?: string;
  cursor?: string;
  limit?: number;
}

/** A memory row's canon refs (chain.truthRefs, else truthRef) — the same reading as visible-form. Pure. */
function refsOf(r: { truthRef: string | null; chain: string }): string[] {
  let refs: string[] = [];
  try { refs = ((JSON.parse(r.chain) as { truthRefs?: unknown }).truthRefs as string[] | undefined)?.filter((x) => typeof x === 'string') ?? []; } catch { refs = []; }
  return [...new Set(refs.length ? refs : r.truthRef ? [r.truthRef] : [])];
}

/** How far after the moment a memory row may be written (listening, the reach pass) — paging slack. */
const WRITE_LAG_MS = 10 * 60 * 1000;

/**
 * The Trailblazer's page: same contract as queryCampaignEvents (newest first,
 * `cursor` = strictly older than, `nextCursor` = more exists).
 */
export async function queryPerceivedFeed(q: PerceivedFeedQuery): Promise<{ events: FeedApiEvent[]; nextCursor: string | null; perceived: true }> {
  const { campaignId, viewer } = q;
  const limit = Math.min(q.limit || 50, 200);
  const cursor = q.cursor ? new Date(q.cursor) : null;
  const after = q.after ? new Date(q.after) : null;
  const inWindow = (d: Date) => (!cursor || d < cursor) && (!after || d > after);

  // Own lines + session markers: the viewer's in full.
  const own = await prisma.campaignEvent.findMany({
    where: {
      campaignId,
      ...(cursor || after ? { createdAt: { ...(cursor ? { lt: cursor } : {}), ...(after ? { gt: after } : {}) } } : {}),
      OR: [
        ...(viewer.characterId ? [{ characterId: viewer.characterId }] : []),
        { actorUserId: viewer.userId, actor: 'player' },
        { type: 'game_event', payload: { contains: '"eventType":"session_' } },
      ],
    },
    orderBy: { createdAt: 'desc' },
    take: limit + 1,
  });
  const ownRows: FeedApiEvent[] = own.map((row) => ({
    id: row.id, campaignId: row.campaignId, sessionId: row.sessionId,
    type: row.type as TerminalEventType, actor: row.actor as TerminalActor,
    actorUserId: row.actorUserId, actorName: row.actorName,
    characterId: row.characterId, characterName: row.characterName,
    payload: JSON.parse(row.payload) as TerminalPayload, createdAt: row.createdAt.toISOString(),
  }));

  // The character's memory of everything else.
  const memRows: FeedApiEvent[] = [];
  let memMore = false;
  const entity = viewer.characterId ? await prisma.dayaEntity.findUnique({ where: { characterId: viewer.characterId }, select: { id: true } }) : null;
  if (entity && viewer.characterId) {
    const take = limit * 2 + 1;
    const mems = await prisma.dayaMemoryEntry.findMany({
      where: {
        entityId: entity.id, noticed: true, truthRef: { not: null },
        ...(cursor || after ? { realTime: { ...(cursor ? { lt: new Date(cursor.getTime() + WRITE_LAG_MS) } : {}), ...(after ? { gt: after } : {}) } } : {}),
      },
      orderBy: { realTime: 'desc' },
      take,
      select: { id: true, truthRef: true, chain: true, realTime: true },
    });
    memMore = mems.length === take;
    const allRefs = [...new Set(mems.flatMap(refsOf))];
    const canon = allRefs.length ? await prisma.canonEvent.findMany({ where: { id: { in: allRefs }, campaignId }, select: { id: true, kind: true, actorId: true, createdAt: true, cycle: true } }) : [];
    const byId = new Map(canon.map((c) => [c.id, c]));
    const seen = new Set<string>();
    const picked: Array<{ id: string; at: Date; cycle?: number }> = [];
    for (const m of mems) {
      const evs = refsOf(m).map((id) => byId.get(id)).filter((e): e is NonNullable<typeof e> => !!e);
      if (!evs.length) continue;
      // The viewer's own line is already in full (its chat row); its memory of saying it is not a second line.
      if (evs.every((e) => e.kind === 'dialogue' && e.actorId === viewer.characterId)) continue;
      const key = evs.map((e) => e.id).sort().join(',');
      if (seen.has(key)) continue; // two memories of one moment (a witness row + a listening stretch) = one line
      seen.add(key);
      const at = evs.reduce((a, e) => (e.createdAt < a ? e.createdAt : a), evs[0].createdAt);
      if (!inWindow(at)) continue;
      picked.push({ id: m.id, at, cycle: evs[0].cycle });
    }
    const forms = await renderViewerFeed(campaignId, viewer.characterId, picked.map((p) => p.id));
    const sessions = await prisma.gameSession.findMany({ where: { campaignId }, select: { id: true, startedAt: true, endedAt: true }, orderBy: { startedAt: 'asc' } });
    const sessionAt = (d: Date) => sessions.find((s) => s.startedAt <= d && (!s.endedAt || d <= s.endedAt))?.id ?? null;
    for (const p of picked) {
      const form = forms.get(p.id);
      if (!form || !form.rows.length) continue;
      memRows.push(...formToFeedEvents(form, { campaignId, viewerId: viewer.characterId, at: p.at, cycle: p.cycle, sessionId: sessionAt(p.at) }));
    }
  }

  let merged = [...ownRows, ...memRows];
  if (q.types?.length) merged = merged.filter((e) => q.types!.includes(e.type));
  if (q.sessionId !== undefined) merged = merged.filter((e) => e.sessionId === q.sessionId);
  merged.sort((a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0));
  const hasMore = merged.length > limit || own.length > limit || memMore;
  const events = merged.slice(0, limit);
  return { events, nextCursor: hasMore && events.length ? events[events.length - 1].createdAt : null, perceived: true };
}
