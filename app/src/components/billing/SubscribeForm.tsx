'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

interface Props {
  alreadySubscribed: boolean;
  currentStatus: string | null;
}

export default function SubscribeForm({ alreadySubscribed, currentStatus }: Props) {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubscribe = async () => {
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const res = await fetch('/api/billing/stub-checkout', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? 'Subscription failed');
        return;
      }
      setSuccess(data.message ?? 'Subscription activated.');
      // Let the success message land then refresh server props
      setTimeout(() => router.refresh(), 700);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setSubmitting(false);
    }
  };

  if (alreadySubscribed && currentStatus === 'ACTIVE') {
    return (
      <div className="border p-3 text-[12px] font-[family-name:var(--font-terminal)] text-center"
        style={{ borderColor: 'rgba(34,171,148,0.4)', background: 'rgba(34,171,148,0.08)', color: '#22ab94' }}
      >
        ✓ Subscription active — KRMA drip is running.
      </div>
    );
  }

  if (alreadySubscribed && currentStatus === 'PAST_DUE') {
    return (
      <div className="border p-3 text-[12px] font-[family-name:var(--font-terminal)] text-center"
        style={{ borderColor: 'rgba(232,88,90,0.4)', background: 'rgba(232,88,90,0.08)', color: '#E8585A' }}
      >
        ✗ Subscription past due — payment failed. Drip paused.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <button
        onClick={handleSubscribe}
        disabled={submitting}
        className="w-full py-3 text-[12px] uppercase tracking-[0.15em] font-[family-name:var(--font-terminal)] font-bold disabled:opacity-40 transition-all hover:brightness-110"
        style={{
          background: submitting ? 'rgba(255,204,120,0.3)' : 'linear-gradient(135deg, #ffcc78, #d99a36)',
          color: '#000',
          boxShadow: submitting ? 'none' : '0 0 24px rgba(255,204,120,0.3)',
        }}
      >
        {submitting ? 'Activating...' : (currentStatus === 'CANCELED' ? 'Reactivate ›' : 'Subscribe ›')}
      </button>
      {error && (
        <div className="border p-2 text-[11px] font-[family-name:var(--font-terminal)] text-center"
          style={{ borderColor: 'rgba(232,88,90,0.4)', background: 'rgba(232,88,90,0.08)', color: '#E8585A' }}
        >
          ✗ {error}
        </div>
      )}
      {success && (
        <div className="border p-2 text-[11px] font-[family-name:var(--font-terminal)] text-center"
          style={{ borderColor: 'rgba(34,171,148,0.4)', background: 'rgba(34,171,148,0.08)', color: '#22ab94' }}
        >
          ✓ {success}
        </div>
      )}
    </div>
  );
}
