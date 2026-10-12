'use client';
/**
 * The status line at the top of the campaign chrome → JEWL's work screen
 * (Mike 2026-10-12: "the little dialog we have at the top on click it should
 * bring that loading screen as a pop up").
 *
 * JewlStatusButton replaces the ⚒ "JEWL is building — …" ticker for the
 * Watcher: it is always there, shows JEWL's one-line state, a Needs-you count
 * badge and a small pillar-bar activity indicator while a session cycles.
 * Tap → the work screen as an overlay over the current page (no navigation;
 * the canvas stays mounted underneath). Esc or the phone's back gesture
 * closes it; Keep working minimises back to the line.
 *
 * Data: GET /api/campaigns/[id]/jewl/work, refreshed on the campaign stream's
 * daya_work_session / jewl_working events (the shared EventSource — no second
 * connection) with a slow poll as the fallback.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useCampaignStream } from '@/hooks/useCampaignStream';
import {
  jewlStateLine, needsYouCount, TYPE_TITLE_KEY, JEWL_WORK_OPEN_EVENT, openCharacterAppearance,
  type JewlWorkPayload, type WorkSessionView,
} from '@/lib/jewl-work';
import { GenesisLoadingOverlay, toolVerb } from '@/components/character/GenesisLoading';
import { GenesisGmSteps } from '@/components/character/GenesisGmSteps';
import {
  JewlWorkScreen, NeedsYouList, WorkTabs, fmtElapsed, useNow,
  type WorkScreenModel, type WorkTab,
} from './JewlWorkScreen';

// ── Data ─────────────────────────────────────────────────────────────────

export function useJewlWork({ campaignId, enabled, open }: { campaignId: string; enabled: boolean; open: boolean }) {
  const [payload, setPayload] = useState<JewlWorkPayload | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [live, setLive] = useState<{ tool: string | null; label: string | null } | null>(null);
  const doneTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const refetch = useCallback(async () => {
    if (!enabled || !campaignId) return;
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/jewl/work`);
      if (res.status === 401 || res.status === 403) { setForbidden(true); return; }
      if (res.ok) setPayload(await res.json() as JewlWorkPayload);
    } catch { /* keep last known state */ }
  }, [campaignId, enabled]);

  useEffect(() => {
    if (!enabled || !campaignId) return;
    let alive = true;
    fetch(`/api/campaigns/${campaignId}/jewl/work`)
      .then(res => {
        if (res.status === 401 || res.status === 403) { if (alive) setForbidden(true); return null; }
        return res.ok ? res.json() as Promise<JewlWorkPayload> : null;
      })
      .then(p => { if (alive && p) setPayload(p); })
      .catch(() => { /* keep last known state */ });
    return () => { alive = false; };
  }, [campaignId, enabled]);

  // Fast while he cycles or the screen is open; slow otherwise.
  const cycling = !!payload?.cycling;
  useEffect(() => {
    if (!enabled || forbidden) return;
    const t = setInterval(() => { void refetch(); }, cycling || open ? 4000 : 30000);
    return () => clearInterval(t);
  }, [enabled, forbidden, cycling, open, refetch]);

  const { on } = useCampaignStream({ campaignId, enabled: enabled && !!campaignId });
  useEffect(() => on('daya_work_session', () => { void refetch(); }), [on, refetch]);
  useEffect(() => on('jewl_working', d => {
    if (d.phase === 'done') {
      if (doneTimer.current) clearTimeout(doneTimer.current);
      doneTimer.current = setTimeout(() => setLive(null), 1500); // linger a beat
      void refetch();
    } else {
      if (doneTimer.current) { clearTimeout(doneTimer.current); doneTimer.current = null; }
      setLive(prev => ({ tool: d.phase === 'tool' ? d.tool ?? null : prev?.tool ?? null, label: d.phase === 'tool' && d.label ? d.label : prev?.label ?? null }));
    }
  }), [on, refetch]);
  useEffect(() => () => { if (doneTimer.current) clearTimeout(doneTimer.current); }, []);

  return { payload, forbidden, live, refetch };
}

// ── Generic session (drafting / reconciliation / default) ────────────────

