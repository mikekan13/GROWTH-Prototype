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
import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useCampaignStream } from '@/hooks/useCampaignStream';
import type { GenesisProgress } from '@/services/character-genesis-progress';
import { genesisPillars, pillarFills } from '@/lib/jewl-work';
import { JewlWorkScreen, WORK_CSS, fmtElapsed, useNow, type WorkScreenModel } from '@/components/jewl/JewlWorkScreen';
import { GenesisGmSteps } from './GenesisGmSteps';
import { GenesisProds, GenesisOpenThreads } from './GenesisProds';

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
  attach_block: 'attaching a block',
  forge_list_drafts: 'checking the Forge',
  forge_read: 'reading the Forge',
  edit_character_sheet: 'writing the sheet',
  update_work_session: 'logging progress',
  establish_world_facts: 'recording world facts',
  raise_prod: 'raising a question for you',
  end_prod_round: 'handing you the questions',
  record_delegated_choice: 'recording what he chose',
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
// pillarFills moved to lib/jewl-work (the work screen's genesis adapter).
export { pillarFills };

/** The feed line for a seed withhold (fixed vocabulary only). */
export function seedWarningLine(w: { categories: string[]; outcome: string }): string {
  const cats = w.categories.join(', ') || 'unspecified';
  return w.outcome === 'softened'
    ? `⚠ part of the seed was toned down for JEWL: ${cats}`
    : `⚠ part of the seed was withheld from JEWL: ${cats}`;
}

/** One Terminal log line per observed change — counts and stage names only. */
export function diffLogLines(prev: GenesisProgress | null, next: GenesisProgress): string[] {
  const out: string[] = [];
  if (!prev || prev.sessionId !== next.sessionId) {
    out.push(`genesis session open · step ${next.step}/${next.total}`);
  }
  // Never silent (2026-10-12): every new seed withhold gets a feed line.
  const prevWarn = prev && prev.sessionId === next.sessionId ? (prev.seedWarnings ?? []).length : 0;
  for (const w of (next.seedWarnings ?? []).slice(prevWarn)) out.push(seedWarningLine(w));
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
    const np = next.prods?.length ?? 0;
    const pp = prev.prods?.length ?? 0;
    if (np > pp) out.push(`jewl raised +${np - pp} question${np - pp === 1 ? '' : 's'}`);
    const decided = (p: GenesisProgress) => (p.prods ?? []).filter(x => x.status !== 'OPEN').length;
    const dd = decided(next) - decided(prev);
    if (dd > 0 && np === pp) out.push(`watcher decided ${dd}`);
    if (next.counts.cycles > prev.counts.cycles) out.push(`cycle ${next.counts.cycles} complete`);
    if (next.state === 'waiting' && prev.state !== 'waiting') out.push('paused · waiting on the watcher');
    if (next.state === 'running' && prev.state === 'waiting') out.push('resumed');
  }
  return out;
}

const WAIT_COPY: Record<string, { title: string; body: string }> = {
  prods: {
    title: 'JEWL HAS QUESTIONS',
    body: 'Before he builds, JEWL asks about the gaps in the story. Answer, leave open, or let him decide, then press Build.',
  },
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

// ── Overlay — the genesis adapter of JEWL's work screen ──────────────────

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
  /** Watcher steps (submit JEWL's drafts): needs the campaign + a refetch. */
  campaignId?: string;
  /** Shown in JEWL's prod line ("they're on Violet's page"). */
  characterName?: string | null;
  /** Harness: open the answer field on this prod with this draft. */
  prodAnswerOpenId?: string;
  prodAnswerDraft?: string;
  onStepsChanged?: () => void;
  onOpenForge?: () => void;
  /** Appearance is SEPARATE from genesis (Mike 2026-10-12): open the
   *  look/photo/style editor while JEWL keeps working (the badge tracks him). */
  onOpenAppearance?: () => void;
  /** JEWL's work popup: session tabs above the header. */
  tabs?: ReactNode;
}

