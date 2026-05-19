'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

interface CreationReviewBannerProps {
  characterId: string;
  status: string; // 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'ACTIVE'
  isOwner: boolean;
}

export default function CreationReviewBanner({ characterId, status, isOwner }: CreationReviewBannerProps) {
  const router = useRouter();
  const [busy, setBusy] = useState<'lock' | 'request' | null>(null);
  const [error, setError] = useState('');
  const [notes, setNotes] = useState('');
  const [showNotesField, setShowNotesField] = useState(false);

  // Hide for ACTIVE characters (no banner needed) or for non-owners (GM uses the review page).
  if (!isOwner) return null;
  if (status === 'ACTIVE') return null;

  const lock = async () => {
    setBusy('lock'); setError('');
    try {
      const res = await fetch(`/api/characters/${characterId}/lock`, { method: 'POST' });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Failed to lock character');
        return;
      }
      router.refresh();
    } catch {
      setError('Network error');
    } finally {
      setBusy(null);
    }
  };

  const submitChanges = async () => {
    setBusy('request'); setError('');
    try {
      const res = await fetch(`/api/characters/${characterId}/request-changes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || 'Failed to send change request');
        return;
      }
      setShowNotesField(false);
      setNotes('');
      router.refresh();
    } catch {
      setError('Network error');
    } finally {
      setBusy(null);
    }
  };

  if (status === 'DRAFT') {
    return (
      <div className="border border-[var(--accent-gold)]/40 bg-[var(--accent-gold)]/5 p-4 mb-4">
        <div className="text-[var(--accent-gold)] text-[10px] uppercase tracking-[0.2em] mb-1 font-[family-name:var(--font-terminal)]">
          Step 1 — Backstory
        </div>
        <div className="text-white text-sm mb-3">
          Write your character&apos;s backstory. Once you submit it, your GM will review and apply the seed, roots, and branches.
        </div>
        <Link
          href={`/character/${characterId}/backstory`}
          className="inline-block px-4 py-1.5 text-[10px] uppercase tracking-[0.15em] font-[family-name:var(--font-terminal)] bg-[var(--accent-gold)] text-black hover:brightness-110 transition-all"
        >
          Open backstory
        </Link>
      </div>
    );
  }

  if (status === 'SUBMITTED') {
    return (
      <div className="border border-white/20 bg-black/30 p-4 mb-4">
        <div className="text-white/40 text-[10px] uppercase tracking-[0.2em] mb-1 font-[family-name:var(--font-terminal)]">
          Step 2 — Awaiting GM
        </div>
        <div className="text-white/70 text-sm">
          Your backstory is with the GM. They&apos;ll attach a Seed, Roots, and Branches and then send the sheet back for your review.
        </div>
      </div>
    );
  }

  if (status === 'APPROVED') {
    return (
      <div className="border-2 border-[var(--accent-teal)] bg-[var(--accent-teal)]/5 p-4 mb-4">
        <div className="text-[var(--accent-teal)] text-[10px] uppercase tracking-[0.2em] mb-1 font-[family-name:var(--font-terminal)]">
          Step 3 — Review your sheet
        </div>
        <div className="text-white text-sm mb-3">
          Your GM has applied the mechanics. Look it over. If it feels right, lock it in. Otherwise send it back with notes.
        </div>

        {showNotesField && (
          <div className="mb-3">
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="What would you like changed?"
              className="w-full bg-black/50 border border-white/20 text-white text-sm p-2 font-[family-name:var(--font-terminal)] focus:border-[var(--accent-teal)] focus:outline-none"
            />
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={lock}
            disabled={busy !== null}
            className="px-5 py-2 text-[11px] uppercase tracking-[0.2em] font-[family-name:var(--font-terminal)] bg-[var(--accent-teal)] text-black hover:brightness-110 disabled:opacity-40 transition-all"
          >
            {busy === 'lock' ? 'Locking…' : 'Approve & Lock In'}
          </button>
          {!showNotesField ? (
            <button
              type="button"
              onClick={() => setShowNotesField(true)}
              className="px-4 py-2 text-[11px] uppercase tracking-[0.2em] font-[family-name:var(--font-terminal)] border border-white/30 text-white/70 hover:border-[#E8585A]/60 hover:text-[#E8585A] transition-all"
            >
              Request Changes
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={submitChanges}
                disabled={busy !== null}
                className="px-4 py-2 text-[11px] uppercase tracking-[0.2em] font-[family-name:var(--font-terminal)] border border-[#E8585A] bg-[#E8585A]/10 text-[#E8585A] hover:bg-[#E8585A]/20 disabled:opacity-40 transition-all"
              >
                {busy === 'request' ? 'Sending…' : 'Send back to GM'}
              </button>
              <button
                type="button"
                onClick={() => { setShowNotesField(false); setNotes(''); }}
                className="text-white/40 text-[10px] uppercase tracking-[0.15em] font-[family-name:var(--font-terminal)] hover:text-white/60"
              >
                Cancel
              </button>
            </>
          )}
        </div>

        {error && <div className="text-[#E8585A] text-xs mt-2 font-[family-name:var(--font-terminal)]">{error}</div>}
      </div>
    );
  }

  return null;
}
