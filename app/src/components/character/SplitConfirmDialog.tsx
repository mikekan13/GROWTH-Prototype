'use client';

/**
 * SplitConfirmDialog — preview + two-step confirm of the death split.
 *
 * Opened from DeathSaveDialog on a failed death save.
 * Fetches GET /api/characters/[id]/death to show the exact KV routing preview,
 * then on double-confirm fires POST /api/characters/[id]/death to execute.
 *
 * Cancel here does NOT grant Tara's mercy — that's the SPARE THEM button in
 * DeathSaveDialog. Cancel merely closes this sub-dialog.
 */

import { useState, useEffect } from 'react';

// ── Types ──────────────────────────────────────────────────────────────────

interface SplitComponent {
  source: string;
  kv: number;
  destination: string;
  reason: string;
}

interface SplitManifest {
  toCampaign: number;
  toLadyDeath: number;
  components: SplitComponent[];
}

interface DeathPreview {
  manifest: SplitManifest;
}

export interface Props {
  characterId: string;
  characterName: string;
  onClose: () => void;
  onExecuted: () => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const DESTINATION_ORDER = ['campaign', 'lady_death', 'kept'] as const;

function destinationLabel(dest: string): string {
  switch (dest) {
    case 'campaign':    return 'To the Campaign';
    case 'lady_death':  return 'To Lady Death';
    case 'kept':        return 'Kept by the Ghost';
    default:            return dest;
  }
}

// ── Component ──────────────────────────────────────────────────────────────

export default function SplitConfirmDialog({
  characterId,
  characterName,
  onClose,
  onExecuted,
}: Props) {
  const [preview, setPreview] = useState<DeathPreview | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);
  const [executing, setExecuting] = useState(false);
  const [done, setDone] = useState(false);

  // Fetch routing preview on mount
  useEffect(() => {
    fetch(`/api/characters/${characterId}/death`)
      .then(r => {
        if (!r.ok) throw new Error(`Preview failed (${r.status})`);
        return r.json();
      })
      .then((data: DeathPreview) => setPreview(data))
      .catch((err: Error) => setPreviewError(err.message));
  }, [characterId]);

