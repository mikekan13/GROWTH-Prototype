'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function CampaignCreator() {
  const router = useRouter();
  const [error, setError] = useState('');

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');

    const form = new FormData(e.currentTarget);
    const name = form.get('name') as string;
    const genre = form.get('genre') as string;

    if (!name.trim()) {
      setError('Campaign name required');
      return;
    }

    const res = await fetch('/api/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, genre: genre || undefined }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || 'Failed to create campaign');
      return;
    }

    router.refresh();
  }

  return (
    <div>
      <div className="text-xs uppercase tracking-wider text-[var(--surface-dark)]/40 mb-3">Create Campaign</div>
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input name="name" placeholder="Campaign name" required className="flex-1 px-3 py-2 bg-white/60 border border-[var(--surface-dark)]/20 text-sm" />
        <input name="genre" placeholder="Genre (optional)" className="w-40 px-3 py-2 bg-white/60 border border-[var(--surface-dark)]/20 text-sm" />
        <button type="submit" className="px-4 py-2 bg-[var(--surface-dark)] text-[var(--accent-gold)] text-xs uppercase tracking-wider">
          Create
        </button>
      </form>
      {error && <p className="text-sm text-[var(--accent-coral)] mt-2">{error}</p>}
    </div>
  );
}
