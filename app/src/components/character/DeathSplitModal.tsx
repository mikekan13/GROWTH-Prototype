'use client';

/**
 * DeathSplitModal — preview + confirm the multi-transaction death split.
 *
 * Per the 2026-05-19 transformation model:
 *   - Body components → GM (campaign wallet)
 *   - Soul halves → Lady Death system wallet
 *   - Frequency capacity → Lady Death
 *   - Spirit + Soul-kept components → stay on the character (now a ghost)
 *
 * Workflow:
 *   1. On open, GET /api/characters/[id]/death — pulls manifest from
 *      previewDeathSplit() without writing anything.
 *   2. GM types a cause-of-death (required) + optional sessionId.
 *   3. Confirm → POST /api/characters/[id]/death → batched ledger writes.
 *
 * GM-only. Triggered from the character sheet / canvas card. Idempotent
 * at the ledger level so accidental double-clicks won't double-split.
 */

import { useEffect, useState } from 'react';

interface DeathSplitComponent {
  source: string;
  kv: number;
  destination: 'campaign' | 'player' | 'lady_death' | 'kept';
  reason: string;
}

interface DeathSplitManifest {
  toCampaign: number;
  toPlayer: number;
  toLadyDeath: number;
  components: DeathSplitComponent[];
}

interface PreviewPayload {
  tkv: { total: number };
  manifest: DeathSplitManifest;
  characterWalletBalance: string;
  characterName: string;
}

interface Props {
  characterId: string;
  characterName?: string;
  onClose: () => void;
  onApplied: (manifest: DeathSplitManifest) => void;
}

const DESTINATION_META: Record<DeathSplitComponent['destination'], { label: string; color: string; hint: string }> = {
  campaign:   { label: 'GM',         color: '#ffcc78', hint: 'Body strips return to the campaign wallet' },
  lady_death: { label: 'Lady Death', color: '#7050A8', hint: 'Soul halves + Frequency capacity' },
  kept:       { label: 'Ghost',      color: '#3EB89A', hint: 'Stays on the ghost — Spirit + Soul-kept' },
  player:     { label: 'Player',     color: '#3E78C0', hint: 'Legacy split (pre-2026-05-19)' },
};

