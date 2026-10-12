'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

/**
 * One-time blocking prompt for an existing account with no date of birth
 * (Mike 2026-10-12: age source = DOB; unknown = treated as a minor). Rendered
 * on the campaign list pages only when the server says the user still owes a
 * DOB — never for ADMIN. Phone-first: full-screen sheet, one field.
 */
export default function DateOfBirthPrompt() {
  const [dob, setDob] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const router = useRouter();

  if (done) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSaving(true);
    try {
      const res = await fetch('/api/auth/date-of-birth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dateOfBirth: dob }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || 'Something went wrong');
        return;
      }
      setDone(true);
      router.refresh();
    } catch {
      setError('Connection failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 px-4" role="dialog" aria-modal="true" aria-labelledby="dob-title">
      <form onSubmit={submit} className="w-full max-w-sm bg-black border border-[var(--accent-teal)]/40 p-5 space-y-3">
        <div id="dob-title" className="text-xs uppercase tracking-[0.2em] font-[family-name:var(--font-terminal)] text-[var(--accent-teal)]">
          [TERMINAL]: Date of birth required
        </div>
        <p className="text-xs font-[family-name:var(--font-body)] text-white/60">
          Some tables are 18+. We need your date of birth once to know which you can join. It is never shown to anyone.
        </p>
        <input
          name="dateOfBirth"
          type="date"
          required
          value={dob}
          max={new Date().toISOString().slice(0, 10)}
          onChange={e => setDob(e.target.value)}
          className="w-full px-3 py-2 bg-black border border-[var(--accent-teal)]/30 text-[var(--accent-teal)] font-[family-name:var(--font-body)] text-base tracking-wider focus:outline-none focus:border-[var(--accent-teal)] [color-scheme:dark]"
        />
        {error && (
          <p className="text-xs font-[family-name:var(--font-terminal)] text-[var(--accent-coral)] tracking-wider">[ERROR]: {error}</p>
        )}
        <button
          type="submit"
          disabled={saving || !dob}
          className="w-full py-2.5 bg-[var(--surface-dark)] text-[var(--accent-gold)] uppercase tracking-[0.2em] text-xs font-[family-name:var(--font-terminal)] border border-[var(--accent-gold)]/40 hover:bg-[var(--accent-gold)] hover:text-black transition-colors disabled:opacity-50"
        >
          {saving ? '...' : '[ CONFIRM ]'}
        </button>
      </form>
    </div>
  );
}
