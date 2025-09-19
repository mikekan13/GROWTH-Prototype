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
  _count?: {
    characters: number;
    sheets: number;
    sessions: number;
  };
}

export default function WatchersPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newCampaignName, setNewCampaignName] = useState("");
  const [creating, setCreating] = useState(false);
  const [krmaBalance, setKrmaBalance] = useState<string>("0");

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

  useEffect(() => {
    fetchCampaigns();
    fetchKrmaBalance();
  }, [session]);

  const fetchCampaigns = async () => {
    try {
      const response = await fetch("/api/campaigns");
      if (response.ok) {
        const data = await response.json();
        setCampaigns(data.campaigns || []);
      }
    } catch (error) {
      console.error("Failed to fetch campaigns:", error);
    } finally {
      setLoading(false);
    }
  };

  const createCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCampaignName.trim()) return;

    setCreating(true);
    try {
      const response = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newCampaignName.trim() }),
      });

      if (response.ok) {
        const data = await response.json();
        router.push(`/campaign/${data.campaign.id}`);
      }
    } catch (error) {
      console.error("Failed to create campaign:", error);
    } finally {
      setCreating(false);
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
              <h1 className="growth-title text-3xl text-white">Watchers Dashboard</h1>
              <div className="flex items-center gap-4 text-sm text-white opacity-90">
                <span>GM: {session?.user?.name}</span>
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
              <Link
                href="/queues/decisions"
                className="text-sm text-white hover:text-growth-accent-light transition-colors"
              >
                Decision Queue
              </Link>
              <button
                onClick={() => setShowCreateForm(true)}
                className="btn-growth-primary"
              >
                New Campaign
              </button>
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
        {/* GM Tools Quick Access */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Link href="/players/invite" className="growth-card p-4 hover:shadow-md transition-shadow">
            <div className="flex items-center">
              <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center mr-3">
                <span className="text-purple-600 font-bold">👥</span>
              </div>
              <div>
                <div className="text-sm font-medium text-gray-900">Player Management</div>
                <div className="text-xs text-gray-500">Invite & manage</div>
              </div>
            </div>
          </Link>

          <div className="growth-card p-4 opacity-50">
            <div className="flex items-center">
              <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center mr-3">
                <span className="text-blue-600 font-bold">🌍</span>
              </div>
              <div>
                <div className="text-sm font-medium text-gray-900">World Building</div>
                <div className="text-xs text-gray-500">Coming soon</div>
              </div>
            </div>
          </div>

          <div className="growth-card p-4 opacity-50">
            <div className="flex items-center">
              <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center mr-3">
                <span className="text-green-600 font-bold">📊</span>
              </div>
              <div>
                <div className="text-sm font-medium text-gray-900">Analytics</div>
                <div className="text-xs text-gray-500">Coming soon</div>
              </div>
            </div>
          </div>

          <div className="growth-card p-4 opacity-50">
            <div className="flex items-center">
              <div className="w-8 h-8 bg-orange-100 rounded-lg flex items-center justify-center mr-3">
                <span className="text-orange-600 font-bold">🎲</span>
              </div>
              <div>
                <div className="text-sm font-medium text-gray-900">GM Tools</div>
                <div className="text-xs text-gray-500">Coming soon</div>
              </div>
            </div>
          </div>
        </div>

        {/* Campaigns */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-gray-900">My Campaigns</h2>
            <div className="text-sm text-gray-500">
              {campaigns.length} campaigns
            </div>
          </div>

          {campaigns.length === 0 ? (
            <div className="text-center py-12">
              <div className="mx-auto h-12 w-12 text-gray-400 mb-4">
                <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                </svg>
              </div>
              <h3 className="growth-title text-xl mb-2">No campaigns yet</h3>
              <p className="growth-body mb-6">
                Create your first campaign to start managing characters and sessions
              </p>
              <button
                onClick={() => setShowCreateForm(true)}
                className="btn-growth-primary px-6 py-3"
              >
                Create Your First Campaign
              </button>
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
                      <span>Characters:</span>
                      <span>{campaign._count?.characters || 0}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Sheets:</span>
                      <span>{campaign._count?.sheets || 0}</span>
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
      </main>

      {/* Create Campaign Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-growth-gray-900 bg-opacity-75 flex items-center justify-center p-4 z-50">
          <div className="growth-card max-w-md w-full p-6">
            <h3 className="growth-title text-lg mb-4">
              Create New Campaign
            </h3>
            <form onSubmit={createCampaign}>
              <div className="mb-4">
                <label htmlFor="campaign-name" className="block text-sm font-medium growth-subtitle mb-2">
                  Campaign Name
                </label>
                <input
                  id="campaign-name"
                  type="text"
                  value={newCampaignName}
                  onChange={(e) => setNewCampaignName(e.target.value)}
                  placeholder="Enter campaign name..."
                  className="growth-input w-full"
                  autoFocus
                />
              </div>
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateForm(false);
                    setNewCampaignName("");
                  }}
                  className="btn-growth-secondary px-4 py-2 text-sm font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || !newCampaignName.trim()}
                  className="btn-growth-primary px-4 py-2 text-sm font-medium disabled:opacity-50"
                >
                  {creating ? "Creating..." : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}