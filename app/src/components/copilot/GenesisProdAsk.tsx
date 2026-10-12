'use client';
/**
 * JEWL asks in the chat (Mike 2026-10-12: "The user shouldn't be directed to
 * the logs. Jewl should just ask there in the chat."). A genesis prod message
 * carries its decisions as a message action: ANSWER (inline reply), LEAVE
 * OPEN, YOU DECIDE. A plain chat reply also answers the newest open prod
 * (services/genesis-prods#answerOpenProdFromChat).
 */
import { useState } from 'react';

export interface GenesisProdActionView {
  id: string;
  type: 'genesis_prod';
  description?: string;
  status?: 'pending' | 'confirmed' | 'cancelled';
  params?: { prodId?: string; sessionId?: string; prodStatus?: string; answer?: string | null };
}

/** The genesis_prod action of a message, if any (actions may arrive as an
 *  array or as a raw JSON string). */
export function genesisProdActionOf(actions: unknown): GenesisProdActionView | null {
  let list: unknown = actions;
  if (typeof list === 'string') {
    try { list = JSON.parse(list); } catch { return null; }
  }
  if (!Array.isArray(list)) return null;
  const a = list.find(x => x && typeof x === 'object' && (x as { type?: unknown }).type === 'genesis_prod');
  return (a as GenesisProdActionView) ?? null;
}

const OUTCOME: Record<string, string> = {
  ANSWERED: '✓ ANSWERED',
  LEFT_OPEN: '◌ LEFT OPEN',
  DELEGATED: '⇢ JEWL DECIDES',
};

export function GenesisProdAsk({ action, campaignId, canDecide, onDecided }: {
  action: GenesisProdActionView;
  campaignId: string;
  canDecide: boolean;
  onDecided: () => void;
}) {
  const [answering, setAnswering] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const prodId = action.params?.prodId ?? action.id;
  const status = action.params?.prodStatus ?? (action.status === 'pending' ? 'OPEN' : null);

  const decide = async (decision: 'ANSWER' | 'LEAVE_OPEN' | 'YOU_DECIDE', answer?: string) => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/genesis/prods/${prodId}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(decision === 'ANSWER' ? { decision, answer } : { decision }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setAnswering(false);
      setDraft('');
      onDecided();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Not saved');
    } finally {
      setBusy(false);
    }
  };

  if (status && status !== 'OPEN') {
    return (
      <p className="jc-state" data-prod-ask={prodId} data-prod-status={status}>
        <span className="jc-done">[{OUTCOME[status] ?? status}]</span>
        {status === 'ANSWERED' && action.params?.answer ? <span className="jc-aside"> {action.params.answer}</span> : null}
      </p>
    );
  }
  if (!canDecide) return null;
  return (
    <div className="jc-answers" data-prod-ask={prodId} data-prod-status="OPEN" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      {answering ? (
        <>
          <textarea value={draft} rows={3} autoFocus aria-label="Your answer"
            placeholder="Your answer — it becomes canon for the build."
            onChange={e => setDraft(e.target.value)}
            style={{ width: '100%', boxSizing: 'border-box', background: '#000', color: '#fff', border: '1px solid #D07818', padding: 8, font: 'inherit', fontSize: 14 }} />
          <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
            <button type="button" className="jc-no" data-no-hold onClick={() => { setAnswering(false); setDraft(''); }}>Cancel</button>
            <button type="button" className="jc-yes" data-no-hold disabled={!draft.trim() || busy}
              onClick={() => void decide('ANSWER', draft.trim())}>{busy ? '…' : 'Send'}</button>
          </div>
        </>
      ) : (
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button type="button" className="jc-yes" data-no-hold disabled={busy} onClick={() => setAnswering(true)}>Answer</button>
          <button type="button" className="jc-no" data-no-hold disabled={busy} onClick={() => void decide('LEAVE_OPEN')}>Leave open</button>
          <button type="button" className="jc-no" data-no-hold disabled={busy} onClick={() => void decide('YOU_DECIDE')}>You decide</button>
        </div>
      )}
      {error && <p className="jc-state" role="alert" style={{ color: '#f7525f' }}>{error}</p>}
    </div>
  );
}
