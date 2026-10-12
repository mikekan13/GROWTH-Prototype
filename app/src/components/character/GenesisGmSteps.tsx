'use client';
/**
 * Genesis GM steps (Mike 2026-10-11): every step only the Watcher can take
 * to finish a genesis — JEWL's drafts awaiting consent in the Forge. JEWL
 * never approves ([[jewl-never-approves-forge-consent-2026-08-26]]); this
 * list hands the Watcher the SAME Forge publish route the Forge panel uses
 * (POST /api/campaigns/[id]/forge/[itemId]/publish — same validation, same
 * GM gate, same batch-watch wake-up), one per row or "Submit all" after an
 * in-page confirm. Each row's ComplexTooltip carries the full submission
 * (kind, KV + who priced it, rule text, what it's for, provenance); each row
 * links into the Forge for edits.
 */
import { useState, type ReactNode } from 'react';
import { ComplexTooltip } from '@/components/ui/ComplexTooltip';
import type { GenesisGmStep } from '@/services/character-genesis-progress';

type RowResult = { status: 'sending' } | { status: 'ok' } | { status: 'fail'; message: string };

/** Ask the canvas to open the Forge on this draft (CampaignCanvas listens). */
export const OPEN_FORGE_EVENT = 'growth:open-forge';

function kvText(kv: number | null): string {
  if (kv == null) return 'ungraded';
  return `${kv > 0 ? '' : kv < 0 ? '−' : ''}${Math.abs(kv)} KV`;
}

async function publish(campaignId: string, id: string): Promise<RowResult> {
  try {
    const res = await fetch(`/api/campaigns/${campaignId}/forge/${id}/publish`, { method: 'POST' });
    if (res.ok) return { status: 'ok' };
    const data = await res.json().catch(() => ({})) as { error?: string };
    return { status: 'fail', message: data.error || `HTTP ${res.status}` };
  } catch (err) {
    return { status: 'fail', message: err instanceof Error ? err.message : 'network error' };
  }
}