function stateTone(s: WorkSessionView['state']): WorkTab['tone'] {
  return s === 'running' ? 'run' : s === 'waiting' ? 'wait' : s === 'error' ? 'err' : 'done';
}

export function sessionScreenModel(v: WorkSessionView, opts: { liveTool: string | null; now: number }): WorkScreenModel {
  const started = v.startedAt ? Date.parse(v.startedAt) : null;
  const ended = v.endedAt ? Date.parse(v.endedAt) : null;
  const running = v.state === 'running';
  return {
    ariaLabel: `JEWL work · ${v.title}`,
    born: v.state === 'done',
    stageKey: v.current,
    headRight: v.state === 'done' ? 'COMPLETE' : `STEP ${v.step}/${v.total}`,
    elapsed: started ? fmtElapsed((ended ?? opts.now) - started) : '00:00',
    titleKey: TYPE_TITLE_KEY[v.type],
    titleValue: v.state === 'waiting' ? `${v.title} · waiting on you` : v.state === 'error' ? `${v.title} · halted` : v.title,
    pillars: v.pillars,
    stages: v.state === 'done' ? null : v.stages,
    liveVerb: running ? toolVerb(opts.liveTool) : null,
    nowLine: running ? toolVerb(opts.liveTool) : null,
    footMeta: `${v.cycles} cycle${v.cycles === 1 ? '' : 's'}`,
    closeLabel: v.state === 'running' || v.state === 'waiting' ? 'KEEP WORKING ▾' : 'CLOSE',
    hint: v.state === 'running' || v.state === 'waiting' ? 'It keeps running if you close this — the status line tracks it.' : null,
  };
}

function SessionScreen({ view, liveTool, campaignId, onClose, onChanged, tabs, fixedNow }: {
  view: WorkSessionView; liveTool: string | null; campaignId: string;
  onClose: () => void; onChanged: () => void; tabs?: ReactNode; fixedNow?: number;
}) {
  const now = useNow(view.state === 'running' || view.state === 'waiting', fixedNow);
  const model = sessionScreenModel(view, { liveTool, now });
  const others = view.needsYou.filter(i => i.kind !== 'draft');
  return (
    <JewlWorkScreen model={model} log={view.log.map((text, i) => ({ id: `${view.id}:${i}`, text }))} onClose={onClose} tabs={tabs}>
      <NeedsYouList items={others} onOpenPortrait={id => { openCharacterAppearance(id); onClose(); }} />
      {/* mounted at 0 too: a row sent back with feedback stays "revising…" until its redraft lands */}
      <GenesisGmSteps steps={view.gmSteps} campaignId={campaignId} onChanged={onChanged} onOpenForge={onClose} />
    </JewlWorkScreen>
  );
}

// ── Idle / overview ──────────────────────────────────────────────────────

export function idleScreenModel(payload: JewlWorkPayload | null, live: string | null): WorkScreenModel {
  const n = needsYouCount(payload);
  return {
    ariaLabel: 'JEWL work · idle',
    stageKey: null,
    headRight: live ? 'WORKING' : (payload?.sessions.length ?? 0) > 0 ? 'WORKING' : 'IDLE',
    elapsed: null,
    titleKey: '// JEWL',
    titleValue: jewlStateLine(payload, live),
    pillars: null,
    stages: null,
    liveVerb: null,
    nowLine: live ? live : null,
    footMeta: n > 0 ? `${n} need${n === 1 ? 's' : ''} you` : 'nothing needs you',
    closeLabel: 'CLOSE',
    hint: null,
  };
}

function IdleScreen({ payload, live, onClose, tabs, campaignOnly }: {
  payload: JewlWorkPayload | null; live: string | null; onClose: () => void; tabs?: ReactNode;
  /** Overview tab beside sessions: only the campaign-level items. */
  campaignOnly?: boolean;
}) {
  const items = (payload?.needsYou ?? []).filter(i => !campaignOnly || i.sessionId === null);
  const lines = (payload?.recentLog ?? []).slice(-8);
  return (
    <JewlWorkScreen model={idleScreenModel(payload, live)} log={lines.map((text, i) => ({ id: `idle:${i}`, text }))} onClose={onClose} tabs={tabs}>
      {items.length > 0
        ? <NeedsYouList items={items} onOpenPortrait={id => { openCharacterAppearance(id); onClose(); }} />
        : <div className="jw-note">Nothing is waiting on you. JEWL is watching the table; right-click anywhere to ask him.</div>}
      {lines.length === 0 && <div className="jw-note">No work logged yet in this campaign.</div>}
    </JewlWorkScreen>
  );
}

