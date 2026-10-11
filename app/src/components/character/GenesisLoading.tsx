'use client';
/**
 * Genesis loading screen (Mike 2026-10-11): while JEWL gestates a character
 * the GM sees the Terminal at work — RAW FEED pole of the rulebook (black
 * void, Consolas, teal/amber Terminal type, glitch on stage turns) with the
 * three pillars filling as the being is assembled, the real stage ladder,
 * elapsed time and a rolling Terminal log.
 *
 * SPOILER FIREWALL ([[mike-blind-gm-claude-story-proxy-2026-08-28]]): this
 * screen renders PROCESS only — stage keys/labels, counts, timing and a fixed
 * verb per tool name. Nothing here can display story text: the progress
 * payload carries none (services/character-genesis-progress.ts) and the live
 * tool feed maps tool names onto a fixed vocabulary, discarding labels.
 *
 * Dismissable: the run continues and a small badge shows progress; tapping
 * the badge reopens the screen. On completion it shows the "born" moment.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useCampaignStream } from '@/hooks/useCampaignStream';
import type { GenesisProgress } from '@/services/character-genesis-progress';

export type { GenesisProgress };

// ── Live tool → fixed Terminal verb (labels are NEVER shown: they can carry
//    names). Unknown tools fall back to a generic verb. ─────────────────────
const TOOL_VERBS: Record<string, string> = {
  daya_author_entity: 'authoring the person',
  daya_seed_memory: 'sealing memories',
  daya_ledger_read: 'reading the ledger',
  daya_sheet_diff: 'comparing believed vs true sheet',
  search_catalog: 'searching the catalog',
  draw_from_kit: 'pulling stock blocks',
  propose_forge_blueprint: 'forging a block',
  forge_list_drafts: 'checking the Forge',
  forge_read: 'reading the Forge',
  edit_character_sheet: 'writing the sheet',
  update_work_session: 'logging progress',
  establish_world_facts: 'recording world facts',
};
export function toolVerb(tool: string | undefined | null): string {
  if (!tool) return 'working';
  return TOOL_VERBS[tool] ?? 'working';
}

// ── Data hook: GM-only poll + SSE nudges ─────────────────────────────────

/** In flight = a genesis session is active or blocked (incl. a provider
 *  pause) — the server's truth, so it survives navigation and reload. */
export function genesisInFlight(p: GenesisProgress | null): boolean {
  return !!p && (p.state === 'running' || p.state === 'waiting' || (p.state === 'error' && p.error === 'provider'));
}

export function useGenesisProgress(opts: {
  characterId: string | null | undefined;
  campaignId: string;
  enabled: boolean;
  /** Bump to force an immediate refetch (e.g. right after submitting). */
  kick?: number;
}) {
  const { characterId, campaignId, enabled, kick } = opts;
  // Keyed by character so a Tapestry switch never shows the last one's run.
  const [entry, setEntry] = useState<{ id: string; p: GenesisProgress } | null>(null);
  const progress = entry && entry.id === characterId ? entry.p : null;
  const [liveTool, setLiveTool] = useState<string | null>(null);
  const sessionIdRef = useRef<string | null>(null);
  useEffect(() => { sessionIdRef.current = progress?.sessionId ?? null; }, [progress?.sessionId]);

  const refetch = useCallback(async () => {
    if (!characterId) return;
    try {
      const res = await fetch(`/api/characters/${characterId}/genesis`);
      if (res.ok) setEntry({ id: characterId, p: await res.json() as GenesisProgress });
    } catch { /* keep last known state */ }
  }, [characterId]);

  useEffect(() => {
    if (!enabled || !characterId) return;
    let alive = true;
    fetch(`/api/characters/${characterId}/genesis`)
      .then(res => (res.ok ? res.json() as Promise<GenesisProgress> : null))
      .then(p => { if (alive && p) setEntry({ id: characterId, p }); })
      .catch(() => { /* keep last known state */ });
    return () => { alive = false; };
  }, [enabled, characterId, kick]);

  const live = genesisInFlight(progress);
  useEffect(() => {
    if (!enabled || !live) return;
    const timer = setInterval(() => { void refetch(); }, 4000);
    return () => clearInterval(timer);
  }, [enabled, live, refetch]);

  const { on } = useCampaignStream({ campaignId, enabled: enabled && live && !!campaignId });
  useEffect(() => on('daya_work_session', d => {
    if (!sessionIdRef.current || d.sessionId === sessionIdRef.current) void refetch();
  }), [on, refetch]);
  useEffect(() => on('jewl_working', d => {
    if (d.phase === 'tool') setLiveTool(d.tool ?? null);
    else if (d.phase === 'done') { setLiveTool(null); void refetch(); }
  }), [on, refetch]);

  return { progress, liveTool, refetch };
}

