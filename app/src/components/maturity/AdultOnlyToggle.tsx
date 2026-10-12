'use client';

import { useState } from 'react';

/**
 * Campaign settings: the Watcher marks the table 18+ by hand (Mike 2026-10-12).
 * An auto-set 18+ (content flagged `sexual`) cannot be switched off while that
 * content exists — the API answers 409 and the message is shown.
 */
export default function AdultOnlyToggle({
  campaignId,
  initialAdultOnly,
  initialSetBy,
}: {
  campaignId: string;
  initialAdultOnly: boolean;
  initialSetBy: string | null;
}) {
  const [adultOnly, setAdultOnly] = useState(initialAdultOnly);
  const [setBy, setSetBy] = useState(initialSetBy);
  const [msg, setMsg] = useState('');
  const [saving, setSaving] = useState(false);

  async function toggle() {
    setSaving(true);
    setMsg('');
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/adult-only`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adultOnly: !adultOnly }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setMsg(data.error || 'Could not change this');
        return;
      }
      setAdultOnly(data.adultOnly);
      setSetBy(data.adultOnlySetBy);
      if (data.removed > 0) setMsg(`${data.removed} member${data.removed === 1 ? '' : 's'} removed: table is now 18+`);
    } catch {
      setMsg('Connection failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="border border-[var(--surface-dark)]/15 p-4 space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wider font-[family-name:var(--font-terminal)] text-[var(--surface-dark)]">
            18+ table
          </div>
          <div className="text-xs text-[var(--surface-dark)]/50">
            {adultOnly
              ? setBy === 'auto'
                ? 'On — content here is flagged sexual. Players under 18 cannot join, view or find this table.'
                : 'On — players under 18 cannot join, view or find this table.'
              : 'Off — open to all ages.'}
          </div>
        </div>
        <button
          type="button"
          onClick={toggle}
          disabled={saving}
          aria-pressed={adultOnly}
          className={`shrink-0 px-3 py-1.5 text-xs uppercase tracking-[0.15em] font-[family-name:var(--font-terminal)] border transition-colors disabled:opacity-50 ${
            adultOnly
              ? 'bg-black text-[var(--accent-gold)] border-black'
              : 'bg-transparent text-[var(--surface-dark)]/60 border-[var(--surface-dark)]/30 hover:border-[var(--surface-dark)]'
          }`}
        >
          {saving ? '...' : adultOnly ? '18+ ON' : '18+ OFF'}
        </button>
      </div>
      {msg && <p className="text-xs font-[family-name:var(--font-terminal)] text-[var(--accent-coral)]">{msg}</p>}
    </div>
  );
}
