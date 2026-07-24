"use client";

import React, { useEffect, useState, useCallback } from 'react';

interface MessageRow {
  id: string;
  godHeadId: string;
  godHeadName: string;
  godHeadPillar: string;
  direction: 'GODHEAD_TO_GM' | 'GM_TO_GODHEAD';
  content: string;
  invocationId?: string | null;
  readAt: string | null;
  createdAt: string;
}

interface NectarBestowal {
  kind: 'nectar_bestowal';
  characterId: string;
  goalId?: string;
  nectar: {
    name: string;
    pillar: string;
    mechanicalEffect: string;
    rollModifiers?: Record<string, number>;
  };
  kv: number;
  reason: string;
  resolved?: { action: 'accept' | 'decline'; at: string; by: string };
}

function parseBestowal(content: string): NectarBestowal | null {
  try {
    const obj = JSON.parse(content);
    if (obj && obj.kind === 'nectar_bestowal') return obj as NectarBestowal;
  } catch { /* not JSON */ }
  return null;
}

const NECTAR_PILLAR_COLOR: Record<string, string> = {
  body:   'var(--pillar-body)',
  spirit: 'var(--pillar-spirit)',
  soul:   'var(--pillar-soul)',
};

function pillarChip(pillar: string) {
  const color = NECTAR_PILLAR_COLOR[pillar?.toLowerCase()] ?? 'var(--pillar-spirit)';
  return (
    <span style={{
      display: 'inline-block',
      padding: '0 5px',
      fontSize: '8px',
      borderRadius: '2px',
      border: `1px solid ${color}`,
      color,
      fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif',
      letterSpacing: '0.06em',
      textTransform: 'uppercase' as const,
      verticalAlign: 'middle',
      marginLeft: '4px',
    }}>{pillar}</span>
  );
}

interface Props {
  campaignId: string;
  onClose?: () => void;
}

const PILLAR_COLOR: Record<string, string> = {
  MERCY: '#3EB89A',
  BALANCE: '#D4A830',
  SEVERITY: '#E8585A',
};

