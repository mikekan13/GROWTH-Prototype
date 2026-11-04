/**
 * What a being has already said inside its own head, from the record — the memory the voice filter and the replay guard
 * read (HW8 run 6). Two sources: its `being_thought` rows (the thought, and the card the builder made of it) and the
 * monologues kept in the declaration payloads (a voiced being's pre-listen lives there, not in a thought row).
 * Newest first. Never throws: unreadable = nothing to compare against.
 */
import 'server-only';
import { prisma } from '@/lib/db';

/** Bound on what counts as recent (2026-11-03, session 2 live: test-replay rows and the last session's thoughts were handed over as the present). */
export interface VoiceBound { since?: Date; sessionId?: string | null }

/** The where-fragment of a bound: a given sessionId excludes null/other-session rows; `since` excludes older rows. */
function boundWhere(opts?: VoiceBound): Record<string, unknown> {
  const w: Record<string, unknown> = {};
  if (opts?.sessionId) w.sessionId = opts.sessionId;
  if (opts?.since) w.createdAt = { gte: opts.since };
  return w;
}

const LIVE_TTL_MS = 30_000;
const liveCache = new Map<string, { at: number; v: { id: string; startedAt: Date } | null }>();

/** The campaign's live session (no end), cached 30 s. Never throws: unreadable = null. */
export async function liveSessionOf(campaignId: string): Promise<{ id: string; startedAt: Date } | null> {
  const hit = liveCache.get(campaignId);
  if (hit && Date.now() - hit.at < LIVE_TTL_MS) return hit.v;
  try {
    const row = await prisma.gameSession.findFirst({ where: { campaignId, endedAt: null }, orderBy: { number: 'desc' }, select: { id: true, startedAt: true } });
    const v = row ? { id: row.id, startedAt: row.startedAt } : null;
    liveCache.set(campaignId, { at: Date.now(), v });
    return v;
  } catch { return null; }
}

/** Forget the cached live session (a session started or ended). */
export function forgetLiveSession(campaignId?: string): void {
  if (campaignId) liveCache.delete(campaignId); else liveCache.clear();
}

/** The bound for a being's listen beat: the live session's rows only; with no live session, the last hour (test harness runs see their own rows). */
export async function liveVoiceBound(campaignId: string): Promise<VoiceBound> {
  const live = await liveSessionOf(campaignId);
  if (live) return { sessionId: live.id, since: live.startedAt };
  return { since: new Date(Date.now() - 3_600_000) };
}

/** The being's last `n` recorded thoughts on this campaign, newest first, then the last three declaration monologues. */
export async function recentVoiceOf(campaignId: string, characterId: string, n = 3, opts?: VoiceBound): Promise<string[]> {
  try {
    const bound = boundWhere(opts);
    const rows = await prisma.campaignEvent.findMany({ where: { campaignId, type: 'being_thought', characterId, ...bound }, orderBy: { createdAt: 'desc' }, take: n, select: { payload: true } });
    const out = rows.map((r) => { try { return (JSON.parse(r.payload) as { thought?: string }).thought ?? ''; } catch { return ''; } }).filter(Boolean);
    // THE REPLAY, second source (HW8 run 5): a voiced being's pre-listen monologue lives in the declaration payload
    // (`monologues: [{actorId, text}]`), not in a being_thought row — the last 3 declarations count too.
    try {
      const decls = await prisma.campaignEvent.findMany({ where: { campaignId, type: 'game_event', payload: { contains: '"monologues"' }, ...bound }, orderBy: { createdAt: 'desc' }, take: 3, select: { payload: true } });
      for (const d of decls ?? []) {
        try {
          const ms = (JSON.parse(d.payload) as { monologues?: Array<{ actorId?: string; text?: string }> }).monologues ?? [];
          for (const m of ms) if (m.actorId === characterId && m.text?.trim()) out.push(m.text.trim());
        } catch { /* skip */ }
      }
    } catch { /* non-fatal */ }
    return out;
  } catch { return []; }
}

/**
 * The prose a being's last `n` CARDS put on the page — the scene line and the thought / action segments the builder made
 * (HW8 run 6: the standing-beat card repeated "The wood doesn't vibrate; it just *is*." from the card before it, a sentence
 * the raw thought comparison missed because the builder had re-set it). Newest first. Never throws.
 */
export async function recentCardTextsOf(campaignId: string, characterId: string, n = 3, opts?: VoiceBound): Promise<string[]> {
  try {
    const rows = await prisma.campaignEvent.findMany({ where: { campaignId, type: 'being_thought', characterId, ...boundWhere(opts) }, orderBy: { createdAt: 'desc' }, take: n, select: { payload: true } });
    const out: string[] = [];
    for (const r of rows ?? []) {
      try {
        const p = JSON.parse(r.payload) as { scene?: string; segments?: Array<{ kind?: string; text?: string }> };
        if (p.scene) out.push(p.scene);
        for (const s of p.segments ?? []) if (s.text && s.kind !== 'speech') out.push(s.text);
      } catch { /* skip */ }
    }
    return out;
  } catch { return []; }
}

/**
 * The being's last `n` SPOKEN lines (chat rows it posted), newest first - the answer replay's memory (HW8 run 7 #7: "I'm fine, just...
 * checking the lock." twice verbatim). Acts (starred rows) are not speech. Never throws.
 */
export async function recentSpokenOf(campaignId: string, characterId: string, n = 3): Promise<string[]> {
  try {
    const rows = await prisma.campaignEvent.findMany({ where: { campaignId, type: 'chat', characterId }, orderBy: { createdAt: 'desc' }, take: n * 3, select: { payload: true } });
    const out: string[] = [];
    for (const r of rows ?? []) {
      try {
        const m = (JSON.parse(r.payload) as { message?: string }).message?.trim();
        if (m && !/^\*.*\*$/.test(m)) out.push(m);
      } catch { /* skip */ }
      if (out.length >= n) break;
    }
    return out;
  } catch { return []; }
}

/**
 * The memories that WOKE in the being's last `n` cards (payload.pieces.wakes), newest first — Day 6 (2026-11-04, finding 23):
 * Rosemary on the porch steps woke in six of Violet's seven cards. A memory that woke a beat or two ago is a recent thought,
 * not a wake. Never throws.
 */
export async function recentWakesOf(campaignId: string, characterId: string, n = 2, opts?: VoiceBound): Promise<string[]> {
  try {
    const rows = await prisma.campaignEvent.findMany({ where: { campaignId, type: 'being_thought', characterId, ...boundWhere(opts) }, orderBy: { createdAt: 'desc' }, take: n, select: { payload: true } });
    const out: string[] = [];
    for (const r of rows ?? []) {
      try {
        const p = JSON.parse(r.payload) as { pieces?: { wakes?: Array<{ text?: string }> } };
        for (const w of p.pieces?.wakes ?? []) if (w.text) out.push(w.text.replace(/^[^:]{1,40}:\s*/, ''));
      } catch { /* skip */ }
    }
    return out;
  } catch { return []; }
}
