'use client';
/**
 * JEWL's WORK SCREEN (Mike 2026-10-12: "The loading screen for character
 * creation was beautiful… I want to implement that loading screen into JEWL
 * completely"). The genesis loading screen, generalised: RAW FEED pole of the
 * rulebook (black void, Consolas, teal/amber Terminal type, glitch on stage
 * turns) with a Terminal header, the three pillar tubes, the stage ladder,
 * elapsed time, a rolling log, a Needs-you list and Keep working / Close.
 *
 * This file is the SHELL — it knows nothing about genesis. A session-type
 * adapter builds a WorkScreenModel and passes its own blocks as slots:
 *   - genesis:   components/character/GenesisLoading.tsx (prods, GM steps,
 *                born/error/wait boxes, appearance) — looks as it always did;
 *   - others:    components/jewl/JewlWorkPopup.tsx (drafts, waits, notes).
 * The popup opened from the status line in the campaign chrome renders tabs
 * (one per session) and an idle view through the same shell.
 */
import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { NeedsYouItem, WorkPillar, WorkStage } from '@/lib/jewl-work';

// ── Helpers ──────────────────────────────────────────────────────────────

export function fmtElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function useNow(active: boolean, fixedNow?: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (fixedNow != null || !active) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active, fixedNow]);
  return fixedNow ?? now;
}

// ── Model ────────────────────────────────────────────────────────────────

export interface WorkScreenModel {
  ariaLabel: string;
  /** The "born"/finished glow. */
  born?: boolean;
  /** The current stage key — every change replays the glitch. */
  stageKey: string | null;
  headRight: string;
  /** Elapsed clock beside the head text; null hides it. */
  elapsed: string | null;
  titleKey: string;
  titleValue: string;
  /** null = no tubes (idle view). */
  pillars: WorkPillar[] | null;
  /** null = no ladder (finished / idle). */
  stages: WorkStage[] | null;
  /** The live verb under the current stage (only while running). */
  liveVerb: string | null;
  /** A ladder row shown before the first stage exists. */
  placeholderStage?: string | null;
  /** The live caret line at the foot of the log (only while running). */
  nowLine: string | null;
  footMeta: string;
  closeLabel: string;
  hint: string | null;
}

export interface JewlWorkScreenProps {
  model: WorkScreenModel;
  log: Array<{ id: number | string; text: string }>;
  onClose: () => void;
  /** Beside the Terminal badge (e.g. genesis's APPEARANCE ↗). */
  headExtra?: ReactNode;
  /** Above the pillars (e.g. a persistent warning). */
  beforePillars?: ReactNode;
  /** Between the pillars and the ladder — the adapter's blocks. */
  children?: ReactNode;
  /** Session tabs (popup with more than one session). */
  tabs?: ReactNode;
}

