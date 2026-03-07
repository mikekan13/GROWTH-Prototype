'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function JoinCampaign() {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(false);

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim()) return;

    setJoining(true);
    setError('');

    const res = await fetch('/api/campaigns/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inviteCode: code.trim() }),
    });

    const data = await res.json();

    if (!res.ok) {
      setError(data.error || 'Failed to join');
      setJoining(false);
      return;
    }

    router.refresh();
    setCode('');
    setJoining(false);
  }

  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-[var(--surface-dark)]/40 mb-3">Join a Campaign</div>
      <form onSubmit={handleJoin} className="flex gap-2">
        <input
          value={code}
          onChange={e => setCode(e.target.value)}
          placeholder="Enter invite code"
          className="flex-1 px-3 py-2 bg-white/60 border border-[var(--surface-dark)]/20 text-sm font-mono"
        />
        <button
          type="submit"
          disabled={joining}
          className="px-4 py-2 bg-[var(--surface-dark)] text-[var(--accent-gold)] text-xs uppercase tracking-wider disabled:opacity-50"
        >
          {joining ? 'Joining...' : 'Join'}
        </button>
      </form>
      {error && <p className="text-sm text-[var(--accent-coral)] mt-2">{error}</p>}
    </div>
  );
}