// ── Helpers ──────────────────────────────────────────────────────────────

function fmtElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function useNow(active: boolean, fixedNow?: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (fixedNow != null || !active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active, fixedNow]);
  return fixedNow ?? now;
}

const STAGE_ORDER = ['open', 'expansion', 'ledger', 'mechanics', 'sheet', 'born'] as const;

/** Pillar fill 0..1 — Soul (mind/memory) fills with the person and the
 *  ledger, Spirit with the traits forged, Body with the blocks and sheet. */
export function pillarFills(p: GenesisProgress | null): { body: number; spirit: number; soul: number } {
  if (!p || p.state === 'none') return { body: 0, spirit: 0, soul: 0 };
  if (p.state === 'done') return { body: 1, spirit: 1, soul: 1 };
  const at = Math.max(0, STAGE_ORDER.indexOf((p.current ?? 'open') as typeof STAGE_ORDER[number]));
  const c = p.counts;
  const soul = at <= 1 ? 0.12 : Math.min(1, 0.3 + 0.7 * Math.min(1, c.memories / 40));
  const spirit = at < 3 ? 0.04 : Math.min(1, 0.25 + 0.6 * Math.min(1, c.traitsForged / 6) + (at >= 4 ? 0.15 : 0));
  const body = at < 3 ? 0.04 : Math.min(1, 0.2 + 0.5 * Math.min(1, c.blocksForged / 4) + (at >= 4 ? 0.2 : 0));
  return { body, spirit, soul };
}

/** One Terminal log line per observed change — counts and stage names only. */
export function diffLogLines(prev: GenesisProgress | null, next: GenesisProgress): string[] {
  const out: string[] = [];
  if (!prev || prev.sessionId !== next.sessionId) {
    out.push(`genesis session open · step ${next.step}/${next.total}`);
  }
  if (prev && prev.current !== next.current && next.current) {
    const st = next.stages.find(s => s.key === next.current);
    if (st) out.push(`stage → ${st.label.toLowerCase()}`);
  }
  if (prev) {
    const dm = next.counts.memories - prev.counts.memories;
    if (dm > 0) out.push(`ledger +${dm} sealed · ${next.counts.memories} total`);
    const db = next.counts.blocksForged - prev.counts.blocksForged;
    if (db > 0) out.push(`forge +${db} block${db === 1 ? '' : 's'} drafted`);
    const dt = next.counts.traitsForged - prev.counts.traitsForged;
    if (dt > 0) out.push(`forge +${dt} trait${dt === 1 ? '' : 's'} drafted`);
    const da = next.counts.approved - prev.counts.approved;
    if (da > 0) out.push(`watcher approved ${da}`);
    if (next.counts.cycles > prev.counts.cycles) out.push(`cycle ${next.counts.cycles} complete`);
    if (next.state === 'waiting' && prev.state !== 'waiting') out.push('paused · waiting on the watcher');
    if (next.state === 'running' && prev.state === 'waiting') out.push('resumed');
  }
  return out;
}