export default function GodHeadMessagesPanel({ campaignId, onClose }: Props) {
  const [messages, setMessages] = useState<MessageRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'ALL' | 'GODHEAD_TO_GM' | 'GM_TO_GODHEAD'>('ALL');
  const [godheadName, setGodheadName] = useState('Eth\'erling');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [resolving, setResolving] = useState<Record<string, boolean>>({});
  const [resolveError, setResolveError] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const q = filter === 'ALL' ? '' : `?direction=${filter}`;
      const res = await fetch(`/api/campaigns/${campaignId}/godhead-messages${q}`, { cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages ?? []);
      }
    } catch { /* swallow */ }
    setLoading(false);
  }, [campaignId, filter]);

  useEffect(() => { load(); }, [load]);

  const markRead = async (id: string) => {
    await fetch(`/api/campaigns/${campaignId}/godhead-messages`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messageId: id, markRead: true }),
    });
    setMessages(prev => prev.map(m => m.id === id ? { ...m, readAt: new Date().toISOString() } : m));
  };

  const send = async () => {
    if (!draft.trim() || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/godhead-messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ godheadName, content: draft.trim() }),
      });
      if (res.ok) {
        setDraft('');
        await load();
      }
    } finally {
      setSending(false);
    }
  };

  const resolveBestowal = async (messageId: string, action: 'accept' | 'decline') => {
    setResolving(prev => ({ ...prev, [messageId]: true }));
    setResolveError(prev => ({ ...prev, [messageId]: '' }));
    try {
      const res = await fetch(
        `/api/campaigns/${campaignId}/godhead-messages/${messageId}/resolve-bestowal`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action }),
        }
      );
      if (res.ok) {
        await load();
      } else {
        const body = await res.json().catch(() => ({}));
        setResolveError(prev => ({ ...prev, [messageId]: body?.error ?? `Error ${res.status}` }));
      }
    } catch (err) {
      setResolveError(prev => ({ ...prev, [messageId]: 'Network error' }));
    } finally {
      setResolving(prev => ({ ...prev, [messageId]: false }));
    }
  };

  return (
    <div className="border" style={{ backgroundColor: '#1a1a2e', borderColor: 'var(--pillar-spirit)', borderRadius: '3px', width: '480px' }}>
      <div className="p-3 text-white cursor-grab" style={{ background: 'linear-gradient(135deg, #2a1a52 0%, #1a0d3a 100%)', borderRadius: '2px 2px 0 0' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-lg">{'☉'}</span>
            <h3 className="font-semibold text-sm" style={{ fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', letterSpacing: '0.08em', fontSize: '15px' }}>GODHEAD COUNCIL</h3>
          </div>
          {onClose && (
            <button onClick={e => { e.stopPropagation(); onClose(); }} onMouseDown={e => e.stopPropagation()}
              className="p-1 hover:bg-white/20 transition-colors" style={{ borderRadius: '2px' }}>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          )}
        </div>
      </div>

      <div className="p-3" style={{ fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
        <div className="flex gap-1 mb-3">
          {(['ALL', 'GODHEAD_TO_GM', 'GM_TO_GODHEAD'] as const).map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className="px-2 py-1 text-[10px] uppercase"
              style={{
                borderRadius: '2px', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', letterSpacing: '0.05em',
                backgroundColor: filter === f ? '#2a1a52' : '#2a2a3e',
                color: filter === f ? '#fff' : '#888',
                border: `1px solid ${filter === f ? 'var(--pillar-spirit)' : '#3a3a4e'}`,
              }}>
              {f === 'ALL' ? 'ALL' : f === 'GODHEAD_TO_GM' ? '← FROM GODS' : '→ TO GODS'}
            </button>
          ))}
        </div>

        <div className="space-y-1.5 max-h-72 overflow-y-auto mb-3">
          {loading ? (
            <div className="text-center text-gray-400 py-4">Loading...</div>
          ) : messages.length === 0 ? (
            <div className="text-center text-gray-400 py-4">No messages.</div>
          ) : messages.map(m => {
            const color = PILLAR_COLOR[m.godHeadPillar] ?? 'var(--pillar-spirit)';
            const isFromGod = m.direction === 'GODHEAD_TO_GM';
            return (
              <div key={m.id}
                className="p-2 border"
                style={{
                  borderRadius: '2px',
                  backgroundColor: isFromGod ? 'rgba(88, 42, 114,0.08)' : '#2a2a3e',
                  borderColor: '#3a3a4e',
                  borderLeftColor: color,
                  borderLeftWidth: '3px',
                  marginLeft: isFromGod ? 0 : 20,
                }}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold" style={{ color, fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', letterSpacing: '0.08em' }}>
                    {isFromGod ? '☉' : '→'} {m.godHeadName}
                  </span>
                  <span className="text-[8px]" style={{ color: '#666' }}>{new Date(m.createdAt).toLocaleString()}</span>
                </div>
                {(() => {
                  const bestowal = parseBestowal(m.content);
                  if (bestowal) {
                    const nPillar = bestowal.nectar.pillar?.toLowerCase();
                    const nColor = NECTAR_PILLAR_COLOR[nPillar] ?? 'var(--pillar-spirit)';
                    const mods = bestowal.nectar.rollModifiers;
                    return (
                      <div style={{ border: `1px solid ${nColor}`, borderRadius: '2px', overflow: 'hidden', marginTop: '2px' }}>
                        {/* Bestowal header */}
                        <div style={{ backgroundColor: `${nColor}22`, padding: '4px 6px', borderBottom: `1px solid ${nColor}44`, display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ color: nColor, fontSize: '10px', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', letterSpacing: '0.08em' }}>
                            ⟡ NECTAR PROPOSED — {bestowal.nectar.name}
                          </span>
                          {pillarChip(bestowal.nectar.pillar)}
                        </div>
                        {/* Body */}
                        <div style={{ padding: '6px 7px', backgroundColor: 'rgba(26,26,46,0.6)' }}>
                          {/* Reason */}
                          <p style={{ color: '#ccc', fontSize: '11px', lineHeight: 1.45, marginBottom: '5px' }}>{bestowal.reason}</p>
                          {/* Mechanical effect */}
                          <div style={{ background: '#12122a', border: '1px solid #3a3a4e', borderRadius: '2px', padding: '4px 6px', marginBottom: mods ? '5px' : '4px' }}>
                            <div style={{ color: '#888', fontSize: '8px', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', letterSpacing: '0.06em', marginBottom: '2px' }}>MECHANICAL EFFECT</div>
                            <p style={{ color: '#e8e0ff', fontSize: '10px', lineHeight: 1.4 }}>{bestowal.nectar.mechanicalEffect}</p>
                          </div>
                          {/* Roll modifiers */}
                          {mods && Object.keys(mods).length > 0 && (
                            <div style={{ marginBottom: '4px' }}>
                              {Object.entries(mods).map(([k, v]) => (
                                <span key={k} style={{ display: 'inline-block', marginRight: '6px', color: v >= 0 ? 'var(--terminal-prime)' : '#e85858', fontSize: '10px' }}>
                                  {v >= 0 ? '+' : ''}{v} to {k}
                                </span>
                              ))}
                            </div>
                          )}
                          {/* KV */}
                          <div style={{ color: '#c9962e', fontSize: '10px', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', letterSpacing: '0.04em', marginBottom: '5px' }}>
                            KV COST: {bestowal.kv}
                          </div>
                          {/* Resolved / Actions */}
                          {bestowal.resolved ? (
                            <div style={{
                              display: 'inline-block',
                              fontSize: '9px',
                              padding: '1px 6px',
                              borderRadius: '2px',
                              fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif',
                              letterSpacing: '0.06em',
                              color: bestowal.resolved.action === 'accept' ? 'var(--terminal-prime)' : '#888',
                              border: `1px solid ${bestowal.resolved.action === 'accept' ? '#22ab9444' : '#3a3a4e'}`,
                              backgroundColor: bestowal.resolved.action === 'accept' ? 'rgba(34,171,148,0.08)' : 'rgba(255,255,255,0.03)',
                            }}>
                              {bestowal.resolved.action === 'accept' ? 'ACCEPTED' : 'DECLINED — converted to raw KRMA (10% tax)'}
                            </div>
                          ) : (
                            <div style={{ display: 'flex', gap: '5px', alignItems: 'center', flexWrap: 'wrap' }}>
                              <button
                                disabled={!!resolving[m.id]}
                                onClick={() => resolveBestowal(m.id, 'accept')}
                                style={{
                                  padding: '2px 8px', fontSize: '9px', borderRadius: '2px', cursor: resolving[m.id] ? 'wait' : 'pointer',
                                  fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', letterSpacing: '0.06em',
                                  backgroundColor: resolving[m.id] ? '#1a1a2e' : 'var(--terminal-prime)',
                                  color: resolving[m.id] ? 'var(--terminal-prime)' : '#0d1a17',
                                  border: '1px solid var(--terminal-prime)',
                                }}>
                                BESTOW
                              </button>
                              <button
                                disabled={!!resolving[m.id]}
                                onClick={() => resolveBestowal(m.id, 'decline')}
                                style={{
                                  padding: '2px 8px', fontSize: '9px', borderRadius: '2px', cursor: resolving[m.id] ? 'wait' : 'pointer',
                                  fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', letterSpacing: '0.06em',
                                  backgroundColor: '#2a2a3e',
                                  color: '#888',
                                  border: '1px solid #3a3a4e',
                                }}>
                                DECLINE → RAW KRMA
                              </button>
                              {resolveError[m.id] && (
                                <span style={{ color: '#e85858', fontSize: '9px' }}>{resolveError[m.id]}</span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  }
                  return <p className="text-[11px]" style={{ color: '#ddd', whiteSpace: 'pre-wrap', lineHeight: 1.4 }}>{m.content}</p>;
                })()}
                {isFromGod && !m.readAt && (
                  <button onClick={() => markRead(m.id)}
                    className="text-[8px] mt-1 px-1.5 py-0.5 uppercase"
                    style={{ color: 'var(--krma-gold)', border: '1px solid rgba(255,204,120,0.3)', borderRadius: '2px' }}>
                    Mark Read
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Compose */}
        <div className="border-t pt-2" style={{ borderColor: '#3a3a4e' }}>
          <div className="flex gap-1 mb-1.5">
            {['Eth\'erling', 'Kai', 'Lady Death'].map(name => (
              <button key={name} onClick={() => setGodheadName(name)}
                className="px-2 py-0.5 text-[9px] uppercase"
                style={{
                  borderRadius: '2px', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif',
                  backgroundColor: godheadName === name ? '#2a1a52' : '#2a2a3e',
                  color: godheadName === name ? '#fff' : '#888',
                  border: `1px solid ${godheadName === name ? 'var(--pillar-spirit)' : '#3a3a4e'}`,
                }}>{name}</button>
            ))}
          </div>
          <textarea
            value={draft}
            onChange={e => setDraft(e.target.value)}
            placeholder={`Message to ${godheadName}...`}
            rows={3}
            maxLength={8000}
            className="w-full bg-transparent outline-none text-xs text-white p-1.5 border resize-none"
            style={{ borderColor: '#3a3a4e', borderRadius: '2px', fontFamily: 'var(--font-terminal), Consolas, monospace' }}
          />
          <button onClick={send} disabled={!draft.trim() || sending}
            className="mt-1 px-3 py-1 text-[10px] uppercase float-right"
            style={{
              color: (draft.trim() && !sending) ? '#1a1a2e' : '#555',
              backgroundColor: (draft.trim() && !sending) ? 'var(--pillar-spirit)' : '#2a2a3e',
              border: '1px solid var(--pillar-spirit)',
              borderRadius: '2px',
              fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif',
              letterSpacing: '0.05em',
              opacity: (draft.trim() && !sending) ? 1 : 0.6,
            }}>
            {sending ? 'Sending...' : 'Send'}
          </button>
        </div>
      </div>
    </div>
  );
}
