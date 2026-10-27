"use client";

/**
 * RollPopup — a roll's CHOICES, force-opened for whoever owns them (Mike 2026-10-26: "This will also be a pop-up for
 * any users since a trailblazer controlling a character has choices to make like how much effort. A watcher will have
 * the choice to manually control effort or allow the AI to choose."). A sibling of JewlInterruptPopup in the same
 * skin (black panel, ^v^v border, scanlines, Inknut inverted-case title, Consolas buttons): closes only on an answer.
 *
 * Trailblazer: the event, the SD already rolled, the colour hint (NEVER the DR), the Effort wager from the governor
 * pools (bounded by the sheet and the ceiling), "throw". A timeout counts down; at zero the server's AI has chosen.
 * Watcher (manual mode): the same, plus the DR field with the sim's suggestion pre-filled, and "let the AI choose".
 * Composable: more context controls are added as rows in the body.
 */
import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { CtxMenuPanel, CtxMenuStreamLabel } from '@/components/ui/ContextMenu';
import { aiEffort } from '@/lib/active-check';
import { HINT_WORD } from '@/lib/roll-card';
import type { EffortWagerPromptEvent } from '@/types/campaign-events';

export type RollPrompt = EffortWagerPromptEvent & { tableRoll: NonNullable<EffortWagerPromptEvent['tableRoll']> };

export interface RollAnswer { wagers: Array<{ governor: string; amount: number }>; dr?: number; aiChose?: boolean }

const HINT_COLOR: Record<'blue' | 'purple' | 'red', string> = { blue: '#4da6ff', purple: '#b366ff', red: '#ff6666' };