const WAIT_COPY: Record<string, { title: string; body: string }> = {
  approval: {
    title: 'WAITING ON YOU',
    body: 'drafts await your approval in the Forge. JEWL resumes on his own once you approve.',
  },
  question: {
    title: 'JEWL HAS A QUESTION',
    body: 'Open JEWL (◈) to answer him. Genesis resumes when he has what he needs.',
  },
  stalled: {
    title: 'JEWL IS IDLING',
    body: 'Several cycles passed with nothing to do. Open JEWL (◈) and tell him to continue the genesis.',
  },
};

const ERROR_COPY: Record<string, { title: string; body: string }> = {
  provider: {
    title: 'AI PROVIDER FAILING',
    body: 'The model is down or out of credits, so genesis paused itself. Nothing was lost. Check the provider/credits, then open JEWL (◈) and tell him to resume the genesis.',
  },
  cancelled: {
    title: 'GENESIS CANCELLED',
    body: 'This session was closed before the character was born. Press ◆ Submit to JEWL to start a fresh one. The backstory is kept.',
  },
};

// ── Overlay ──────────────────────────────────────────────────────────────

export interface GenesisLoadingOverlayProps {
  progress: GenesisProgress | null;
  liveTool?: string | null;
  /** Submission failed before a session existed — shown plainly. */
  submitError?: string | null;
  onDismiss: () => void;
  onViewSheet: () => void;
  /** Harness: freeze the clock. */
  fixedNow?: number;
  /** Harness: seed the rolling log. */
  initialLog?: string[];
}

