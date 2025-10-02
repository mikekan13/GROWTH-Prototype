'use client';

/**
 * Admin GM Invite Code Management Page
 * Allows admin to generate and view GM invite codes
 */

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface InviteCode {
  id: string;
  code: string;
  createdAt: string;
  usedAt: string | null;
  usedBy: string | null;
  expiresAt: string | null;
  isActive: boolean;
  user: {
    username: string;
    email: string;
    name: string | null;
  } | null;
}

export default function InviteCodesPage() {
  const router = useRouter();
  const [inviteCodes, setInviteCodes] = useState<InviteCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [count, setCount] = useState(1);
  const [expiresInDays, setExpiresInDays] = useState<number | ''>('');
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchInviteCodes = useCallback(async () => {
    try {
      const response = await fetch('/api/admin/invite-codes');
      if (response.status === 401 || response.status === 403) {
        router.push('/login');
        return;
      }
      const data = await response.json();
      setInviteCodes(data.inviteCodes || []);
      setError(null);
    } catch (error) {
      console.error('Error fetching invite codes:', error);
      setError('Failed to load invite codes');
      setInviteCodes([]);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    fetchInviteCodes();
  }, [fetchInviteCodes]);

  const generateCodes = async () => {
    if (count < 1 || count > 100) {
      alert('Count must be between 1 and 100');
      return;
    }

    setGenerating(true);
    try {
      const response = await fetch('/api/admin/invite-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          count,
          expiresInDays: expiresInDays || undefined,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        alert(data.message);
        fetchInviteCodes();
      } else {
        alert(data.error || 'Failed to generate codes');
      }
    } catch (error) {
      console.error('Error generating codes:', error);
      alert('Failed to generate codes');
    } finally {
      setGenerating(false);
    }
  };

  const deactivateCode = async (codeId: string) => {
    if (!confirm('Are you sure you want to deactivate this invite code?')) {
      return;
    }

    try {
      const response = await fetch('/api/admin/invite-codes', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ codeId }),
      });

      const data = await response.json();

      if (response.ok) {
        alert(data.message);
        fetchInviteCodes();
      } else {
        alert(data.error || 'Failed to deactivate code');
      }
    } catch (error) {
      console.error('Error deactivating code:', error);
      alert('Failed to deactivate code');
    }
  };

  const copyToClipboard = async (code: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(code);
      setTimeout(() => setCopiedCode(null), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const activeCount = inviteCodes?.filter((c) => c.isActive && !c.usedBy).length || 0;
  const usedCount = inviteCodes?.filter((c) => c.usedBy).length || 0;

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-8">
        <div className="max-w-6xl mx-auto">
          <p>Loading...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-900 text-white p-8">
        <div className="max-w-6xl mx-auto">
          <div className="bg-red-900 text-red-200 p-4 rounded mb-4">
            {error}
          </div>
          <button
            onClick={fetchInviteCodes}
            className="bg-blue-600 hover:bg-blue-700 px-4 py-2 rounded"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2">GM Invite Code Management</h1>
          <p className="text-gray-400">Generate and manage GM invitation codes</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-8">
          <div className="bg-gray-800 p-4 rounded-lg">
            <div className="text-2xl font-bold">{inviteCodes.length}</div>
            <div className="text-sm text-gray-400">Total Codes</div>
          </div>
          <div className="bg-green-900 p-4 rounded-lg">
            <div className="text-2xl font-bold">{activeCount}</div>
            <div className="text-sm text-gray-400">Available</div>
          </div>
          <div className="bg-blue-900 p-4 rounded-lg">
            <div className="text-2xl font-bold">{usedCount}</div>
            <div className="text-sm text-gray-400">Used</div>
          </div>
        </div>

        {/* Generate Form */}
        <div className="bg-gray-800 p-6 rounded-lg mb-8">
          <h2 className="text-xl font-bold mb-4">Generate New Codes</h2>
          <div className="flex gap-4 items-end">
            <div>
              <label className="block text-sm text-gray-400 mb-2">
                Number of Codes (1-100)
              </label>
              <input
                type="number"
                min="1"
                max="100"
                value={count}
                onChange={(e) => setCount(parseInt(e.target.value) || 1)}
                className="bg-gray-700 px-4 py-2 rounded w-32"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-2">
                Expires In (Days, optional)
              </label>
              <input
                type="number"
                min="1"
                value={expiresInDays}
                onChange={(e) =>
                  setExpiresInDays(e.target.value ? parseInt(e.target.value) : '')
                }
                placeholder="No expiry"
                className="bg-gray-700 px-4 py-2 rounded w-32"
              />
            </div>
            <button
              onClick={generateCodes}
              disabled={generating}
              className="bg-blue-600 hover:bg-blue-700 px-6 py-2 rounded font-semibold disabled:opacity-50"
            >
              {generating ? 'Generating...' : 'Generate'}
            </button>
          </div>
        </div>

        {/* Codes Table */}
        <div className="bg-gray-800 rounded-lg overflow-hidden">
          <table className="w-full">
            <thead className="bg-gray-700">
              <tr>
                <th className="text-left p-4">Code</th>
                <th className="text-left p-4">Status</th>
                <th className="text-left p-4">Used By</th>
                <th className="text-left p-4">Created</th>
                <th className="text-left p-4">Expires</th>
                <th className="text-left p-4">Actions</th>
              </tr>
            </thead>
            <tbody>
              {inviteCodes && inviteCodes.length > 0 ? inviteCodes.map((code) => (
                <tr key={code.id} className="border-t border-gray-700">
                  <td className="p-4">
                    <button
                      onClick={() => copyToClipboard(code.code)}
                      className="font-mono bg-gray-700 hover:bg-gray-600 px-3 py-1 rounded"
                      title="Click to copy"
                    >
                      {code.code}
                      {copiedCode === code.code && (
                        <span className="ml-2 text-green-400 text-sm">✓ Copied</span>
                      )}
                    </button>
                  </td>
                  <td className="p-4">
                    {code.usedBy ? (
                      <span className="text-blue-400">Used</span>
                    ) : code.isActive ? (
                      <span className="text-green-400">Active</span>
                    ) : (
                      <span className="text-gray-500">Inactive</span>
                    )}
                  </td>
                  <td className="p-4">
                    {code.user ? (
                      <div>
                        <div className="font-semibold">{code.user.username}</div>
                        <div className="text-sm text-gray-400">{code.user.email}</div>
                      </div>
                    ) : (
                      <span className="text-gray-500">—</span>
                    )}
                  </td>
                  <td className="p-4 text-sm text-gray-400">
                    {new Date(code.createdAt).toLocaleDateString()}
                  </td>
                  <td className="p-4 text-sm text-gray-400">
                    {code.expiresAt
                      ? new Date(code.expiresAt).toLocaleDateString()
                      : 'Never'}
                  </td>
                  <td className="p-4">
                    {code.isActive && !code.usedBy && (
                      <button
                        onClick={() => deactivateCode(code.id)}
                        className="text-red-400 hover:text-red-300 text-sm"
                      >
                        Deactivate
                      </button>
                    )}
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-gray-400">
                    No invite codes yet. Generate some codes to get started!
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
