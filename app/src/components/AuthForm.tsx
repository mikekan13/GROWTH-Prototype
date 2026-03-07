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
    <div className="w-full max-w-sm px-6">
      {/* Mode toggle — blocky terminal tabs */}
      <div className="flex mb-2">
        <button
          onClick={() => { setMode('login'); setError(''); }}
          className={`flex-1 py-2 text-center text-xs uppercase tracking-[0.2em] font-[family-name:var(--font-terminal)] border border-[var(--accent-teal)]/40 transition-colors ${
            mode === 'login'
              ? 'bg-[var(--accent-teal)] text-black'
              : 'bg-transparent text-[var(--accent-teal)]/50 hover:text-[var(--accent-teal)]'
          }`}
        >
          Login
        </button>
        <button
          onClick={() => { setMode('register'); setError(''); }}
          className={`flex-1 py-2 text-center text-xs uppercase tracking-[0.2em] font-[family-name:var(--font-terminal)] border border-[var(--accent-teal)]/40 border-l-0 transition-colors ${
            mode === 'register'
              ? 'bg-[var(--accent-teal)] text-black'
              : 'bg-transparent text-[var(--accent-teal)]/50 hover:text-[var(--accent-teal)]'
          }`}
        >
          Register
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-2">
        {mode === 'register' && (
          <>
            <input
              name="username"
              type="text"
              placeholder="USERNAME"
              required
              className="w-full px-3 py-2 bg-black border border-[var(--accent-teal)]/30 text-[var(--accent-teal)] placeholder:text-[var(--accent-teal)]/25 font-[family-name:var(--font-body)] text-sm tracking-wider focus:outline-none focus:border-[var(--accent-teal)]"
            />
            <input
              name="email"
              type="email"
              placeholder="EMAIL"
              required
              className="w-full px-3 py-2 bg-black border border-[var(--accent-teal)]/30 text-[var(--accent-teal)] placeholder:text-[var(--accent-teal)]/25 font-[family-name:var(--font-body)] text-sm tracking-wider focus:outline-none focus:border-[var(--accent-teal)]"
            />
          </>
        )}

        {mode === 'login' && (
          <input
            name="login"
            type="text"
            placeholder="USERNAME OR EMAIL"
            required
            className="w-full px-3 py-2 bg-black border border-[var(--accent-teal)]/30 text-[var(--accent-teal)] placeholder:text-[var(--accent-teal)]/25 font-[family-name:var(--font-body)] text-sm tracking-wider focus:outline-none focus:border-[var(--accent-teal)]"
          />
        )}

        <input
          name="password"
          type="password"
          placeholder="PASSWORD"
          required
          minLength={8}
          className="w-full px-3 py-2 bg-black border border-[var(--accent-teal)]/30 text-[var(--accent-teal)] placeholder:text-[var(--accent-teal)]/25 font-[family-name:var(--font-body)] text-sm tracking-wider focus:outline-none focus:border-[var(--accent-teal)]"
        />

        {mode === 'register' && (
          <input
            name="accessCode"
            type="text"
            placeholder="ACCESS CODE (FROM RULEBOOK)"
            className="w-full px-3 py-2 bg-black border border-[var(--accent-gold)]/30 text-[var(--accent-gold)] placeholder:text-[var(--accent-gold)]/25 font-[family-name:var(--font-body)] text-sm tracking-wider uppercase focus:outline-none focus:border-[var(--accent-gold)]"
          />
        )}

        {error && (
          <p className="text-xs font-[family-name:var(--font-terminal)] text-[var(--accent-coral)] tracking-wider">
            [ERROR]: {error}
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full py-2.5 bg-[var(--surface-dark)] text-[var(--accent-gold)] uppercase tracking-[0.2em] text-xs font-[family-name:var(--font-terminal)] border border-[var(--surface-dark)] hover:bg-[var(--accent-gold)] hover:text-black transition-colors disabled:opacity-50"
        >
          {loading ? '...' : mode === 'login' ? '[ ENTER ]' : '[ BEGIN ]'}
        </button>
      </form>
    </div>
  );
}