export function GenesisLoadingOverlay({
  progress, liveTool, submitError, onDismiss, onViewSheet, fixedNow, initialLog,
}: GenesisLoadingOverlayProps) {
  const state = submitError ? 'error' : progress?.state ?? 'none';
  const running = state === 'running' || state === 'waiting' || state === 'none';
  const now = useNow(running, fixedNow);

  // Rolling log — derived from observed changes, never from content.
  const [log, setLog] = useState<Array<{ id: number; text: string }>>(
    () => (initialLog ?? []).map((text, i) => ({ id: i, text })),
  );
  const prevRef = useRef<GenesisProgress | null>(null);
  const idRef = useRef(initialLog?.length ?? 0);
  useEffect(() => {
    if (!progress) return;
    const lines = diffLogLines(prevRef.current, progress);
    prevRef.current = progress;
    if (initialLog && lines.length && lines[0].startsWith('genesis session open')) lines.shift();
    if (lines.length === 0) return;
    setLog(l => [...l, ...lines.map(text => ({ id: idRef.current++, text }))].slice(-6));
  }, [progress, initialLog]);

  // Glitch on every stage turn: the column is keyed by the turn count, so
  // its one-shot glitch animation replays on each change.
  const cur = progress?.current ?? null;
  const [seenStage, setSeenStage] = useState(cur);
  const [turns, setTurns] = useState(0);
  if (cur !== seenStage) {
    setSeenStage(cur);
    if (seenStage !== null) setTurns(t => t + 1);
  }

  if (typeof document === 'undefined') return null;

  const fills = pillarFills(progress);
  const started = progress?.startedAt ? Date.parse(progress.startedAt) : null;
  const ended = progress?.endedAt ? Date.parse(progress.endedAt) : null;
  const elapsed = started ? fmtElapsed((ended ?? now) - started) : '00:00';
  const c = progress?.counts;
  const currentStage = progress?.stages.find(s => s.status === 'current');
  const errorKind = submitError ? 'submit' : progress?.error ?? null;

  const body = (
    <div className={`gn-root${state === 'done' ? ' gn-born' : ''}`}
      role="dialog" aria-modal="true" aria-label="JEWL genesis progress" data-no-hold>
      <style>{GENESIS_CSS}</style>
      <div className="gn-scan" aria-hidden />
      <div className={`gn-col${turns > 0 ? ' gn-glitch' : ''}`} key={turns}>
        {/* Terminal header */}
        <div className="gn-head">
          <span className="gn-badge">tHE TERmInAl</span>
          <span className="gn-head-r">
            {state === 'done' ? 'COMPLETE' : progress?.step ? `STEP ${progress.step}/${progress.total}` : 'OPENING'}
            {' · '}<span className="gn-num">{elapsed}</span>
          </span>
        </div>
        <div className="gn-title">
          <span className="gn-title-k">{'// GENESIS'}</span>
          <span className="gn-title-v">
            {state === 'done' ? 'a being is born'
              : state === 'error' ? 'genesis halted'
                : state === 'waiting' ? 'paused · waiting on the watcher'
                  : 'JEWL is assembling a being'}
          </span>
        </div>

        {/* Pillars */}
        <div className="gn-pillars" aria-label="Pillars assembled">
          {([
            ['body', 'BODY', fills.body, c ? `${c.blocksForged} block${c.blocksForged === 1 ? '' : 's'}` : '—'],
            ['spirit', 'SPIRIT', fills.spirit, c ? `${c.traitsForged} trait${c.traitsForged === 1 ? '' : 's'}` : '—'],
            ['soul', 'SOUL', fills.soul, c ? `${c.memories} memor${c.memories === 1 ? 'y' : 'ies'}` : '—'],
          ] as const).map(([key, label, fill, sub]) => (
            <div key={key} className={`gn-pillar gn-${key}`}>
              <div className="gn-tube">
                <div className="gn-fill" style={{ height: `${Math.round(fill * 100)}%` }} />
                <div className="gn-tick" style={{ bottom: `${Math.round(fill * 100)}%` }} />
              </div>
              <div className="gn-plabel">{label}</div>
              <div className="gn-psub">{sub}</div>
            </div>
          ))}
        </div>

        {/* Done / error / waiting blocks */}
        {state === 'done' && c && (
          <div className="gn-bornbox">
            <div className="gn-born-word">BORN</div>
            <div className="gn-born-sub">
              {c.memories} memories sealed · {c.blocksForged} blocks · {c.traitsForged} traits · {elapsed}
            </div>
            <div className="gn-born-note">The dossier and sheet await your review.</div>
            <button type="button" className="gn-btn gn-btn-gold" onClick={onViewSheet}>VIEW THE SHEET</button>
          </div>
        )}
        {state === 'error' && (
          <div className="gn-errbox" role="alert">
            <div className="gn-err-t">{errorKind === 'submit' ? 'SUBMISSION FAILED' : ERROR_COPY[errorKind ?? 'cancelled']?.title}</div>
            <div className="gn-err-b">
              {errorKind === 'submit'
                ? <>{submitError} <br />Fix that, then press ◆ Submit to JEWL again.</>
                : ERROR_COPY[errorKind ?? 'cancelled']?.body}
            </div>
          </div>
        )}
        {state === 'waiting' && progress?.wait && WAIT_COPY[progress.wait] && (
          <div className="gn-waitbox" role="status">
            <div className="gn-wait-t">{WAIT_COPY[progress.wait].title}</div>
            <div className="gn-wait-b">
              {progress.wait === 'approval' && c ? `${c.pendingApproval} ` : ''}{WAIT_COPY[progress.wait].body}
            </div>
          </div>
        )}

        {/* Stage ladder */}
        {state !== 'done' && (
          <ol className="gn-ladder">
            {(progress?.stages ?? []).map(s => (
              <li key={s.key} className={`gn-st gn-st-${s.status}`}>
                <span className="gn-mark">{s.status === 'done' ? '✓' : s.status === 'current' ? '◆' : '○'}</span>
                <span className="gn-st-l">{s.label}</span>
                {s.status === 'current' && state === 'running' && (
                  <span className="gn-st-live">&gt; {toolVerb(liveTool)}<span className="gn-caret">_</span></span>
                )}
              </li>
            ))}
            {!progress && !submitError && (
              <li className="gn-st gn-st-current"><span className="gn-mark">◆</span><span className="gn-st-l">Handing the genome to JEWL</span></li>
            )}
          </ol>
        )}

        {/* Rolling Terminal log */}
        <div className="gn-log" aria-live="polite">
          {log.map(l => <div key={l.id} className="gn-line"><span className="gn-pr">&gt;</span> {l.text}</div>)}
          {state === 'running' && <div className="gn-line gn-line-now"><span className="gn-pr">&gt;</span> {currentStage ? toolVerb(liveTool) : 'listening'}<span className="gn-caret">_</span></div>}
        </div>

        {/* Footer */}
        <div className="gn-foot">
          <span className="gn-meta">
            {c ? `${c.cycles} cycle${c.cycles === 1 ? '' : 's'}` : '—'}
            {c && c.pendingApproval > 0 ? ` · ${c.pendingApproval} awaiting approval` : ''}
          </span>
          <button type="button" className="gn-btn" onClick={onDismiss}>
            {state === 'done' || state === 'error' ? 'CLOSE' : 'KEEP WORKING ▾'}
          </button>
        </div>
        {running && (
          <div className="gn-hint">It keeps running if you close this — the badge tracks it.</div>
        )}
      </div>
    </div>
  );
  return createPortal(body, document.body);
}

