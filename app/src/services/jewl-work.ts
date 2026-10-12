/**
 * JEWL's work screen payload (Mike 2026-10-12) — every open work session in a
 * campaign, mapped through its session-type adapter (lib/jewl-work.ts), plus
 * the campaign's Needs-you items and JEWL's recent log. Campaign GM / ADMIN
 * only: goals, notes and prods are Watcher-side content.
 *
 * Genesis sessions reuse the genesis progress derivation unchanged
 * (character-genesis-progress#loadGenesisFacts → deriveGenesisProgress), so
 * the genesis tab is the genesis screen. A genesis session that finished but
 * still has drafts awaiting the Watcher stays listed until they are submitted
 * (as the character page's screen does).
 */
import 'server-only';
import { prisma } from '@/lib/db';
import { requireCampaignGM } from './campaign-access';
import { parseProgress } from './daya-work-session';
import {
  deriveGenesisProgress, loadGenesisFacts, parseGenesisGoal, toGmStep,
  GENESIS_REPORT_EVENT, type ForgedRow,
} from './character-genesis-progress';
import {
  classifySessionType, defaultSessionView, draftingSessionView, genesisSessionView,
  goalTitle, mergeNeedsYou, orderSessions, reconciliationSessionView,
  type JewlWorkPayload, type NeedsYouItem, type WorkSessionFacts, type WorkSessionView,
} from '@/lib/jewl-work';

type SessionRow = {
  id: string; campaignId: string; goal: string; status: string; cycleCount: number;
  blockedReason: string | null; startedAt: Date; endedAt: Date | null; lastCycleAt: Date | null; progress: string;
};

/** How far back a finished genesis with unsubmitted drafts still shows. */
const DONE_GENESIS_WINDOW_MS = 3 * 24 * 3600 * 1000;

function facts(s: SessionRow): WorkSessionFacts {
  return {
    id: s.id, goal: s.goal, status: s.status, cycleCount: s.cycleCount, blockedReason: s.blockedReason,
    startedAt: s.startedAt, endedAt: s.endedAt, lastCycleAt: s.lastCycleAt, notes: parseProgress(s.progress),
  };
}

const windowOf = (s: SessionRow) => ({ gte: s.startedAt, ...(s.endedAt ? { lte: s.endedAt } : {}) });

let jewlUserIdCache: string | null = null;
async function jewlUserId(): Promise<string | null> {
  if (jewlUserIdCache) return jewlUserIdCache;
  try {
    const { getJewlGodHead } = await import('@/ai/copilot/jewl-identity');
    jewlUserIdCache = (await getJewlGodHead()).characterUserId;
  } catch { return null; }
  return jewlUserIdCache;
}

async function jewlDrafts(s: SessionRow): Promise<ForgedRow[]> {
  const uid = await jewlUserId();
  if (!uid) return [];
  return prisma.forgeItem.findMany({
    where: { campaignId: s.campaignId, createdBy: uid, createdAt: windowOf(s) },
    select: { id: true, type: true, status: true, name: true, data: true, karmicValue: true, createdAt: true, relationshipTags: true },
    orderBy: { createdAt: 'asc' },
  });
}

async function genesisLog(s: SessionRow, characterId: string): Promise<string[]> {
  const rows = await prisma.campaignEvent.findMany({
    where: { campaignId: s.campaignId, type: 'game_event', characterId, createdAt: windowOf(s), payload: { contains: GENESIS_REPORT_EVENT } },
    orderBy: { createdAt: 'desc' },
    take: 6,
    select: { payload: true },
  });
  return rows.reverse().map(r => {
    try {
      const p = JSON.parse(r.payload) as { description?: string };
      return `report · ${(p.description ?? '').split('\n')[0]}`.trim();
    } catch { return 'report'; }
  });
}

