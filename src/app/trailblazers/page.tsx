"use client";

import { useState, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface Campaign {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  gmName?: string;
  _count?: {
    characters: number;
    sessions: number;
  };
}

interface Character {
  id: string;
  name: string;
  campaignId: string;
  campaign: {
    name: string;
    id: string;
  };
  createdAt: string;
}

export default function TrailblazersPage() {
  const { data: session } = useSession();
  const _router = useRouter();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const [krmaBalance, setKrmaBalance] = useState<string>("0");

  useEffect(() => {
    fetchPlayerData();
    fetchKrmaBalance();
  }, [session]);

  const fetchKrmaBalance = async () => {
    try {
      const response = await fetch("/api/krma/balance");
      if (response.ok) {
        const data = await response.json();
        setKrmaBalance(data.formatted);
      }
    } catch (error) {
      console.error("Failed to fetch KRMA balance:", error);
    }
  };

  const fetchPlayerData = async () => {
    try {
      // Fetch campaigns player is part of
      const campaignsResponse = await fetch("/api/players/my-campaigns");
      if (campaignsResponse.ok) {
        const campaignsData = await campaignsResponse.json();
        setCampaigns(campaignsData.campaigns || []);
      }

      // Fetch player's characters
      const charactersResponse = await fetch("/api/players/my-characters");
      if (charactersResponse.ok) {
        const charactersData = await charactersResponse.json();
        setCharacters(charactersData.characters || []);
      }
    } catch (error) {
      console.error("Failed to fetch player data:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-growth-gray-50">
      {/* Header */}
      <header className="growth-page-header shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="growth-title text-3xl text-white">Trailblazers Dashboard</h1>
              <div className="flex items-center gap-4 text-sm text-white opacity-90">
                <span>Welcome, {session?.user?.name}</span>
                <div className="krma-badge">
                  <div className="w-2 h-2 bg-white rounded-full opacity-75"></div>
                  <span className="font-bold">
                    {krmaBalance} KRMA Available
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <Link
                href="/settings"
                className="text-sm text-white hover:text-growth-accent-light transition-colors"
              >
                Settings
              </Link>
              <button
                onClick={() => signOut({ callbackUrl: '/' })}
                className="text-sm text-white hover:text-growth-error px-3 py-2 border border-white border-opacity-30 rounded-md hover:bg-white hover:bg-opacity-10 transition-all"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Quick Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="growth-card p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                  <span className="text-blue-600 font-bold text-lg">🎭</span>
                </div>
              </div>
              <div className="ml-4">
                <div className="text-2xl font-bold text-gray-900">{campaigns.length}</div>
                <div className="text-sm text-gray-600">Active Campaigns</div>
              </div>
            </div>
          </div>

          <div className="growth-card p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                  <span className="text-green-600 font-bold text-lg">👤</span>
                </div>
              </div>
              <div className="ml-4">
                <div className="text-2xl font-bold text-gray-900">{characters.length}</div>
                <div className="text-sm text-gray-600">Characters</div>
              </div>
            </div>
          </div>

          <div className="growth-card p-6">
            <div className="flex items-center">
              <div className="flex-shrink-0">
                <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                  <span className="text-purple-600 font-bold text-lg">₭</span>
                </div>
              </div>
              <div className="ml-4">
                <div className="text-2xl font-bold text-gray-900">{krmaBalance}</div>
                <div className="text-sm text-gray-600">KRMA Balance</div>
              </div>
            </div>
          </div>
        </div>

        {/* Active Campaigns */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-gray-900 mb-4">My Campaigns</h2>
          {campaigns.length === 0 ? (
            <div className="growth-card p-8 text-center">
              <div className="mx-auto h-12 w-12 text-gray-400 mb-4">
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
              <h3 className="growth-title text-xl mb-2">No campaigns yet</h3>
              <p className="growth-body mb-4">
                You haven&apos;t been invited to any campaigns yet. Ask your GM to send you an invitation!
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {campaigns.map((campaign) => (
                <Link
                  key={campaign.id}
                  href={`/campaign/${campaign.id}`}
                  className="growth-card p-6"
                >
                  <h3 className="growth-title text-xl mb-2">
                    {campaign.name}
                  </h3>
                  <div className="space-y-2 text-sm growth-body">
                    <div className="flex justify-between">
                      <span>GM:</span>
                      <span>{campaign.gmName || 'Unknown'}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Sessions:</span>
                      <span>{campaign._count?.sessions || 0}</span>
                    </div>
                    <div className="text-xs text-growth-gray-500 mt-4">
                      Updated {new Date(campaign.updatedAt).toLocaleDateString()}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* My Characters */}
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-4">My Characters</h2>
          {characters.length === 0 ? (
            <div className="growth-card p-8 text-center">
              <div className="mx-auto h-12 w-12 text-gray-400 mb-4">
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <h3 className="growth-title text-xl mb-2">No characters yet</h3>
              <p className="growth-body mb-4">
                Create your first character in one of your campaigns to get started!
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {characters.map((character) => (
                <Link
                  key={character.id}
                  href={`/campaign/${character.campaignId}/character/${character.id}`}
                  className="growth-card p-6"
                >
                  <h3 className="growth-title text-xl mb-2">
                    {character.name}
                  </h3>
                  <div className="space-y-2 text-sm growth-body">
                    <div className="flex justify-between">
                      <span>Campaign:</span>
                      <span>{character.campaign.name}</span>
                    </div>
                    <div className="text-xs text-growth-gray-500 mt-4">
                      Created {new Date(character.createdAt).toLocaleDateString()}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}