"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";

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

export default function CharacterPage() {
  const params = useParams();
  const _router = useRouter();
  const campaignId = params.id as string;
  const characterId = params.characterId as string;
  const [character, setCharacter] = useState<Character | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCharacter = useCallback(async () => {
    try {
      setError(null);
      const response = await fetch(`/api/campaigns/${campaignId}/characters/${characterId}`);
      if (response.ok) {
        const data = await response.json();
        setCharacter(data.character);
      } else if (response.status === 404) {
        setError("Character not found");
      } else {
        setError("Failed to load character");
      }
    } catch (error) {
      console.error("Failed to fetch character:", error);
      setError("Failed to load character");
    } finally {
      setLoading(false);
    }
  }, [campaignId, characterId]);

  const refreshCharacter = async () => {
    setRefreshing(true);
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/characters/${characterId}/refresh`, {
        method: 'POST',
      });
      if (response.ok) {
        await fetchCharacter();
      } else {
        setError("Failed to refresh character data from Google Sheets");
      }
    } catch (error) {
      console.error("Failed to refresh character:", error);
      setError("Failed to refresh character data");
    } finally {
      setRefreshing(false);
    }
  };

  const openSheet = () => {
    if (character) {
      window.open(`https://docs.google.com/spreadsheets/d/${character.spreadsheetId}/edit`, '_blank');
    }
  };

  useEffect(() => {
    fetchCharacter();
  }, [fetchCharacter]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <nav className="flex items-center space-x-2 text-sm text-gray-600">
              <Link href="/campaigns" className="hover:text-indigo-600">
                Campaigns
              </Link>
              <span>/</span>
              <Link href={`/campaign/${campaignId}`} className="hover:text-indigo-600">
                Campaign
              </Link>
              <span>/</span>
              <Link href={`/campaign/${campaignId}/characters`} className="hover:text-indigo-600">
                Characters
              </Link>
              <span>/</span>
              <span className="text-gray-900">Character</span>
            </nav>
          </div>
        </header>
        
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center py-12">
            <div className="mx-auto h-12 w-12 text-red-400 mb-4">
              <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">Error</h3>
            <p className="text-gray-600 mb-6">{error}</p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={fetchCharacter}
                className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700"
              >
                Try Again
              </button>
              <Link
                href={`/campaign/${campaignId}/characters`}
                className="bg-gray-300 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-400"
              >
                Back to Characters
              </Link>
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (!character) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <nav className="flex items-center space-x-2 text-sm text-gray-600">
              <Link href="/campaigns" className="hover:text-indigo-600">
                Campaigns
              </Link>
              <span>/</span>
              <Link href={`/campaign/${campaignId}`} className="hover:text-indigo-600">
                Campaign
              </Link>
              <span>/</span>
              <Link href={`/campaign/${campaignId}/characters`} className="hover:text-indigo-600">
                Characters
              </Link>
              <span>/</span>
              <span className="text-gray-900">Character Not Found</span>
            </nav>
          </div>
        </header>
        
        <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="text-center py-12">
            <h3 className="text-lg font-medium text-gray-900 mb-2">Character not found</h3>
            <p className="text-gray-600 mb-6">This character may have been deleted or moved.</p>
            <Link
              href={`/campaign/${campaignId}/characters`}
              className="bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700"
            >
              Back to Characters
            </Link>
          </div>
        </main>
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
                <Link href={`/campaign/${campaignId}/characters`} className="hover:text-indigo-600">
                  Characters
                </Link>
                <span>/</span>
                <span className="text-gray-900">{character.identity?.name || character.name}</span>
              </nav>
              <h1 className="text-2xl font-bold text-gray-900">
                {character.identity?.name || character.name}
              </h1>
              {character.playerEmail && (
                <p className="text-sm text-gray-600 mt-1">
                  Player: {character.playerEmail}
                </p>
              )}
            </div>
            <div className="flex items-center space-x-3">
              <button
                onClick={refreshCharacter}
                disabled={refreshing}
                className="bg-gray-100 text-gray-700 px-4 py-2 rounded-md hover:bg-gray-200 disabled:opacity-50 flex items-center space-x-2"
              >
                <svg className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span>{refreshing ? 'Refreshing...' : 'Refresh'}</span>
              </button>
              <button
                onClick={openSheet}
                className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 flex items-center space-x-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
                <span>Open Sheet</span>
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Character Overview */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Character Overview</h2>
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="font-medium text-gray-700">Name:</span>
                  <p className="text-gray-900">{character.identity?.name || character.name}</p>
                </div>
                {character.playerEmail && (
                  <div>
                    <span className="font-medium text-gray-700">Player:</span>
                    <p className="text-gray-900">{character.playerEmail}</p>
                  </div>
                )}
                <div>
                  <span className="font-medium text-gray-700">Sheet ID:</span>
                  <p className="text-gray-900 font-mono text-xs">{character.spreadsheetId}</p>
                </div>
                <div>
                  <span className="font-medium text-gray-700">Last Updated:</span>
                  <p className="text-gray-900">{new Date(character.updatedAt).toLocaleString()}</p>
                </div>
              </div>
            </div>

            {/* Attributes */}
            {character.attributes && Object.keys(character.attributes).length > 0 && (
              <div className="bg-white rounded-lg shadow p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Attributes</h2>
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                  {Object.entries(character.attributes).map(([key, attr]) => (
                    <div key={key} className="text-center p-3 bg-gray-50 rounded-md">
                      <div className="text-2xl font-bold text-gray-900">
                        {attr.current || attr.level || 0}
                      </div>
                      <div className="text-sm text-gray-600 capitalize">
                        {key.replace(/([A-Z])/g, ' $1').trim()}
                      </div>
                      {attr.augment && (
                        <div className="text-xs text-green-600">
                          +{attr.augment}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Actions Sidebar */}
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Actions</h2>
              <div className="space-y-3">
                <button
                  onClick={openSheet}
                  className="w-full bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 flex items-center justify-center space-x-2"
                >
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                  </svg>
                  <span>Edit Character Sheet</span>
                </button>
                
                <button
                  onClick={refreshCharacter}
                  disabled={refreshing}
                  className="w-full bg-indigo-600 text-white px-4 py-2 rounded-md hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center space-x-2"
                >
                  <svg className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <span>{refreshing ? 'Syncing...' : 'Sync from Sheet'}</span>
                </button>
              </div>
            </div>

            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Info</h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-600">Character ID:</span>
                  <span className="text-gray-900 font-mono text-xs">{character.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-600">Sheet Link:</span>
                  <button
                    onClick={() => navigator.clipboard.writeText(`https://docs.google.com/spreadsheets/d/${character.spreadsheetId}/edit`)}
                    className="text-indigo-600 hover:text-indigo-800 text-xs"
                  >
                    Copy URL
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}