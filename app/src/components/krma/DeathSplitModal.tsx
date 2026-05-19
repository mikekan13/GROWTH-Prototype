"use client";

import React, { useEffect, useState } from 'react';

interface DeathSplitComponent {
  source: string;
  destination: 'campaign' | 'player' | 'ladyDeath';
  amount: number;
  description?: string;
}

interface DeathSplitManifest {
  toCampaign: number;
  toPlayer: number;
  toLadyDeath: number;
  components: DeathSplitComponent[];
}

interface DeathSplitPreview {
  tkv: { total: number };
  manifest: DeathSplitManifest;
  characterWalletBalance: string;
  characterName: string;
}

interface DeathSplitModalProps {
  characterId: string;
  onConfirm?: (result: { spiritPackageKV: number; transactionIds: string[] }) => void;
  onClose: () => void;
}

const DEST_COLOR: Record<DeathSplitComponent['destination'], string> = {
  campaign: '#22ab94',
  player: '#7050A8',
  ladyDeath: '#E84040',
};
const DEST_LABEL: Record<DeathSplitComponent['destination'], string> = {
  campaign: 'CAMPAIGN',
  player: 'PLAYER (SPIRIT PACKAGE)',
  ladyDeath: 'LADY DEATH',
};

export default function DeathSplitModal({ characterId, onConfirm, onClose }: DeathSplitModalProps) {
  const [preview, setPreview] = useState<DeathSplitPreview | null>(null);
  const [cause, setCause] = useState('');
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/characters/${characterId}/death`, { cache: 'no-store' })
      .then(async (r) => {
        if (!r.ok) {
          const data = await r.json().catch(() => ({ error: 'Failed to load preview' }));
          throw new Error(data.error ?? `HTTP ${r.status}`);
        }
        return r.json();
      })
      .then((data) => { if (!cancelled) setPreview(data); })
      .catch((err: Error) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [characterId]);

  const handleExecute = async () => {
    if (!cause.trim() || executing) return;
    setExecuting(true);
    setError(null);
    try {
      const res = await fetch(`/api/characters/${characterId}/death`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cause: cause.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      onConfirm?.({
        spiritPackageKV: data.spiritPackageKV,
        transactionIds: (data.transactions ?? []).map((t: { id: string }) => t.id),
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setExecuting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center" style={{ backgroundColor: 'rgba(0,0,0,0.85)' }}>
      <div className="border-2 max-w-2xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col"
        style={{ backgroundColor: '#1a1a2e', borderColor: '#E84040', borderRadius: '3px' }}>
        {/* Header */}
        <div className="p-4 text-white" style={{ background: 'linear-gradient(135deg, #4a1a1a 0%, #2a0d0d 100%)', borderBottom: '1px solid #E84040' }}>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-2xl">{'☠'}</span>
              <div>
                <h2 className="font-bold" style={{ fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', letterSpacing: '0.1em', fontSize: '20px', color: '#E84040' }}>DEATH SPLIT</h2>
                <p className="text-xs" style={{ color: '#ccc', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
                  {preview?.characterName ?? 'Loading...'}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="p-1 hover:bg-white/10" style={{ borderRadius: '2px' }}>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-4 overflow-y-auto" style={{ fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
          {loading ? (
            <div className="text-center text-gray-400 py-8">Loading manifest...</div>
          ) : error ? (
            <div className="p-3 border" style={{ borderColor: '#E84040', backgroundColor: 'rgba(232,64,64,0.1)', color: '#E84040' }}>
              {error}
            </div>
          ) : preview ? (
            <>
              {/* Summary row */}
              <div className="flex gap-2 mb-4">
                <div className="flex-1 p-2 border" style={{ borderColor: '#3a3a4e', borderRadius: '2px', backgroundColor: '#2a2a3e' }}>
                  <div className="text-[9px] uppercase" style={{ color: '#888' }}>TKV at Death</div>
                  <div className="text-lg font-bold" style={{ color: '#ffcc78' }}>{preview.tkv.total}</div>
                </div>
                <div className="flex-1 p-2 border" style={{ borderColor: '#3a3a4e', borderRadius: '2px', backgroundColor: '#2a2a3e' }}>
                  <div className="text-[9px] uppercase" style={{ color: '#888' }}>Wallet Balance</div>
                  <div className="text-lg font-bold" style={{ color: '#7050A8' }}>{preview.characterWalletBalance}</div>
                </div>
                <div className="flex-1 p-2 border" style={{ borderColor: '#3a3a4e', borderRadius: '2px', backgroundColor: '#2a2a3e' }}>
                  <div className="text-[9px] uppercase" style={{ color: '#888' }}>Spirit Package</div>
                  <div className="text-lg font-bold" style={{ color: '#7050A8' }}>{preview.manifest.toPlayer}</div>
                </div>
              </div>

              {/* Destination breakdown */}
              <div className="space-y-2 mb-4">
                {(['campaign', 'player', 'ladyDeath'] as const).map(dest => {
                  const total = dest === 'campaign' ? preview.manifest.toCampaign
                    : dest === 'player' ? preview.manifest.toPlayer
                    : preview.manifest.toLadyDeath;
                  const components = preview.manifest.components.filter(c => c.destination === dest);
                  return (
                    <div key={dest} className="border" style={{ borderColor: '#3a3a4e', borderRadius: '2px', backgroundColor: '#2a2a3e', borderLeftColor: DEST_COLOR[dest], borderLeftWidth: '3px' }}>
                      <div className="flex items-center justify-between p-2">
                        <span className="text-[10px] font-bold uppercase" style={{ color: DEST_COLOR[dest], fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', letterSpacing: '0.08em' }}>
                          → {DEST_LABEL[dest]}
                        </span>
                        <span className="text-lg font-bold" style={{ color: DEST_COLOR[dest] }}>{total}</span>
                      </div>
                      {components.length > 0 && (
                        <div className="px-2 pb-2 space-y-0.5">
                          {components.map((c, i) => (
                            <div key={i} className="flex justify-between text-[10px]" style={{ color: '#ccc' }}>
                              <span>{c.source}{c.description ? ` — ${c.description}` : ''}</span>
                              <span>{c.amount}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Cause input */}
              <div className="mb-4">
                <label className="text-[10px] uppercase block mb-1" style={{ color: '#888', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', letterSpacing: '0.05em' }}>Cause of Death (required)</label>
                <input
                  type="text"
                  value={cause}
                  onChange={(e) => setCause(e.target.value)}
                  placeholder="e.g. Killed by Bandit Captain in combat"
                  maxLength={500}
                  className="w-full bg-transparent text-white text-sm p-2 border outline-none"
                  style={{ borderColor: '#3a3a4e', borderRadius: '2px' }}
                />
              </div>
            </>
          ) : null}
        </div>

        {/* Footer */}
        <div className="p-4 border-t flex justify-between items-center" style={{ borderColor: '#3a3a4e', backgroundColor: '#0d0d1e' }}>
          <p className="text-[9px] italic" style={{ color: '#666' }}>This action is final and recorded to the immutable ledger.</p>
          <div className="flex gap-2">
            <button onClick={onClose}
              className="px-4 py-1.5 text-xs uppercase"
              style={{ color: '#888', border: '1px solid #3a3a4e', borderRadius: '2px', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', letterSpacing: '0.05em' }}>
              Cancel
            </button>
            <button onClick={handleExecute}
              disabled={!preview || !cause.trim() || executing}
              className="px-4 py-1.5 text-xs uppercase font-bold"
              style={{
                color: (preview && cause.trim() && !executing) ? '#1a1a2e' : '#555',
                backgroundColor: (preview && cause.trim() && !executing) ? '#E84040' : '#2a2a3e',
                border: '1px solid #E84040',
                borderRadius: '2px',
                fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif',
                letterSpacing: '0.05em',
                opacity: (preview && cause.trim() && !executing) ? 1 : 0.6,
              }}>
              {executing ? 'Executing...' : 'Confirm Death'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