// ── The popup ────────────────────────────────────────────────────────────

const OVERVIEW = '__jewl__';

export function JewlWorkPopup({ payload, campaignId, live, onClose, onChanged, fixedNow, initialTab }: {
  payload: JewlWorkPayload | null;
  campaignId: string;
  live: { tool: string | null; label: string | null } | null;
  onClose: () => void;
  onChanged: () => void;
  /** Harness: freeze the clock / choose the tab. */
  fixedNow?: number;
  initialTab?: string;
}) {
  const sessions = useMemo(() => payload?.sessions ?? [], [payload]);
  const campaignItems = (payload?.needsYou ?? []).filter(i => i.sessionId === null).length;
  const tabs: WorkTab[] = useMemo(() => {
    const t: WorkTab[] = sessions.map(s => ({
      id: s.id,
      label: s.type === 'genesis' && s.genesis ? `GENESIS · ${s.genesis.name}` : s.title,
      tone: stateTone(s.state),
      count: s.needsYou.length,
    }));
    if (t.length > 0 && campaignItems > 0) t.push({ id: OVERVIEW, label: 'JEWL', tone: 'idle', count: campaignItems });
    return t;
  }, [sessions, campaignItems]);
  const [picked, setPicked] = useState<string | null>(initialTab ?? null);
  const active = tabs.find(t => t.id === picked)?.id ?? tabs[0]?.id ?? OVERVIEW;
  const tabBar = tabs.length > 1 ? <WorkTabs tabs={tabs} active={active} onSelect={setPicked} /> : undefined;
  const liveText = live ? (live.label ?? toolVerb(live.tool)) : null;

  const view = sessions.find(s => s.id === active);
  if (!view) {
    return <IdleScreen payload={payload} live={liveText} onClose={onClose} tabs={tabBar} campaignOnly={sessions.length > 0} />;
  }
  if (view.type === 'genesis' && view.genesis) {
    return (
      <GenesisLoadingOverlay
        key={view.id}
        progress={view.genesis.progress}
        liveTool={live?.tool ?? null}
        campaignId={campaignId}
        characterName={view.genesis.name}
        characterId={view.genesis.characterId}
        onOpenAppearance={() => { openCharacterAppearance(view.genesis!.characterId); onClose(); }}
        onDismiss={onClose}
        onViewSheet={onClose}
        onStepsChanged={onChanged}
        onOpenForge={onClose}
        fixedNow={fixedNow}
        tabs={tabBar}
      />
    );
  }
  return <SessionScreen key={view.id} view={view} liveTool={live?.tool ?? null} campaignId={campaignId}
    onClose={onClose} onChanged={onChanged} tabs={tabBar} fixedNow={fixedNow} />;
}

// ── The status line (the top element) ────────────────────────────────────

export function JewlStatusLine({ line, count, cycling, waiting, onOpen }: {
  line: string; count: number; cycling: boolean; waiting: boolean; onOpen: () => void;
}) {
  return (
    <button type="button" className={`jw-status${cycling ? ' jw-status-on' : ''}${waiting || count > 0 ? ' jw-status-wait' : ''}`}
      onClick={onOpen} data-no-hold aria-haspopup="dialog"
      aria-label={`JEWL — ${line}${count > 0 ? ` · ${count} need${count === 1 ? 's' : ''} you` : ''}. Open his work screen.`}>
      <style>{STATUS_CSS}</style>
      <span className="jw-bars" aria-hidden><i /><i /><i /></span>
      <span className="jw-who">JEWL</span>
      <span className="jw-line">{line}</span>
      {count > 0 && <span className="jw-badge" data-jewl-needs={count}>{count}</span>}
    </button>
  );
}

