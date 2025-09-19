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

type TabType = 'relations' | 'forge' | 'essence';

// Legacy sample nodes - DELETED to prevent fallback issues
const legacySampleNodes: any[] = [];

const sampleConnections = [
  {
    from: 'char1',
    to: 'char2',
    krmaFlow: 25,
    type: 'alliance' as const,
    strength: 3
  }
];

export default function CampaignPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const campaignId = params.id as string;

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [loading, setLoading] = useState(true);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValues, setEditValues] = useState({
    name: "",
    genre: "",
    themes: "",
    description: ""
  });
  const [characters, setCharacters] = useState<any[]>([]);
  const [charactersLoading, setCharactersLoading] = useState(false);

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
        setEditValues({
          name: data.campaign.name || "",
          genre: data.campaign.genre || "",
          themes: data.campaign.themes || "",
          description: data.campaign.description || ""
        });
      }
    } catch (error) {
      console.error("Failed to fetch campaign:", error);
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  const fetchCharacters = useCallback(async () => {
    if (!campaignId) return;

    console.log('🔄 Starting character fetch for campaign:', campaignId);
    setCharactersLoading(true);
    try {
      const response = await fetch(`/api/campaigns/${campaignId}/characters?useFallback=true&preferSheets=true&autoSync=true`);
      console.log('📡 Character fetch response:', response.status, response.statusText);
      if (response.ok) {
        const data = await response.json();
        console.log('📥 Character fetch data:', data);
        console.log('🎯 Setting characters to:', data.characters || []);
        setCharacters(data.characters || []);
      } else {
        console.error('❌ Character fetch failed:', response.status, response.statusText);
      }
    } catch (error) {
      console.error("❌ Failed to fetch characters:", error);
    } finally {
      setCharactersLoading(false);
      console.log('✅ Character fetch completed');
    }
  }, [campaignId]);

  const handleCharacterPositionChange = useCallback(async (characterId: string, x: number, y: number) => {
    try {
      console.log(`🎯 Saving character ${characterId} position to (${x}, ${y})`);
      const response = await fetch(`/api/characters/${characterId}/position`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'same-origin',
        body: JSON.stringify({ x, y }),
      });

      if (response.ok) {
        console.log(`✅ Character ${characterId} position saved successfully`);
      } else {
        console.error(`❌ Failed to save character ${characterId} position:`, response.status, response.statusText);
      }
    } catch (error) {
      console.error(`❌ Error saving character ${characterId} position:`, error);
    }
  }, []);

  useEffect(() => {
    fetchCampaign();
    fetchCharacters();
  }, [campaignId]); // Only depend on campaignId, not the functions themselves

  // Transform character data for KRMA Line - memoized to prevent position resets
  const transformCharactersToNodes = useMemo(() => {
    console.log('🎯 Transforming characters to nodes:', characters.length, 'characters');
    console.log('🎯 Characters data:', characters);

    const transformedNodes = characters.map((char, index) => {
      console.log('🔍 Processing character:', { charId: char.id, index, char });
      const character = char.source === 'sheets' ? char.sheetsData : char.character;

      // Extract the actual character ID from the data structure
      // Priority: char.character.id (database), character.id (sheets), char.id (wrapper), fallback
      const characterId = char.character?.id || character?.id || char.id || `char-fallback-${index}`;
      console.log('🆔 Character ID extraction debug:', {
        'char.character?.id': char.character?.id,
        'character?.id': character?.id,
        'char.id': char.id,
        'final characterId': characterId,
        'char source': char.source
      });

      // Handle case where character data might be undefined
      if (!character) {
        return {
          id: characterId,
          type: 'character' as const,
          name: char.name || 'Unnamed Character',
          krmaValue: 0,
          x: 0,
          y: 0,
          connections: [],
          color: '#00FF7F',
          details: {
            resistance: 0,
            opportunity: 0,
            status: 'No Data'
          },
          characterDetails: {
            playerEmail: '',
            characterImage: '',
            identity: { name: char.name || 'Unnamed Character' },
            levels: { healthLevel: 1, wealthLevel: 1, techLevel: 1 },
            conditions: {
              weak: false, clumsy: false, exhausted: false, muted: false, deathsDoor: false,
              deafened: false, overwhelmed: false, confused: false, incoherent: false
            },
            attributes: {
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
            creation: { seed: { baseFateDie: 'd6' } },
            skills: { skills: [] },
            magic: { mercy: { schools: [], knownSpells: [] }, severity: { schools: [], knownSpells: [] }, balance: { schools: [], knownSpells: [] } },
            nectars: { combat: [], learning: [], magic: [], social: [], utility: [], supernatural: [], supertech: [], negative: [], natural: [] },
            vitals: {
              bodyParts: { HEAD: 0, NECK: 0, TORSO: 0, RIGHTARM: 0, LEFTARM: 0, RIGHTUPPERLEG: 0, LEFTUPPERLEG: 0, RIGHTLOWERLEG: 0, LEFTLOWERLEG: 0 },
              baseResist: 10, restRate: 1, carryLevel: 2, weightStatus: 'Fine'
            },
            inventory: { weight: 0, items: [] },
            notes: ''
          }
        };
      }

      // Extract position with fallback logic
      // Check all possible sources: char.character (db), character.data (fallback), character (processed data)
      let characterX = char.character?.x ?? char.data?.x ?? character?.x ?? 0;
      let characterY = char.character?.y ?? char.data?.y ?? character?.y ?? 0;

      // Debug position extraction
      console.log('🎯 Position extraction for', characterId, ':', {
        'char.character?.x': char.character?.x,
        'char.character?.y': char.character?.y,
        'char.data?.x': char.data?.x,
        'char.data?.y': char.data?.y,
        'character?.x': character?.x,
        'character?.y': character?.y,
        'final x': characterX,
        'final y': characterY,
        'char structure': Object.keys(char),
        'character structure': character ? Object.keys(character) : 'null'
      });

      const transformedChar = {
        id: characterId,
        type: 'character' as const,
        name: character?.identity?.name || character?.name || 'Unnamed Character',
        krmaValue: 0,
        x: characterX,
        y: characterY,
        connections: [], // TODO: Add relationship connections
        color: '#00FF7F',
        details: {
          resistance: character?.attributes?.constitution?.current || 0,
          opportunity: character?.attributes?.clout?.current || 0,
          status: char.source === 'sheets' ? 'Sheet Synced' : 'Database'
        },
        characterDetails: {
          playerEmail: '',
          characterImage: character?.image || '',
          // Map GROWTH data to the interface
          identity: {
            name: character?.identity?.name || character?.name || 'Unnamed Character'
          },
          levels: {
            healthLevel: character?.levels?.healthLevel || 1,
            wealthLevel: character?.levels?.wealthLevel || 1,
            techLevel: character?.levels?.techLevel || 1
          },
          conditions: character?.conditions || {
            weak: false,
            clumsy: false,
            exhausted: false,
            muted: false,
            deathsDoor: false,
            deafened: false,
            overwhelmed: false,
            confused: false,
            incoherent: false
          },
          attributes: character?.attributes || {
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
          creation: character?.creation || {
            seed: { baseFateDie: 'd6' }
          },
          skills: character?.skills || { skills: [] },
          magic: character?.magic || { mercy: { schools: [], knownSpells: [] }, severity: { schools: [], knownSpells: [] }, balance: { schools: [], knownSpells: [] } },
          nectars: character?.nectars || { combat: [], learning: [], magic: [], social: [], utility: [], supernatural: [], supertech: [], negative: [], natural: [] },
          vitals: character?.vitals || {
            bodyParts: { HEAD: 0, NECK: 0, TORSO: 0, RIGHTARM: 0, LEFTARM: 0, RIGHTUPPERLEG: 0, LEFTUPPERLEG: 0, RIGHTLOWERLEG: 0, LEFTLOWERLEG: 0 },
            baseResist: 10,
            restRate: 1,
            carryLevel: 2,
            weightStatus: 'Fine'
          },
          inventory: character?.inventory || { weight: 0, items: [] },
          notes: character?.notes || ''
        }
      };

      console.log('✅ Transformed character:', transformedChar.id, transformedChar.name, 'Position:', transformedChar.x, transformedChar.y);
      return transformedChar;
    });

    console.log('🎯 All transformed nodes with positions:', transformedNodes.map(n => ({ id: n.id, name: n.name, x: n.x, y: n.y })));
    return transformedNodes;
  }, [characters]); // Only recalculate when characters data changes

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
            {/* Debug info */}
            <div className="absolute top-4 left-4 bg-black/80 text-white p-2 rounded text-xs z-50" data-testid="debug-panel">
              <div>Characters loaded: {characters.length}</div>
              <div>Loading: {charactersLoading ? 'Yes' : 'No'}</div>
              <div>Campaign ID: {campaignId}</div>
            </div>

            <KRMALine
              nodes={[...legacySampleNodes, ...transformCharactersToNodes]}
              connections={sampleConnections}
              className="w-full h-full bg-gray-900"
              campaignId={campaignId}
              onCharacterCreated={() => {
                console.log('🔄 Character created, refreshing...');
                fetchCharacters();
              }}
              onCharacterPositionChange={handleCharacterPositionChange}
            />
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