export function GenesisLoadingOverlay({
  progress, liveTool, submitError, onDismiss, onViewSheet, fixedNow, initialLog,
  campaignId, onStepsChanged, onOpenForge, onOpenAppearance, characterName, prodAnswerOpenId, prodAnswerDraft,
  tabs,
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

  const started = progress?.startedAt ? Date.parse(progress.startedAt) : null;
  const ended = progress?.endedAt ? Date.parse(progress.endedAt) : null;
  const elapsed = started ? fmtElapsed((ended ?? now) - started) : '00:00';
  const c = progress?.counts;
  const currentStage = progress?.stages.find(s => s.status === 'current');
  const errorKind = submitError ? 'submit' : progress?.error ?? null;
  const stepsN = progress?.gmSteps?.length ?? 0;

  const model: WorkScreenModel = {
    ariaLabel: 'JEWL genesis progress',
    born: state === 'done',
    stageKey: progress?.current ?? null,
    headRight: state === 'done' ? 'COMPLETE' : progress?.step ? `STEP ${progress.step}/${progress.total}` : 'OPENING',
    elapsed,
    titleKey: '// GENESIS',
    titleValue: state === 'done' && stepsN > 0 ? `a being is born · ${stepsN} need${stepsN === 1 ? 's' : ''} you`
      : state === 'done' ? 'a being is born'
        : state === 'error' ? 'genesis halted'
          : progress?.prodding && state === 'waiting' ? 'JEWL has questions before he builds'
            : progress?.prodding ? 'JEWL is reading the seed'
              : state === 'waiting' ? 'paused · waiting on the watcher'
                : 'JEWL is assembling a being',
    pillars: genesisPillars(progress),
    stages: state !== 'done' ? (progress?.stages ?? []) : null,
    liveVerb: state === 'running' ? toolVerb(liveTool) : null,
    placeholderStage: !progress && !submitError ? 'Handing the genome to JEWL' : null,
    nowLine: state === 'running' ? (currentStage ? toolVerb(liveTool) : 'listening') : null,
    footMeta: `${c ? `${c.cycles} cycle${c.cycles === 1 ? '' : 's'}` : '—'}${c && c.pendingApproval > 0 ? ` · ${c.pendingApproval} awaiting approval` : ''}`,
    closeLabel: state === 'done' || state === 'error' ? 'CLOSE' : 'KEEP WORKING ▾',
    hint: running ? 'It keeps running if you close this — the badge tracks it.' : null,
  };

  return (
    <JewlWorkScreen
      model={model}
      log={log}
      onClose={onDismiss}
      tabs={tabs}
      headExtra={onOpenAppearance && state !== 'error' ? (
        <button type="button" className="gn-apr" data-no-hold onClick={onOpenAppearance}
          title="Work on the look, photos and style while JEWL keeps building — the badge tracks him.">
          APPEARANCE ↗
        </button>
      ) : null}
      beforePillars={(progress?.seedWarnings?.length ?? 0) > 0 ? (
        // Seed withheld from JEWL — persistent, never only in the rolling log
        <div className="gn-seedwarn" role="alert">
          {(progress?.seedWarnings ?? []).map((w, i) => <div key={i}>{seedWarningLine(w)}</div>)}
        </div>
      ) : null}
    >
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
      {campaignId && progress?.prodding && progress.sessionId && (
        <GenesisProds prods={progress.prods ?? []} campaignId={campaignId} sessionId={progress.sessionId}
          characterName={characterName} waiting={state === 'waiting'}
          onChanged={() => onStepsChanged?.()} onOpenAppearance={onOpenAppearance}
          initialOpenId={prodAnswerOpenId} initialDraft={prodAnswerDraft} />
      )}
      {state === 'done' && (progress?.openThreads?.length ?? 0) > 0 && (
        <GenesisOpenThreads threads={progress?.openThreads ?? []} />
      )}
      {campaignId && progress && stepsN > 0 && (
        <GenesisGmSteps steps={progress.gmSteps} campaignId={campaignId}
          onChanged={() => onStepsChanged?.()} onOpenForge={onOpenForge} onOpenAppearance={onOpenAppearance} />
      )}
      {state === 'waiting' && progress?.wait && WAIT_COPY[progress.wait]
        && !(progress.wait === 'approval' && campaignId && stepsN > 0)
        && !(progress.wait === 'prods' && campaignId) && (
        <div className="gn-waitbox" role="status">
          <div className="gn-wait-t">{WAIT_COPY[progress.wait].title}</div>
          <div className="gn-wait-b">
            {progress.wait === 'approval' && c ? `${c.pendingApproval} ` : ''}{WAIT_COPY[progress.wait].body}
          </div>
        </div>
      )}
    </JewlWorkScreen>
  );
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
  const needs = (progress.gmSteps ?? []).length;
  const tone = progress.state === 'error' ? 'err' : progress.state === 'waiting' || needs > 0 ? 'wait' : progress.state === 'done' ? 'done' : 'run';
  const text = progress.state === 'done' && needs > 0 ? `BORN · ${needs} NEED${needs === 1 ? 'S' : ''} YOU`
    : progress.state === 'done' ? 'BORN · VIEW'
    : progress.state === 'error' ? 'GENESIS HALTED'
      : progress.state === 'waiting' ? `NEEDS YOU · ${progress.step}/${progress.total}`
        : `GENESIS ${progress.step}/${progress.total} · ${fmtElapsed((ended ?? now) - started)}`;
  return createPortal(
    <button type="button" className={`gn-chip gn-chip-${tone}`} onClick={onOpen} data-no-hold
      aria-label="Open genesis progress">
      <style>{WORK_CSS}</style>
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
