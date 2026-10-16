'use client';

/**
 * NotificationBell (2026-10-16) — the header badge that tells a person JEWL
 * needs them. Sits in DashboardShell's header for every role (Trailblazer
 * Portal, Watcher Console, Terminal). Polls GET /api/notifications (30 s, on
 * focus, on open); each unread 'genesis_prod' row is "JEWL needs you:
 * <question>" linking to the character page, with Answer / Leave open /
 * You decide right here (the existing decide API — the prod's audience owner
 * may decide their own prods). No SSE here: the shell is outside any one
 * campaign's stream; the campaign pages' streams carry `needs_input` and the
 * next poll shows it.
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';

interface ProdPayload {
  prodId?: string;
  sessionId?: string;
  characterId?: string;
  characterName?: string;
  question?: string;
  why?: string;
  audience?: string;
}

interface NotificationItem {
  id: string;
  kind: string;
  campaignId: string | null;
  readAt: string | null;
  createdAt: string;
  payload: ProdPayload;
}

const POLL_MS = 30_000;
const FONT = 'font-[family-name:var(--font-terminal)]';

export default function NotificationBell() {
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [open, setOpen] = useState(false);
  const [answering, setAnswering] = useState<string | null>(null);
  const [answer, setAnswer] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/notifications', { cache: 'no-store' });
      if (!res.ok) return;
      const data = await res.json() as { unread: NotificationItem[] };
      setItems(data.unread ?? []);
    } catch { /* offline — keep what we have */ }
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(load, POLL_MS);
    const onFocus = () => { void load(); };
    window.addEventListener('focus', onFocus);
    return () => { clearInterval(t); window.removeEventListener('focus', onFocus); };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    void load();
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open, load]);

  async function markRead(id: string) {
    setItems(prev => prev.filter(n => n.id !== id));
    try { await fetch(`/api/notifications/${id}/read`, { method: 'POST' }); } catch { /* next poll */ }
  }

  async function decide(n: NotificationItem, decision: 'ANSWER' | 'LEAVE_OPEN' | 'YOU_DECIDE') {
    const { prodId } = n.payload;
    if (!n.campaignId || !prodId) return;
    setBusy(n.id);
    setError('');
    try {
      const res = await fetch(`/api/campaigns/${n.campaignId}/genesis/prods/${prodId}/decide`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(decision === 'ANSWER' ? { decision, answer: answer.trim() } : { decision }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        setError(data.error || 'JEWL did not take that.');
        return;
      }
      setAnswering(null);
      setAnswer('');
      await markRead(n.id);
    } catch {
      setError('Network error');
    } finally {
      setBusy(null);
    }
  }

  const count = items.length;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        aria-label={count ? `${count} unread — JEWL needs you` : 'No notifications'}
        title={count ? `JEWL needs you (${count})` : 'Nothing waits on you'}
        className={`relative flex items-center gap-1 px-2 py-1 text-[9px] uppercase tracking-[0.2em] ${FONT} transition-colors border ${
          count
            ? 'text-[var(--accent-gold)] border-[var(--accent-gold)]/50 bg-[var(--accent-gold)]/10'
            : 'text-[var(--accent-teal)]/40 border-[var(--accent-teal)]/10 hover:text-[var(--accent-teal)]'
        }`}
      >
        <span style={{ fontSize: '10px' }}>{count ? '◉' : '◎'}</span>
        <span>{count ? `${count}` : ''}</span>
      </button>
      {open && (
        <div
          className="absolute top-full right-0 mt-1 z-[100] border bg-[#0a0a0a] w-[340px] max-h-[70vh] overflow-auto"
          style={{ borderColor: count ? 'rgba(255,204,120,0.4)' : 'rgba(45,184,160,0.3)' }}
        >
          <div className={`px-3 py-1.5 text-[8px] uppercase tracking-[0.25em] ${FONT} text-white/30 border-b`} style={{ borderColor: 'rgba(45,184,160,0.15)' }}>
            {count ? 'JEWL needs you' : 'Nothing waits on you'}
          </div>
          {items.map(n => {
            const p = n.payload;
            const isProd = n.kind === 'genesis_prod' && p.prodId && n.campaignId;
            const who = p.audience && p.audience.startsWith('player:') ? 'about your character' : p.characterName ? `about ${p.characterName}` : '';
            return (
              <div key={n.id} className="px-3 py-2 border-b" style={{ borderColor: 'rgba(45,184,160,0.12)' }}>
                <div className={`text-[8px] uppercase tracking-[0.2em] ${FONT} text-[var(--accent-gold)]/80`}>
                  JEWL needs you {who ? `· ${who}` : ''}
                </div>
                {p.characterId ? (
                  <Link
                    href={`/character/${p.characterId}`}
                    onClick={() => setOpen(false)}
                    className="block mt-1 text-[11px] leading-snug text-white/85 hover:text-[var(--accent-teal)]"
                  >
                    {p.question ?? 'A question for you.'}
                  </Link>
                ) : (
                  <div className="mt-1 text-[11px] leading-snug text-white/85">{p.question ?? 'A question for you.'}</div>
                )}
                {p.why && <div className="mt-0.5 text-[9px] text-white/35 italic">Why he asks: {p.why}</div>}
                {isProd && (
                  <div className="mt-1.5 flex flex-wrap items-center gap-1">
                    {answering === n.id ? (
                      <>
                        <textarea
                          value={answer}
                          onChange={e => setAnswer(e.target.value)}
                          rows={2}
                          placeholder="Your answer…"
                          className="w-full bg-black/60 border border-[var(--accent-teal)]/30 text-[11px] text-white/90 p-1.5 outline-none focus:border-[var(--accent-teal)]/70"
                        />
                        <button type="button" disabled={busy === n.id || !answer.trim()} onClick={() => decide(n, 'ANSWER')} className={btn('gold')}>Send</button>
                        <button type="button" onClick={() => { setAnswering(null); setAnswer(''); }} className={btn('dim')}>Cancel</button>
                      </>
                    ) : (
                      <>
                        <button type="button" disabled={busy === n.id} onClick={() => { setAnswering(n.id); setAnswer(''); }} className={btn('gold')}>Answer</button>
                        <button type="button" disabled={busy === n.id} onClick={() => decide(n, 'LEAVE_OPEN')} className={btn('teal')}>Leave open</button>
                        <button type="button" disabled={busy === n.id} onClick={() => decide(n, 'YOU_DECIDE')} className={btn('teal')}>You decide</button>
                        <button type="button" onClick={() => markRead(n.id)} className={btn('dim')}>Dismiss</button>
                      </>
                    )}
                  </div>
                )}
                {!isProd && (
                  <div className="mt-1.5">
                    <button type="button" onClick={() => markRead(n.id)} className={btn('dim')}>Dismiss</button>
                  </div>
                )}
              </div>
            );
          })}
          {error && <div className={`px-3 py-1.5 text-[9px] ${FONT} text-[var(--pillar-body)]`}>{error}</div>}
        </div>
      )}
    </div>
  );
}

function btn(tone: 'gold' | 'teal' | 'dim'): string {
  const base = `px-2 py-0.5 text-[8px] uppercase tracking-[0.15em] ${FONT} border transition-colors disabled:opacity-40`;
  if (tone === 'gold') return `${base} text-[var(--accent-gold)] border-[var(--accent-gold)]/50 hover:bg-[var(--accent-gold)]/10`;
  if (tone === 'teal') return `${base} text-[var(--accent-teal)] border-[var(--accent-teal)]/40 hover:bg-[var(--accent-teal)]/10`;
  return `${base} text-white/35 border-white/10 hover:text-white/70`;
}
