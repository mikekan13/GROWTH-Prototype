'use client';

import React, { useState, useCallback } from 'react';

interface PortraitGeneration {
  id: string;
  imagePath: string;
  thumbnailPath?: string;
  status: string;
  isCurrentPortrait: boolean;
  seed: number;
  generationTimeMs: number;
  createdAt: string;
}

interface PortraitPanelProps {
  characterId: string;
  currentPortrait?: string | null;
  onPortraitChange?: (newPortraitPath: string) => void;
}

type PanelState = 'idle' | 'generating' | 'preview' | 'history' | 'error';

export default function PortraitPanel({ characterId, currentPortrait, onPortraitChange }: PortraitPanelProps) {
  const [state, setState] = useState<PanelState>('idle');
  const [error, setError] = useState<string>('');
  const [generatedImage, setGeneratedImage] = useState<{
    imagePath: string;
    seed: number;
    generationTimeMs: number;
  } | null>(null);
  const [history, setHistory] = useState<PortraitGeneration[]>([]);
  const [providerAvailable, setProviderAvailable] = useState<boolean | null>(null);
  const [steeringWords, setSteeringWords] = useState('');

  // Check provider status on first interaction
  const checkProvider = useCallback(async () => {
    if (providerAvailable !== null) return providerAvailable;
    try {
      const res = await fetch('/api/portraits/provider');
      const data = await res.json();
      const available = data.local?.available || data.cloud?.available || false;
      setProviderAvailable(available);
      return available;
    } catch {
      setProviderAvailable(false);
      return false;
    }
  }, [providerAvailable]);

  // Generate a new portrait
  const handleGenerate = useCallback(async () => {
    const available = await checkProvider();
    if (!available) {
      setError('Portrait generation is offline. Start ComfyUI first.');
      setState('error');
      return;
    }

    setState('generating');
    setError('');

    try {
      const overrides: Record<string, unknown> = {};
      if (steeringWords.trim()) {
        overrides.steeringWords = steeringWords.split(',').map(w => w.trim()).filter(Boolean);
      }

      const res = await fetch('/api/portraits/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          characterId,
          overrides: Object.keys(overrides).length > 0 ? overrides : undefined,
        }),
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Generation failed');
      }

      setGeneratedImage({
        imagePath: data.imagePath,
        seed: data.metadata.seed,
        generationTimeMs: data.metadata.generationTimeMs,
      });
      setState('preview');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Generation failed');
      setState('error');
    }
  }, [characterId, checkProvider, steeringWords]);

  // Accept the generated portrait
  const handleAccept = useCallback(async () => {
    if (!generatedImage) return;

    try {
      // Get the latest generation ID from history
      const histRes = await fetch(`/api/portraits/history?characterId=${characterId}`);
      const histData = await histRes.json();
      const latest = histData.portraits?.[0];

      if (!latest) throw new Error('No generation found to accept');

      await fetch('/api/portraits/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ generationId: latest.id, characterId }),
      });

      onPortraitChange?.(generatedImage.imagePath);
      setState('idle');
      setGeneratedImage(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to accept portrait');
      setState('error');
    }
  }, [characterId, generatedImage, onPortraitChange]);

  // Lock persona
  const handleLock = useCallback(async () => {
    if (!generatedImage) return;

    try {
      const histRes = await fetch(`/api/portraits/history?characterId=${characterId}`);
      const histData = await histRes.json();
      const latest = histData.portraits?.[0];

      if (!latest) throw new Error('No generation found to lock');

      await fetch('/api/portraits/lock', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ generationId: latest.id, characterId }),
      });

      onPortraitChange?.(generatedImage.imagePath);
      setState('idle');
      setGeneratedImage(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to lock persona');
      setState('error');
    }
  }, [characterId, generatedImage, onPortraitChange]);

  // Load portrait history
  const handleShowHistory = useCallback(async () => {
    try {
      const res = await fetch(`/api/portraits/history?characterId=${characterId}`);
      const data = await res.json();
      setHistory(data.portraits || []);
      setState('history');
    } catch {
      setError('Failed to load history');
      setState('error');
    }
  }, [characterId]);

  // Regenerate with new seed
  const handleRegenerate = useCallback(() => {
    setGeneratedImage(null);
    handleGenerate();
  }, [handleGenerate]);

  const displayPortrait = generatedImage?.imagePath || currentPortrait;

  return (
    <div className="bg-[var(--surface-dark)] p-4">
      <div className="flex gap-4">
        {/* Portrait Image */}
        <div className="flex-shrink-0 relative" style={{ width: '200px', height: '200px' }}>
          <div className="w-full h-full bg-gray-900 overflow-hidden relative">
            {displayPortrait ? (
              <img
                src={`/${displayPortrait}`}
                alt="Character portrait"
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-white/20">
                <div className="text-center">
                  <div style={{ fontSize: '48px' }}>&#9678;</div>
                  <div className="text-xs mt-1">No Portrait</div>
                </div>
              </div>
            )}

            {/* Generating overlay */}
            {state === 'generating' && (
              <div className="absolute inset-0 bg-black/70 flex items-center justify-center">
                <div className="text-center">
                  <div className="animate-spin text-2xl mb-2">&#9881;</div>
                  <div className="text-xs text-white/60">Generating...</div>
                  <div className="text-xs text-white/40 mt-1">~20-30 seconds</div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="flex-1 flex flex-col justify-between">
          {/* Title */}
          <div>
            <h3 className="text-sm uppercase tracking-wider text-white/40 mb-2"
                style={{ fontFamily: 'var(--font-header)' }}>
              Portrait
            </h3>

            {/* Steering Words Input */}
            <input
              type="text"
              placeholder="Steering words (e.g. battle-worn, smiling)"
              value={steeringWords}
              onChange={e => setSteeringWords(e.target.value)}
              className="w-full bg-black/40 border border-white/10 text-white/80 text-xs px-2 py-1 mb-2 focus:border-[var(--accent-teal)] focus:outline-none"
              disabled={state === 'generating'}
            />
          </div>

          {/* Action Buttons */}
          <div className="space-y-2">
            {state === 'idle' || state === 'error' ? (
              <>
                <button
                  onClick={handleGenerate}
                  disabled={false}
                  className="w-full px-3 py-1.5 text-xs uppercase tracking-wider
                    bg-[var(--accent-teal)] text-black font-bold
                    hover:bg-[var(--accent-teal)]/80 transition-colors
                    disabled:opacity-40 disabled:cursor-not-allowed"
                  style={{ fontFamily: 'var(--font-header)' }}
                >
                  {currentPortrait ? 'Regenerate Portrait' : 'Generate Portrait'}
                </button>
                {currentPortrait && (
                  <button
                    onClick={handleShowHistory}
                    className="w-full px-3 py-1 text-xs text-white/40 hover:text-white/70 transition-colors"
                  >
                    View History
                  </button>
                )}
              </>
            ) : state === 'preview' ? (
              <>
                <div className="text-xs text-white/40 mb-1">
                  Seed: {generatedImage?.seed} | {((generatedImage?.generationTimeMs || 0) / 1000).toFixed(1)}s
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={handleAccept}
                    className="flex-1 px-3 py-1.5 text-xs uppercase tracking-wider
                      bg-green-600 text-white font-bold
                      hover:bg-green-500 transition-colors"
                    style={{ fontFamily: 'var(--font-header)' }}
                  >
                    Accept
                  </button>
                  <button
                    onClick={handleLock}
                    className="flex-1 px-3 py-1.5 text-xs uppercase tracking-wider
                      bg-[var(--krma-gold)] text-black font-bold
                      hover:bg-[var(--krma-gold)]/80 transition-colors"
                    style={{ fontFamily: 'var(--font-header)' }}
                    title="Lock this face as permanent identity — all future portraits will look like this person"
                  >
                    Lock Identity
                  </button>
                </div>
                <button
                  onClick={handleRegenerate}
                  className="w-full px-3 py-1 text-xs text-white/40 hover:text-white/70 transition-colors"
                >
                  Try Again (new seed)
                </button>
                <button
                  onClick={() => { setState('idle'); setGeneratedImage(null); }}
                  className="w-full px-3 py-1 text-xs text-white/40 hover:text-white/70 transition-colors"
                >
                  Cancel
                </button>
              </>
            ) : null}
          </div>

          {/* Error Display */}
          {error && (
            <div className="text-xs text-red-400 mt-1">{error}</div>
          )}
        </div>
      </div>

      {/* History Panel */}
      {state === 'history' && history.length > 0 && (
        <div className="mt-3 border-t border-white/10 pt-3">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs text-white/40 uppercase tracking-wider">Generation History</span>
            <button
              onClick={() => setState('idle')}
              className="text-xs text-white/30 hover:text-white/60"
            >
              Close
            </button>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-2">
            {history.map(gen => (
              <div
                key={gen.id}
                className={`flex-shrink-0 relative cursor-pointer border-2 ${
                  gen.isCurrentPortrait ? 'border-[var(--accent-teal)]' : 'border-transparent'
                } hover:border-white/40 transition-colors`}
                style={{ width: '80px', height: '80px' }}
                title={`Seed: ${gen.seed} | ${new Date(gen.createdAt).toLocaleDateString()}`}
              >
                <img
                  src={`/${gen.imagePath}`}
                  alt={`Generation ${gen.seed}`}
                  className="w-full h-full object-cover"
                />
                {gen.isCurrentPortrait && (
                  <div className="absolute bottom-0 left-0 right-0 bg-[var(--accent-teal)] text-black text-center"
                    style={{ fontSize: '8px', fontFamily: 'var(--font-header)' }}>
                    CURRENT
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