/** The screen without the portal (tests + embedding). */
export function JewlWorkScreenBody({ model, log, onClose, headExtra, beforePillars, children, tabs }: JewlWorkScreenProps) {
  // Glitch on every stage turn: the column is keyed by the turn count, so
  // its one-shot glitch animation replays on each change.
  const cur = model.stageKey;
  const [seenStage, setSeenStage] = useState(cur);
  const [turns, setTurns] = useState(0);
  if (cur !== seenStage) {
    setSeenStage(cur);
    if (seenStage !== null) setTurns(t => t + 1);
  }

  return (
    <div className={`gn-root${model.born ? ' gn-born' : ''}`}
      role="dialog" aria-modal="true" aria-label={model.ariaLabel} data-no-hold>
      <style>{WORK_CSS}</style>
      <div className="gn-scan" aria-hidden />
      <div className={`gn-col${turns > 0 ? ' gn-glitch' : ''}`} key={turns}>
        {tabs}
        {/* Terminal header */}
        <div className="gn-head">
          <span className="gn-badge">tHE TERmInAl</span>
          {headExtra}
          <span className="gn-head-r">
            {model.headRight}
            {model.elapsed != null && <>{' · '}<span className="gn-num">{model.elapsed}</span></>}
          </span>
        </div>
        <div className="gn-title">
          <span className="gn-title-k">{model.titleKey}</span>
          <span className="gn-title-v">{model.titleValue}</span>
        </div>

        {beforePillars}

        {/* Pillars */}
        {model.pillars && (
          <div className="gn-pillars" aria-label="Pillars assembled">
            {model.pillars.map(p => (
              <div key={p.key} className={`gn-pillar gn-${p.key}`}>
                <div className="gn-tube">
                  <div className="gn-fill" style={{ height: `${Math.round(p.fill * 100)}%` }} />
                  <div className="gn-tick" style={{ bottom: `${Math.round(p.fill * 100)}%` }} />
                </div>
                <div className="gn-plabel">{p.label}</div>
                <div className="gn-psub">{p.sub}</div>
              </div>
            ))}
          </div>
        )}

        {children}

        {/* Stage ladder */}
        {model.stages && (
          <ol className="gn-ladder">
            {model.stages.map(s => (
              <li key={s.key} className={`gn-st gn-st-${s.status}`}>
                <span className="gn-mark">{s.status === 'done' ? '✓' : s.status === 'current' ? '◆' : '○'}</span>
                <span className="gn-st-l">{s.label}</span>
                {s.status === 'current' && model.liveVerb != null && (
                  <span className="gn-st-live">&gt; {model.liveVerb}<span className="gn-caret">_</span></span>
                )}
              </li>
            ))}
            {model.placeholderStage && (
              <li className="gn-st gn-st-current"><span className="gn-mark">◆</span><span className="gn-st-l">{model.placeholderStage}</span></li>
            )}
          </ol>
        )}

        {/* Rolling Terminal log */}
        <div className="gn-log" aria-live="polite">
          {log.map(l => <div key={l.id} className={`gn-line${l.text.startsWith('⚠') ? ' gn-line-warn' : ''}`}><span className="gn-pr">&gt;</span> {l.text}</div>)}
          {model.nowLine != null && <div className="gn-line gn-line-now"><span className="gn-pr">&gt;</span> {model.nowLine}<span className="gn-caret">_</span></div>}
        </div>

        {/* Footer */}
        <div className="gn-foot">
          <span className="gn-meta">{model.footMeta}</span>
          <button type="button" className="gn-btn" onClick={onClose}>{model.closeLabel}</button>
        </div>
        {model.hint && <div className="gn-hint">{model.hint}</div>}
      </div>
    </div>
  );
}

/** The screen as a full overlay over the current page (portal to body). */
export function JewlWorkScreen(props: JewlWorkScreenProps) {
  if (typeof document === 'undefined') return null;
  return createPortal(<JewlWorkScreenBody {...props} />, document.body);
}

// ── Shared pieces for the popup ──────────────────────────────────────────

const KIND_TAG: Record<NeedsYouItem['kind'], string> = {
  prod: 'ASK', draft: 'DRAFT', question: 'WORD', stalled: 'QUIET', reconciliation: 'CANON', portrait: 'IMAGE',
};