export function GenesisGmSteps({ steps, campaignId, onChanged, onOpenForge, onOpenAppearance }: {
  steps: GenesisGmStep[];
  campaignId: string;
  /** Refetch progress after submits (rows leave once the server agrees). */
  onChanged: () => void;
  /** Leaving for the Forge (the overlay steps aside). */
  onOpenForge?: () => void;
  /** Appearance is separate from genesis (2026-10-12) — edit it alongside. */
  onOpenAppearance?: () => void;
}) {
  const [results, setResults] = useState<Record<string, RowResult>>({});
  // Rows submitted here stay on screen (✓) after the server drops them.
  const [kept, setKept] = useState<GenesisGmStep[]>([]);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  // Per-draft GM feedback (Mike 2026-10-12): one inline note field at a time;
  // a sent row shows "revising…" until a NEW draft of its kind appears.
  const [fbOpen, setFbOpen] = useState<string | null>(null);
  const [fbText, setFbText] = useState('');
  const [fbFail, setFbFail] = useState<string | null>(null);
  const [revising, setRevising] = useState<Array<{ step: GenesisGmStep; seen: string[] }>>([]);
  const stillRevising = revising.filter(r => !steps.some(s => s.type === r.step.type && !r.seen.includes(s.id)));

  const rows = [
    ...steps,
    ...kept.filter(k => !steps.some(s => s.id === k.id)),
    ...stillRevising.map(r => r.step).filter(r => !steps.some(s => s.id === r.id)),
  ];
  const isRevising = (id: string) => stillRevising.some(r => r.step.id === id);
  const open = steps.filter(s => results[s.id]?.status !== 'ok' && !isRevising(s.id));
  if (rows.length === 0) return null;

  const sendFeedback = async (step: GenesisGmStep) => {
    const note = fbText.trim();
    if (!note) return;
    setFbFail(null);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/genesis/drafts/${step.id}/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ note }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        setFbFail(data.error || `HTTP ${res.status}`);
        return;
      }
      setRevising(r => [...r.filter(x => x.step.id !== step.id), { step, seen: steps.map(s => s.id) }]);
      setFbOpen(null);
      setFbText('');
      onChanged();
    } catch (err) {
      setFbFail(err instanceof Error ? err.message : 'network error');
    }
  };

  const submitOne = async (step: GenesisGmStep) => {
    setResults(r => ({ ...r, [step.id]: { status: 'sending' } }));
    const res = await publish(campaignId, step.id);
    setResults(r => ({ ...r, [step.id]: res }));
    if (res.status === 'ok') setKept(k => [...k.filter(x => x.id !== step.id), step]);
    return res;
  };

  const submitAll = async () => {
    setConfirming(false);
    setBusy(true);
    for (const step of open) {
      await submitOne(step); // sequential: the Forge watch wakes JEWL once, on the last
    }
    setBusy(false);
    onChanged();
  };

  const openForge = (step: GenesisGmStep) => {
    window.dispatchEvent(new CustomEvent(OPEN_FORGE_EVENT, { detail: { id: step.id, type: step.type } }));
    onOpenForge?.();
  };

  return (
    <section className="gs-box" aria-label="Steps that need you">
      <style>{GS_CSS}</style>
      <div className="gs-head">
        <span className="gs-title">NEEDS YOU · {open.length}</span>
        {onOpenAppearance && (
          <button type="button" className="gn-apr" data-no-hold onClick={onOpenAppearance}>APPEARANCE ↗</button>
        )}
        {open.length > 1 && !confirming && (
          <button type="button" className="gs-all" data-no-hold disabled={busy} onClick={() => setConfirming(true)}>
            SUBMIT ALL
          </button>
        )}
      </div>
      <p className="gs-sub">JEWL drafted these. Nothing enters the campaign until you submit it. Tap a row for the full draft.</p>
      {confirming && (
        <div className="gs-confirm" role="alertdialog" aria-label="Confirm submit all">
          <div>Submit all {open.length} drafts as they stand? Their KV is committed on your consent.</div>
          <div className="gs-confirm-b">
            <button type="button" className="gs-btn gs-btn-go" data-no-hold onClick={() => void submitAll()}>YES, SUBMIT {open.length}</button>
            <button type="button" className="gs-btn" data-no-hold onClick={() => setConfirming(false)}>CANCEL</button>
          </div>
        </div>
      )}
      <ul className="gs-list">
        {rows.map(step => {
          const r = results[step.id];
          const done = r?.status === 'ok';
          const rev = isRevising(step.id);
          return (
            <li key={step.id} className={`gs-row${done || rev ? ' gs-done' : ''}`}>
              <ComplexTooltip
                title={step.name}
                modifiers={[]}
                totalValue={0}
                skin="terminal"
                triggerClassName="gs-info"
                triggerProps={{ role: 'button', tabIndex: 0, 'aria-haspopup': 'dialog', 'data-no-hold': '', 'data-step': step.id }}
                content={<StepCard step={step} />}
              >
                <span className="gs-kind">{step.type.toUpperCase()}</span>
                <span className="gs-name">{step.name}</span>
                <span className="gs-kv">{kvText(step.kv)}</span>
              </ComplexTooltip>
              <div className="gs-actions">
                {rev ? <span className="gs-rev" role="status">REVISING…</span> : done ? <span className="gs-ok">✓ SUBMITTED</span> : (
                  <button type="button" className="gs-btn gs-btn-go" data-no-hold disabled={busy || r?.status === 'sending'}
                    onClick={() => { void submitOne(step).then(res => { if (res.status === 'ok') onChanged(); }); }}>
                    {r?.status === 'sending' ? '…' : 'SUBMIT'}
                  </button>
                )}
                {!done && !rev && (
                  <button type="button" className="gs-btn" data-no-hold aria-expanded={fbOpen === step.id}
                    onClick={() => { setFbOpen(o => (o === step.id ? null : step.id)); setFbText(''); setFbFail(null); }}>
                    FEEDBACK
                  </button>
                )}
                {!done && !rev && <button type="button" className="gs-btn" data-no-hold onClick={() => openForge(step)}>FORGE ↗</button>}
              </div>
              {fbOpen === step.id && !rev && (
                <div className="gs-fb">
                  <textarea className="gs-fb-in" data-no-hold maxLength={600} rows={2} value={fbText}
                    aria-label={`Feedback for JEWL on ${step.name}`}
                    placeholder={step.type === 'seed' ? 'What should change? JEWL may re-pick the seed.' : 'What should change? JEWL redrafts this one.'}
                    onChange={e => setFbText(e.target.value)} />
                  <button type="button" className="gs-btn gs-btn-go" data-no-hold disabled={!fbText.trim()}
                    onClick={() => { void sendFeedback(step); }}>SEND</button>
                  {fbFail && <div className="gs-fail" role="alert">Not sent: {fbFail}</div>}
                </div>
              )}
              {r?.status === 'fail' && <div className="gs-fail" role="alert">Not submitted: {r.message}</div>}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function StepCard({ step }: { step: GenesisGmStep }) {
  const row = (label: string, value: ReactNode) => (
    <div style={{ display: 'grid', gridTemplateColumns: '84px 1fr', gap: 8, marginBottom: 6 }}>
      <span style={{ color: '#22ab94', fontSize: 11, letterSpacing: '.08em' }}>{label}</span>
      <span style={{ color: '#eee', fontSize: 13, lineHeight: 1.45 }}>{value}</span>
    </div>
  );
  return (
    <div style={{ fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
      {row('KIND', step.type)}
      {row('COST', <>{kvText(step.kv)}{step.pricedBy ? <span style={{ color: '#999' }}> · priced by {step.pricedBy}</span> : null}</>)}
      {step.ageAdded != null && row('SPAN', `${step.ageAdded} year${step.ageAdded === 1 ? '' : 's'}`)}
      {step.description && row('ABOUT', step.description)}
      {step.rules.length > 0 && row('RULES', <>{step.rules.map((l, i) => <div key={i}>· {l}</div>)}</>)}
      {step.purpose && row('FOR', step.purpose)}
      {row('FROM', `JEWL · genesis draft${step.draftedAt ? ` · ${new Date(step.draftedAt).toLocaleString()}` : ''}`)}
    </div>
  );
}

const GS_CSS = `
.gs-box{background:#0b0b0b;border-left:4px solid #FFCC78;padding:10px 12px;display:flex;flex-direction:column;gap:8px}
.gs-head{display:flex;justify-content:space-between;align-items:center;gap:8px}
.gs-title{font-family:var(--font-header,'Bebas Neue',Impact,sans-serif);font-size:22px;letter-spacing:.08em;color:#FFCC78}
.gs-sub{margin:0;font-size:12px;color:#9a9a9a;line-height:1.4}
.gs-all{font-family:var(--font-header,'Bebas Neue',Impact,sans-serif);font-size:17px;letter-spacing:.1em;min-height:40px;padding:6px 14px;background:#FFCC78;color:#000;border:0;cursor:pointer}
.gs-all:disabled{opacity:.5}
.gs-confirm{background:#1a1408;border:1px solid #FFCC78;padding:10px;font-size:13px;color:#f3e3c3;display:flex;flex-direction:column;gap:8px}
.gs-confirm-b{display:flex;gap:8px;flex-wrap:wrap}
.gs-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.gs-row{background:#141414;padding:8px;display:flex;flex-direction:column;gap:6px}
.gs-done{opacity:.6}
.gs-info{display:grid!important;grid-template-columns:auto 1fr auto;gap:8px;align-items:baseline;cursor:pointer}
.gs-kind{font-size:10px;letter-spacing:.1em;color:#000;background:#22ab94;padding:1px 5px}
.gs-name{color:#fff;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gs-kv{color:#FFCC78;font-size:12px;font-variant-numeric:tabular-nums;white-space:nowrap}
.gs-actions{display:flex;gap:6px;justify-content:flex-end;align-items:center}
.gs-btn{font-family:var(--font-header,'Bebas Neue',Impact,sans-serif);font-size:16px;letter-spacing:.1em;min-height:40px;min-width:44px;padding:6px 12px;background:#000;color:#fff;border:1px solid #333;cursor:pointer}
.gs-btn:disabled{opacity:.5}
.gs-btn-go{border-color:#FFCC78;color:#FFCC78}
.gs-ok{color:#22ab94;font-size:12px;letter-spacing:.08em}
.gs-fail{color:#f7525f;font-size:12px}
.gs-rev{color:#FFCC78;font-size:12px;letter-spacing:.08em}
.gs-fb{display:flex;gap:6px;align-items:flex-start;flex-wrap:wrap}
.gs-fb-in{flex:1 1 200px;min-height:40px;background:#000;color:#eee;border:1px solid #333;padding:6px;font:13px/1.4 var(--font-terminal),Consolas,monospace;resize:vertical}
`;
