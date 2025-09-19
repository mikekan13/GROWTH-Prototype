'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useSession, signIn } from 'next-auth/react';

interface InvitationData {
  gmName: string;
  playerEmail: string;
  campaignName?: string;
  expiresAt: string;
}

function InvitePageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();
  
  const [invitation, setInvitation] = useState<InvitationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);
  
  const inviteToken = searchParams.get('token');

  useEffect(() => {
    if (!inviteToken) {
      setError('No invitation token provided');
      setLoading(false);
      return;
    }

    // Fetch invitation details
    fetch(`/api/invitations/${inviteToken}`)
      .then(res => res.json())
      .then(data => {
        if (data.error) {
          setError(data.error);
        } else {
          setInvitation(data);
        }
      })
      .catch(_err => {
        setError('Failed to load invitation details');
      })
      .finally(() => setLoading(false));
  }, [inviteToken]);

  const handleAcceptInvitation = async () => {
    if (!session?.user?.id) {
      // User needs to sign in first
      signIn('google');
      return;
    }

    setAccepting(true);
    try {
      const response = await fetch('/api/invitations/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ inviteToken })
      });

      const data = await response.json();
      
      if (data.success) {
        router.push('/campaigns');
      } else {
        setError(data.error || 'Failed to accept invitation');
      }
    } catch (_err) {
      setError('Failed to accept invitation');
    } finally {
      setAccepting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading invitation...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-red-100 flex items-center justify-center">
        <div className="bg-white p-8 rounded-lg shadow-lg max-w-md text-center">
          <div className="text-red-600 text-6xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Invitation Error</h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <button
            onClick={() => router.push('/campaigns')}
            className="bg-gray-600 text-white px-6 py-2 rounded-md hover:bg-gray-700"
          >
            Go to Campaigns
          </button>
        </div>
      </div>
    );
  }

  if (!invitation) {
    return null;
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white p-6 text-center">
          <div className="text-4xl mb-2">🎲</div>
          <h1 className="text-2xl font-bold">GROWTH RPG Invitation</h1>
        </div>

        {/* Content */}
        <div className="p-6">
          <div className="text-center mb-6">
            <h2 className="text-xl font-semibold text-gray-900 mb-2">
              You&apos;re Invited!
            </h2>
            <p className="text-gray-600">
              <strong>{invitation.gmName}</strong> has invited you to join their GROWTH RPG campaign.
            </p>
          </div>

          {/* Invitation Details */}
          <div className="bg-gray-50 rounded-lg p-4 mb-6 space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-600">GM:</span>
              <span className="font-medium">{invitation.gmName}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-600">Player Email:</span>
              <span className="font-medium">{invitation.playerEmail}</span>
            </div>
            {invitation.campaignName && (
              <div className="flex justify-between">
                <span className="text-gray-600">Campaign:</span>
                <span className="font-medium">{invitation.campaignName}</span>
              </div>
            )}
            <div className="flex justify-between">
              <span className="text-gray-600">Expires:</span>
              <span className="font-medium">
                {new Date(invitation.expiresAt).toLocaleDateString()}
              </span>
            </div>
          </div>

          {/* Action Buttons */}
          {status === 'loading' ? (
            <div className="text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 mx-auto"></div>
              <p className="mt-2 text-gray-600">Checking authentication...</p>
            </div>
          ) : !session ? (
            <div className="space-y-4">
              <p className="text-center text-gray-600">
                Please sign in with Google to accept this invitation.
              </p>
              <button
                onClick={() => signIn('google')}
                className="w-full bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 transition-colors"
              >
                Sign in with Google
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              {session.user?.email !== invitation.playerEmail && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
                  <p className="text-yellow-800 text-sm">
                    ⚠️ You&apos;re signed in as <strong>{session.user?.email}</strong>, 
                    but this invitation is for <strong>{invitation.playerEmail}</strong>.
                    Please sign in with the correct account.
                  </p>
                </div>
              )}
              
              <button
                onClick={handleAcceptInvitation}
                disabled={accepting || session.user?.email !== invitation.playerEmail}
                className={`w-full px-4 py-2 rounded-md transition-colors ${
                  accepting || session.user?.email !== invitation.playerEmail
                    ? 'bg-gray-400 cursor-not-allowed'
                    : 'bg-green-600 hover:bg-green-700'
                } text-white`}
              >
                {accepting ? 'Accepting...' : 'Accept Invitation'}
              </button>
              
              <button
                onClick={() => router.push('/campaigns')}
                className="w-full bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700 transition-colors"
              >
                Go to Campaigns
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-gray-50 px-6 py-3 text-center text-sm text-gray-600">
          Welcome to the GROWTH universe! 🌟
        </div>
      </div>
    </div>
  );
}

export default function InvitePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading...</p>
        </div>
      </div>
    }>
      <InvitePageContent />
    </Suspense>
  );
}