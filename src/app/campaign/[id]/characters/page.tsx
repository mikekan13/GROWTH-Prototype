"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams } from "next/navigation";
import { signOut } from "next-auth/react";
import Link from "next/link";
import { CharacterCard } from "@/components/ui/CharacterCard";

interface Character {
  id: string;
  name: string;
  playerEmail?: string;
  spreadsheetId: string;
  updatedAt: string;
  identity?: {
    name?: string;
  };
  attributes?: {
    [key: string]: {
      current?: number;
      level?: number;
      augment?: number;
    };
  };
}

interface Campaign {
  id: string;
  name: string;
  folderId?: string;
}

export default function CharactersPage() {
  const params = useParams();
  const campaignId = params.id as string;
  const [characters, setCharacters] = useState<Character[]>([]);
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [showAddSheet, setShowAddSheet] = useState(false);
  const [showCreateSheet, setShowCreateSheet] = useState(false);
  const [newSheetUrl, setNewSheetUrl] = useState("");
  const [playerName, setPlayerName] = useState("");
  const [playerEmail, setPlayerEmail] = useState("");
  const [adding, setAdding] = useState(false);
  const [creating, setCreating] = useState(false);

  const fetchCharacters = useCallback(async () => {
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/characters`);
      if (response.ok) {
        const data = await response.json();
        setCharacters(data.characters || []);
      }
    } catch (error) {
      console.error("Failed to fetch characters:", error);
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  const fetchCampaign = useCallback(async () => {
    try {
      const response = await fetch(`/api/campaigns/${campaignId}`);
      if (response.ok) {
        const data = await response.json();
        setCampaign(data.campaign);
      }
    } catch (error) {
      console.error("Failed to fetch campaign:", error);
    }
  }, [campaignId]);

  useEffect(() => {
    fetchCharacters();
    fetchCampaign();
  }, [fetchCharacters, fetchCampaign]);

  const addCharacterSheet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSheetUrl.trim()) return;

    setAdding(true);
    try {
      // Extract spreadsheet ID from URL
      const urlMatch = newSheetUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
      const spreadsheetId = urlMatch ? urlMatch[1] : newSheetUrl.trim();

      const response = await fetch(`/api/campaigns/${campaignId}/characters`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spreadsheetId }),
      });

      if (response.ok) {
        await fetchCharacters();
        setShowAddSheet(false);
        setNewSheetUrl("");
      } else {
        const error = await response.json();
        alert(`Failed to add character sheet: ${error.error}`);
      }
    } catch (error) {
      console.error("Failed to add character sheet:", error);
      alert("Failed to add character sheet");
    } finally {
      setAdding(false);
    }
  };

  const createBlankSheet = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!playerName.trim()) return;

    setCreating(true);
    try {
      // First create the blank character sheet
      const createResponse = await fetch("/api/sheets/create-blank", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerName: playerName.trim(),
          playerEmail: playerEmail.trim() || undefined,
          campaignId: campaignId,
          campaignName: campaign?.name,
          folderId: campaign?.folderId || undefined,
        }),
      });

      if (!createResponse.ok) {
        const error = await createResponse.json();
        throw new Error(error.error || "Failed to create blank sheet");
      }

      const newSheet = await createResponse.json();

      // Then add it to the campaign
      const addResponse = await fetch(`/api/campaigns/${campaignId}/characters`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          spreadsheetId: newSheet.id,
          playerEmail: playerEmail.trim() || undefined,
        }),
      });

      if (addResponse.ok) {
        await fetchCharacters();
        setShowCreateSheet(false);
        setPlayerName("");
        setPlayerEmail("");
        alert(`Character sheet created successfully!\nURL: ${newSheet.url}`);
      } else {
        const error = await addResponse.json();
        alert(`Sheet created but failed to add to campaign: ${error.error}`);
      }
    } catch (error) {
      console.error("Failed to create character sheet:", error);
      alert(`Failed to create character sheet: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <div>
              <nav className="flex items-center space-x-2 text-sm text-gray-600 mb-2">
                <Link href="/campaigns" className="hover:text-indigo-600">
                  Campaigns
                </Link>
                <span>/</span>
                <Link href={`/campaign/${campaignId}`} className="hover:text-indigo-600">
                  Campaign
                </Link>
                <span>/</span>
                <span className="text-gray-900">Characters</span>
              </nav>
              <h1 className="text-2xl font-bold text-gray-900">Characters</h1>
            </div>
            <div className="flex items-center space-x-4">
              <div className="flex">
                <button
                  onClick={() => setShowCreateSheet(true)}
                  className="bg-indigo-600 text-white px-4 py-2 rounded-l-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  Create New Sheet
                </button>
                <button
                  onClick={() => setShowAddSheet(true)}
                  className="bg-indigo-500 text-white px-4 py-2 rounded-r-md border-l border-indigo-400 hover:bg-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  Add Existing
                </button>
              </div>
              <button
                onClick={() => signOut({ callbackUrl: '/' })}
                className="text-sm text-gray-600 hover:text-red-600 px-3 py-2 border border-gray-300 rounded-md hover:bg-gray-50"
              >
                Sign Out
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {characters.length === 0 ? (
          <div className="text-center py-12">
            <div className="mx-auto h-12 w-12 text-gray-400 mb-4">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5 0a4 4 0 11-8 0" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No characters yet</h3>
            <p className="text-gray-600 mb-6">
              Create a new character sheet or add an existing one to get started
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={() => setShowCreateSheet(true)}
                className="bg-indigo-600 text-white px-6 py-3 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                Create New Sheet
              </button>
              <button
                onClick={() => setShowAddSheet(true)}
                className="bg-indigo-500 text-white px-6 py-3 rounded-md hover:bg-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                Add Existing
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {characters.map((character) => (
              <CharacterCard
                key={character.id}
                character={character}
                campaignId={campaignId}
              />
            ))}
          </div>
        )}
      </main>

      {/* Create New Sheet Modal */}
      {showCreateSheet && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              Create New Character Sheet
            </h3>
            <form onSubmit={createBlankSheet}>
              <div className="mb-4">
                <label htmlFor="player-name" className="block text-sm font-medium text-gray-700 mb-2">
                  Player Name *
                </label>
                <input
                  id="player-name"
                  type="text"
                  value={playerName}
                  onChange={(e) => setPlayerName(e.target.value)}
                  placeholder="Enter player name"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900"
                  autoFocus
                  required
                />
              </div>
              <div className="mb-4">
                <label htmlFor="player-email" className="block text-sm font-medium text-gray-700 mb-2">
                  Player Email (optional)
                </label>
                <input
                  id="player-email"
                  type="email"
                  value={playerEmail}
                  onChange={(e) => setPlayerEmail(e.target.value)}
                  placeholder="player@example.com"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900"
                />
                <p className="mt-1 text-xs text-gray-500">
                  If provided, the sheet will be shared with this email
                </p>
              </div>
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateSheet(false);
                    setPlayerName("");
                    setPlayerEmail("");
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={creating || !playerName.trim()}
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50"
                >
                  {creating ? "Creating..." : "Create Sheet"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Add Sheet Modal */}
      {showAddSheet && (
        <div className="fixed inset-0 bg-gray-600 bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-medium text-gray-900 mb-4">
              Add Character Sheet
            </h3>
            <form onSubmit={addCharacterSheet}>
              <div className="mb-4">
                <label htmlFor="sheet-url" className="block text-sm font-medium text-gray-700 mb-2">
                  Google Sheets URL or Spreadsheet ID
                </label>
                <input
                  id="sheet-url"
                  type="text"
                  value={newSheetUrl}
                  onChange={(e) => setNewSheetUrl(e.target.value)}
                  placeholder="https://docs.google.com/spreadsheets/d/... or spreadsheet ID"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 text-gray-900"
                  autoFocus
                />
                <p className="mt-1 text-xs text-gray-500">
                  Make sure the sheet is shared with your Google account
                </p>
              </div>
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={() => {
                    setShowAddSheet(false);
                    setNewSheetUrl("");
                  }}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={adding || !newSheetUrl.trim()}
                  className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 disabled:opacity-50"
                >
                  {adding ? "Adding..." : "Add Sheet"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}