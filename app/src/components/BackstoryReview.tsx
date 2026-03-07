'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface BackstoryReviewProps {
  characterId: string;
  characterName: string;
  playerName: string;
  responses: Array<{ prompt: string; response: string }>;
  status: string;
  existingNotes?: string | null;
}

export default function BackstoryReview({
  characterId,
  characterName,
  playerName,
  responses,
  status,
  existingNotes,
}: BackstoryReviewProps) {
  const router = useRouter();
  const [gmNotes, setGmNotes] = useState(existingNotes || '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleReview(newStatus: 'APPROVED' | 'REVISION') {
    setSaving(true);
    setError('');

    const res = await fetch(`/api/characters/${characterId}/backstory`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: newStatus, gmNotes: gmNotes.trim() || undefined }),
    });

    if (!res.ok) {
      const data = await res.json();
      setError(data.error || 'Failed to update');
      setSaving(false);
      return;
    }

    router.refresh();
    setSaving(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="section-badge inline-block text-sm">Backstory Review</div>
          <h2 className="font-[family-name:var(--font-header)] text-2xl tracking-wider text-[var(--surface-dark)] mt-1">
            {characterName}
          </h2>
          <span className="text-xs text-[var(--surface-dark)]/40">by {playerName}</span>
        </div>
        <span className={`text-xs uppercase tracking-wider ${
          status === 'SUBMITTED' ? 'text-[var(--krma-gold)]'
          : status === 'APPROVED' ? 'text-[var(--accent-teal)]'
          : status === 'REVISION' ? 'text-[var(--accent-coral)]'
          : 'text-[var(--surface-dark)]/40'
        }`}>
          {status}
        </span>
      </div>

      {/* Player's structured responses */}
      <div className="space-y-4">
        {responses.map((r, i) => (
          <div key={i} className="bg-white/50 border border-[var(--surface-dark)]/10 p-3">
            <div className="text-xs uppercase tracking-wider text-[var(--surface-dark)]/40 mb-1">
              {r.prompt}
            </div>
            <div className="text-sm leading-relaxed whitespace-pre-wrap">{r.response}</div>
          </div>
        ))}
      </div>

      {/* GM Notes */}
      <div>
        <label className="text-xs uppercase tracking-wider text-[var(--surface-dark)]/60 block mb-1">
          Watcher Notes (visible to player on revision)
        </label>
        <textarea
          value={gmNotes}
          onChange={e => setGmNotes(e.target.value)}
          rows={4}
          placeholder="Notes for the Trailblazer (optional for approval, recommended for revision)..."
          className="w-full px-3 py-2 bg-white/60 border border-[var(--surface-dark)]/20 text-sm"
        />
      </div>

      {error && <p className="text-sm text-[var(--accent-coral)]">{error}</p>}

      <div className="flex gap-3">
        <button
          onClick={() => handleReview('APPROVED')}
          disabled={saving}
          className="px-6 py-2 bg-[var(--accent-teal)] text-white text-sm uppercase tracking-wider disabled:opacity-50"
        >
          Approve
        </button>
        <button
          onClick={() => handleReview('REVISION')}
          disabled={saving}
          className="px-6 py-2 bg-[var(--accent-coral)] text-white text-sm uppercase tracking-wider disabled:opacity-50"
        >
          Request Revision
        </button>
      </div>
    </div>
  );
}