/** The Needs-you list: every GM-blocking item, tagged by kind. */
export function NeedsYouList({ items, title = 'NEEDS YOU', onOpenPortrait }: {
  items: NeedsYouItem[]; title?: string;
  /** BORN ≠ DONE: a Portrait item opens that character's Appearance ↗. */
  onOpenPortrait?: (characterId: string) => void;
}) {
  if (items.length === 0) return null;
  return (
    <div className="jw-needs" role="region" aria-label="Needs you">
      <div className="jw-needs-h">{title} · <span className="gn-num">{items.length}</span></div>
      <ul>
        {items.map(i => (
          <li key={`${i.kind}:${i.id}`} className={`jw-need jw-need-${i.kind}`}>
            <span className="jw-tag">{KIND_TAG[i.kind]}</span>
            <span className="jw-need-b">
              <span className="jw-need-t">{i.title}</span>
              {i.detail && <span className="jw-need-d">{i.detail}</span>}
              {i.kind === 'portrait' && i.characterId && onOpenPortrait && (
                <button type="button" className="gn-apr jw-need-go" data-no-hold
                  onClick={() => onOpenPortrait(i.characterId!)}>APPEARANCE ↗</button>
              )}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export interface WorkTab { id: string; label: string; tone: 'run' | 'wait' | 'err' | 'done' | 'idle'; count: number }

/** Session tabs — active / most recent first; the count is that tab's Needs-you. */
export function WorkTabs({ tabs, active, onSelect }: { tabs: WorkTab[]; active: string; onSelect: (id: string) => void }) {
  return (
    <div className="jw-tabs" role="tablist" aria-label="JEWL's work">
      {tabs.map(t => (
        <button key={t.id} type="button" role="tab" aria-selected={t.id === active} data-no-hold
          className={`jw-tab jw-tab-${t.tone}${t.id === active ? ' jw-tab-on' : ''}`} onClick={() => onSelect(t.id)}>
          <span className="jw-tab-l">{t.label}</span>
          {t.count > 0 && <span className="jw-count">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

// ── Styles (RAW FEED pole) ───────────────────────────────────────────────

export const WORK_CSS = `
.gn-root{position:fixed;inset:0;z-index:9000;background:#000;color:#e8e8e8;font-family:var(--font-terminal,Consolas,monospace);overflow-y:auto;-webkit-overflow-scrolling:touch;animation:gn-in .38s steps(6,end) both}
.gn-scan{pointer-events:none;position:fixed;inset:0;background:repeating-linear-gradient(0deg,rgba(255,255,255,.025) 0 1px,transparent 1px 3px);z-index:0}
.gn-scan::after{content:"";position:absolute;left:0;right:0;height:90px;background:linear-gradient(180deg,transparent,rgba(34,171,148,.07),transparent);animation:gn-sweep 5.5s linear infinite}
.gn-col{position:relative;z-index:1;max-width:412px;margin:0 auto;padding:18px 16px 28px;display:flex;flex-direction:column;gap:16px;min-height:100%}
.gn-head{display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap}
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
.gn-line-warn{color:#f7525f;opacity:1!important}
.gn-seedwarn{border-left:4px solid #f7525f;background:#1a0606;color:#f0d6d8;padding:8px 10px;font-size:12px;line-height:1.5;display:flex;flex-direction:column;gap:2px}
.gn-apr{font-family:var(--font-terminal,Consolas,monospace);font-size:12px;letter-spacing:.06em;min-height:32px;padding:4px 10px;background:#000;color:#FFCC78;border:1px solid #FFCC78;cursor:pointer}
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
.jw-tabs{display:flex;gap:4px;overflow-x:auto;margin:-6px -4px 0;padding:0 4px 2px;scrollbar-width:none}
.jw-tabs::-webkit-scrollbar{display:none}
.jw-tab{flex:0 0 auto;display:flex;align-items:center;gap:6px;min-height:36px;max-width:220px;padding:4px 10px;background:#0d0d0d;color:#8a8a8a;border:0;border-bottom:2px solid #1d1d1d;font-family:var(--font-terminal,Consolas,monospace);font-size:12px;letter-spacing:.04em;cursor:pointer}
.jw-tab-l{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.jw-tab-on{background:#141414;color:#fff;border-bottom-color:#22ab94}
.jw-tab-wait.jw-tab-on{border-bottom-color:#D07818}.jw-tab-err.jw-tab-on{border-bottom-color:#f7525f}.jw-tab-done.jw-tab-on{border-bottom-color:#FFCC78}
.jw-tab-run .jw-tab-l::before{content:"◆ ";color:#22ab94}
.jw-count{background:#D07818;color:#000;font-size:11px;line-height:1;padding:3px 5px;font-variant-numeric:tabular-nums}
.jw-needs{background:#0d0d0d;border-left:4px solid #D07818;padding:8px 10px;display:flex;flex-direction:column;gap:6px}
.jw-needs-h{font-family:var(--font-header,'Bebas Neue',Impact,sans-serif);font-size:20px;letter-spacing:.08em;color:#D07818;line-height:1}
.jw-needs ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.jw-need{display:grid;grid-template-columns:auto 1fr;gap:8px;align-items:baseline;font-size:13px}
.jw-tag{background:#D07818;color:#000;font-size:10px;letter-spacing:.08em;padding:2px 5px}
.jw-need-reconciliation .jw-tag{background:#22ab94}
.jw-need-draft .jw-tag{background:#FFCC78}
.jw-need-portrait .jw-tag{background:#22ab94}
.jw-need-go{align-self:flex-start;margin-top:4px;min-height:32px}
.jw-need-b{display:flex;flex-direction:column;gap:2px;min-width:0}
.jw-need-t{color:#fff}
.jw-need-d{color:#9a9a9a;font-size:12px;line-height:1.4}
.jw-note{font-size:12px;color:#bbb;line-height:1.5;border-left:3px solid #22ab94;padding:4px 0 4px 10px}
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
