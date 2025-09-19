"use client";

import { useState, useEffect } from "react";
import { Modal } from "./Modal";

interface KrmaBalance {
  total: string;
  crystallized: string;
  liquid: string;
  formatted: {
    total: string;
    crystallized: string;
    liquid: string;
  };
  campaigns: number;
}

interface ToolsCardProps {
  campaignId?: string;
  onCreateCharacter?: (characterName: string) => void;
  className?: string;
}

export function ToolsCard({ campaignId, onCreateCharacter, className = "" }: ToolsCardProps) {
  const [krmaBalance, setKrmaBalance] = useState<KrmaBalance | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [characterName, setCharacterName] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    const fetchKrmaBalance = async () => {
      try {
        const response = await fetch("/api/krma/breakdown");
        if (response.ok) {
          const data = await response.json();
          setKrmaBalance(data);
        }
      } catch (error) {
        console.error("Failed to fetch KRMA breakdown:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchKrmaBalance();

    // Auto-refresh balance every 30 seconds
    const interval = setInterval(fetchKrmaBalance, 30000);
    return () => clearInterval(interval);
  }, []);

  const handleCreateCharacter = async () => {
    if (!characterName.trim()) return;

    setCreating(true);
    try {
      const response = await fetch("/api/tools/create-character", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          characterName: characterName.trim(),
          campaignId: campaignId,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to create character");
      }

      const data = await response.json();

      // Call the optional callback if provided
      if (onCreateCharacter) {
        await onCreateCharacter(characterName.trim());
      }

      // Open the Google Sheet in a new tab
      if (data.character?.spreadsheetUrl) {
        window.open(data.character.spreadsheetUrl, '_blank');
      }

      setCharacterName("");
      setShowCreateDialog(false);

      // Show success message (you could add a toast notification here)
      console.log(`✅ Character "${data.character.name}" created in "${data.campaign.name}"`);
    } catch (error) {
      console.error("Failed to create character:", error);
      // You could add error toast notification here
      alert(`Failed to create character: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setCreating(false);
    }
  };

  const formatKrmaValue = (value: string | undefined) => {
    if (!value || value === '') {
      return '0';
    }
    try {
      const num = BigInt(value);
      return num.toLocaleString();
    } catch (error) {
      console.warn('Failed to format KRMA value:', value, error);
      return '0';
    }
  };

  return (
    <>
      <div
        className={`p-6 border-2 border-dashed shadow-lg rounded-xl ${className}`}
        style={{
          backgroundColor: '#22ab94',
          borderColor: '#1e9b82',
          background: 'linear-gradient(135deg, #22ab94 0%, #1e9b82 50%, #22ab94 100%)',
          boxShadow: '0 8px 32px rgba(34, 171, 148, 0.3), inset 0 1px 0 rgba(255, 255, 255, 0.2)'
        }}
        data-testid="tools-card"
      >
        {/* Minimalist Header */}
        <div className="text-center mb-5">
          <div className="inline-flex items-center justify-center w-14 h-14 bg-white bg-opacity-25 rounded-full mb-2 shadow-2xl border border-white border-opacity-40" style={{
            background: 'radial-gradient(circle at 30% 30%, rgba(255,255,255,0.4) 0%, rgba(255,255,255,0.1) 70%)'
          }}>
            <svg className="w-7 h-7 text-white drop-shadow-md" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 2L3 7v6c0 5.55 3.84 9.74 9 9.74s9-4.19 9-9.74V7l-7-5z" />
            </svg>
          </div>
        </div>

        {/* Minimalist KRMA Display */}
        <div className="mb-5">
          {loading ? (
            <div className="space-y-2">
              <div className="h-8 bg-white bg-opacity-20 rounded-lg animate-pulse mx-auto w-20"></div>
              <div className="flex gap-1 justify-center">
                <div className="h-3 w-8 bg-white bg-opacity-10 rounded animate-pulse"></div>
                <div className="h-3 w-8 bg-white bg-opacity-10 rounded animate-pulse"></div>
              </div>
            </div>
          ) : krmaBalance ? (
            <div className="text-center">
              {/* Total Display */}
              <div className="mb-3">
                <div className="text-2xl font-bold text-white drop-shadow-lg mb-1" data-testid="total-krma" style={{
                  fontFamily: 'monospace',
                  letterSpacing: '0.05em'
                }}>
                  {krmaBalance.formatted.total} Ҝ
                </div>
              </div>

              {/* Compact Breakdown */}
              <div className="flex justify-center gap-4 text-xs">
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-white bg-opacity-80 rounded-full shadow-sm"></div>
                  <span className="text-white text-opacity-90 font-medium" data-testid="crystallized-krma">
                    {krmaBalance.formatted.crystallized}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-2 h-2 bg-white bg-opacity-60 rounded-full border border-white border-opacity-40"></div>
                  <span className="text-white text-opacity-90 font-medium" data-testid="liquid-krma">
                    {krmaBalance.formatted.liquid}
                  </span>
                </div>
              </div>
            </div>
          ) : (
            <div className="text-center text-red-300 text-sm">⚠️ Error</div>
          )}
        </div>

        {/* Primary Action */}
        <div className="space-y-3">
          <button
            onClick={() => setShowCreateDialog(true)}
            className="group w-full bg-white bg-opacity-20 hover:bg-opacity-30 active:bg-opacity-40 text-white py-3 px-4 rounded-2xl transition-all duration-300 flex items-center justify-center space-x-3 backdrop-blur-sm border border-white border-opacity-40 hover:border-opacity-60 shadow-xl hover:shadow-2xl font-semibold text-sm hover:scale-105 active:scale-95"
            style={{
              textShadow: '0 2px 4px rgba(0,0,0,0.4)',
              background: 'linear-gradient(145deg, rgba(255,255,255,0.25) 0%, rgba(255,255,255,0.1) 100%)'
            }}
            data-testid="create-character-btn"
          >
            <svg className="w-5 h-5 transition-transform group-hover:scale-110" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
            </svg>
            <span>CREATE</span>
          </button>

          {/* Future Actions */}
          <div className="flex justify-center gap-3 opacity-40">
            <div className="w-8 h-8 bg-white bg-opacity-10 rounded-full flex items-center justify-center border border-white border-opacity-20">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
            </div>
            <div className="w-8 h-8 bg-white bg-opacity-10 rounded-full flex items-center justify-center border border-white border-opacity-20">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </div>
          </div>
        </div>

        {/* Minimal Status */}
        <div className="mt-4 text-center">
          <div className="w-1 h-1 bg-white bg-opacity-60 rounded-full mx-auto animate-pulse"></div>
        </div>
      </div>

      {/* Create Character Dialog */}
      <Modal
        isOpen={showCreateDialog}
        onClose={() => !creating && setShowCreateDialog(false)}
        title="Create New Character"
        data-testid="character-modal"
      >
        <div className="space-y-6">
          <div>
            <label
              htmlFor="characterName"
              className="block text-sm font-medium text-white text-opacity-90 mb-3"
              style={{
                fontFamily: 'monospace',
                letterSpacing: '0.05em',
                textShadow: '0 2px 4px rgba(0,0,0,0.4)'
              }}
            >
              Character Name
            </label>
            <input
              id="characterName"
              type="text"
              value={characterName}
              onChange={(e) => setCharacterName(e.target.value)}
              placeholder="Enter character name..."
              className="w-full px-4 py-3 rounded-xl text-white placeholder-white placeholder-opacity-60 focus:outline-none focus:ring-2 focus:ring-white focus:ring-opacity-50 disabled:opacity-50 transition-all duration-300"
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.3)',
                backdropFilter: 'blur(5px)',
                WebkitBackdropFilter: 'blur(5px)',
                boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.2)',
                fontFamily: 'monospace',
                letterSpacing: '0.05em'
              }}
              disabled={creating}
              onKeyDown={(e) => e.key === 'Enter' && !creating && handleCreateCharacter()}
            />
          </div>

          <div
            className="text-sm text-white text-opacity-80 p-4 rounded-xl"
            style={{
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              backdropFilter: 'blur(3px)',
              WebkitBackdropFilter: 'blur(3px)',
              textShadow: '0 1px 2px rgba(0,0,0,0.3)'
            }}
          >
            <p>This will create a new character and generate a Google Sheet using the character template.</p>
          </div>

          <div className="flex justify-end space-x-4 pt-2">
            <button
              onClick={() => setShowCreateDialog(false)}
              disabled={creating}
              className="px-6 py-3 text-sm font-medium text-white text-opacity-80 hover:text-opacity-100 disabled:opacity-50 transition-all duration-300 rounded-xl"
              style={{
                backgroundColor: 'rgba(255, 255, 255, 0.1)',
                border: '1px solid rgba(255, 255, 255, 0.2)',
                backdropFilter: 'blur(5px)',
                WebkitBackdropFilter: 'blur(5px)',
                textShadow: '0 2px 4px rgba(0,0,0,0.4)',
                fontFamily: 'monospace',
                letterSpacing: '0.05em'
              }}
            >
              Cancel
            </button>
            <button
              onClick={handleCreateCharacter}
              disabled={creating || !characterName.trim()}
              className="px-6 py-3 text-sm font-bold text-white disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2 transition-all duration-300 rounded-xl hover:scale-105 active:scale-95"
              style={{
                background: 'linear-gradient(145deg, rgba(255,255,255,0.25) 0%, rgba(255,255,255,0.1) 100%)',
                border: '1px solid rgba(255, 255, 255, 0.4)',
                backdropFilter: 'blur(5px)',
                WebkitBackdropFilter: 'blur(5px)',
                boxShadow: '0 4px 15px rgba(255, 255, 255, 0.2), inset 0 1px 0 rgba(255, 255, 255, 0.3)',
                textShadow: '0 2px 4px rgba(0,0,0,0.4)',
                fontFamily: 'monospace',
                letterSpacing: '0.05em'
              }}
            >
              {creating && (
                <svg className="animate-spin -ml-1 mr-2 h-4 w-4" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
              )}
              <span>{creating ? "Creating..." : "Create Character"}</span>
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}