export default function RollPopup({ prompt, answering, onThrow, onExpire }: {
  prompt: RollPrompt;
  answering: boolean;
  onThrow: (answer: RollAnswer, at: { x: number; y: number }) => void;
  /** The owner's time ran out: the server's AI has chosen and the card is written. */
  onExpire: () => void;
}) {
  const watcher = prompt.tableRoll.ownerRole === 'watcher';
  const [wagers, setWagers] = useState<Record<string, number>>(() => Object.fromEntries(prompt.availableGovernors.map((g) => [g.name, 0])));
  const [dr, setDr] = useState<number>(prompt.tableRoll.dr ?? 10);
  const [left, setLeft] = useState<number>(prompt.tableRoll.timeoutSec);

  // Force-open: Escape is swallowed; the popup closes only on an answer (or when the owner's time runs out).
  useEffect(() => {
    const swallow = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); } };
    window.addEventListener('keydown', swallow, true);
    return () => window.removeEventListener('keydown', swallow, true);
  }, []);
  useEffect(() => {
    const t = setInterval(() => setLeft((s) => s - 1), 1000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => { if (left <= -1) onExpire(); }, [left, onExpire]);

  const ceiling = Math.max(0, prompt.maxPossible - prompt.sdResult - 1);
  const total = useMemo(() => Object.values(wagers).reduce((s, v) => s + v, 0), [wagers]);

  const change = (name: string, value: number) => {
    const gov = prompt.availableGovernors.find((g) => g.name === name);
    if (!gov) return;
    const others = Object.entries(wagers).filter(([k]) => k !== name).reduce((s, [, v]) => s + v, 0);
    setWagers((w) => ({ ...w, [name]: Math.max(0, Math.min(value, gov.current, ceiling - others)) }));
  };
  const list = () => Object.entries(wagers).filter(([, a]) => a > 0).map(([governor, amount]) => ({ governor, amount }));

  const aiPick = (e: React.MouseEvent) => {
    const picked = aiEffort({ sd: prompt.sdResult, fdMax: prompt.fdMax, dr, pools: prompt.availableGovernors.map((g) => ({ name: g.name, current: g.current })), ceiling });
    onThrow({ wagers: picked, dr, aiChose: true }, { x: e.clientX, y: e.clientY });
  };

  if (typeof document === 'undefined') return null;
  const mono = 'var(--font-terminal), Consolas, monospace';
  const btn: React.CSSProperties = { fontFamily: mono, fontSize: 13, color: '#fff', background: 'none', border: '1px solid #444', padding: '8px 12px', cursor: 'pointer', minHeight: 40, flex: 1 };
  const step: React.CSSProperties = { ...btn, flex: 'none', width: 40, padding: 0 };
  const sd = prompt.sdDie.startsWith('flat') ? `+${prompt.sdResult}` : `${prompt.sdDie.toUpperCase()} → ${prompt.sdResult}`;

  return createPortal(
    <div
      data-roll-popup
      role="dialog"
      aria-modal="true"
      aria-label={`Roll for ${prompt.tableRoll.actorName}`}
      style={{ position: 'fixed', inset: 0, zIndex: 100001, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16, overflowY: 'auto' }}
    >
      <div style={{ width: 'min(100%, 460px)', maxHeight: '100%', display: 'flex', flexDirection: 'column' }}>
        <CtxMenuStreamLabel />
        <CtxMenuPanel title={`Roll — ${prompt.tableRoll.actorName}`}>
          <div style={{ padding: '10px 12px 6px', fontFamily: mono, color: '#fff', fontSize: 13, lineHeight: 1.5, overflowY: 'auto', maxHeight: '70vh' }}>
            <p style={{ margin: '0 0 8px', whiteSpace: 'pre-wrap' }}>{prompt.tableRoll.event}</p>
            <p style={{ margin: '0 0 8px', color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>
              {prompt.skillName ? `${prompt.skillName} (skill ${prompt.skillLevel})` : 'unskilled'} · SD {sd}
              {' · '}
              <span style={{ color: HINT_COLOR[prompt.difficultyHint] }} data-hint={prompt.difficultyHint}>{HINT_WORD[prompt.difficultyHint]}</span>
            </p>
            {watcher && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 8px', fontSize: 12 }}>
                <span style={{ color: 'rgba(255,255,255,0.7)' }}>DR (the sim suggests {prompt.tableRoll.dr ?? 10})</span>
                <input
                  type="number" min={1} max={99} value={dr} disabled={answering} data-roll-dr
                  onChange={(e) => setDr(Math.max(1, Math.min(99, Math.round(Number(e.target.value)) || 1)))}
                  // 16px: anything smaller makes iOS zoom the page when the owner taps in.
                  style={{ width: 70, fontFamily: mono, fontSize: 16, color: '#fff', background: '#111', border: '1px solid #444', padding: '4px 6px', outline: 0 }}
                />
              </label>
            )}
            <div style={{ margin: '0 0 6px', color: 'rgba(255,255,255,0.7)', fontSize: 12 }}>Effort (spent either way) — at most {ceiling}</div>
            {prompt.availableGovernors.map((g) => (
              <div key={g.name} style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '0 0 6px' }}>
                <span style={{ flex: 1 }}>{g.name} <span style={{ color: 'rgba(255,255,255,0.45)' }}>({g.current})</span></span>
                <button className="hover:bg-white/10" style={step} disabled={answering || wagers[g.name] <= 0} onClick={() => change(g.name, (wagers[g.name] ?? 0) - 1)} aria-label={`less ${g.name}`}>−</button>
                <span data-effort={g.name} style={{ width: 24, textAlign: 'center' }}>{wagers[g.name] ?? 0}</span>
                <button className="hover:bg-white/10" style={step} disabled={answering || (wagers[g.name] ?? 0) >= g.current || total >= ceiling} onClick={() => change(g.name, (wagers[g.name] ?? 0) + 1)} aria-label={`more ${g.name}`}>+</button>
              </div>
            ))}
            {!watcher && (
              <p style={{ margin: '8px 0 0', color: 'rgba(255,255,255,0.45)', fontSize: 11 }}>
                {left > 0 ? `If you do not answer in ${left}s the AI chooses for ${prompt.tableRoll.actorName}.` : 'Time is up — the AI is choosing.'}
              </p>
            )}
          </div>
          <div style={{ display: 'flex', gap: 8, padding: '6px 12px 10px' }}>
            <button className="hover:bg-white/10" style={btn} disabled={answering} onClick={(e) => onThrow({ wagers: list(), ...(watcher ? { dr } : {}) }, { x: e.clientX, y: e.clientY })} title="Spend this Effort and throw the Fate Die">
              {answering ? '…' : `throw (${total} effort)`}
            </button>
            {watcher && (
              <button className="hover:bg-white/10" style={btn} disabled={answering} onClick={aiPick} title="The sim chooses the Effort; the card says so">
                let the AI choose
              </button>
            )}
          </div>
        </CtxMenuPanel>
      </div>
    </div>,
    document.body,
  );
}