export function JewlStatusButton({ campaignId }: { campaignId: string }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<string | undefined>(undefined);
  const { payload, forbidden, live, refetch } = useJewlWork({ campaignId, enabled: true, open });
  const pushedRef = useRef(false);

  const openScreen = useCallback((sessionId?: string) => {
    setTab(sessionId);
    if (open) return; // already up — the tab switch is enough
    setOpen(true);
    void refetch();
    // Phone back closes the popup: one history entry while it is up.
    try {
      window.history.pushState({ ...(window.history.state ?? {}), jewlWork: true }, '');
      pushedRef.current = true;
    } catch { /* no history — Esc / buttons still close */ }
  }, [refetch, open]);

  // A tappable genesis chat line opens the screen on its session (2026-10-12).
  useEffect(() => {
    const onOpen = (e: Event) => {
      const sessionId = (e as CustomEvent<{ sessionId?: string }>).detail?.sessionId;
      openScreen(typeof sessionId === 'string' ? sessionId : undefined);
    };
    window.addEventListener(JEWL_WORK_OPEN_EVENT, onOpen);
    return () => window.removeEventListener(JEWL_WORK_OPEN_EVENT, onOpen);
  }, [openScreen]);

  const closeScreen = useCallback(() => {
    setOpen(false);
    if (pushedRef.current) {
      pushedRef.current = false;
      try { window.history.back(); } catch { /* ignore */ }
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    const onPop = () => { pushedRef.current = false; setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeScreen(); };
    window.addEventListener('popstate', onPop);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('popstate', onPop);
      window.removeEventListener('keydown', onKey);
    };
  }, [open, closeScreen]);

  if (forbidden) return null;
  const liveText = live ? (live.label ?? toolVerb(live.tool)) : null;
  const sessions = payload?.sessions ?? [];
  return (
    <>
      <JewlStatusLine
        line={jewlStateLine(payload, liveText)}
        count={needsYouCount(payload)}
        cycling={!!live || !!payload?.cycling}
        waiting={sessions.some(s => s.state === 'waiting')}
        onOpen={() => openScreen()}
      />
      {open && (
        <JewlWorkPopup key={tab ?? 'auto'} initialTab={tab} payload={payload} campaignId={campaignId} live={live}
          onClose={closeScreen} onChanged={() => { void refetch(); }} />
      )}
    </>
  );
}

// The status line: the rulebook's black highlight bar (white Consolas on
// black), teal = Terminal, amber count = needs you. Hugs its text.
const STATUS_CSS = `
.jw-status{display:inline-flex;align-items:center;gap:8px;max-width:min(92vw,520px);min-height:32px;padding:4px 10px 4px 8px;background:#000;color:#fff;border:0;border-left:3px solid #22ab94;font-family:var(--font-terminal,Consolas,monospace);font-size:12px;letter-spacing:.04em;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,.35);pointer-events:auto;touch-action:manipulation}
.jw-status-wait{border-left-color:#D07818}
.jw-who{color:#22ab94;letter-spacing:.1em}
.jw-line{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#e8e8e8}
.jw-badge{flex:none;background:#D07818;color:#000;font-size:11px;line-height:1;padding:3px 6px;font-variant-numeric:tabular-nums}
.jw-bars{display:flex;align-items:flex-end;gap:2px;height:14px;flex:none}
.jw-bars i{display:block;width:3px;height:40%;opacity:.45}
.jw-bars i:nth-child(1){background:#f7525f}.jw-bars i:nth-child(2){background:#8a4bb0}.jw-bars i:nth-child(3){background:#2f6fc2}
.jw-status-on .jw-bars i{opacity:1;animation:jw-bob 1.1s ease-in-out infinite}
.jw-status-on .jw-bars i:nth-child(2){animation-delay:.18s}.jw-status-on .jw-bars i:nth-child(3){animation-delay:.36s}
@keyframes jw-bob{0%,100%{height:30%}50%{height:100%}}
@media (prefers-reduced-motion: reduce){.jw-status-on .jw-bars i{animation:none;height:80%}}
`;
