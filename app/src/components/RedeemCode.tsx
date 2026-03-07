'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function RedeemCode() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [redeeming, setRedeeming] = useState(false);

  async function handleRedeem(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;

    setRedeeming(true);
    setError('');

    const res = await fetch('/api/access-codes/redeem', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: code.trim() }),
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.error || 'Failed to redeem');
      setRedeeming(false);
      return;
    }

    // Redirect to new role dashboard
    router.push('/watcher');
    router.refresh();
  }

  return (
    <div className="border-t border-[var(--surface-dark)]/10 pt-6">
      <div className="text-xs uppercase tracking-wider text-[var(--surface-dark)]/40 mb-3">
        Have a Rulebook Access Code?
      </div>
      <p className="text-xs text-[var(--surface-dark)]/60 mb-3">
        Enter the code from your physical rulebook to unlock Watcher (GM) access.
      </p>
      <form onSubmit={handleRedeem} className="flex gap-2">
        <input
          value={code}
          onChange={e => setCode(e.target.value.toUpperCase())}
          placeholder="Enter access code"
          className="flex-1 px-3 py-2 bg-white/60 border border-[var(--surface-dark)]/20 text-sm font-mono uppercase"
        />
        <button
          type="submit"
          disabled={redeeming}
          className="px-4 py-2 bg-[var(--surface-dark)] text-[var(--accent-gold)] text-xs uppercase tracking-wider disabled:opacity-50"
        >
          {redeeming ? '...' : 'Redeem'}
        </button>
      </form>
      {error && <p className="text-sm text-[var(--accent-coral)] mt-2">{error}</p>}
    </div>
  );
}
