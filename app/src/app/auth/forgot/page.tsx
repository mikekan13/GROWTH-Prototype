'use client';

import { useState } from 'react';
import Link from 'next/link';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim() || busy) return;
    setBusy(true);
    try {
      await fetch('/api/auth/forgot', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      });
    } catch { /* endpoint always answers ok; network errors fall through to the same message */ }
    setSent(true);
    setBusy(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#CBD9E8' }}>
      <div className="w-full max-w-sm p-6 space-y-4" style={{ background: 'rgba(255,255,255,0.5)', border: '1px solid rgba(30,45,64,0.15)' }}>
        <div className="section-badge inline-block">Reset Password</div>
        {sent ? (
          <>
            <p className="text-sm" style={{ color: 'var(--surface-dark)' }}>
              If that address has an account, a reset link is on its way. The link expires in 30 minutes.
            </p>
            <Link href="/" className="text-xs uppercase tracking-wider" style={{ color: 'var(--accent-teal)' }}>
              Back to sign in
            </Link>
          </>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <p className="text-xs" style={{ color: 'var(--surface-dark)', opacity: 0.6 }}>
              Enter your account email and we&apos;ll send a reset link.
            </p>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="you@example.com"
              required
              className="w-full px-3 py-2 text-sm outline-none"
              style={{ background: 'white', border: '1px solid rgba(30,45,64,0.2)', fontFamily: 'var(--font-terminal), Consolas, monospace' }}
            />
            <button
              type="submit"
              disabled={busy || !email.trim()}
              className="w-full px-4 py-2 text-xs uppercase tracking-wider"
              style={{ background: 'var(--surface-dark)', color: 'var(--accent-gold)', opacity: busy ? 0.6 : 1 }}
            >
              {busy ? 'Sending…' : 'Send reset link'}
            </button>
            <Link href="/" className="block text-xs uppercase tracking-wider" style={{ color: 'var(--accent-teal)' }}>
              Back to sign in
            </Link>
          </form>
        )}
      </div>
    </div>
  );
}
