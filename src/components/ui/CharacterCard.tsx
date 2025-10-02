"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { cn } from "@/lib/utils";

interface AttributePool {
  name: string;
  abbreviation: string;
  current: number;
  max: number;
  percentage: number;
  category: 'body' | 'soul' | 'spirit';
}

interface CharacterTKV {
  total: string;
  formatted: string;
  breakdown: {
    attributes: string;
    skills: string;
    frequency: string;
    wealthLevel: string;
    techLevel: string;
    healthLevel: string;
    fateDie: string;
    items: string;
    nectars: string;
    thorns: string;
    seeds: string;
    roots: string;
    branches: string;
  };
}

interface CharacterCardProps {
  character: {
    id: string;
    name: string;
    playerEmail?: string;
    spreadsheetId: string;
    updatedAt: string;
    identity?: {
      name?: string;
      image?: string;
    };
    attributes?: {
      [key: string]: {
        current?: number;
        level?: number;
        augment?: number;
        augmentPositive?: number;
        augmentNegative?: number;
      };
    };
  };
  campaignId: string;
  className?: string;
  onDelete?: () => void;
}

export function CharacterCard({ character, campaignId, className, onDelete }: CharacterCardProps) {
  const [imageError, setImageError] = useState(false);
  const [tkv, setTkv] = useState<CharacterTKV | null>(null);
  const [tkvLoading, setTkvLoading] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [sheetData, setSheetData] = useState<{
    name: string;
    portrait?: string;
    tkv: string;
    attributes: Record<string, { current: number; max: number }>;
  } | null>(null);
  const [sheetLoading, setSheetLoading] = useState(false);
  const [sheetExists, setSheetExists] = useState(true);
  const [checkingSheet, setCheckingSheet] = useState(false);
  const [showRestoreDialog, setShowRestoreDialog] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const characterName = character.identity?.name || character.name;

  // Check if Google Sheet exists
  useEffect(() => {
    const checkSheet = async () => {
      console.log(`🔍 Checking sheet existence for character: ${characterName} (${character.id})`);
      setCheckingSheet(true);
      try {
        const response = await fetch(`/api/characters/${character.id}/check-sheet`);
        if (response.ok) {
          const result = await response.json();
          console.log(`📊 Sheet check result for ${characterName}:`, result);
          setSheetExists(result.exists);
          if (!result.exists) {
            console.warn(`⚠️ Sheet missing for character ${characterName}:`, result.error);
          } else {
            console.log(`✅ Sheet exists for character ${characterName}`);
          }
        } else {
          console.error(`❌ Sheet check failed for ${characterName}:`, response.status);
          setSheetExists(false);
        }
      } catch (error) {
        console.error("❌ Failed to check sheet status:", error);
        setSheetExists(false);
      } finally {
        setCheckingSheet(false);
      }
    };

    checkSheet();
  }, [character.id, characterName]);

  // Fetch character card data from Google Sheets
  useEffect(() => {
    const fetchSheetData = async () => {
      setSheetLoading(true);
      try {
        const response = await fetch(`/api/characters/${character.id}/card-data`);
        if (response.ok) {
          const result = await response.json();
          if (result.success && result.data) {
            setSheetData(result.data);
            setSheetExists(true); // If we can fetch data, sheet exists
            console.log("📊 Loaded character data from Google Sheets:", result.data);
          } else if (result.fallback) {
            setSheetData(result.fallback);
            console.log("⚠️ Using fallback character data");
          }
        } else {
          // If we can't fetch sheet data, mark as not existing
          setSheetExists(false);
        }
      } catch (error) {
        console.error("❌ Failed to fetch character sheet data:", error);
        setSheetExists(false);
      } finally {
        setSheetLoading(false);
      }
    };

    // Only fetch sheet data if we haven't confirmed the sheet is missing
    if (sheetExists) {
      fetchSheetData();
    }
  }, [character.id, sheetExists]);

  // Fetch TKV for this character (fallback if not in sheet data)
  useEffect(() => {
    const fetchTKV = async () => {
      setTkvLoading(true);
      try {
        const response = await fetch(`/api/characters/${character.id}/tkv`);
        if (response.ok) {
          const data = await response.json();
          setTkv(data.tkv);
        }
      } catch (error) {
        console.error("Failed to fetch character TKV:", error);
      } finally {
        setTkvLoading(false);
      }
    };

    // Only fetch TKV if we don't have it from sheet data
    if (!sheetData?.tkv) {
      fetchTKV();
    }
  }, [character.id, sheetData]);

  // Handle character deletion
  const handleDelete = async () => {
    if (!onDelete) return;

    setDeleting(true);
    try {
      const response = await fetch(`/api/characters/${character.id}`, {
        method: 'DELETE',
      });

      if (response.ok) {
        onDelete();
        setShowDeleteConfirm(false);
      } else {
        console.error('Failed to delete character');
      }
    } catch (error) {
      console.error('Error deleting character:', error);
    } finally {
      setDeleting(false);
    }
  };

  // Handle sheet restoration
  const handleRestore = async () => {
    setRestoring(true);
    try {
      const response = await fetch(`/api/characters/${character.id}/restore-sheet`, {
        method: 'POST',
      });

      if (response.ok) {
        const result = await response.json();
        console.log('✅ Sheet restored successfully:', result);

        // Update local state to reflect successful restoration
        setSheetExists(true);
        setShowRestoreDialog(false);

        // Refresh the character data by triggering a re-fetch
        window.location.reload(); // Simple refresh for now
      } else {
        const error = await response.json();
        console.error('❌ Failed to restore sheet:', error);
        alert(`Failed to restore sheet: ${error.error || 'Unknown error'}`);
      }
    } catch (error) {
      console.error('❌ Error restoring sheet:', error);
      alert('Failed to restore sheet. Please try again.');
    } finally {
      setRestoring(false);
    }
  };

  // Calculate attribute pools from Google Sheets data
  const attributePools = sheetData ? calculateAttributePoolsFromSheet(sheetData.attributes) : [];

  // Use character image from sheet if available, otherwise use database or placeholder
  const characterImageUrl = sheetData?.portrait ||
    character.identity?.image;

  return (
    <>
      {/* Compact Character Card - NEW DESIGN */}
      <div className={cn(
        "group relative bg-gray-900/95 border border-purple-500/50 rounded-lg p-4 text-white transition-all duration-200 hover:border-purple-400/70 hover:shadow-lg",
        className
      )} style={{ minWidth: '500px', minHeight: '200px' }}>

        {/* Main Content Flex Container */}
        <div className="flex">
          {/* Left Side: Profile Picture with Name Overlay */}
          <div className="relative mr-6 flex-shrink-0">
            <div className="w-32 h-32 rounded-lg overflow-hidden bg-gradient-to-br from-purple-600 to-purple-800 flex items-center justify-center relative">
              {!imageError && characterImageUrl ? (
                <Image
                  src={characterImageUrl}
                  alt={`${sheetData?.name || characterName} avatar`}
                  fill
                  className="object-cover"
                  onError={() => setImageError(true)}
                  sizes="128px"
                />
              ) : (
                <span className="text-2xl font-bold text-white">
                  {(sheetData?.name || characterName)?.charAt(0).toUpperCase() || '?'}
                </span>
              )}
              {/* Character Name Overlay */}
              <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-xs font-bold text-center py-1 px-1 truncate">
                {sheetData?.name || characterName}
              </div>
            </div>
          </div>

          {/* Right Side: Attribute Bars and WTH */}
          <div className="flex-1 min-w-0">
            {/* 8 Attribute Bars: 3 Body + 3 Soul + 2 Spirit */}
            <div className="grid grid-cols-3 gap-4 mb-4">
              {/* Body Pillar */}
              <div className="space-y-1">
                <div className="text-center text-xs text-green-400 font-semibold">BODY</div>
                {['clout', 'celerity', 'constitution'].map((attr) => {
                  const pool = attributePools.find(p => p.name === attr);
                  const percentage = pool?.percentage || 0;
                  return (
                    <div key={attr} className="relative">
                      <div className="w-full h-5 bg-gray-700 rounded border border-green-600/30 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-green-500 to-green-400 transition-all duration-300"
                          style={{ width: `${Math.min(100, percentage)}%` }}
                        />
                      </div>
                      <div className="text-xs text-center text-gray-300 mt-0.5 font-mono">
                        {pool?.current || 0}/{pool?.max || 0}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Soul Pillar */}
              <div className="space-y-1">
                <div className="text-center text-xs text-blue-400 font-semibold">SOUL</div>
                {['focus', 'flow', 'frequency'].map((attr) => {
                  const pool = attributePools.find(p => p.name === attr);
                  const percentage = pool?.percentage || 0;
                  return (
                    <div key={attr} className="relative">
                      <div className="w-full h-5 bg-gray-700 rounded border border-blue-600/30 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-blue-500 to-blue-400 transition-all duration-300"
                          style={{ width: `${Math.min(100, percentage)}%` }}
                        />
                      </div>
                      <div className="text-xs text-center text-gray-300 mt-0.5 font-mono">
                        {pool?.current || 0}/{pool?.max || 0}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Spirit Pillar */}
              <div className="space-y-1">
                <div className="text-center text-xs text-purple-400 font-semibold">SPIRIT</div>
                {['willpower', 'wisdom'].map((attr) => {
                  const pool = attributePools.find(p => p.name === attr);
                  const percentage = pool?.percentage || 0;
                  return (
                    <div key={attr} className="relative">
                      <div className="w-full h-5 bg-gray-700 rounded border border-purple-600/30 overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-purple-500 to-purple-400 transition-all duration-300"
                          style={{ width: `${Math.min(100, percentage)}%` }}
                        />
                      </div>
                      <div className="text-xs text-center text-gray-300 mt-0.5 font-mono">
                        {pool?.current || 0}/{pool?.max || 0}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* WTH Levels Under Bars */}
            <div className="flex justify-between px-4">
              <div className="text-center">
                <div className="text-xs text-red-400 font-semibold">WEALTH</div>
                <div className="text-sm text-red-300 font-bold">{tkv?.breakdown?.wealthLevel || 1}</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-yellow-400 font-semibold">TECH</div>
                <div className="text-sm text-yellow-300 font-bold">{tkv?.breakdown?.techLevel || 1}</div>
              </div>
              <div className="text-center">
                <div className="text-xs text-cyan-400 font-semibold">HEALTH</div>
                <div className="text-sm text-cyan-300 font-bold">{tkv?.breakdown?.healthLevel || 1}</div>
              </div>
            </div>
          </div>
        </div>

        {/* TKV Box Connected at Bottom */}
        <div className="mt-3 bg-gray-800/95 border border-gray-600 rounded px-3 py-2">
          <div className="flex justify-between items-center text-xs">
            <div className="text-center">
              <div className="text-gray-400">T</div>
              <div className="text-orange-400 font-bold">{tkv?.breakdown?.fateDie ? `d${tkv.breakdown.fateDie}` : 'd6'}</div>
            </div>
            <div className="text-center">
              <div className="text-gray-400">K</div>
              <div className="text-purple-400 font-bold">
                {sheetLoading ? '...' : sheetData?.tkv || (tkvLoading ? '...' : tkv ? BigInt(tkv.total).toLocaleString() : '0')}
              </div>
            </div>
            <div className="text-center">
              <div className="text-gray-400">V</div>
              <div className="text-green-400 font-bold">1</div>
            </div>
          </div>
        </div>

        {/* Broken Sheet Warning Overlay */}
        {!sheetExists && !checkingSheet && (
          <div className="absolute inset-0 bg-red-500/20 border-2 border-red-500 rounded-lg flex items-center justify-center z-10"
               onClick={(e) => {
                 e.preventDefault();
                 e.stopPropagation();
                 setShowRestoreDialog(true);
               }}>
            <div className="flex flex-col items-center text-white bg-red-600/90 px-4 py-3 rounded-lg shadow-lg cursor-pointer hover:bg-red-600">
              <svg className="w-12 h-12 mb-2 text-yellow-300" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 2L1 21h22L12 2zm0 3.5L19.53 19H4.47L12 5.5zM11 16v2h2v-2h-2zm0-6v4h2v-4h-2z"/>
              </svg>
              <div className="text-center">
                <div className="font-bold text-sm">Sheet Missing!</div>
                <div className="text-xs">Click to restore</div>
              </div>
            </div>
          </div>
        )}

        {/* Action buttons - only show delete for unassigned characters */}
        {!character.playerEmail && onDelete && (
          <div className="absolute top-3 right-3 flex gap-2">
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                setShowDeleteConfirm(true);
              }}
              className="w-8 h-8 bg-red-500 hover:bg-red-600 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all duration-200 shadow-lg"
              title="Delete Character"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          </div>
        )}

        {/* Click to view character */}
        <Link
          href={`/campaign/${campaignId}/character/${character.id}`}
          className="absolute inset-0 rounded-lg"
          aria-label={`View ${characterName} character sheet`}
        />
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4">Delete Character</h3>
            <p className="mb-6 text-gray-600">
              Are you sure you want to delete &quot;{characterName}&quot;? This will permanently delete the character and their Google Sheet. This action cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowDeleteConfirm(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
                disabled={deleting}
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded transition-colors disabled:opacity-50"
              >
                {deleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Restore Sheet Dialog */}
      {showRestoreDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-lg font-semibold mb-4 text-red-600">Character Sheet Missing</h3>
            <p className="mb-6 text-gray-600">
              The Google Sheet for &quot;{characterName}&quot; cannot be found. It may have been deleted or moved.
              You can restore it from the template or permanently delete this character.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setShowRestoreDialog(false)}
                className="px-4 py-2 text-gray-600 hover:text-gray-800 transition-colors"
                disabled={restoring}
              >
                Cancel
              </button>
              {onDelete && (
                <button
                  onClick={async () => {
                    setShowRestoreDialog(false);
                    setShowDeleteConfirm(true);
                  }}
                  disabled={restoring}
                  className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded transition-colors disabled:opacity-50"
                >
                  Delete Character
                </button>
              )}
              <button
                onClick={handleRestore}
                disabled={restoring}
                className="px-4 py-2 bg-green-500 hover:bg-green-600 text-white rounded transition-colors disabled:opacity-50"
              >
                {restoring ? 'Restoring...' : 'Restore Sheet'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// Helper function to calculate attribute pools from Google Sheets data
function calculateAttributePoolsFromSheet(attributes: Record<string, { current: number; max: number }>): AttributePool[] {
  // Define the 8 attributes in the exact order: CLT, CEL, CON, FOC, FREQ, FLO, WIL, WIS
  const attributeDefinitions = [
    { name: 'clout', abbreviation: 'CLT', category: 'body' as const },
    { name: 'celerity', abbreviation: 'CEL', category: 'body' as const },
    { name: 'constitution', abbreviation: 'CON', category: 'body' as const },
    { name: 'focus', abbreviation: 'FOC', category: 'soul' as const },
    { name: 'frequency', abbreviation: 'FREQ', category: 'soul' as const },
    { name: 'flow', abbreviation: 'FLO', category: 'soul' as const },
    { name: 'willpower', abbreviation: 'WIL', category: 'spirit' as const },
    { name: 'wisdom', abbreviation: 'WIS', category: 'spirit' as const },
  ];

  const pools: AttributePool[] = [];

  for (const attrDef of attributeDefinitions) {
    const attr = attributes[attrDef.name];

    // Use data from Google Sheets with fallback to 0 values
    const current = attr?.current || 0;
    const max = attr?.max || 1;
    const percentage = max > 0 ? (current / max) * 100 : 0;

    pools.push({
      name: attrDef.name,
      abbreviation: attrDef.abbreviation,
      current,
      max,
      percentage,
      category: attrDef.category
    });
  }

  return pools;
}