// ── Badge (overlay dismissed, run continues) ─────────────────────────────

export function GenesisBadge({ progress, onOpen, fixedNow }: {
  progress: GenesisProgress | null;
  onOpen: () => void;
  fixedNow?: number;
}) {
  const live = progress?.state === 'running' || progress?.state === 'waiting';
  const now = useNow(live, fixedNow);
  if (typeof document === 'undefined' || !progress || progress.state === 'none') return null;
  const fills = pillarFills(progress);
  const started = progress.startedAt ? Date.parse(progress.startedAt) : now;
  const ended = progress.endedAt ? Date.parse(progress.endedAt) : null;
  const tone = progress.state === 'error' ? 'err' : progress.state === 'waiting' ? 'wait' : progress.state === 'done' ? 'done' : 'run';
  const text = progress.state === 'done' ? 'BORN · VIEW'
    : progress.state === 'error' ? 'GENESIS HALTED'
      : progress.state === 'waiting' ? `NEEDS YOU · ${progress.step}/${progress.total}`
        : `GENESIS ${progress.step}/${progress.total} · ${fmtElapsed((ended ?? now) - started)}`;
  return createPortal(
    <button type="button" className={`gn-chip gn-chip-${tone}`} onClick={onOpen} data-no-hold
      aria-label="Open genesis progress">
      <style>{GENESIS_CSS}</style>
      <span className="gn-chip-bars" aria-hidden>
        <i style={{ height: `${20 + fills.body * 80}%`, background: '#f7525f' }} />
        <i style={{ height: `${20 + fills.spirit * 80}%`, background: '#8a4bb0' }} />
        <i style={{ height: `${20 + fills.soul * 80}%`, background: '#2f6fc2' }} />
      </span>
      <span>{text}</span>
    </button>,
    document.body,
  );
}

// ── Styles (RAW FEED pole) ───────────────────────────────────────────────

