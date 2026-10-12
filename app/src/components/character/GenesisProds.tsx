'use client';
/**
 * Genesis PRODS (Mike 2026-10-12 — genesis is a dialogue,
 * [[ruling-genesis-is-a-dialogue-jewl-prods-gm-2026-10-12]]). Before JEWL
 * builds, he asks the GM about the load-bearing creative gaps in the seed.
 * Each prod shows the passage that raised it (dim, italic, tap to expand),
 * the question and what hinges on it, and three answers: ANSWER (inline
 * text), LEAVE OPEN (a mystery for play — JEWL never fills it), YOU DECIDE
 * (JEWL fills it and records his choice). Decided prods collapse to one line
 * (tap to change, until Build). BUILD ends the dialogue; unanswered prods are
 * left open after an in-page confirm.
 *
 * GM = storyteller; JEWL = production crew, not a co-author.
 */
import { useState } from 'react';
import type { GenesisProdView } from '@/services/character-genesis-progress';

type Decision = 'ANSWER' | 'LEAVE_OPEN' | 'YOU_DECIDE';

const OUTCOME: Record<string, { mark: string; word: string; cls: string }> = {
  ANSWERED: { mark: '✓', word: 'ANSWERED', cls: 'gp-o-ans' },
  LEFT_OPEN: { mark: '◌', word: 'LEFT OPEN', cls: 'gp-o-open' },
  DELEGATED: { mark: '⇢', word: 'JEWL DECIDES', cls: 'gp-o-del' },
};

/** JEWL's one line for the round, in voice. */
export function prodChatLine(open: number, name?: string | null): string {
  const page = name ? ` — they're on ${name}'s page` : '';
  if (open === 0) return 'Nothing more to ask. Build when you\'re ready.';
  return open === 1
    ? `I've got 1 question before I build${name ? ` — it's on ${name}'s page` : ''}.`
    : `I've got ${open} questions before I build${page}.`;
}

