"use client";

import { useState, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";

interface Campaign {
  id: string;
  name: string;
  genre?: string;
  themes?: string;
  description?: string;
  createdAt: string;
}

interface Character {
  id: string;
  name: string;
  spreadsheetId: string;
  updatedAt: string;
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

interface Backstory {
  id: string;
  status: string;
  characterName?: string;
  submittedAt?: string;
  reviewedAt?: string;
  campaign: {
    id: string;
    name: string;
  };
}

export default function TrailblazerPage() {
  const { data: session } = useSession();
  const router = useRouter();
  const [myCharacters, setMyCharacters] = useState<Character[]>([]);
  const [activeCampaigns, setActiveCampaigns] = useState<Campaign[]>([]);
  const [myBackstories, setMyBackstories] = useState<Backstory[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchTrailblazerData();
  }, [session]);

  const fetchTrailblazerData = async () => {
    try {
      // Fetch dashboard data (characters and campaigns)
      const dashboardResponse = await fetch("/api/trailblazer/dashboard");
      if (dashboardResponse.ok) {
        const dashboardData = await dashboardResponse.json();
        setMyCharacters(dashboardData.characters || []);
        setActiveCampaigns(dashboardData.campaigns || []);
      }

      // Fetch backstories
      const backstoryResponse = await fetch("/api/trailblazer/backstory");
      if (backstoryResponse.ok) {
        const backstoryData = await backstoryResponse.json();
        setMyBackstories(backstoryData.backstories || []);
      }
    } catch (error) {
      console.error("Failed to fetch trailblazer data:", error);
    } finally {
      setLoading(false);
    }
  };

  const openCharacterSheet = (character: Character) => {
    // Open the character sheet - for now, link to Google Sheets, later will be the mirror interface
    window.open(`https://docs.google.com/spreadsheets/d/${character.spreadsheetId}/edit`, '_blank');
  };

  const goToCharacterMirror = (character: Character) => {
    // Navigate to the character sheet mirror interface
    router.push(`/trailblazer/character/${character.id}`);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'DRAFT':
        return 'bg-gray-100 text-gray-800';
      case 'SUBMITTED':
        return 'bg-blue-100 text-blue-800';
      case 'UNDER_REVIEW':
        return 'bg-yellow-100 text-yellow-800';
      case 'REVISION_NEEDED':
        return 'bg-orange-100 text-orange-800';
      case 'APPROVED':
        return 'bg-green-100 text-green-800';
      case 'MECHANICAL':
        return 'bg-purple-100 text-purple-800';
      case 'COMPLETE':
        return 'bg-emerald-100 text-emerald-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'DRAFT':
        return 'Draft';
      case 'SUBMITTED':
        return 'Submitted';
      case 'UNDER_REVIEW':
        return 'Under Review';
      case 'REVISION_NEEDED':
        return 'Needs Revision';
      case 'APPROVED':
        return 'Approved';
      case 'MECHANICAL':
        return 'Converting to Mechanics';
      case 'COMPLETE':
        return 'Complete';
      default:
        return status;
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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <div className="flex justify-between items-center">
            <div>
              <h1 className="growth-title text-3xl text-white">Trailblazer Dashboard</h1>
              <p className="text-white opacity-90 mt-2">
                Welcome back, {session?.user?.name}! Manage your characters and adventures.
              </p>
            </div>
            <div className="flex items-center space-x-4">
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
        {/* My Characters Section */}
        <div className="growth-card p-6 mb-8">
          <div className="growth-card-header -m-6 mb-6">
            <h2 className="growth-title text-xl text-white">My Characters</h2>
          </div>

          {myCharacters.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 mx-auto mb-4 text-growth-gray-400">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
              </div>
              <h3 className="growth-subtitle text-lg mb-2">No Characters Yet</h3>
              <p className="growth-body text-growth-gray-600 mb-4">
                You haven&apos;t been assigned any characters yet. Check with your GM or wait for character assignments.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {myCharacters.map((character) => (
                <div key={character.id} className="growth-card p-4 hover:shadow-lg transition-shadow">
                  {/* Character Image/Avatar */}
                  <div className="w-16 h-16 mx-auto mb-4 bg-growth-primary rounded-full flex items-center justify-center">
                    {character.identity?.image ? (
                      <Image
                        src={character.identity.image}
                        alt={character.name}
                        width={64}
                        height={64}
                        className="w-16 h-16 rounded-full object-cover"
                      />
                    ) : (
                      <span className="text-white text-xl font-bold">
                        {character.name.charAt(0).toUpperCase()}
                      </span>
                    )}
                  </div>

                  {/* Character Info */}
                  <div className="text-center mb-4">
                    <h3 className="growth-title text-lg mb-1">{character.name}</h3>
                    <p className="growth-body text-sm text-growth-gray-600">
                      {character.campaign.name}
                    </p>
                  </div>

                  {/* Character Attributes Preview */}
                  {character.attributes && (
                    <div className="mb-4">
                      <div className="flex justify-between text-sm">
                        {Object.entries(character.attributes).slice(0, 3).map(([attr, values]) => (
                          <div key={attr} className="text-center">
                            <div className="growth-subtitle text-xs">{attr}</div>
                            <div className="growth-body text-sm font-medium">
                              {values.current || 0}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Action Buttons */}
                  <div className="flex space-x-2">
                    <button
                      onClick={() => goToCharacterMirror(character)}
                      className="btn-growth-primary flex-1 px-3 py-2 text-sm"
                    >
                      View Character
                    </button>
                    <button
                      onClick={() => openCharacterSheet(character)}
                      className="btn-growth-secondary px-3 py-2 text-sm"
                      title="Open Google Sheet"
                    >
                      📊
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Character Backstories Section */}
        <div className="growth-card p-6 mb-8">
          <div className="growth-card-header -m-6 mb-6 flex justify-between items-center">
            <h2 className="growth-title text-xl text-white">Character Backstories</h2>
            <Link
              href="/trailblazer/create-character"
              className="bg-white bg-opacity-20 text-white px-4 py-2 rounded-lg text-sm hover:bg-opacity-30 transition-all"
            >
              + Create New Character
            </Link>
          </div>

          {myBackstories.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-16 h-16 mx-auto mb-4 text-growth-gray-400">
                <svg fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <h3 className="growth-subtitle text-lg mb-2">No Character Backstories Yet</h3>
              <p className="growth-body text-growth-gray-600 mb-6">
                Start your adventure by creating a character backstory for one of the active campaigns.
              </p>
              <Link
                href="/trailblazer/create-character"
                className="btn-growth-primary px-6 py-3"
              >
                Create Your First Character
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {myBackstories.map((backstory) => (
                <div key={backstory.id} className="growth-card p-4 hover:shadow-lg transition-shadow">
                  {/* Status Badge */}
                  <div className="mb-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${getStatusColor(backstory.status)}`}>
                      {getStatusText(backstory.status)}
                    </span>
                  </div>

                  {/* Character Info */}
                  <div className="mb-4">
                    <h3 className="growth-title text-lg mb-1">
                      {backstory.characterName || "Unnamed Character"}
                    </h3>
                    <p className="growth-body text-sm text-growth-gray-600">
                      {backstory.campaign.name}
                    </p>
                  </div>

                  {/* Timestamps */}
                  <div className="mb-4 text-xs text-growth-gray-500 space-y-1">
                    {backstory.submittedAt && (
                      <div>Submitted: {new Date(backstory.submittedAt).toLocaleDateString()}</div>
                    )}
                    {backstory.reviewedAt && (
                      <div>Last Reviewed: {new Date(backstory.reviewedAt).toLocaleDateString()}</div>
                    )}
                  </div>

                  {/* Action Button */}
                  <Link
                    href={`/trailblazer/backstory/${backstory.id}`}
                    className="btn-growth-primary w-full px-3 py-2 text-sm text-center block"
                  >
                    {backstory.status === 'DRAFT' ? 'Continue Writing' : 'View Backstory'}
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Active Campaigns Section */}
        <div className="growth-card p-6">
          <div className="growth-card-header -m-6 mb-6">
            <h2 className="growth-title text-xl text-white">Active Campaigns</h2>
          </div>

          {activeCampaigns.length === 0 ? (
            <div className="text-center py-8">
              <h3 className="growth-subtitle text-lg mb-2">No Active Campaigns</h3>
              <p className="growth-body text-growth-gray-600">
                You&apos;re not currently participating in any campaigns. Ask your GM for an invitation!
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {activeCampaigns.map((campaign) => (
                <div key={campaign.id} className="growth-card p-4">
                  <h3 className="growth-title text-lg mb-2">{campaign.name}</h3>
                  {campaign.genre && (
                    <p className="growth-body text-sm text-growth-gray-600 mb-1">
                      <strong>Genre:</strong> {campaign.genre}
                    </p>
                  )}
                  {campaign.themes && (
                    <p className="growth-body text-sm text-growth-gray-600 mb-3">
                      <strong>Themes:</strong> {campaign.themes}
                    </p>
                  )}
                  {campaign.description && (
                    <p className="growth-body text-sm text-growth-gray-700 mb-4">
                      {campaign.description}
                    </p>
                  )}
                  <Link
                    href={`/trailblazer/campaign/${campaign.id}`}
                    className="btn-growth-primary inline-block px-4 py-2 text-sm"
                  >
                    View Campaign
                  </Link>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}