const GENESIS_CSS = `
.gn-root{position:fixed;inset:0;z-index:9000;background:#000;color:#e8e8e8;font-family:var(--font-terminal,Consolas,monospace);overflow-y:auto;-webkit-overflow-scrolling:touch;animation:gn-in .38s steps(6,end) both}
.gn-scan{pointer-events:none;position:fixed;inset:0;background:repeating-linear-gradient(0deg,rgba(255,255,255,.025) 0 1px,transparent 1px 3px);z-index:0}
.gn-scan::after{content:"";position:absolute;left:0;right:0;height:90px;background:linear-gradient(180deg,transparent,rgba(34,171,148,.07),transparent);animation:gn-sweep 5.5s linear infinite}
.gn-col{position:relative;z-index:1;max-width:412px;margin:0 auto;padding:18px 16px 28px;display:flex;flex-direction:column;gap:16px;min-height:100%}
.gn-head{display:flex;justify-content:space-between;align-items:center;gap:8px}
.gn-badge{background:#fff;color:#000;padding:2px 8px;font-size:13px;letter-spacing:.06em}
.gn-head-r{color:#22ab94;font-size:12px;letter-spacing:.08em}
.gn-num{font-variant-numeric:tabular-nums;color:#fff}
.gn-title{display:flex;flex-direction:column;gap:2px;border-left:4px solid #D07818;padding:4px 0 4px 10px;background:#0d0d0d}
.gn-title-k{color:#D07818;font-size:12px;letter-spacing:.14em}
.gn-title-v{color:#fff;font-size:17px}
.gn-pillars{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;padding:6px 6px 0}
.gn-pillar{display:flex;flex-direction:column;align-items:center;gap:6px}
.gn-tube{position:relative;width:46px;height:150px;background:#0b0b0b;border:1px solid #1d1d1d;overflow:hidden}
.gn-fill{position:absolute;left:0;right:0;bottom:0;transition:height 1.2s cubic-bezier(.2,.8,.2,1)}
.gn-fill::after{content:"";position:absolute;inset:0;background:repeating-linear-gradient(0deg,rgba(0,0,0,.28) 0 2px,transparent 2px 6px);animation:gn-rise 1.8s linear infinite}
.gn-tick{position:absolute;left:-2px;right:-2px;height:2px;background:#fff;opacity:.85;transition:bottom 1.2s cubic-bezier(.2,.8,.2,1);box-shadow:0 0 8px #fff}
.gn-body .gn-fill{background:linear-gradient(0deg,#f7525f,#ff8f97);box-shadow:0 0 18px #f7525f}
.gn-spirit .gn-fill{background:linear-gradient(0deg,#582a72,#9a5cc0);box-shadow:0 0 18px #7a3d9c}
.gn-soul .gn-fill{background:linear-gradient(0deg,#002f6c,#2f6fc2);box-shadow:0 0 18px #1f57a0}
.gn-plabel{font-family:var(--font-header,'Bebas Neue',Impact,sans-serif);font-size:20px;letter-spacing:.08em;line-height:1}
.gn-body .gn-plabel{color:#f7525f}.gn-spirit .gn-plabel{color:#b07ad0}.gn-soul .gn-plabel{color:#5f9be0}
.gn-psub{font-size:11px;color:#9a9a9a;font-variant-numeric:tabular-nums}
.gn-ladder{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.gn-st{display:grid;grid-template-columns:22px 1fr;column-gap:6px;align-items:baseline;font-size:14px;padding:5px 8px}
.gn-mark{text-align:center}
.gn-st-done{color:#7d8a88}.gn-st-done .gn-mark{color:#22ab94}
.gn-st-current{background:#141414;color:#fff;border-left:3px solid #D07818}
.gn-st-current .gn-mark{color:#D07818;animation:gn-pulse 1.4s ease-in-out infinite}
.gn-st-pending{color:#4a4a4a}
.gn-st-live{grid-column:2;color:#22ab94;font-size:12px;margin-top:2px}
.gn-caret{animation:gn-blink 1s steps(1) infinite}
.gn-log{background:#070707;border-top:2px solid #22ab94;padding:8px 10px;min-height:96px;font-size:12px;color:#22ab94;display:flex;flex-direction:column;justify-content:flex-end;gap:3px}
.gn-line{opacity:.55;animation:gn-type .3s steps(8,end) both;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gn-line:nth-last-child(-n+3){opacity:.8}.gn-line:last-child,.gn-line-now{opacity:1}
.gn-line-now{color:#D07818}
.gn-pr{color:#D07818}
.gn-foot{display:flex;justify-content:space-between;align-items:center;gap:10px;margin-top:auto}
.gn-meta{font-size:12px;color:#8a8a8a}
.gn-btn{font-family:var(--font-header,'Bebas Neue',Impact,sans-serif);letter-spacing:.1em;font-size:18px;padding:10px 16px;min-height:44px;background:#141414;color:#fff;border:1px solid #333;cursor:pointer}
.gn-btn-gold{background:#002f6c;color:#FFCC78;border-color:#FFCC78;width:100%}
.gn-hint{font-size:11px;color:#5a5a5a;text-align:center}
.gn-waitbox{background:#D07818;color:#000;padding:10px 12px}
.gn-wait-t{font-family:var(--font-header,'Bebas Neue',Impact,sans-serif);font-size:20px;letter-spacing:.08em}
.gn-wait-b{font-size:13px;line-height:1.45}
.gn-errbox{border-left:4px solid #f7525f;background:#1a0606;padding:10px 12px}
.gn-err-t{font-family:var(--font-header,'Bebas Neue',Impact,sans-serif);font-size:22px;letter-spacing:.08em;color:#f7525f}
.gn-err-b{font-size:13px;line-height:1.5;color:#f0d6d8}
.gn-bornbox{display:flex;flex-direction:column;align-items:center;gap:10px;padding:8px 0;text-align:center}
.gn-born-word{font-family:var(--font-chapter,'Inknut Antiqua',Georgia,serif);font-size:44px;line-height:1.1;color:#fff;background:#000;padding:0 18px;text-shadow:-2px 0 #f7525f,2px 0 #2f6fc2,0 0 22px rgba(255,204,120,.55);animation:gn-bornin 1.1s cubic-bezier(.2,.8,.2,1) both}
.gn-born-sub{font-size:12px;color:#22ab94}
.gn-born-note{font-size:13px;color:#bbb}
.gn-born .gn-tube{box-shadow:0 0 24px rgba(255,204,120,.35);border-color:#FFCC78}
.gn-born .gn-scan::after{background:linear-gradient(180deg,transparent,rgba(255,204,120,.12),transparent)}
.gn-col.gn-glitch{animation:gn-glitch .52s steps(2,end) both}
.gn-col.gn-glitch .gn-title-v,.gn-col.gn-glitch .gn-st-current{animation:gn-rgb .6s steps(3,end) both}
@keyframes gn-rgb{0%,66%{text-shadow:-2px 0 #f7525f,2px 0 #22ab94}100%{text-shadow:none}}
.gn-chip{position:fixed;right:12px;bottom:92px;z-index:8990;display:flex;align-items:center;gap:8px;min-height:40px;padding:6px 12px 6px 8px;background:#000;color:#fff;font-family:var(--font-terminal,Consolas,monospace);font-size:12px;letter-spacing:.06em;border:1px solid #22ab94;cursor:pointer;box-shadow:0 2px 10px rgba(0,0,0,.5)}
.gn-chip-wait{border-color:#D07818;color:#D07818}.gn-chip-err{border-color:#f7525f;color:#f7525f}.gn-chip-done{border-color:#FFCC78;color:#FFCC78}
.gn-chip-bars{display:flex;align-items:flex-end;gap:2px;height:20px}
.gn-chip-bars i{display:block;width:4px;transition:height .8s}
@keyframes gn-in{0%{opacity:0;clip-path:inset(48% 0 48% 0)}60%{opacity:1;clip-path:inset(8% 0 12% 0)}100%{opacity:1;clip-path:inset(0)}}
@keyframes gn-sweep{0%{top:-90px}100%{top:100%}}
@keyframes gn-rise{0%{background-position:0 0}100%{background-position:0 -12px}}
@keyframes gn-pulse{0%,100%{opacity:1}50%{opacity:.35}}
@keyframes gn-blink{50%{opacity:0}}
@keyframes gn-type{0%{clip-path:inset(0 100% 0 0)}100%{clip-path:inset(0 0 0 0)}}
@keyframes gn-glitch{0%{transform:translateX(0);clip-path:inset(0)}25%{transform:translateX(-4px);clip-path:inset(12% 0 58% 0)}50%{transform:translateX(3px);clip-path:inset(54% 0 8% 0)}75%{transform:translateX(-1px);clip-path:inset(0)}100%{transform:none;clip-path:none}}
@keyframes gn-bornin{0%{opacity:0;letter-spacing:.6em;filter:blur(6px)}100%{opacity:1;letter-spacing:.04em;filter:none}}
@media (prefers-reduced-motion: reduce){
  .gn-root,.gn-root *,.gn-root *::before,.gn-root *::after,.gn-chip,.gn-chip *{animation:none!important;transition:none!important}
  .gn-scan::after{display:none}
}
`;