  async function handleExecute() {
    setExecuting(true);
    try {
      const res = await fetch(`/api/characters/${characterId}/death`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cause: 'Facing Death failed' }),
      });
      if (!res.ok) throw new Error(`Split failed (${res.status})`);
      setDone(true);
      setTimeout(() => onExecuted(), 1800);
    } finally {
      setExecuting(false);
    }
  }

  // Group components by destination for table rendering
  const grouped = preview?.manifest.components.reduce<Record<string, SplitComponent[]>>(
    (acc, c) => {
      (acc[c.destination] = acc[c.destination] ?? []).push(c);
      return acc;
    },
    {},
  );

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9100,
        background: 'rgba(0,0,0,0.92)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontFamily: 'Consolas, monospace',
      }}
      onClick={onClose}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '760px',
          maxHeight: '90vh',
          overflowY: 'auto',
          background: '#000',
          border: '1px solid var(--pillar-body)',
          padding: '48px',
          position: 'relative',
          color: '#fff',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Title */}
        <h2 style={{
          fontFamily: 'Bebas Neue, Consolas, monospace',
          fontSize: '3rem',
          letterSpacing: '0.1em',
          color: '#fff',
          margin: '0 0 6px 0',
          lineHeight: 1,
        }}>
          THE DEATH ENGINE
        </h2>
        <div style={{ width: '100%', height: '2px', background: 'var(--pillar-body)', marginBottom: '32px' }} />

        {/* Character badge */}
        <div style={{
          display: 'inline-block',
          background: 'var(--pillar-body)',
          color: '#000',
          fontFamily: 'Bebas Neue, monospace',
          fontSize: '1.1rem',
          letterSpacing: '0.08em',
          padding: '2px 12px',
          marginBottom: '28px',
        }}>
          {characterName.toUpperCase()}
        </div>

        {/* Loading */}
        {!preview && !previewError && (
          <div style={{ color: '#555', fontSize: '0.9rem', marginBottom: '24px' }}>
            Loading manifest...
          </div>
        )}

        {/* Error */}
        {previewError && (
          <div style={{ color: 'var(--pillar-body)', fontSize: '0.9rem', marginBottom: '24px' }}>
            {previewError}
          </div>
        )}

        {/* Manifest routing table */}
        {preview && grouped && (
          <>
            {DESTINATION_ORDER.filter(d => (grouped[d]?.length ?? 0) > 0).map(dest => (
              <div key={dest} style={{ marginBottom: '28px' }}>
                <div style={{
                  color: '#aaa',
                  fontSize: '0.72rem',
                  letterSpacing: '0.14em',
                  textTransform: 'uppercase',
                  marginBottom: '8px',
                  borderBottom: '1px solid #1a1a1a',
                  paddingBottom: '6px',
                }}>
                  {destinationLabel(dest)}
                </div>
                {(grouped[dest] ?? []).map((c, i) => (
                  <div key={i} style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    fontSize: '0.88rem',
                    color: '#ccc',
                    padding: '5px 0',
                    borderBottom: '1px solid #0d0d0d',
                  }}>
                    <span>{c.source}</span>
                    <span style={{ display: 'flex', gap: '24px', alignItems: 'center' }}>
                      <span style={{ color: '#666', fontSize: '0.8rem' }}>{c.reason}</span>
                      <span style={{
                        color: dest === 'lady_death' ? 'var(--pillar-body)' : '#aaa',
                        minWidth: '52px',
                        textAlign: 'right',
                        fontFamily: 'Consolas, monospace',
                      }}>
                        {c.kv} KV
                      </span>
                    </span>
                  </div>
                ))}
              </div>
            ))}

            {/* Totals */}
            <div style={{
              borderTop: '1px solid #2a2a2a',
              paddingTop: '16px',
              marginBottom: '40px',
              display: 'flex',
              gap: '40px',
              flexWrap: 'wrap',
              fontSize: '0.88rem',
            }}>
              <div>
                <span style={{ color: '#555', marginRight: '8px' }}>To Campaign:</span>
                <span style={{ color: '#fff' }}>{preview.manifest.toCampaign} KV</span>
              </div>
              <div>
                <span style={{ color: '#555', marginRight: '8px' }}>To Lady Death:</span>
                <span style={{ color: 'var(--pillar-body)' }}>{preview.manifest.toLadyDeath} KV</span>
              </div>
            </div>
          </>
        )}

        {/* Done state */}
        {done && (
          <div style={{
            fontFamily: 'Bebas Neue, monospace',
            fontSize: '1.75rem',
            color: '#fff',
            letterSpacing: '0.08em',
            textAlign: 'center',
            padding: '32px 0',
          }}>
            It is done.
          </div>
        )}

        {/* Action buttons — two-step confirm */}
        {!done && (
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center' }}>
            {!armed ? (
              <>
                <button
                  onClick={() => setArmed(true)}
                  disabled={!preview}
                  style={{
                    background: preview ? 'var(--pillar-body)' : '#1a1a1a',
                    color: preview ? '#000' : '#444',
                    border: 'none',
                    fontFamily: 'Bebas Neue, monospace',
                    fontSize: '1.1rem',
                    letterSpacing: '0.08em',
                    padding: '12px 28px',
                    cursor: preview ? 'pointer' : 'not-allowed',
                  }}
                >
                  EXECUTE THE SPLIT
                </button>
                <button
                  onClick={onClose}
                  style={{
                    background: 'transparent',
                    color: '#555',
                    border: '1px solid #222',
                    fontFamily: 'Consolas, monospace',
                    fontSize: '0.85rem',
                    padding: '12px 20px',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={handleExecute}
                  disabled={executing}
                  style={{
                    background: executing ? '#1a1a1a' : '#fff',
                    color: executing ? '#444' : '#000',
                    border: 'none',
                    fontFamily: 'Bebas Neue, monospace',
                    fontSize: '1rem',
                    letterSpacing: '0.06em',
                    padding: '14px 28px',
                    cursor: executing ? 'not-allowed' : 'pointer',
                  }}
                >
                  {executing ? 'EXECUTING...' : 'CONFIRM — THEY BECOME A GHOST'}
                </button>
                <button
                  onClick={() => setArmed(false)}
                  style={{
                    background: 'transparent',
                    color: '#555',
                    border: '1px solid #222',
                    fontFamily: 'Consolas, monospace',
                    fontSize: '0.85rem',
                    padding: '12px 20px',
                    cursor: 'pointer',
                  }}
                >
                  Back
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
