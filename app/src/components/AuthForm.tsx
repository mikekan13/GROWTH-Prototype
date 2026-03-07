'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function AuthForm() {
  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    setLoading(true);

    const form = new FormData(e.currentTarget);
    const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';

    const body = mode === 'login'
      ? { login: form.get('login'), password: form.get('password') }
      : {
          username: form.get('username'),
          email: form.get('email'),
          password: form.get('password'),
          accessCode: form.get('accessCode') || undefined,
        };

    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error || 'Something went wrong');
        return;
      }

      router.push(data.redirect);
      router.refresh();
    } catch {
      setError('Connection failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="w-full max-w-sm">
      {/* Mode toggle */}
      <div className="flex mb-6">
        <button
          onClick={() => { setMode('login'); setError(''); }}
          className={`flex-1 py-2 text-center text-sm uppercase tracking-wider transition-colors ${
            mode === 'login'
              ? 'bg-[var(--surface-dark)] text-[var(--accent-gold)]'
              : 'bg-[var(--surface-dark)]/20 text-[var(--surface-dark)]'
          }`}
        >
          Login
        </button>
        <button
          onClick={() => { setMode('register'); setError(''); }}
          className={`flex-1 py-2 text-center text-sm uppercase tracking-wider transition-colors ${
            mode === 'register'
              ? 'bg-[var(--surface-dark)] text-[var(--accent-gold)]'
              : 'bg-[var(--surface-dark)]/20 text-[var(--surface-dark)]'
          }`}
        >
          Register
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {mode === 'register' && (
          <>
            <input
              name="username"
              type="text"
              placeholder="Username"
              required
              className="w-full px-3 py-2 bg-white/60 border border-[var(--surface-dark)]/20 text-[var(--surface-dark)] placeholder:text-[var(--surface-dark)]/40 focus:outline-none focus:border-[var(--accent-teal)]"
            />
            <input
              name="email"
              type="email"
              placeholder="Email"
              required
              className="w-full px-3 py-2 bg-white/60 border border-[var(--surface-dark)]/20 text-[var(--surface-dark)] placeholder:text-[var(--surface-dark)]/40 focus:outline-none focus:border-[var(--accent-teal)]"
            />
          </>
        )}

        {mode === 'login' && (
          <input
            name="login"
            type="text"
            placeholder="Username or Email"
            required
            className="w-full px-3 py-2 bg-white/60 border border-[var(--surface-dark)]/20 text-[var(--surface-dark)] placeholder:text-[var(--surface-dark)]/40 focus:outline-none focus:border-[var(--accent-teal)]"
          />
        )}

        <input
          name="password"
          type="password"
          placeholder="Password"
          required
          minLength={8}
          className="w-full px-3 py-2 bg-white/60 border border-[var(--surface-dark)]/20 text-[var(--surface-dark)] placeholder:text-[var(--surface-dark)]/40 focus:outline-none focus:border-[var(--accent-teal)]"
        />

        {mode === 'register' && (
          <input
            name="accessCode"
            type="text"
            placeholder="Access Code (from rulebook — optional)"
            className="w-full px-3 py-2 bg-white/60 border border-[var(--surface-dark)]/20 text-[var(--surface-dark)] placeholder:text-[var(--surface-dark)]/40 focus:outline-none focus:border-[var(--accent-gold)]/60 font-mono uppercase"
          />
        )}

        {error && (
          <p className="text-sm text-[var(--accent-coral)]">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2 bg-[var(--surface-dark)] text-[var(--accent-gold)] uppercase tracking-wider text-sm hover:bg-[var(--surface-dark)]/90 transition-colors disabled:opacity-50"
        >
          {loading ? '...' : mode === 'login' ? 'Enter' : 'Begin'}
        </button>
      </form>
    </div>
  );
}
