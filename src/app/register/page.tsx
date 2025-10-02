'use client';

/**
 * Registration Page
 * Allows users to create accounts with GM invite code or player invite token
 */

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';

export default function RegisterPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [name, setName] = useState('');
  const [gmInviteCode, setGmInviteCode] = useState('');
  const [playerInviteToken, setPlayerInviteToken] = useState('');
  const [registrationType, setRegistrationType] = useState<'gm' | 'player'>('gm');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // Check if we have an invite token in the URL
    const token = searchParams.get('token');
    if (token) {
      setPlayerInviteToken(token);
      setRegistrationType('player');
    }
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    // Validation
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }

    if (registrationType === 'gm' && !gmInviteCode) {
      setError('GM invite code is required');
      return;
    }

    if (registrationType === 'player' && !playerInviteToken) {
      setError('Player invite token is required');
      return;
    }

    setLoading(true);

    try {
      const response = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username,
          email,
          password,
          name: name || username,
          gmInviteCode: registrationType === 'gm' ? gmInviteCode : undefined,
          playerInviteToken: registrationType === 'player' ? playerInviteToken : undefined,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        // Redirect based on role
        if (data.user.role === 'WATCHER') {
          router.push('/campaigns');
        } else if (data.user.role === 'TRAILBLAZER') {
          router.push('/trailblazer');
        } else {
          router.push('/');
        }
      } else {
        setError(data.error || 'Registration failed');
      }
    } catch (error) {
      console.error('Registration error:', error);
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center p-4">
      <div className="bg-gray-800 p-8 rounded-lg shadow-xl w-full max-w-md">
        <h1 className="text-3xl font-bold text-white mb-6 text-center">
          GROWTH
        </h1>
        <h2 className="text-xl text-gray-300 mb-6 text-center">Create Account</h2>

        {error && (
          <div className="bg-red-900 text-red-200 p-3 rounded mb-4 text-sm">
            {error}
          </div>
        )}

        {/* Registration Type Selection */}
        {!playerInviteToken && (
          <div className="flex gap-2 mb-6">
            <button
              type="button"
              onClick={() => setRegistrationType('gm')}
              className={`flex-1 py-2 px-4 rounded font-semibold ${
                registrationType === 'gm'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300'
              }`}
            >
              GM (Watcher)
            </button>
            <button
              type="button"
              onClick={() => setRegistrationType('player')}
              className={`flex-1 py-2 px-4 rounded font-semibold ${
                registrationType === 'player'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300'
              }`}
            >
              Player (Trailblazer)
            </button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Username */}
          <div>
            <label htmlFor="username" className="block text-sm font-medium text-gray-300 mb-2">
              Username*
            </label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full bg-gray-700 text-white px-4 py-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
              autoFocus
              minLength={3}
              maxLength={30}
              pattern="[a-zA-Z0-9_-]+"
              title="Only letters, numbers, underscores, and hyphens"
            />
          </div>

          {/* Email */}
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-300 mb-2">
              Email*
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full bg-gray-700 text-white px-4 py-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>

          {/* Display Name */}
          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-300 mb-2">
              Display Name (optional)
            </label>
            <input
              id="name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={username || 'Your display name'}
              className="w-full bg-gray-700 text-white px-4 py-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Password */}
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-300 mb-2">
              Password* (min 8 characters)
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full bg-gray-700 text-white px-4 py-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
              minLength={8}
            />
          </div>

          {/* Confirm Password */}
          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-300 mb-2">
              Confirm Password*
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full bg-gray-700 text-white px-4 py-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
              minLength={8}
            />
          </div>

          {/* GM Invite Code or Player Invite Token */}
          {registrationType === 'gm' ? (
            <div>
              <label htmlFor="gmInviteCode" className="block text-sm font-medium text-gray-300 mb-2">
                GM Invite Code* (e.g., GM-XXXX-XXXX-XXXX)
              </label>
              <input
                id="gmInviteCode"
                type="text"
                value={gmInviteCode}
                onChange={(e) => setGmInviteCode(e.target.value.toUpperCase())}
                placeholder="GM-XXXX-XXXX-XXXX"
                className="w-full bg-gray-700 text-white px-4 py-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono"
                required
                pattern="GM-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}"
              />
              <p className="text-xs text-gray-400 mt-1">
                Enter the invite code from your GROWTH rulebook
              </p>
            </div>
          ) : (
            <div>
              <label htmlFor="playerInviteToken" className="block text-sm font-medium text-gray-300 mb-2">
                Player Invite Token*
              </label>
              <input
                id="playerInviteToken"
                type="text"
                value={playerInviteToken}
                onChange={(e) => setPlayerInviteToken(e.target.value)}
                className="w-full bg-gray-700 text-white px-4 py-2 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
                readOnly={!!searchParams.get('token')}
              />
              <p className="text-xs text-gray-400 mt-1">
                Use the invite link provided by your GM
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-4 rounded disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Creating account...' : 'Create Account'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <Link
            href="/login"
            className="text-blue-400 hover:text-blue-300 text-sm"
          >
            Already have an account? Sign In
          </Link>
        </div>
      </div>
    </div>
  );
}