async function toView(s: SessionRow): Promise<WorkSessionView | null> {
  const type = classifySessionType(s.goal);
  if (type === 'genesis') {
    const parsed = parseGenesisGoal(s.goal);
    if (!parsed) return defaultSessionView(facts(s), { toolCalls: 0, itemsWritten: 0 });
    const progress = deriveGenesisProgress(await loadGenesisFacts(parsed.characterId, s.campaignId, s.id));
    return genesisSessionView({
      id: s.id, characterId: parsed.characterId, name: parsed.name, progress,
      log: await genesisLog(s, parsed.characterId),
    });
  }
  if (type === 'drafting') {
    const forged = await jewlDrafts(s);
    const pending = forged.filter(f => f.status === 'draft').length;
    const steps = forged.map(toGmStep).filter((g): g is NonNullable<typeof g> => g !== null);
    return draftingSessionView(facts(s), { drafts: forged.length, approved: forged.length - pending, pending }, steps);
  }
  if (type === 'reconciliation') {
    const rows = await prisma.reconciliation.findMany({
      where: { campaignId: s.campaignId, createdAt: windowOf(s) }, select: { status: true },
    });
    const conflicts = rows.filter(r => r.status === 'PENDING').length;
    return reconciliationSessionView(facts(s), { facts: rows.length, conflicts, resolved: rows.length - conflicts });
  }
  const [messages, forged] = await Promise.all([
    prisma.copilotMessage.findMany({
      where: { campaignId: s.campaignId, role: 'assistant', createdAt: windowOf(s) },
      select: { actions: true }, take: 300,
    }),
    jewlDrafts(s),
  ]);
  let toolCalls = 0;
  for (const m of messages) {
    try {
      const a = JSON.parse(m.actions ?? 'null') as { toolCalls?: unknown[] } | null;
      if (Array.isArray(a?.toolCalls)) toolCalls += a.toolCalls.length;
    } catch { /* malformed — skip */ }
  }
  return defaultSessionView(facts(s), { toolCalls, itemsWritten: forged.length });
}

/** Pending reconciliations = JEWL's "mistake, or somewhere new?" — the GM's call. */
async function campaignNeedsYou(campaignId: string): Promise<NeedsYouItem[]> {
  const rows = await prisma.reconciliation.findMany({
    where: { campaignId, status: 'PENDING' },
    orderBy: { createdAt: 'desc' },
    take: 20,
    select: { id: true, question: true, summary: true },
  });
  return rows.map(r => ({ id: r.id, kind: 'reconciliation' as const, sessionId: null, title: r.question || 'Mistake, or somewhere new?', detail: r.summary || null }));
}

/** JEWL's last ~8 log lines across his most recent sessions, oldest first. */
function recentLogFrom(rows: SessionRow[], views: WorkSessionView[]): string[] {
  const out: string[] = [];
  for (const s of rows.slice(0, 4)) {
    const v = views.find(x => x.id === s.id);
    const lines = v ? v.log : parseProgress(s.progress).slice(-4);
    const who = goalTitle(s.goal, 28);
    const tail = s.status === 'done' ? ['session closed'] : s.status === 'cancelled' ? ['session cancelled'] : [];
    out.unshift(...[...lines.slice(-4), ...tail].map(l => `${who} · ${l.length > 120 ? `${l.slice(0, 120)}…` : l}`));
  }
  return out.slice(-8);
}

export async function getJewlWork(opts: {
  campaignId: string;
  user: { id: string; role: string };
}): Promise<JewlWorkPayload> {
  await requireCampaignGM(opts.campaignId, opts.user);
  const rows = await prisma.dayaWorkSession.findMany({
    where: { campaignId: opts.campaignId },
    orderBy: { startedAt: 'desc' },
    take: 12,
    select: {
      id: true, campaignId: true, goal: true, status: true, cycleCount: true, blockedReason: true,
      startedAt: true, endedAt: true, lastCycleAt: true, progress: true,
    },
  }) as SessionRow[];

  const now = Date.now();
  const candidates = rows.filter(s => s.status === 'active' || s.status === 'blocked'
    || (s.status === 'done' && classifySessionType(s.goal) === 'genesis'
      && now - (s.endedAt?.getTime() ?? 0) < DONE_GENESIS_WINDOW_MS));

  const built = (await Promise.all(candidates.map(toView))).filter((v): v is WorkSessionView => v !== null)
    // A finished genesis stays only while drafts still need the Watcher.
    .filter(v => v.state !== 'done' || v.needsYou.length > 0);
  const sessions = orderSessions(built);
  const extra = await campaignNeedsYou(opts.campaignId);
  return {
    sessions,
    needsYou: mergeNeedsYou(sessions, extra),
    recentLog: recentLogFrom(rows, sessions),
    cycling: sessions.some(s => s.state === 'running'),
  };
}
