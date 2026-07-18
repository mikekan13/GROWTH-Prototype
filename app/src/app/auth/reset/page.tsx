'use client';

import { Suspense, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';

function ResetForm() {
  const params = useSearchParams();
  const token = params.get('token') ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const mismatch = confirm.length > 0 && password !== confirm;
  const canSubmit = token && password.length >= 8 && password === confirm && !busy;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/auth/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword: password }),
      });
      if (res.ok) {
        setDone(true);
      } else {
        const data = await res.json().catch(() => null);
        setError(data?.error ?? 'Invalid or expired reset link — request a new one.');
      }
    } catch {
      setError('Connection failed — try again.');
    }
    setBusy(false);
  };

  if (!token) {
    return (
      <>
        <p className="text-sm" style={{ color: 'var(--surface-dark)' }}>
          This reset link is missing its token. Request a fresh one below.
        </p>
        <Link href="/auth/forgot" className="text-xs uppercase tracking-wider" style={{ color: 'var(--accent-teal)' }}>
          Request a new link
        </Link>
      </>
    );
  }

  if (done) {
    return (
      <>
        <p className="text-sm" style={{ color: 'var(--surface-dark)' }}>
          Password updated. Sign in with your new password.
        </p>
        <Link href="/" className="text-xs uppercase tracking-wider" style={{ color: 'var(--accent-teal)' }}>
          Go to sign in
        </Link>
      </>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <input
        type="password"
        value={password}
        onChange={e => setPassword(e.target.value)}
        placeholder="New password (8+ characters)"
        minLength={8}
        required
        className="w-full px-3 py-2 text-sm outline-none"
        style={{ background: 'white', border: '1px solid rgba(30,45,64,0.2)', fontFamily: 'var(--font-terminal), Consolas, monospace' }}
      />
      <input
        type="password"
        value={confirm}
        onChange={e => setConfirm(e.target.value)}
        placeholder="Confirm new password"
        required
        className="w-full px-3 py-2 text-sm outline-none"
        style={{ background: 'white', border: `1px solid ${mismatch ? '#E8585A' : 'rgba(30,45,64,0.2)'}`, fontFamily: 'var(--font-terminal), Consolas, monospace' }}
      />
      {mismatch && <p className="text-xs" style={{ color: '#E8585A' }}>Passwords don&apos;t match.</p>}
      {error && <p className="text-xs" style={{ color: '#E8585A' }}>{error}</p>}
      <button
        type="submit"
        disabled={!canSubmit}
        className="w-full px-4 py-2 text-xs uppercase tracking-wider"
        style={{ background: 'var(--surface-dark)', color: 'var(--accent-gold)', opacity: canSubmit ? 1 : 0.6 }}
      >
        {busy ? 'Saving…' : 'Set new password'}
      </button>
    </form>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#CBD9E8' }}>
      <div className="w-full max-w-sm p-6 space-y-4" style={{ background: 'rgba(255,255,255,0.5)', border: '1px solid rgba(30,45,64,0.15)' }}>
        <div className="section-badge inline-block">Choose a New Password</div>
        <Suspense fallback={null}>
          <ResetForm />
        </Suspense>
      </div>
    </div>
  );
}