export default function DeathSplitModal({ characterId, characterName, onClose, onApplied }: Props) {
  const [preview, setPreview] = useState<PreviewPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [cause, setCause] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [confirmText, setConfirmText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(`/api/characters/${characterId}/death`);
        if (!res.ok) {
          const err = await res.json().catch(() => ({ error: 'Preview failed' }));
          if (!cancelled) setPreviewError(err.error || 'Preview failed');
          return;
        }
        const data = (await res.json()) as PreviewPayload;
        if (!cancelled) setPreview(data);
      } catch (e) {
        if (!cancelled) setPreviewError(e instanceof Error ? e.message : 'Network error');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [characterId]);

  const handleConfirm = async () => {
    setSubmitError(null);
    setSubmitting(true);
    try {
      const res = await fetch(`/api/characters/${characterId}/death`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cause, sessionId: sessionId || undefined }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Death split failed' }));
        setSubmitError(err.error || 'Death split failed');
        return;
      }
      const data = await res.json();
      onApplied(data.manifest as DeathSplitManifest);
    } catch (e) {
      setSubmitError(e instanceof Error ? e.message : 'Network error');
    } finally {
      setSubmitting(false);
    }
  };

  const expectedConfirm = (preview?.characterName ?? characterName ?? '').trim();
  const confirmReady = cause.trim().length >= 1
    && expectedConfirm.length > 0
    && confirmText.trim().toLowerCase() === expectedConfirm.toLowerCase()
    && !submitting;

  // Group components by destination for the readout
  const grouped: Record<DeathSplitComponent['destination'], DeathSplitComponent[]> = preview
    ? preview.manifest.components.reduce((acc, c) => {
        (acc[c.destination] = acc[c.destination] || []).push(c);
        return acc;
      }, {} as Record<DeathSplitComponent['destination'], DeathSplitComponent[]>)
    : {} as Record<DeathSplitComponent['destination'], DeathSplitComponent[]>;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: 'rgba(0,0,0,0.85)' }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-2xl border max-h-[90vh] overflow-y-auto"
        style={{ borderColor: '#E8585A55', background: '#0a0a14', boxShadow: '0 0 80px rgba(232,88,90,0.25)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b"
          style={{ borderColor: 'rgba(255,255,255,0.08)' }}
        >
          <div>
            <div className="text-[11px] font-[family-name:var(--font-terminal)] tracking-[0.2em] uppercase text-[#E8585A]">
              Death · Lady Death Settles
            </div>
            <div className="text-[16px] font-[family-name:var(--font-header)] tracking-[0.1em] text-white mt-1">
              {preview?.characterName ?? characterName ?? '(loading…)'}
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-7 h-7 text-white/40 hover:text-[#E8585A] transition-colors"
          >✕</button>
        </div>

        {/* Preview body */}
        {loading ? (
          <div className="p-8 text-center text-[12px] text-white/30 font-[family-name:var(--font-terminal)] uppercase tracking-[0.15em]">
            Loading manifest...
          </div>
        ) : previewError ? (
          <div className="p-5">
            <div className="border p-3 text-[12px] font-[family-name:var(--font-terminal)]"
              style={{ borderColor: '#E8585A55', background: 'rgba(232,88,90,0.08)', color: '#E8585A' }}
            >
              ✗ {previewError}
            </div>
          </div>
        ) : preview ? (
          <div className="p-5 space-y-4">
            {/* Totals strip */}
            <div className="grid grid-cols-3 gap-2">
              <DestinationCard
                label="Body → GM"
                value={preview.manifest.toCampaign}
                color={DESTINATION_META.campaign.color}
                hint={DESTINATION_META.campaign.hint}
              />
              <DestinationCard
                label="Lady Death"
                value={preview.manifest.toLadyDeath}
                color={DESTINATION_META.lady_death.color}
                hint={DESTINATION_META.lady_death.hint}
              />
              <DestinationCard
                label="Ghost (kept)"
                value={preview.manifest.components.filter(c => c.destination === 'kept').reduce((s, c) => s + c.kv, 0)}
                color={DESTINATION_META.kept.color}
                hint={DESTINATION_META.kept.hint}
              />
            </div>

            {preview.manifest.toPlayer > 0 && (
              <div className="border p-2 text-[11px] font-[family-name:var(--font-terminal)]"
                style={{ borderColor: '#3E78C033', background: 'rgba(62,120,192,0.06)', color: '#3E78C0' }}
              >
                Legacy split detected: {preview.manifest.toPlayer} Ҝ routed to player wallet
                (pre-2026-05-19 transformation manifest, honored for back-compat).
              </div>
            )}

            <div className="flex justify-between text-[12px] font-[family-name:var(--font-terminal)] uppercase tracking-[0.12em] border-b py-2"
              style={{ borderColor: 'rgba(255,255,255,0.08)' }}
            >
              <span className="text-white/40">TKV at Death</span>
              <span className="text-[#ffcc78]">{preview.tkv.total} Ҝ</span>
            </div>

            {/* Component breakdown */}
            <div className="space-y-3">
              {(['campaign', 'lady_death', 'kept'] as const).map(dest => {
                const items = grouped[dest] || [];
                if (items.length === 0) return null;
                const meta = DESTINATION_META[dest];
                return (
                  <div key={dest}>
                    <div className="flex items-baseline justify-between mb-1.5">
                      <span className="text-[11px] uppercase tracking-[0.12em] font-[family-name:var(--font-terminal)]"
                        style={{ color: meta.color }}
                      >
                        → {meta.label} <span className="text-white/30 normal-case ml-1">({items.length})</span>
                      </span>
                      <span className="text-[11px] text-white/40 font-[family-name:var(--font-terminal)]">{meta.hint}</span>
                    </div>
                    <div className="space-y-0.5">
                      {items.map((c, i) => (
                        <div key={i} className="flex justify-between items-baseline text-[11px] font-[family-name:var(--font-terminal)] py-1 px-2"
                          style={{ background: 'rgba(255,255,255,0.02)' }}
                        >
                          <span className="text-white/60">
                            <span className="text-white/30">{c.source.split(':')[0]}:</span>{' '}{c.source.split(':').slice(1).join(':')}
                          </span>
                          <span className="text-white/50">{c.reason}</span>
                          <span className="text-[12px] font-[family-name:var(--font-bebas-neue)]" style={{ color: meta.color }}>
                            {c.kv}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Cause input */}
            <div className="pt-3 space-y-2 border-t" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-[0.12em] text-white/40 font-[family-name:var(--font-terminal)]">
                  Cause of Death (logged in ledger metadata)
                </label>
                <input
                  type="text"
                  value={cause}
                  onChange={(e) => setCause(e.target.value)}
                  placeholder="Frequency=0 in combat; Fated Age; etc."
                  maxLength={500}
                  className="w-full px-3 py-2 text-[12px] font-[family-name:var(--font-terminal)] bg-black/40 border text-white placeholder:text-white/25"
                  style={{ borderColor: 'rgba(232,88,90,0.33)' }}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-[0.12em] text-white/40 font-[family-name:var(--font-terminal)]">
                  Session ID (optional)
                </label>
                <input
                  type="text"
                  value={sessionId}
                  onChange={(e) => setSessionId(e.target.value)}
                  placeholder="(blank = no session pin)"
                  className="w-full px-3 py-2 text-[12px] font-[family-name:var(--font-terminal)] bg-black/40 border text-white placeholder:text-white/25"
                  style={{ borderColor: 'rgba(255,255,255,0.1)' }}
                />
              </div>

              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-[0.12em] text-[#E8585A] font-[family-name:var(--font-terminal)]">
                  Type the character&apos;s name to confirm: <span className="text-white/40 normal-case">{expectedConfirm}</span>
                </label>
                <input
                  type="text"
                  value={confirmText}
                  onChange={(e) => setConfirmText(e.target.value)}
                  className="w-full px-3 py-2 text-[12px] font-[family-name:var(--font-terminal)] bg-black/40 border text-white"
                  style={{ borderColor: '#E8585A55' }}
                />
              </div>
            </div>

            {submitError && (
              <div className="border p-3 text-[12px] font-[family-name:var(--font-terminal)]"
                style={{ borderColor: '#E8585A55', background: 'rgba(232,88,90,0.08)', color: '#E8585A' }}
              >
                ✗ {submitError}
              </div>
            )}
          </div>
        ) : null}

        {/* Footer */}
        <div className="flex items-center justify-between gap-2 px-5 py-4 border-t"
          style={{ borderColor: 'rgba(255,255,255,0.08)' }}
        >
          <button
            onClick={onClose}
            className="px-3 py-2 text-[11px] uppercase tracking-[0.1em] font-[family-name:var(--font-terminal)] text-white/40 hover:text-white/70"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={!confirmReady}
            className="px-5 py-2 text-[11px] uppercase tracking-[0.12em] font-[family-name:var(--font-terminal)] font-bold disabled:opacity-30 transition-all"
            style={{
              background: confirmReady ? '#E8585A' : 'rgba(232,88,90,0.3)',
              color: '#000',
              boxShadow: confirmReady ? '0 0 20px rgba(232,88,90,0.3)' : 'none',
            }}
          >
            {submitting ? 'Settling...' : 'Execute Death Split ›'}
          </button>
        </div>
      </div>
    </div>
  );
}

function DestinationCard({ label, value, color, hint }: { label: string; value: number; color: string; hint: string }) {
  return (
    <div className="border p-3" style={{ borderColor: `${color}33`, background: `${color}06` }}>
      <div className="text-[10px] uppercase tracking-[0.12em] font-[family-name:var(--font-terminal)] text-white/40 mb-1">
        {label}
      </div>
      <div className="text-[20px] font-[family-name:var(--font-bebas-neue)]" style={{ color }}>
        {value} <span className="text-[11px] text-white/40">Ҝ</span>
      </div>
      <div className="text-[10px] font-[family-name:var(--font-terminal)] text-white/35 mt-0.5 leading-tight">
        {hint}
      </div>
    </div>
  );
}
