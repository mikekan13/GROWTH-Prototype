/**
 * JEWL's WORK SCREEN model (Mike 2026-10-12: "The loading screen for character
 * creation was beautiful… implement that loading screen into JEWL completely").
 *
 * Pure, client-safe. Every open DayaWorkSession becomes one WorkSessionView
 * through a SESSION-TYPE ADAPTER — genesis keeps its real stage ladder and
 * counts (services/character-genesis-progress.ts); the other types get a
 * derived ladder and their own three pillar counters:
 *
 *   genesis        BODY blocks      · SPIRIT traits    · SOUL memories
 *   drafting       BODY drafts      · SPIRIT approved  · SOUL pending
 *   reconciliation BODY facts       · SPIRIT conflicts · SOUL resolved
 *   default        BODY cycles      · SPIRIT tool calls· SOUL items written
 *
 * The Needs-you list gathers every GM-blocking item a session exposes (open
 * prods, drafts awaiting submit, a question, a stall) plus campaign-level ones
 * (pending reconciliations). The status line + badge in the campaign chrome
 * read the same payload.
 */
import type { GenesisProgress, GenesisGmStep } from '@/services/character-genesis-progress';

export type WorkSessionType = 'genesis' | 'drafting' | 'reconciliation' | 'default';
export type PillarKey = 'body' | 'spirit' | 'soul';

export interface WorkPillar { key: PillarKey; label: 'BODY' | 'SPIRIT' | 'SOUL'; count: number; sub: string; fill: number }
export interface WorkStage { key: string; label: string; status: 'done' | 'current' | 'pending' }

export type NeedsYouKind = 'prod' | 'draft' | 'question' | 'stalled' | 'reconciliation' | 'portrait';
export interface NeedsYouItem {
  id: string;
  kind: NeedsYouKind;
  /** The session it belongs to; null = campaign-level (e.g. a reconciliation). */
  sessionId: string | null;
  title: string;
  detail?: string | null;
  /** 'portrait' items: the character whose Appearance ↗ finishes it. */
  characterId?: string;
}

export interface WorkSessionView {
  id: string;
  type: WorkSessionType;
  /** Short human title — never carries entity ids. */
  title: string;
  state: 'running' | 'waiting' | 'done' | 'error';
  stages: WorkStage[];
  current: string | null;
  step: number;
  total: number;
  pillars: WorkPillar[];
  cycles: number;
  needsYou: NeedsYouItem[];
  /** Recent log lines for this session, oldest first. */
  log: string[];
  /** JEWL's own blocked reason (non-genesis sessions; GM-only payload). */
  blockedReason: string | null;
  startedAt: string | null;
  endedAt: string | null;
  lastCycleAt: string | null;
  /** Genesis sessions: the full progress the genesis screen renders. */
  genesis?: { characterId: string; name: string; progress: GenesisProgress };
  /** Drafts awaiting the Watcher (non-genesis sessions; genesis has its own). */
  gmSteps: GenesisGmStep[];
}

export interface JewlWorkPayload {
  sessions: WorkSessionView[];
  /** Every Needs-you item across the campaign (sessions + campaign-level). */
  needsYou: NeedsYouItem[];
  /** The last ~8 lines JEWL logged across his recent work, oldest first. */
  recentLog: string[];
  /** True while any session is actively cycling. */
  cycling: boolean;
}

// ── Classification ───────────────────────────────────────────────────────

export function isGenesisGoalText(goal: string): boolean {
  return goal.startsWith('Character genesis');
}

export function classifySessionType(goal: string): WorkSessionType {
  if (isGenesisGoalText(goal)) return 'genesis';
  if (/reconcil/i.test(goal)) return 'reconciliation';
  if (/\b(draft|drafts|drafting|forge|blueprint)/i.test(goal)) return 'drafting';
  return 'default';
}

export const TYPE_TITLE_KEY: Record<WorkSessionType, string> = {
  genesis: '// GENESIS',
  drafting: '// DRAFTING',
  reconciliation: '// RECONCILIATION',
  default: '// WORK',
};

