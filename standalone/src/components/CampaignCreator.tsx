'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function CampaignCreator() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(false);

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');

    const form = new FormData(e.currentTarget);
    const name = form.get('name') as string;
    const genre = form.get('genre') as string;
    const description = form.get('description') as string;
    const worldContext = form.get('worldContext') as string;
    const promptsRaw = form.get('customPrompts') as string;

    if (!name.trim()) {
      setError('Campaign name required');
      return;
    }

    // Parse custom prompts (one per line)
    const customPrompts = promptsRaw
      ? promptsRaw.split('\n').map(s => s.trim()).filter(Boolean)
      : undefined;

    const res = await fetch('/api/campaigns', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name,
        genre: genre || undefined,
        description: description || undefined,
        worldContext: worldContext || undefined,
        customPrompts,
      }),
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
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="flex gap-2">
          <input name="name" placeholder="Campaign name" required className="flex-1 px-3 py-2 bg-white/60 border border-[var(--surface-dark)]/20 text-sm" />
          <input name="genre" placeholder="Genre (optional)" className="w-40 px-3 py-2 bg-white/60 border border-[var(--surface-dark)]/20 text-sm" />
        </div>

        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-[var(--accent-teal)] hover:underline"
        >
          {expanded ? '- Less options' : '+ Campaign context & custom prompts'}
        </button>

        {expanded && (
          <div className="space-y-3 border-l-2 border-[var(--accent-teal)]/30 pl-3">
            <div>
              <label className="text-xs text-[var(--surface-dark)]/60 block mb-1">Description</label>
              <textarea name="description" rows={2} placeholder="Brief campaign description for players" className="w-full px-3 py-2 bg-white/60 border border-[var(--surface-dark)]/20 text-sm" />
            </div>
            <div>
              <label className="text-xs text-[var(--surface-dark)]/60 block mb-1">World Context (for AI assistance)</label>
              <textarea name="worldContext" rows={3} placeholder="Describe the world, factions, politics, cultures — this context helps AI assist with backstory creation" className="w-full px-3 py-2 bg-white/60 border border-[var(--surface-dark)]/20 text-sm" />
            </div>
            <div>
              <label className="text-xs text-[var(--surface-dark)]/60 block mb-1">Custom Backstory Prompts (one per line)</label>
              <textarea name="customPrompts" rows={3} placeholder={"Are you part of the King's Dominion?\nAre you aligned with the rebellion?\nWhat is your relationship with magic?"} className="w-full px-3 py-2 bg-white/60 border border-[var(--surface-dark)]/20 text-sm" />
            </div>
          </div>
        )}

        <button type="submit" className="px-4 py-2 bg-[var(--surface-dark)] text-[var(--accent-gold)] text-xs uppercase tracking-wider">
          Create
        </button>
      </form>
      {error && <p className="text-sm text-[var(--accent-coral)] mt-2">{error}</p>}
    </div>
  );
}
