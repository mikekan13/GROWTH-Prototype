"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import KRMALine from "@/components/ui/KRMALine";

interface Campaign {
  id: string;
  name: string;
  genre?: string;
  themes?: string;
  description?: string;
  folderId?: string;
  createdAt: string;
  updatedAt: string;
}

interface CampaignCharacter {
  id: string;
  name: string;
  [key: string]: unknown;
}

type TabType = 'relations' | 'forge' | 'essence';

interface LegacyNode {
  id: string;
  type: 'character' | 'goal' | 'godhead' | 'npc' | 'quest' | 'location';
  name: string;
  krmaValue: number;
  x: number;
  y: number;
  connections: string[];
  color: string;
}

interface Connection {
  from: string;
  to: string;
  type: 'goal' | 'resistance' | 'opportunity' | 'alliance' | 'conflict';
  krmaFlow: number;
  strength: number;
}

const legacySampleNodes: LegacyNode[] = [];
const sampleConnections: Connection[] = [];

export default function CampaignPageClient() {
  console.log('🚀 CLIENT COMPONENT LOADED - NO SSR');

  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const campaignId = params.id as string;
  const [mounted, setMounted] = useState(false);

  console.log('📍 Campaign ID:', campaignId);

  // This useEffect will DEFINITELY run since we're client-only
  useEffect(() => {
    console.log('🎯 Client component mounted - setting state');
    setMounted(true);
  }, []);

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [characters, setCharacters] = useState<CampaignCharacter[]>([]);
  const [charactersLoading, setCharactersLoading] = useState(false);
  const [charactersFetched, setCharactersFetched] = useState(false);

  // Tab management
  const currentTab = (searchParams.get('tab') as TabType) || 'relations';

  const setActiveTab = (tab: TabType) => {
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tab);
    router.push(url.pathname + url.search);
  };

  const fetchCampaign = useCallback(async () => {
    try {
      const response = await fetch(`/api/campaigns/${campaignId}`);
      if (response.ok) {
        const data = await response.json();
        setCampaign(data.campaign);
      }
    } catch (error) {
      console.error("Failed to fetch campaign:", error);
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  // Campaign loading
  useEffect(() => {
    console.log('🚀 Campaign useEffect triggered', { campaignId });
    fetchCampaign();
  }, [campaignId, fetchCampaign]);

  // Character loading - this should finally work!
  useEffect(() => {
    console.log('🎯 Character loading useEffect triggered', { campaignId, mounted });
    if (!campaignId || !mounted) {
      console.log('❌ No campaignId or not mounted, skipping character fetch', { campaignId, mounted });
      return;
    }

    console.log('🔄 Starting character fetch for campaign:', campaignId);
    setCharactersLoading(true);

    const loadCharacters = async () => {
      try {
        console.log('🚀 Starting character fetch API call...');
        const url = `/api/campaigns/${campaignId}/characters?useFallback=true&preferSheets=false&autoSync=false`;
        console.log('🌐 Fetching from URL:', url);

        const response = await fetch(url);
        console.log('📡 Response status:', response.status, response.statusText);

        if (response.ok) {
          const data = await response.json();
          console.log('📥 Raw API response:', data);

          const loadedCharacters = data.characters || [];

          interface LoadedCharacter {
            id: string;
            name: string;
            source: string;
            character?: { id: string; name: string };
          }

          console.log('✅ Character fetch successful:', {
            totalCharacters: loadedCharacters.length,
            characters: (loadedCharacters as LoadedCharacter[]).map((c) => ({
              id: c.character?.id || c.id,
              name: c.character?.name || c.name,
              source: c.source,
              hasCharacterData: !!c.character
            }))
          });

          console.log('🧩 RAW CHARACTER DATA SAMPLE:', loadedCharacters[0]);

          setCharacters(loadedCharacters);
          console.log('📝 Characters state updated to:', loadedCharacters.length, 'characters');
          setCharactersFetched(true);
        } else {
          const errorText = await response.text();
          console.error('❌ Character fetch failed with status:', response.status, 'Response:', errorText);
          setCharacters([]);
        }
      } catch (error) {
        console.error("❌ Failed to fetch characters:", error);
        setCharacters([]);
      } finally {
        setCharactersLoading(false);
      }
    };

    loadCharacters();
  }, [campaignId, mounted]);

  // Transform character data for KRMA Line
  const characterNodes = useMemo(() => {
    console.log('🔄 Transforming character data, count:', characters.length);
    console.log('🔄 Character state contents:', characters);

    if (characters.length === 0) {
      console.log('⚠️ No characters to transform');
      return [];
    }

    return characters.map((char, index) => {
      const character = (char.source === 'sheets' ? char.sheetsData : char.character) as Record<string, unknown> | undefined;

      console.log('🔍 Processing character:', {
        index,
        charId: char.id,
        source: char.source,
        hasCharacterData: !!character,
        characterName: (character as Record<string, unknown>)?.name || ((character as Record<string, unknown>)?.identity as Record<string, unknown>)?.name || 'No name'
      });

      const charData = character as Record<string, unknown>;

      // Read saved position from character.json.position, or use calculated default
      const savedPosition = charData?.position as { x?: number; y?: number } | undefined;
      const defaultX = 100 + (index * 200);
      const defaultY = 200 + (index * 100);

      const transformedCharacter = {
        id: char.id || `char-${index}`,
        type: 'character' as const,
        name: ((charData?.identity as Record<string, unknown>)?.name as string) || (charData?.name as string) || char.name || 'Unnamed Character',
        krmaValue: 0,
        x: savedPosition?.x ?? defaultX,
        y: savedPosition?.y ?? defaultY,
        connections: [],
        color: '#00FF7F',
        details: {
          resistance: (((charData?.attributes as Record<string, unknown>)?.constitution as Record<string, unknown>)?.current as number) || 0,
          opportunity: (((charData?.attributes as Record<string, unknown>)?.clout as Record<string, unknown>)?.current as number) || 0,
          status: char.source === 'sheets' ? 'Sheet Synced' : 'Database'
        },
        characterDetails: {
          playerEmail: '',
          characterImage: (charData?.image as string) || '',
          identity: {
            name: ((charData?.identity as Record<string, unknown>)?.name as string) || (charData?.name as string) || char.name || 'Unnamed Character'
          },
          levels: {
            healthLevel: ((charData?.levels as Record<string, unknown>)?.healthLevel as number) || 1,
            wealthLevel: ((charData?.levels as Record<string, unknown>)?.wealthLevel as number) || 1,
            techLevel: ((charData?.levels as Record<string, unknown>)?.techLevel as number) || 1
          },
          conditions: charData?.conditions || {
            weak: false, clumsy: false, exhausted: false, muted: false, deathsDoor: false,
            deafened: false, overwhelmed: false, confused: false, incoherent: false
          },
          attributes: charData?.attributes || {
            clout: { current: 10, level: 10, modifier: 0, augmentPositive: 0, augmentNegative: 0 },
            celerity: { current: 10, level: 10, modifier: 0, augmentPositive: 0, augmentNegative: 0 },
            constitution: { current: 10, level: 10, modifier: 0, augmentPositive: 0, augmentNegative: 0 },
            flow: { current: 10, level: 10, modifier: 0, augmentPositive: 0, augmentNegative: 0 },
            frequency: { current: 10, level: 10, modifier: 0, augmentPositive: 0, augmentNegative: 0 },
            focus: { current: 10, level: 10, modifier: 0, augmentPositive: 0, augmentNegative: 0 },
            willpower: { current: 10, level: 10, modifier: 0, augmentPositive: 0, augmentNegative: 0 },
            wisdom: { current: 10, level: 10, modifier: 0, augmentPositive: 0, augmentNegative: 0 },
            wit: { current: 10, level: 10, modifier: 0, augmentPositive: 0, augmentNegative: 0 }
          },
          creation: character?.creation || { seed: { baseFateDie: 'd6' } },
          skills: character?.skills || { skills: [] },
          magic: character?.magic || { mercy: { schools: [], knownSpells: [] }, severity: { schools: [], knownSpells: [] }, balance: { schools: [], knownSpells: [] } },
          nectars: character?.nectars || { combat: [], learning: [], magic: [], social: [], utility: [], supernatural: [], supertech: [], negative: [], natural: [] },
          vitals: character?.vitals || {
            bodyParts: { HEAD: 0, NECK: 0, TORSO: 0, RIGHTARM: 0, LEFTARM: 0, RIGHTUPPERLEG: 0, LEFTUPPERLEG: 0, RIGHTLOWERLEG: 0, LEFTLOWERLEG: 0 },
            baseResist: 10, restRate: 1, carryLevel: 2, weightStatus: 'Fine'
          },
          inventory: character?.inventory || { weight: 0, items: [] },
          notes: character?.notes || ''
        }
      };

      console.log('✅ Transformed character:', {
        id: transformedCharacter.id,
        name: transformedCharacter.name,
        hasCharacterDetails: !!transformedCharacter.characterDetails
      });

      return transformedCharacter;
    });
  }, [characters]);

  // Final nodes array
  const allNodes = useMemo(() => {
    console.log('🎯 Final allNodes array:', {
      legacySampleNodes: legacySampleNodes.length,
      characterNodes: characterNodes.length,
      total: legacySampleNodes.length + characterNodes.length
    });
    return [...legacySampleNodes, ...characterNodes];
  }, [characterNodes]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white">
      {/* Header */}
      <header className="bg-gray-800 shadow-sm border-b border-gray-700">
        <div className="w-full px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center py-4">
            <div className="flex items-center space-x-4">
              <Link
                href="/campaigns"
                className="text-gray-300 hover:text-indigo-400 font-medium"
              >
                ← Back to Campaigns
              </Link>
              <div className="h-6 w-px bg-gray-600"></div>
              <h1 className="text-2xl font-bold text-white">
                {campaign?.name || 'Campaign'}
              </h1>
            </div>
          </div>

          {/* Tab Navigation */}
          <div className="flex space-x-8 border-t border-gray-700">
            <button
              onClick={() => setActiveTab('relations')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                currentTab === 'relations'
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-500'
              }`}
            >
              Relations
            </button>
            <button
              onClick={() => setActiveTab('forge')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                currentTab === 'forge'
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-500'
              }`}
            >
              Forge
            </button>
            <button
              onClick={() => setActiveTab('essence')}
              className={`py-4 px-1 border-b-2 font-medium text-sm ${
                currentTab === 'essence'
                  ? 'border-indigo-500 text-indigo-400'
                  : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-500'
              }`}
            >
              Essence
            </button>
          </div>
        </div>
      </header>

      {/* Main Content - Full Screen Canvas */}
      <main className="flex-1 w-full h-full">
        {currentTab === 'relations' && (
          <div className="w-full h-screen relative" style={{ height: 'calc(100vh - 140px)' }}>
            {!mounted ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-gray-400">Initializing...</div>
              </div>
            ) : charactersLoading && !charactersFetched ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-gray-400">Loading characters...</div>
              </div>
            ) : (
              <KRMALine
                key={`krma-${allNodes.length}`}
                nodes={allNodes}
                connections={sampleConnections}
                className="w-full h-full bg-gray-900"
                campaignId={campaignId}
                onCharacterCreated={() => {
                  console.log('🔄 Character created, refreshing page...');
                  window.location.reload();
                }}
              />
            )}
          </div>
        )}

        {currentTab === 'forge' && (
          <div className="space-y-6 p-6">
            <div className="bg-gray-800 rounded-lg shadow-sm border border-gray-700 p-6">
              <h2 className="text-lg font-semibold text-white mb-4">Campaign Forge</h2>
              <p className="text-gray-300">Forge tab content coming soon...</p>
            </div>
          </div>
        )}

        {currentTab === 'essence' && (
          <div className="space-y-6 p-6">
            <div className="bg-gray-800 rounded-lg shadow-sm border border-gray-700 p-6">
              <h2 className="text-lg font-semibold text-white mb-4">Campaign Essence</h2>
              <p className="text-gray-300">Essence tab content coming soon...</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}