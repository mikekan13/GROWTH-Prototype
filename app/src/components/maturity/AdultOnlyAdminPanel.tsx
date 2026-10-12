'use client';

import { useState } from 'react';

/**
 * Terminal → 18+ tables (ADMIN, 2026-10-12). Lists adult-only campaigns; an
 * auto-set one gets "Clear 18+" (refused while content still carries the
 * `sexual` flag). Watcher-set tables are the Watcher's call.
 */
export default function AdultOnlyAdminPanel({
  campaigns,
}: {
  campaigns: { id: string; name: string; setBy: string | null }[];
}) {
  const [rows, setRows] = useState(campaigns);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function clear(id: string) {
    setBusy(id);
    setError(null);
    try {
      const r = await fetch(`/api/campaigns/${id}/adult-only/clear`, { method: 'POST' });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) { setError(data.error || 'Could not clear'); return; }
      setRows(prev => prev.filter(c => c.id !== id));
    } catch {
      setError('Connection failed');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="bg-white/60 border border-[var(--surface-dark)]/15" data-testid="adult-only-panel">
      <div className="bg-[var(--surface-dark)] px-4 py-1.5">
        <span className="text-[var(--accent-gold)] text-xs font-[family-name:var(--font-header)] uppercase tracking-[0.15em]">
          18+ Tables <span className="text-white/60 font-[family-name:var(--font-terminal)]">{rows.length}</span>
        </span>
      </div>
      <div className="p-3 space-y-1.5">
        {rows.length === 0 && (
          <p className="text-xs text-[var(--surface-dark)]/50 font-[family-name:var(--font-terminal)]">No 18+ tables.</p>
        )}
        {rows.map(c => (
          <div key={c.id} className="flex items-center justify-between gap-3 text-xs">
            <span className="truncate">
              <span className="font-bold">{c.name}</span>
              <span className="ml-2 text-[10px] uppercase tracking-wider text-[var(--surface-dark)]/50">{c.setBy ?? '—'}</span>
            </span>
            {c.setBy === 'auto' && (
              <button
                type="button"
                onClick={() => clear(c.id)}
                disabled={busy === c.id}
                className="shrink-0 px-2 py-1 bg-black text-[var(--accent-gold)] uppercase tracking-[0.15em] text-[10px] font-[family-name:var(--font-terminal)] disabled:opacity-50"
              >
                {busy === c.id ? '...' : 'Clear 18+'}
              </button>
            )}
          </div>
        ))}
        {error && <p className="text-xs font-[family-name:var(--font-terminal)] text-[var(--accent-coral)]">[ERROR]: {error}</p>}
      </div>
    </div>
  );
}
