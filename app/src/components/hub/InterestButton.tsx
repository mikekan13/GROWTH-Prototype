'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function InterestButton({ campaignId }: { campaignId: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const router = useRouter();

  const handleClick = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/interest`, {
        method: 'POST',
      });
      if (!res.ok) {
        const data = await res.json();
        setError(data.error || 'Something went wrong');
        return;
      }
      router.refresh();
    } catch {
      setError('Network error');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <button
        onClick={handleClick}
        disabled={loading}
        className="px-8 py-2 bg-[var(--accent-gold)] text-black text-sm font-[family-name:var(--font-terminal)] tracking-wider uppercase hover:bg-[var(--accent-gold)]/80 transition-colors disabled:opacity-50"
      >
        {loading ? 'Sending...' : "I'm Interested"}
      </button>
      {error && (
        <div className="text-xs text-[var(--pillar-body)] font-[family-name:var(--font-terminal)] mt-1">
          {error}
        </div>
      )}
    </div>
  );
}