export function GenesisProds({
  prods, campaignId, sessionId, characterName, waiting, onChanged, initialOpenId, initialDraft, onOpenAppearance,
}: {
  prods: GenesisProdView[];
  campaignId: string;
  sessionId: string;
  characterName?: string | null;
  /** JEWL closed his round (he is waiting on the GM). */
  waiting: boolean;
  onChanged: () => void;
  /** Harness: open the answer field on this prod with this draft. */
  initialOpenId?: string;
  initialDraft?: string;
  /** Appearance is separate from genesis (2026-10-12) — edit it alongside. */
  onOpenAppearance?: () => void;
}) {
  const [answering, setAnswering] = useState<string | null>(initialOpenId ?? null);
  const [draft, setDraft] = useState(initialDraft ?? '');
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [reopened, setReopened] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [built, setBuilt] = useState(false);

  const open = prods.filter(p => p.status === 'OPEN');
  const showBuild = prods.length > 0 || waiting;
  if (!showBuild) return null;

  const decide = async (prod: GenesisProdView, decision: Decision, answer?: string) => {
    setBusy(prod.id);
    setError(null);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/genesis/prods/${prod.id}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(decision === 'ANSWER' ? { decision, answer } : { decision }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setAnswering(null);
      setDraft('');
      setReopened(r => ({ ...r, [prod.id]: false }));
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Not saved');
    } finally {
      setBusy(null);
    }
  };

  const build = async () => {
    setConfirming(false);
    setBusy('build');
    setError(null);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/genesis/${sessionId}/build`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmLeaveOpen: open.length > 0 }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setBuilt(true);
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Build failed');
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="gp-box" aria-label="JEWL's questions before he builds">
      <style>{GP_CSS}</style>
      <div className="gp-head">
        <span className="gp-title">NEEDS YOU · {open.length}</span>
        <span className="gp-sub-r">
          {onOpenAppearance && (
            <button type="button" className="gn-apr" data-no-hold onClick={onOpenAppearance} style={{ marginRight: 8 }}>APPEARANCE ↗</button>
          )}
          {prods.length} prod{prods.length === 1 ? '' : 's'}
        </span>
      </div>
      <div className="gp-jewl"><span className="gp-jewl-k">JEWL ›</span> {waiting || prods.length > 0
        ? prodChatLine(open.length, characterName)
        : 'Reading the seed…'}</div>
      <p className="gp-sub">The story is yours. Answer what you know, leave open what should be found in play, or hand it to JEWL.</p>

      <ul className="gp-list">
        {prods.map(p => {
          const decided = p.status !== 'OPEN' && !reopened[p.id];
          const o = OUTCOME[p.status];
          if (decided && o) {
            return (
              <li key={p.id} className={`gp-row gp-done ${o.cls}`}>
                <button type="button" className="gp-line" data-no-hold
                  onClick={() => setReopened(r => ({ ...r, [p.id]: true }))}
                  aria-label={`Change your answer: ${p.question}`}>
                  <span className="gp-mark">{o.mark}</span>
                  <span className="gp-word">{o.word}</span>
                  <span className="gp-q1">{p.question}</span>
                  {p.status === 'ANSWERED' && p.answer && <span className="gp-a1">— {p.answer}</span>}
                </button>
              </li>
            );
          }
          const isAnswering = answering === p.id;
          return (
            <li key={p.id} className="gp-row">
              <button type="button" className={`gp-anchor${expanded[p.id] ? ' gp-anchor-x' : ''}`} data-no-hold
                onClick={() => setExpanded(e => ({ ...e, [p.id]: !e[p.id] }))}
                aria-expanded={!!expanded[p.id]} aria-label="The passage that raised this — tap to expand">
                “{p.anchorQuote}”
              </button>
              <div className="gp-q">{p.question}</div>
              <div className="gp-why"><span className="gp-why-k">{p.kind === 'MECHANICAL_CHECK' ? 'MECHANICS HINGE' : 'HINGES ON'}</span> {p.why}</div>
              {isAnswering ? (
                <div className="gp-answer">
                  <textarea className="gp-input" value={draft} rows={3} autoFocus
                    placeholder="Your answer — it becomes canon for the build."
                    onChange={e => setDraft(e.target.value)} />
                  <div className="gp-actions">
                    <button type="button" className="gp-btn" data-no-hold onClick={() => { setAnswering(null); setDraft(''); }}>CANCEL</button>
                    <button type="button" className="gp-btn gp-btn-go" data-no-hold
                      disabled={!draft.trim() || busy === p.id}
                      onClick={() => void decide(p, 'ANSWER', draft.trim())}>
                      {busy === p.id ? '…' : 'SEND ▸'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="gp-actions">
                  <button type="button" className="gp-btn gp-btn-go" data-no-hold disabled={busy === p.id}
                    onClick={() => { setAnswering(p.id); setDraft(p.answer ?? ''); }}>ANSWER</button>
                  <button type="button" className="gp-btn" data-no-hold disabled={busy === p.id}
                    onClick={() => void decide(p, 'LEAVE_OPEN')}>LEAVE OPEN</button>
                  <button type="button" className="gp-btn" data-no-hold disabled={busy === p.id}
                    onClick={() => void decide(p, 'YOU_DECIDE')}>YOU DECIDE</button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      {error && <div className="gp-err" role="alert">{error}</div>}

      {confirming ? (
        <div className="gp-confirm" role="alertdialog" aria-label="Confirm build">
          <div>{open.length} unanswered will be left open — mysteries for play. JEWL won&apos;t fill them.</div>
          <div className="gp-actions gp-actions-l">
            <button type="button" className="gp-btn gp-btn-go" data-no-hold onClick={() => void build()}>YES, BUILD</button>
            <button type="button" className="gp-btn" data-no-hold onClick={() => setConfirming(false)}>CANCEL</button>
          </div>
        </div>
      ) : (
        <button type="button" className="gp-build" data-no-hold disabled={busy === 'build' || built}
          onClick={() => { if (open.length > 0) setConfirming(true); else void build(); }}>
          {built ? 'BUILDING…' : busy === 'build' ? '…' : 'BUILD ▸'}
        </button>
      )}
    </section>
  );
}

/** Post-birth: the prods the GM left open, as a visible list. */
export function GenesisOpenThreads({ threads, compact }: {
  threads: Array<{ id: string; anchorQuote: string; question: string }>;
  compact?: boolean;
}) {
  if (threads.length === 0) return null;
  return (
    <section className={`gp-threads${compact ? ' gp-threads-c' : ''}`} aria-label="Open threads">
      <style>{GP_CSS}</style>
      <div className="gp-th-title">OPEN THREADS · {threads.length}</div>
      <p className="gp-sub">Left open at genesis — to be discovered in play. JEWL did not fill them.</p>
      <ul className="gp-th-list">
        {threads.map(t => (
          <li key={t.id}>
            <div className="gp-q">{t.question}</div>
            <div className="gp-th-anchor">“{t.anchorQuote}”</div>
          </li>
        ))}
      </ul>
    </section>
  );
}

const GP_CSS = `
.gp-box{background:#0b0b0b;border-left:4px solid #D07818;padding:10px 12px;display:flex;flex-direction:column;gap:8px}
.gp-head{display:flex;justify-content:space-between;align-items:baseline;gap:8px}
.gp-title{font-family:var(--font-header,'Bebas Neue',Impact,sans-serif);font-size:22px;letter-spacing:.08em;color:#D07818}
.gp-sub-r{font-size:11px;color:#7d8a88;letter-spacing:.06em}
.gp-jewl{font-size:13px;color:#fff;background:#000;padding:6px 8px;border:1px solid #1f1f1f;line-height:1.4}
.gp-jewl-k{color:#22ab94;letter-spacing:.08em}
.gp-sub{margin:0;font-size:12px;color:#9a9a9a;line-height:1.4}
.gp-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.gp-row{background:#141414;padding:9px 9px 8px;display:flex;flex-direction:column;gap:6px}
.gp-anchor{all:unset;box-sizing:border-box;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;font-style:italic;font-size:12px;line-height:1.45;color:#8c8c8c;border-left:2px solid #333;padding-left:8px;cursor:pointer;font-family:var(--font-soul,'Inknut Antiqua',Georgia,serif)}
.gp-anchor-x{-webkit-line-clamp:unset;display:block;color:#b5b5b5}
.gp-q{color:#fff;font-size:14px;line-height:1.45}
.gp-why{font-size:12px;color:#9fd8cd;line-height:1.4}
.gp-why-k{font-size:10px;letter-spacing:.1em;color:#000;background:#22ab94;padding:1px 5px;margin-right:4px}
.gp-actions{display:flex;gap:6px;justify-content:flex-end;flex-wrap:wrap}
.gp-actions-l{justify-content:flex-start}
.gp-btn{font-family:var(--font-header,'Bebas Neue',Impact,sans-serif);font-size:16px;letter-spacing:.1em;min-height:40px;min-width:44px;padding:6px 12px;background:#000;color:#fff;border:1px solid #333;cursor:pointer}
.gp-btn:disabled{opacity:.45}
.gp-btn-go{border-color:#D07818;color:#D07818}
.gp-answer{display:flex;flex-direction:column;gap:6px}
.gp-input{width:100%;box-sizing:border-box;background:#000;color:#fff;border:1px solid #D07818;padding:8px;font:inherit;font-size:14px;line-height:1.45;resize:vertical}
.gp-done{padding:0;background:transparent}
.gp-line{all:unset;box-sizing:border-box;width:100%;display:flex;gap:6px;align-items:baseline;padding:6px 8px;background:#101010;cursor:pointer;font-size:12px;color:#9a9a9a;white-space:nowrap;overflow:hidden}
.gp-mark{flex:none}
.gp-word{flex:none;font-size:10px;letter-spacing:.1em}
.gp-q1{overflow:hidden;text-overflow:ellipsis;color:#cfcfcf;min-width:0;flex:0 1 auto;max-width:55%}
.gp-a1{overflow:hidden;text-overflow:ellipsis;color:#9fd8cd;min-width:0;flex:1 1 auto}
.gp-o-ans .gp-mark,.gp-o-ans .gp-word{color:#22ab94}
.gp-o-open .gp-mark,.gp-o-open .gp-word{color:#b07ad0}
.gp-o-del .gp-mark,.gp-o-del .gp-word{color:#FFCC78}
.gp-err{color:#f7525f;font-size:12px}
.gp-confirm{background:#1a1006;border:1px solid #D07818;padding:10px;font-size:13px;color:#f3e3c3;display:flex;flex-direction:column;gap:8px}
.gp-build{font-family:var(--font-header,'Bebas Neue',Impact,sans-serif);font-size:20px;letter-spacing:.12em;min-height:46px;width:100%;background:#D07818;color:#000;border:0;cursor:pointer}
.gp-build:disabled{opacity:.5}
.gp-threads{background:#0b0b0b;border-left:4px solid #582a72;padding:10px 12px;display:flex;flex-direction:column;gap:6px;font-family:var(--font-terminal,Consolas,monospace)}
.gp-th-title{font-family:var(--font-header,'Bebas Neue',Impact,sans-serif);font-size:20px;letter-spacing:.08em;color:#b07ad0}
.gp-th-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.gp-th-anchor{font-style:italic;font-size:12px;color:#8c8c8c;border-left:2px solid #333;padding-left:8px;margin-top:2px}
`;
