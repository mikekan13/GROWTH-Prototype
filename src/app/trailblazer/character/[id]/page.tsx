"use client";

import { useState, useEffect, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";

interface Character {
  id: string;
  name: string;
  spreadsheetId: string;
  playerEmail?: string;
  campaign: {
    id: string;
    name: string;
  };
  identity?: {
    name?: string;
    image?: string;
  };
  attributes?: {
    [key: string]: {
      current?: number;
      level?: number;
      augment?: number;
    };
  };
}

export default function TrailblazerCharacterPage() {
  const params = useParams();
  const router = useRouter();
  const characterId = params.id as string;
  const [character, setCharacter] = useState<Character | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const fetchCharacter = useCallback(async () => {
    try {
      const response = await fetch(`/api/trailblazer/character/${characterId}`);
      if (response.ok) {
        const data = await response.json();
        setCharacter(data.character);
      } else if (response.status === 403) {
        router.push('/trailblazer?error=access_denied');
      } else if (response.status === 404) {
        router.push('/trailblazer?error=character_not_found');
      }
    } catch (error) {
      console.error("Failed to fetch character:", error);
    } finally {
      setLoading(false);
    }
  }, [characterId, router]);

  useEffect(() => {
    fetchCharacter();
  }, [fetchCharacter]);

  const refreshFromSheets = async () => {
    setRefreshing(true);
    try {
      const response = await fetch(`/api/trailblazer/character/${characterId}/refresh`, {
        method: 'POST'
      });
      if (response.ok) {
        await fetchCharacter();
      }
    } catch (error) {
      console.error("Failed to refresh:", error);
    } finally {
      setRefreshing(false);
    }
  };

  const openGoogleSheet = () => {
    if (character) {
      window.open(`https://docs.google.com/spreadsheets/d/${character.spreadsheetId}/edit`, '_blank');
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  if (!character) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Character Not Found</h1>
          <Link href="/trailblazer" className="text-indigo-600 hover:text-indigo-500">
            ← Back to Trailblazer Dashboard
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-growth-gray-50">
      {/* Header */}
      <header className="growth-page-header shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex justify-between items-center">
            <div>
              <nav className="flex items-center space-x-2 text-sm text-white opacity-90 mb-2">
                <Link href="/trailblazer" className="hover:text-growth-accent-light">
                  Trailblazer
                </Link>
                <span>/</span>
                <span>{character.name}</span>
              </nav>
              <h1 className="growth-title text-3xl text-white">{character.name}</h1>
              <p className="text-white opacity-90 mt-1">{character.campaign.name}</p>
            </div>
            <div className="flex items-center space-x-3">
              <button
                onClick={refreshFromSheets}
                disabled={refreshing}
                className="btn-growth-secondary px-4 py-2 text-sm"
                title="Refresh from Google Sheets"
              >
                {refreshing ? "Refreshing..." : "🔄 Refresh"}
              </button>
              <button
                onClick={openGoogleSheet}
                className="btn-growth-primary px-4 py-2 text-sm"
                title="Open in Google Sheets"
              >
                📊 Open Sheet
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content - Character Sheet Mirror */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Character Identity Section */}
        <div className="growth-card p-6 mb-8">
          <div className="growth-card-header -m-6 mb-6">
            <h2 className="growth-title text-xl text-white">Character Identity</h2>
          </div>

          <div className="flex items-center space-x-6">
            <div className="w-24 h-24 bg-growth-primary rounded-full flex items-center justify-center">
              {character.identity?.image ? (
                <Image
                  src={character.identity.image}
                  alt={character.name}
                  width={96}
                  height={96}
                  className="w-24 h-24 rounded-full object-cover"
                />
              ) : (
                <span className="text-white text-3xl font-bold">
                  {character.name.charAt(0).toUpperCase()}
                </span>
              )}
            </div>
            <div>
              <h3 className="growth-title text-2xl mb-2">{character.name}</h3>
              <p className="growth-body text-growth-gray-600">
                Character in <strong>{character.campaign.name}</strong>
              </p>
              {character.identity?.name && character.identity.name !== character.name && (
                <p className="growth-body text-sm text-growth-gray-500 mt-1">
                  Also known as: {character.identity.name}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Character Attributes Section */}
        {character.attributes && Object.keys(character.attributes).length > 0 && (
          <div className="growth-card p-6 mb-8">
            <div className="growth-card-header -m-6 mb-6">
              <h2 className="growth-title text-xl text-white">Attributes</h2>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {Object.entries(character.attributes).map(([attribute, values]) => (
                <div key={attribute} className="bg-growth-gray-50 p-4 rounded-lg">
                  <h4 className="growth-subtitle text-sm font-medium mb-3 uppercase tracking-wide">
                    {attribute}
                  </h4>

                  <div className="space-y-2">
                    {values.current !== undefined && (
                      <div className="flex justify-between text-sm">
                        <span className="growth-body">Current:</span>
                        <span className="growth-title font-medium">{values.current}</span>
                      </div>
                    )}
                    {values.level !== undefined && (
                      <div className="flex justify-between text-sm">
                        <span className="growth-body">Level:</span>
                        <span className="growth-title font-medium">{values.level}</span>
                      </div>
                    )}
                    {values.augment !== undefined && (
                      <div className="flex justify-between text-sm">
                        <span className="growth-body">Augment:</span>
                        <span className="growth-title font-medium">{values.augment}</span>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Character Sheet Development Notice */}
        <div className="growth-card p-6">
          <div className="text-center">
            <div className="w-16 h-16 mx-auto mb-4 text-growth-primary">
              <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>
            <h3 className="growth-subtitle text-lg mb-3">Character Sheet Mirror</h3>
            <p className="growth-body text-growth-gray-600 max-w-2xl mx-auto mb-6">
              This interface mirrors your Google Sheets character sheet. As we develop the full interface,
              you can always use the &quot;Open Sheet&quot; button above to access the complete Google Sheets version.
            </p>
            <div className="flex justify-center space-x-4">
              <button
                onClick={openGoogleSheet}
                className="btn-growth-primary px-6 py-3"
              >
                📊 Open Full Character Sheet
              </button>
              <Link
                href="/trailblazer"
                className="btn-growth-secondary px-6 py-3"
              >
                ← Back to Dashboard
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}