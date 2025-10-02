"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

interface Campaign {
  id: string;
  name: string;
  genre?: string;
  themes?: string;
  description?: string;
  createdAt: string;
  updatedAt: string;
  _count?: {
    characters: number;
    sheets: number;
    sessions: number;
    worlds: number;
  };
}

export default function CampaignsPage() {
  const router = useRouter();
  const [session, setSession] = useState<{ user?: { id: string; name?: string; email: string; role: string } } | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newCampaignName, setNewCampaignName] = useState("");
  const [newCampaignGenre, setNewCampaignGenre] = useState("");
  const [newCampaignThemes, setNewCampaignThemes] = useState("");
  const [newCampaignDescription, setNewCampaignDescription] = useState("");
  const [creating, setCreating] = useState(false);
  const [krmaBalance, setKrmaBalance] = useState<string>("0");
  const [userRole, setUserRole] = useState<string>("WATCHER");
  const [showPlayerManager, setShowPlayerManager] = useState(false);
  const [players, setPlayers] = useState<Array<{ id: string; user: { name?: string; email: string }; joinedAt: string }>>([]);
  const [pendingInvitations, setPendingInvitations] = useState<Array<{ id: string; playerEmail: string; expiresAt: string }>>([]);
  const [availableSlots, setAvailableSlots] = useState(6);
  const [newPlayerEmail, setNewPlayerEmail] = useState("");
  const [inviting, setInviting] = useState(false);
  const [cancelingInvite, setCancelingInvite] = useState("");
  const [removingPlayer, setRemovingPlayer] = useState("");
  const [lastInviteUrl, setLastInviteUrl] = useState<string | null>(null);
  const [showInviteSuccess, setShowInviteSuccess] = useState(false);

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

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      router.push('/');
    } catch (error) {
      console.error("Logout error:", error);
      router.push('/');
    }
  };

  const fetchSession = useCallback(async () => {
    try {
      const response = await fetch('/api/auth/session');
      if (response.ok) {
        const data = await response.json();
        if (data.user) {
          setSession(data);
          const role = data.user.role || "WATCHER";
          setUserRole(role);

          // Redirect non-GMs to trailblazer interface
          if (role !== "WATCHER" && role !== "ADMIN") {
            router.push("/trailblazer");
            return;
          }
        } else {
          router.push("/login");
        }
      } else {
        router.push("/login");
      }
    } catch (error) {
      console.error("Failed to fetch session:", error);
      router.push("/login");
    }
  }, [router]);

  useEffect(() => {
    fetchSession();
    fetchCampaigns();
    fetchKrmaBalance();
  }, [fetchSession]);

  const fetchPlayers = async () => {
    if (userRole !== "WATCHER") return;
    
    try {
      const response = await fetch("/api/players/my-players");
      if (response.ok) {
        const data = await response.json();
        setPlayers(data.players);
        setPendingInvitations(data.pendingInvitations);
        setAvailableSlots(data.availableSlots);
      }
    } catch (error) {
      console.error("Failed to fetch players:", error);
    }
  };

  const invitePlayer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlayerEmail.trim()) return;

    setInviting(true);
    try {
      const response = await fetch("/api/players/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerEmail: newPlayerEmail.trim() }),
      });

      if (response.ok) {
        const data = await response.json();
        setLastInviteUrl(data.inviteUrl);
        setShowInviteSuccess(true);
        setNewPlayerEmail("");
        await fetchPlayers(); // Refresh list
      } else {
        const error = await response.json();
        alert(`Failed to create invitation: ${error.error}`);
      }
    } catch (_error) {
      console.error("Failed to invite player:", _error);
      alert("Failed to send invitation");
    } finally {
      setInviting(false);
    }
  };

  const copyInviteLink = async () => {
    if (!lastInviteUrl) return;

    try {
      await navigator.clipboard.writeText(lastInviteUrl);
      alert("Invite link copied to clipboard!");
    } catch (_error) {
      // Fallback for browsers that don't support clipboard API
      const textArea = document.createElement("textarea");
      textArea.value = lastInviteUrl;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      document.body.removeChild(textArea);
      alert("Invite link copied to clipboard!");
    }
  };

  const cancelInvitation = async (invitationId: string, playerEmail: string) => {
    if (!confirm(`Cancel invitation for ${playerEmail}?`)) return;

    setCancelingInvite(invitationId);
    try {
      const response = await fetch("/api/players/cancel-invitation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invitationId }),
      });

      if (response.ok) {
        await fetchPlayers(); // Refresh list
      } else {
        const error = await response.json();
        alert(`Failed to cancel invitation: ${error.error}`);
      }
    } catch (error) {
      console.error("Failed to cancel invitation:", error);
      alert("Failed to cancel invitation");
    } finally {
      setCancelingInvite("");
    }
  };

  const removePlayer = async (playerId: string, playerName: string) => {
    if (!confirm(`Remove ${playerName} from your player group? They will lose access to all campaigns.`)) return;

    setRemovingPlayer(playerId);
    try {
      const response = await fetch("/api/players/remove", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ playerId }),
      });

      if (response.ok) {
        await fetchPlayers(); // Refresh list
      } else {
        const error = await response.json();
        alert(`Failed to remove player: ${error.error}`);
      }
    } catch (error) {
      console.error("Failed to remove player:", error);
      alert("Failed to remove player");
    } finally {
      setRemovingPlayer("");
    }
  };

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
    if (!newCampaignName.trim() || !newCampaignGenre.trim() || !newCampaignThemes.trim() || !newCampaignDescription.trim()) {
      alert("Please fill in all required fields: name, genre, themes, and description.");
      return;
    }

    setCreating(true);
    try {
      const response = await fetch("/api/campaigns", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newCampaignName.trim(),
          genre: newCampaignGenre.trim(),
          themes: newCampaignThemes.trim(),
          description: newCampaignDescription.trim()
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setNewCampaignName("");
        setNewCampaignGenre("");
        setNewCampaignThemes("");
        setNewCampaignDescription("");
        setShowCreateForm(false);
        router.push(`/campaign/${data.campaign.id}`);
      } else {
        const error = await response.json();
        alert(`Failed to create campaign: ${error.error}`);
      }
    } catch (error) {
      console.error("Failed to create campaign:", error);
      alert("Failed to create campaign. Please try again.");
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
              <h1 className="growth-title text-3xl text-white">GROWTH Campaigns</h1>
              <div className="flex items-center gap-4 text-sm text-white opacity-90">
                <span>Welcome back, {session?.user?.name}</span>
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
              {userRole === "ADMIN" && (
                <Link
                  href="/admin"
                  className="text-sm text-white hover:text-growth-accent-light transition-colors"
                >
                  Admin
                </Link>
              )}
              {userRole === "WATCHER" && (
                <button
                  onClick={() => {
                    setShowPlayerManager(true);
                    fetchPlayers();
                  }}
                  className="bg-purple-600 text-white px-4 py-2 rounded-md hover:bg-purple-700 focus:outline-none focus:ring-2 focus:ring-purple-500 transition-all"
                >
                  Manage Players ({players.length}/6)
                </button>
              )}
              <button
                onClick={handleLogout}
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
      </main>

      {/* Create Campaign Modal */}
      {showCreateForm && (
        <div className="fixed inset-0 bg-growth-gray-900 bg-opacity-75 flex items-center justify-center p-4 z-50">
          <div className="growth-card max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="growth-title text-lg mb-4">
              Create New Campaign
            </h3>
            <form onSubmit={createCampaign}>
              <div className="mb-4">
                <label htmlFor="campaign-name" className="block text-sm font-medium growth-subtitle mb-2">
                  Campaign Name *
                </label>
                <input
                  id="campaign-name"
                  type="text"
                  value={newCampaignName}
                  onChange={(e) => setNewCampaignName(e.target.value)}
                  placeholder="Enter campaign name..."
                  className="growth-input w-full"
                  autoFocus
                  required
                />
              </div>

              <div className="mb-4">
                <label htmlFor="campaign-genre" className="block text-sm font-medium growth-subtitle mb-2">
                  Genre *
                </label>
                <input
                  id="campaign-genre"
                  type="text"
                  value={newCampaignGenre}
                  onChange={(e) => setNewCampaignGenre(e.target.value)}
                  placeholder="e.g., Fantasy, Sci-Fi, Modern Horror..."
                  className="growth-input w-full"
                  required
                />
              </div>

              <div className="mb-4">
                <label htmlFor="campaign-themes" className="block text-sm font-medium growth-subtitle mb-2">
                  Themes *
                </label>
                <input
                  id="campaign-themes"
                  type="text"
                  value={newCampaignThemes}
                  onChange={(e) => setNewCampaignThemes(e.target.value)}
                  placeholder="e.g., Political intrigue, survival, redemption..."
                  className="growth-input w-full"
                  required
                />
              </div>

              <div className="mb-4">
                <label htmlFor="campaign-description" className="block text-sm font-medium growth-subtitle mb-2">
                  Description *
                </label>
                <textarea
                  id="campaign-description"
                  value={newCampaignDescription}
                  onChange={(e) => setNewCampaignDescription(e.target.value)}
                  placeholder="Describe the campaign setting, premise, and what players can expect..."
                  className="growth-input w-full"
                  rows={4}
                  required
                />
              </div>
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateForm(false);
                    setNewCampaignName("");
                    setNewCampaignGenre("");
                    setNewCampaignThemes("");
                    setNewCampaignDescription("");
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

      {/* Player Management Modal */}
      {showPlayerManager && (
        <div className="fixed inset-0 bg-growth-gray-900 bg-opacity-75 flex items-center justify-center p-4 z-50">
          <div className="growth-card max-w-2xl w-full p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex justify-between items-center mb-6">
              <h3 className="growth-title text-xl">
                Player Management ({players.length}/6 slots)
              </h3>
              <button
                onClick={() => setShowPlayerManager(false)}
                className="text-growth-gray-500 hover:text-growth-gray-700 text-2xl"
              >
                ×
              </button>
            </div>

            {/* Invite New Player */}
            {availableSlots > 0 && (
              <div className="mb-6 p-4 bg-growth-gray-50 rounded-lg">
                <h4 className="growth-subtitle text-sm font-medium mb-3">
                  Invite New Player ({availableSlots} slots remaining)
                </h4>
                <form onSubmit={invitePlayer} className="flex gap-3">
                  <input
                    type="email"
                    value={newPlayerEmail}
                    onChange={(e) => setNewPlayerEmail(e.target.value)}
                    placeholder="Enter player's email..."
                    className="growth-input flex-1"
                    required
                  />
                  <button
                    type="submit"
                    disabled={inviting || !newPlayerEmail.trim()}
                    className="btn-growth-primary px-4 py-2 disabled:opacity-50"
                  >
                    {inviting ? "Creating..." : "Create Invite"}
                  </button>
                </form>
              </div>
            )}

            {/* Invite Success Modal */}
            {showInviteSuccess && lastInviteUrl && (
              <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-green-800 font-medium">✅ Invitation Created!</h4>
                  <button
                    onClick={() => setShowInviteSuccess(false)}
                    className="text-green-600 hover:text-green-800 text-xl"
                  >
                    ×
                  </button>
                </div>
                <p className="text-green-700 text-sm mb-3">
                  Copy this link and send it to your player manually (via text, Discord, etc.):
                </p>
                <div className="flex gap-2 items-center">
                  <input
                    type="text"
                    value={lastInviteUrl}
                    readOnly
                    className="flex-1 p-2 text-xs bg-white border border-green-300 rounded font-mono"
                  />
                  <button
                    onClick={copyInviteLink}
                    className="bg-green-600 text-white px-3 py-2 rounded text-sm hover:bg-green-700"
                  >
                    Copy Link
                  </button>
                </div>
                <p className="text-green-600 text-xs mt-2">
                  💡 This link will expire in 7 days
                </p>
              </div>
            )}

            {availableSlots === 0 && (
              <div className="mb-6 p-4 bg-orange-50 border border-orange-200 rounded-lg">
                <p className="text-orange-800 text-sm">
                  You have reached the maximum of 6 players. Remove a player to invite someone new.
                </p>
              </div>
            )}

            {/* Current Players */}
            <div className="mb-6">
              <h4 className="growth-subtitle text-sm font-medium mb-3">
                Current Players ({players.length})
              </h4>
              {players.length === 0 ? (
                <p className="text-growth-gray-500 text-sm">No players yet. Send some invitations!</p>
              ) : (
                <div className="space-y-2">
                  {players.map((player) => (
                    <div key={player.id} className="flex items-center justify-between p-3 bg-white border border-growth-gray-200 rounded-md">
                      <div>
                        <div className="font-medium growth-title text-sm">
                          {player.user.name || player.user.email}
                        </div>
                        <div className="text-xs text-growth-gray-500">
                          {player.user.email} • Joined {new Date(player.joinedAt).toLocaleDateString()}
                        </div>
                      </div>
                      <button
                        onClick={() => removePlayer(player.id, player.user.name || player.user.email)}
                        disabled={removingPlayer === player.id}
                        className="text-red-600 hover:text-red-800 text-sm px-2 py-1 rounded disabled:opacity-50"
                      >
                        {removingPlayer === player.id ? "Removing..." : "Remove"}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Pending Invitations */}
            {pendingInvitations.length > 0 && (
              <div>
                <h4 className="growth-subtitle text-sm font-medium mb-3">
                  Pending Invitations ({pendingInvitations.length})
                </h4>
                <div className="space-y-2">
                  {pendingInvitations.map((invitation) => (
                    <div key={invitation.id} className="flex items-center justify-between p-3 bg-yellow-50 border border-yellow-200 rounded-md">
                      <div>
                        <div className="font-medium text-sm">
                          {invitation.playerEmail}
                        </div>
                        <div className="text-xs text-growth-gray-500">
                          Expires {new Date(invitation.expiresAt).toLocaleDateString()}
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <button
                          onClick={() => cancelInvitation(invitation.id, invitation.playerEmail)}
                          disabled={cancelingInvite === invitation.id}
                          className="text-red-600 hover:text-red-800 text-sm px-2 py-1 rounded disabled:opacity-50"
                        >
                          {cancelingInvite === invitation.id ? "Canceling..." : "Cancel"}
                        </button>
                        <div className="text-xs text-yellow-600 font-medium">
                          PENDING
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}