/** Goals carry entity ids for dedup (`Violet [cms60...]`) — not for eyes. */
export function goalTitle(goal: string, max = 72): string {
  const clean = goal.replace(/\s*\[[a-z0-9]+\]/gi, '').trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

// ── Genesis adapter ──────────────────────────────────────────────────────

const GENESIS_ORDER = ['open', 'prodding', 'expansion', 'ledger', 'mechanics', 'sheet', 'born'] as const;

/** Pillar fill 0..1 — Soul (mind/memory) fills with the person and the
 *  ledger, Spirit with the traits forged, Body with the blocks and sheet. */
export function pillarFills(p: GenesisProgress | null): { body: number; spirit: number; soul: number } {
  if (!p || p.state === 'none') return { body: 0, spirit: 0, soul: 0 };
  if (p.state === 'done') return { body: 1, spirit: 1, soul: 1 };
  const at = Math.max(0, GENESIS_ORDER.indexOf((p.current ?? 'open') as typeof GENESIS_ORDER[number]));
  const c = p.counts;
  const soul = at <= 2 ? 0.12 : Math.min(1, 0.3 + 0.7 * Math.min(1, c.memories / 40));
  const spirit = at < 4 ? 0.04 : Math.min(1, 0.25 + 0.6 * Math.min(1, c.traitsForged / 6) + (at >= 5 ? 0.15 : 0));
  const body = at < 4 ? 0.04 : Math.min(1, 0.2 + 0.5 * Math.min(1, c.blocksForged / 4) + (at >= 5 ? 0.2 : 0));
  return { body, spirit, soul };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** The three genesis pillars exactly as the genesis screen labels them. */
export function genesisPillars(p: GenesisProgress | null): WorkPillar[] {
  const f = pillarFills(p);
  const c = p?.counts;
  return [
    { key: 'body', label: 'BODY', count: c?.blocksForged ?? 0, fill: f.body, sub: c ? plural(c.blocksForged, 'block', 'blocks') : '—' },
    { key: 'spirit', label: 'SPIRIT', count: c?.traitsForged ?? 0, fill: f.spirit, sub: c ? plural(c.traitsForged, 'trait', 'traits') : '—' },
    { key: 'soul', label: 'SOUL', count: c?.memories ?? 0, fill: f.soul, sub: c ? `${c.memories} memor${c.memories === 1 ? 'y' : 'ies'}` : '—' },
  ];
}

/** BORN ≠ DONE (2026-10-12): born, but the official portrait is unfinished —
 *  the Portrait step. id = the character id so session + campaign copies dedupe. */
export function portraitNeedsYou(characterId: string, name: string, sessionId: string | null): NeedsYouItem {
  return {
    id: characterId, kind: 'portrait', sessionId, characterId,
    title: `Portrait · ${name}`,
    detail: 'Born — awaiting image. Finish the official portrait in Appearance ↗.',
  };
}

/** True when a finished genesis still waits on its portrait. */
export function genesisAwaitingImage(p: GenesisProgress | null | undefined): boolean {
  return !!p && p.state === 'done' && !!p.completion && p.completion.image !== 'done';
}

export function genesisNeedsYou(sessionId: string, name: string, p: GenesisProgress, characterId?: string): NeedsYouItem[] {
  const out: NeedsYouItem[] = [];
  for (const prod of p.prods ?? []) {
    if (prod.status === 'OPEN') out.push({ id: prod.id, kind: 'prod', sessionId, title: `JEWL asks about ${name}`, detail: prod.question });
  }
  for (const s of p.gmSteps ?? []) {
    out.push({ id: s.id, kind: 'draft', sessionId, title: `Submit ${s.type} · ${s.name}`, detail: s.purpose });
  }
  if (p.state === 'waiting' && p.wait === 'question') out.push({ id: `${sessionId}:q`, kind: 'question', sessionId, title: `JEWL needs a word about ${name}`, detail: 'Answer him in the chat.' });
  if (p.state === 'waiting' && p.wait === 'stalled') out.push({ id: `${sessionId}:stall`, kind: 'stalled', sessionId, title: `${name}'s genesis has gone quiet`, detail: 'Tell JEWL to continue.' });
  if (characterId && genesisAwaitingImage(p)) out.push(portraitNeedsYou(characterId, name, sessionId));
  return out;
}

export function genesisSessionView(opts: {
  id: string;
  characterId: string;
  name: string;
  progress: GenesisProgress;
  log?: string[];
}): WorkSessionView {
  const p = opts.progress;
  const state: WorkSessionView['state'] = p.state === 'none' ? 'running' : p.state;
  return {
    id: opts.id,
    type: 'genesis',
    title: `Genesis · ${opts.name}`,
    state,
    stages: p.stages.map(s => ({ key: s.key, label: s.label, status: s.status })),
    current: p.current,
    step: p.step,
    total: p.total,
    pillars: genesisPillars(p),
    cycles: p.counts.cycles,
    needsYou: genesisNeedsYou(opts.id, opts.name, p, opts.characterId),
    log: opts.log ?? [],
    blockedReason: null, // genesis wait reasons are classified, never shipped
    startedAt: p.startedAt,
    endedAt: p.endedAt,
    lastCycleAt: p.lastCycleAt,
    genesis: { characterId: opts.characterId, name: opts.name, progress: p },
    gmSteps: [],
  };
}

// ── Generic adapters (drafting / reconciliation / default) ───────────────

export interface WorkSessionFacts {
  id: string;
  goal: string;
  status: string;
  cycleCount: number;
  blockedReason: string | null;
  startedAt: Date | string;
  endedAt: Date | string | null;
  lastCycleAt: Date | string | null;
  /** JEWL's progress notes, oldest first. */
  notes: string[];
}

export interface DraftCounts { drafts: number; approved: number; pending: number }
export interface ReconciliationCounts { facts: number; conflicts: number; resolved: number }
export interface DefaultCounts { toolCalls: number; itemsWritten: number }

const iso = (d: Date | string | null): string | null => (d == null ? null : typeof d === 'string' ? d : d.toISOString());

function baseState(f: WorkSessionFacts): WorkSessionView['state'] {
  if (f.status === 'done') return 'done';
  if (f.status === 'cancelled') return 'error';
  if (f.status === 'blocked') return (f.blockedReason ?? '').toLowerCase().startsWith('ai provider failing') ? 'error' : 'waiting';
  return 'running';
}

/** Ladder from fixed keys: everything before `at` done, `at` current (or done when finished). */
function ladder(defs: Array<[string, string]>, at: number, finished: boolean): WorkStage[] {
  return defs.map(([key, label], i) => ({
    key, label,
    status: i < at || (finished && i === at) ? 'done' : i === at ? 'current' : 'pending',
  }));
}

const ratio = (n: number, d: number) => (d > 0 ? Math.min(1, n / d) : 0);
const grow = (n: number, scale: number) => (n <= 0 ? 0.04 : Math.min(1, 0.15 + 0.85 * Math.min(1, n / scale)));

function view(
  f: WorkSessionFacts,
  type: WorkSessionType,
  stageDefs: Array<[string, string]>,
  at: number,
  pillars: WorkPillar[],
  needsYou: NeedsYouItem[],
  gmSteps: GenesisGmStep[],
): WorkSessionView {
  const state = baseState(f);
  const done = state === 'done';
  const idx = done ? stageDefs.length - 1 : at;
  return {
    id: f.id,
    type,
    title: goalTitle(f.goal, 48),
    state,
    stages: ladder(stageDefs, idx, done),
    current: stageDefs[idx]?.[0] ?? null,
    step: idx + 1,
    total: stageDefs.length,
    pillars: done ? pillars.map(p => ({ ...p, fill: 1 })) : pillars,
    cycles: f.cycleCount,
    needsYou,
    log: f.notes.slice(-6).map(n => (n.length > 140 ? `${n.slice(0, 140)}…` : n)),
    blockedReason: f.blockedReason,
    startedAt: iso(f.startedAt),
    endedAt: iso(f.endedAt),
    lastCycleAt: iso(f.lastCycleAt),
    gmSteps,
  };
}

function waitItems(f: WorkSessionFacts): NeedsYouItem[] {
  if (f.status !== 'blocked') return [];
  const r = (f.blockedReason ?? '').toLowerCase();
  if (r.startsWith('ai provider failing')) return [];
  if (r.startsWith('no actionable work')) return [{ id: `${f.id}:stall`, kind: 'stalled', sessionId: f.id, title: `${goalTitle(f.goal, 40)} has gone quiet`, detail: 'Tell JEWL to continue.' }];
  return [{ id: `${f.id}:q`, kind: 'question', sessionId: f.id, title: 'JEWL is waiting on you', detail: f.blockedReason }];
}

export function draftingSessionView(f: WorkSessionFacts, c: DraftCounts, gmSteps: GenesisGmStep[] = []): WorkSessionView {
  const at = c.pending > 0 && f.status === 'blocked' ? 2 : c.drafts > 0 || f.cycleCount > 0 ? 1 : 0;
  const pillars: WorkPillar[] = [
    { key: 'body', label: 'BODY', count: c.drafts, fill: grow(c.drafts, 8), sub: plural(c.drafts, 'draft', 'drafts') },
    { key: 'spirit', label: 'SPIRIT', count: c.approved, fill: ratio(c.approved, c.drafts), sub: `${c.approved} approved` },
    { key: 'soul', label: 'SOUL', count: c.pending, fill: ratio(c.pending, c.drafts), sub: `${c.pending} pending` },
  ];
  const drafts: NeedsYouItem[] = gmSteps.map(s => ({ id: s.id, kind: 'draft', sessionId: f.id, title: `Submit ${s.type} · ${s.name}`, detail: s.purpose }));
  return view(f, 'drafting', [['open', 'Session opened'], ['drafting', 'Drafting in the Forge'], ['watcher', 'With the Watcher'], ['done', 'Done']],
    // Pending drafts ARE the wait — the blocked note would only repeat them.
    at, pillars, [...drafts, ...(drafts.length > 0 ? [] : waitItems(f))], gmSteps);
}

export function reconciliationSessionView(f: WorkSessionFacts, c: ReconciliationCounts): WorkSessionView {
  const at = c.conflicts > 0 ? 2 : c.facts > 0 || f.cycleCount > 0 ? 1 : 0;
  const pillars: WorkPillar[] = [
    { key: 'body', label: 'BODY', count: c.facts, fill: grow(c.facts, 10), sub: plural(c.facts, 'fact', 'facts') },
    { key: 'spirit', label: 'SPIRIT', count: c.conflicts, fill: ratio(c.conflicts, c.facts), sub: plural(c.conflicts, 'conflict', 'conflicts') },
    { key: 'soul', label: 'SOUL', count: c.resolved, fill: ratio(c.resolved, c.facts), sub: `${c.resolved} resolved` },
  ];
  return view(f, 'reconciliation', [['open', 'Session opened'], ['reading', 'Reading the world'], ['asking', 'Asking you'], ['settled', 'Settled']],
    at, pillars, waitItems(f), []);
}

export function defaultSessionView(f: WorkSessionFacts, c: DefaultCounts): WorkSessionView {
  const at = f.status === 'blocked' ? 2 : f.cycleCount > 0 ? 1 : 0;
  const pillars: WorkPillar[] = [
    { key: 'body', label: 'BODY', count: f.cycleCount, fill: grow(f.cycleCount, 12), sub: plural(f.cycleCount, 'cycle', 'cycles') },
    { key: 'spirit', label: 'SPIRIT', count: c.toolCalls, fill: grow(c.toolCalls, 40), sub: plural(c.toolCalls, 'tool call', 'tool calls') },
    { key: 'soul', label: 'SOUL', count: c.itemsWritten, fill: grow(c.itemsWritten, 10), sub: `${c.itemsWritten} written` },
  ];
  return view(f, 'default', [['open', 'Session opened'], ['working', 'Working'], ['waiting', 'Waiting on you'], ['done', 'Done']],
    at, pillars, waitItems(f), []);
}

// ── Campaign-level helpers ───────────────────────────────────────────────

const STATE_RANK: Record<WorkSessionView['state'], number> = { running: 0, waiting: 1, error: 2, done: 3 };

/** Active first, then most recent. */
export function orderSessions(sessions: WorkSessionView[]): WorkSessionView[] {
  const t = (s: WorkSessionView) => Date.parse(s.lastCycleAt ?? s.startedAt ?? '') || 0;
  return [...sessions].sort((a, b) => STATE_RANK[a.state] - STATE_RANK[b.state] || t(b) - t(a));
}

/** Every session's items plus campaign-level ones, deduplicated by kind+id. */
export function mergeNeedsYou(sessions: WorkSessionView[], extra: NeedsYouItem[] = []): NeedsYouItem[] {
  const seen = new Set<string>();
  const out: NeedsYouItem[] = [];
  for (const item of [...sessions.flatMap(s => s.needsYou), ...extra]) {
    const k = `${item.kind}:${item.id}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
  }
  return out;
}

/** The badge on the status line = every Needs-you item. */
export function needsYouCount(payload: Pick<JewlWorkPayload, 'needsYou'> | null | undefined): number {
  return payload?.needsYou.length ?? 0;
}

/** JEWL's one-line state for the status button / idle screen. */
export function jewlStateLine(payload: JewlWorkPayload | null, live?: string | null): string {
  if (live) return `building — ${live}`;
  const sessions = payload?.sessions ?? [];
  const running = sessions.find(s => s.state === 'running');
  if (running) return running.type === 'genesis' && running.total ? `${running.title} · ${running.step}/${running.total}` : `${running.title} · cycle ${running.cycles}`;
  const waiting = sessions.find(s => s.state === 'waiting');
  if (waiting) return `waiting on you · ${waiting.title}`;
  const n = needsYouCount(payload);
  if (n > 0) return `${n} thing${n === 1 ? '' : 's'} need${n === 1 ? 's' : ''} you`;
  return 'idle — watching';
}

/** Window event that opens JEWL's work screen on one session — a tappable
 *  genesis chat line dispatches it (2026-10-12: answer JEWL's question where
 *  it is asked, never in the Log). detail: { sessionId }. */
export const JEWL_WORK_OPEN_EVENT = 'jewl:work-open';

export function openJewlWork(sessionId: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(JEWL_WORK_OPEN_EVENT, { detail: { sessionId } }));
}

/** Window event that opens a character's Appearance ↗ (the Portrait step,
 *  BORN ≠ DONE 2026-10-12) — the campaign canvas switches to that character. */
export const CHARACTER_APPEARANCE_OPEN_EVENT = 'growth:open-appearance';

export function openCharacterAppearance(characterId: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(CHARACTER_APPEARANCE_OPEN_EVENT, { detail: { characterId } }));
}

/** One view per character (2026-10-12): a finished genesis kept for its
 *  portrait step and a running completion session are the same person — keep
 *  the newest non-done view (else newest), carry the others' needsYou over
 *  (deduped by kind+title). Non-genesis views are never collapsed. Order of
 *  first appearance is preserved. */
export function collapseByCharacter(views: WorkSessionView[]): WorkSessionView[] {
  const groups = new Map<string, WorkSessionView[]>();
  const out: Array<WorkSessionView | string> = [];
  for (const v of views) {
    const cid = v.genesis?.characterId;
    if (!cid) { out.push(v); continue; }
    if (!groups.has(cid)) { groups.set(cid, []); out.push(cid); }
    groups.get(cid)!.push(v);
  }
  const t = (v: WorkSessionView) => (v.startedAt ? Date.parse(v.startedAt) || 0 : 0);
  return out.map(o => {
    if (typeof o !== 'string') return o;
    const g = groups.get(o)!;
    const newest = (a: WorkSessionView, b: WorkSessionView) => (t(b) > t(a) ? b : a);
    const live = g.filter(v => v.state !== 'done');
    const kept = (live.length ? live : g).reduce(newest);
    if (g.length === 1) return kept;
    const seen = new Set(kept.needsYou.map(n => `${n.kind}|${n.title}`));
    const carried: NeedsYouItem[] = [];
    for (const v of g) {
      if (v === kept) continue;
      for (const n of v.needsYou) {
        const k = `${n.kind}|${n.title}`;
        if (!seen.has(k)) { seen.add(k); carried.push({ ...n, sessionId: kept.id }); }
      }
    }
    return { ...kept, needsYou: [...kept.needsYou, ...carried] };
  });
}
