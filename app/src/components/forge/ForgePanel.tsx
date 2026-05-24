"use client";

import { useState, useEffect, useCallback } from 'react';
import type { Material, MaterialMod, ResistType } from '@/types/material';
import { MATERIAL_CATALOG } from '@/lib/materials';

// ── Types ─────────────────────────────────────────────────────────────────

interface ForgeItem {
  id: string;
  campaignId: string;
  type: string;
  name: string;
  status: string;
  data: Record<string, unknown>;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

interface PlayerRequest {
  id: string;
  campaignId: string;
  requesterId: string;
  type: string;
  name: string;
  status: string;
  data: Record<string, unknown>;
  gmNotes: string | null;
  forgeItemId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ForgePanelProps {
  campaignId: string;
  isGM: boolean;
  userId: string;
  onPlaceItem?: (name: string, type: string, data: Record<string, unknown>) => void;
}

// ── Constants ─────────────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  seed: '#582a72',
  root: '#002f6c',
  branch: '#22ab94',
  skill: '#ffcc78',
  item: '#22ab94',
  nectar: '#3EB89A',
  blossom: '#D0A030',
  thorn: '#E8585A',
};

const STATUS_COLORS: Record<string, string> = {
  draft: '#888',
  published: '#22ab94',
  pending: '#D0A030',
  approved: '#22ab94',
  denied: '#E8585A',
  modified: '#582a72',
};

const GOV_ABBREV: Record<string, string> = {
  clout: 'CLO', celerity: 'CEL', constitution: 'CON',
  flow: 'FLO', focus: 'FOC',
  willpower: 'WIL', wisdom: 'WIS', wit: 'WIT',
};

const GOV_COLOR: Record<string, string> = {
  clout: '#E8585A', celerity: '#E8585A', constitution: '#E8585A',
  flow: '#582a72', focus: '#582a72',
  willpower: '#002f6c', wisdom: '#002f6c', wit: '#002f6c',
};

// ── Component ─────────────────────────────────────────────────────────────

export default function ForgePanel({ campaignId, isGM, userId: _userId, onPlaceItem }: ForgePanelProps) {
  const [items, setItems] = useState<ForgeItem[]>([]);
  const [requests, setRequests] = useState<PlayerRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeType, setActiveType] = useState<string>('seed');
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Create form state — minimal: every blueprint is authored by the chain
  // from name + Vision text. No more direct stat fields in the UI.
  const [newType, setNewType] = useState<string>('skill');
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  // Chain authoring state
  const [authoring, setAuthoring] = useState(false);
  const [authorResult, setAuthorResult] = useState<{
    type: string; name: string; canonicalName: string; data: Record<string, unknown>;
    summary: string; suggestedKV: number;
  } | null>(null);
  const [authorError, setAuthorError] = useState('');
  // Global catalog suggestion state (checked before authoring)
  const [globalSuggestions, setGlobalSuggestions] = useState<Array<{
    id: string; name: string; type: string; data: Record<string, unknown>; useCount: number;
  }>>([]);
  const [checkingGlobal, setCheckingGlobal] = useState(false);

  const fetchData = useCallback(async () => {
    try {
      const [itemsRes, reqRes] = await Promise.all([
        fetch(`/api/campaigns/${campaignId}/forge?type=${activeType}`),
        fetch(`/api/campaigns/${campaignId}/requests`),
      ]);
      if (itemsRes.ok) {
        const data = await itemsRes.json();
        setItems(data.items || []);
      }
      if (reqRes.ok) {
        const data = await reqRes.json();
        setRequests(data.requests || []);
      }
    } catch { /* silent */ }
    setLoading(false);
  }, [campaignId, activeType]);

  useEffect(() => { fetchData(); }, [fetchData]); // eslint-disable-line react-hooks/set-state-in-effect


  // ── Forge Flow: check global catalog first, then God-head authoring ──
  const handleAuthor = async () => {
    if (!newName.trim() || !newDesc.trim()) return;
    // Step 1: Check global catalog for existing similar items
    setCheckingGlobal(true);
    setAuthorError('');
    setAuthorResult(null);
    setGlobalSuggestions([]);
    try {
      const searchParam = encodeURIComponent(newName.trim());
      const res = await fetch(`/api/forge/global?type=${newType}&search=${searchParam}`);
      if (res.ok) {
        const data = await res.json();
        const suggestions = data.items || [];
        if (suggestions.length > 0) {
          setGlobalSuggestions(suggestions);
          setCheckingGlobal(false);
          return; // Show suggestions, don't author yet
        }
      }
    } catch { /* silent — proceed to authoring */ }
    setCheckingGlobal(false);
    // No suggestions found — go straight to God-head authoring
    await doAuthor();
  };

  // Step 2: Actually call God-head authoring (after global check or GM rejects suggestions).
  // `reforge=true` signals an iteration on a previously rejected attempt — server discounts the fee.
  const doAuthor = async (reforge: boolean = false) => {
    setAuthoring(true);
    setAuthorError('');
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/forge/author`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: newType, name: newName.trim(), description: newDesc.trim(), reforge }),
      });
      if (res.ok) {
        const { result } = await res.json();
        setAuthorResult(result);
      } else {
        const err = await res.json();
        setAuthorError(err.error || 'God-head failed to generate stats. Try again.');
      }
    } catch {
      setAuthorError('Connection failed.');
    }
    setAuthoring(false);
  };

  // GM rejects suggestions — proceed to forge new
  const handleForgeNew = async () => {
    setGlobalSuggestions([]);
    await doAuthor();
  };

  // GM pulls a suggestion from global catalog
  const handlePullSuggestion = async (globalItemId: string) => {
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/forge/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ globalItemId }),
      });
      if (res.ok) {
        setGlobalSuggestions([]);
        setNewName('');
        setNewDesc('');
        setShowCreateForm(false);
            fetchData();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to pull item');
      }
    } catch { alert('Connection failed'); }
  };

  const handleConfirmAuthor = async () => {
    if (!authorResult) return;
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/forge/author`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: authorResult.type,
          name: authorResult.canonicalName,
          data: authorResult.data,
          karmicValue: authorResult.suggestedKV,
        }),
      });
      if (res.ok) {
        setAuthorResult(null);
        setNewName('');
        setNewDesc('');
        setShowCreateForm(false);
        fetchData();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to save');
      }
    } catch { alert('Connection failed'); }
  };

  const handlePublish = async (itemId: string) => {
    try {
      await fetch(`/api/campaigns/${campaignId}/forge/${itemId}/publish`, { method: 'POST' });
      fetchData();
    } catch { /* silent */ }
  };

  const handleUnpublish = async (itemId: string) => {
    try {
      await fetch(`/api/campaigns/${campaignId}/forge/${itemId}/publish`, { method: 'DELETE' });
      fetchData();
    } catch { /* silent */ }
  };

  const handleDelete = async (itemId: string) => {
    if (!confirm('Delete this draft design?')) return;
    try {
      await fetch(`/api/campaigns/${campaignId}/forge/${itemId}`, { method: 'DELETE' });
      fetchData();
    } catch { /* silent */ }
  };

  const handleResolve = async (requestId: string, status: 'approved' | 'denied') => {
    try {
      await fetch(`/api/campaigns/${campaignId}/requests/${requestId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      fetchData();
    } catch { /* silent */ }
  };

  const types = ['seed', 'root', 'branch', 'skill', 'item', 'nectar', 'blossom', 'thorn'];
  const pendingRequests = requests.filter(r => r.status === 'pending');
  const resolvedRequests = requests.filter(r => r.status !== 'pending');

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: '#0a0a1a' }}>
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4 border-b" style={{ borderColor: 'rgba(255,204,120,0.2)' }}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <span style={{ color: '#ffcc78', fontSize: '20px' }}>{'\u2692'}</span>
            <h2 className="text-sm uppercase tracking-[0.2em]" style={{
              fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif',
              color: '#ffcc78',
              fontSize: '24px',
            }}>THE FORGE</h2>
          </div>
          {isGM && (
            <button
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="px-3 py-1 text-[14px] uppercase tracking-wider transition-colors"
              style={{
                fontFamily: 'var(--font-terminal), Consolas, monospace',
                color: '#ffcc78',
                border: '1px solid rgba(255,204,120,0.4)',
                backgroundColor: showCreateForm ? 'rgba(255,204,120,0.15)' : 'transparent',
                borderRadius: '2px',
              }}
            >
              + New Design
            </button>
          )}
        </div>

        {/* Type filter */}
        <div className="flex gap-1">
          {types.map(t => (
            <button
              key={t}
              onClick={() => setActiveType(t)}
              className="px-3 py-1.5 text-[13px] uppercase tracking-wider transition-colors"
              style={{
                fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif',
                letterSpacing: '0.05em',
                color: activeType === t ? '#0a0a1a' : '#888',
                backgroundColor: activeType === t ? (TYPE_COLORS[t] || '#ffcc78') : 'transparent',
                border: `1px solid ${activeType === t ? (TYPE_COLORS[t] || '#ffcc78') : 'rgba(255,255,255,0.1)'}`,
                borderRadius: '2px',
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
        {/* Create Form (GM only) */}
        {showCreateForm && isGM && (
          <div className="p-4 border" style={{ borderColor: 'rgba(255,204,120,0.3)', borderRadius: '3px', backgroundColor: '#1a1a2e' }}>
            <div className="text-[16px] uppercase tracking-wider mb-3" style={{ color: '#ffcc78', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif' }}>
              New Design
            </div>
            <div className="space-y-3">
              <div className="flex gap-2 items-center">
                <label className="text-[14px] text-gray-400 w-10">Type:</label>
                <select
                  value={newType}
                  onChange={e => setNewType(e.target.value)}
                  className="text-[14px] bg-transparent text-white outline-none px-2 py-1 border"
                  style={{ borderColor: '#3a3a4e', borderRadius: '2px', fontFamily: 'var(--font-terminal), Consolas, monospace' }}
                >
                  {['seed', 'root', 'branch', 'skill', 'item', 'nectar', 'blossom', 'thorn'].map(t => (
                    <option key={t} value={t} style={{ backgroundColor: '#1a1a2e' }}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2 items-center">
                <label className="text-[14px] text-gray-400 w-10">Name:</label>
                <input
                  type="text"
                  value={newName}
                  onChange={e => setNewName(e.target.value)}
                  placeholder="Design name..."
                  className="flex-1 bg-transparent outline-none text-sm text-white px-2 py-1 border"
                  style={{ borderColor: '#3a3a4e', borderRadius: '2px', fontFamily: 'var(--font-terminal), Consolas, monospace' }}
                  autoFocus
                />
              </div>
              <div className="flex gap-2 items-start">
                <label className="text-[14px] text-gray-400 w-10 pt-1">Vision:</label>
                <textarea
                  value={newDesc}
                  onChange={e => setNewDesc(e.target.value)}
                  placeholder="Describe what you envision — theme, flavor, role in the world, power level..."
                  rows={3}
                  className="flex-1 bg-transparent outline-none text-[14px] text-gray-300 px-2 py-1 border resize-y"
                  style={{ borderColor: '#3a3a4e', borderRadius: '2px', fontFamily: 'var(--font-terminal), Consolas, monospace' }}
                />
              </div>
              {/* Forge authoring flow: global check → suggestions → chain → review */}
              <div className="space-y-3">
                  <div className="text-[12px] px-2 py-1.5" style={{
                    color: 'rgba(255,204,120,0.7)',
                    backgroundColor: 'rgba(255,204,120,0.05)',
                    border: '1px solid rgba(255,204,120,0.15)',
                    borderRadius: '2px',
                    fontFamily: 'var(--font-terminal), Consolas, monospace',
                  }}>
                    Describe what you envision. The Forge will check if something similar exists, or a God-head will author a new blueprint.
                  </div>
                  {authorError && (
                    <div className="text-[12px] px-2 py-1.5" style={{
                      color: '#E8585A', backgroundColor: 'rgba(232,88,90,0.1)',
                      border: '1px solid rgba(232,88,90,0.2)', borderRadius: '2px',
                      fontFamily: 'var(--font-terminal), Consolas, monospace',
                    }}>{authorError}</div>
                  )}
                  {/* Global catalog suggestions */}
                  {globalSuggestions.length > 0 && (
                    <div className="p-3 border space-y-2" style={{
                      borderColor: 'rgba(208,160,48,0.4)',
                      borderRadius: '3px',
                      backgroundColor: 'rgba(208,160,48,0.06)',
                    }}>
                      <div className="text-[13px] uppercase tracking-wider" style={{
                        color: '#D0A030',
                        fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif',
                      }}>Similar designs exist in the global catalog</div>
                      <div className="space-y-1">
                        {globalSuggestions.map(item => (
                          <div key={item.id} className="flex items-center justify-between p-2 border" style={{
                            borderColor: 'rgba(208,160,48,0.2)',
                            borderRadius: '2px',
                            backgroundColor: '#1a1a2e',
                          }}>
                            <div className="flex-1 min-w-0">
                              <span className="text-[14px] text-white" style={{
                                fontFamily: 'var(--font-terminal), Consolas, monospace',
                              }}>{item.name}</span>
                              {(item.data?.description as string) ? (
                                <span className="text-[12px] text-white/35 ml-2 truncate" style={{
                                  fontFamily: 'var(--font-terminal), Consolas, monospace',
                                }}>{(item.data.description as string).slice(0, 80)}</span>
                              ) : null}
                              <span className="text-[11px] ml-2" style={{ color: '#D0A030' }}>
                                ({item.useCount} campaign{item.useCount !== 1 ? 's' : ''})
                              </span>
                            </div>
                            <button
                              onClick={() => handlePullSuggestion(item.id)}
                              className="text-[13px] px-2 py-0.5 uppercase tracking-wider flex-shrink-0 ml-2"
                              style={{
                                color: '#22ab94',
                                border: '1px solid rgba(34,171,148,0.4)',
                                borderRadius: '2px',
                                fontFamily: 'var(--font-terminal), Consolas, monospace',
                              }}
                            >Pull</button>
                          </div>
                        ))}
                      </div>
                      <button
                        onClick={handleForgeNew}
                        disabled={authoring}
                        className="text-[13px] px-3 py-1 uppercase tracking-wider"
                        style={{
                          color: authoring ? '#666' : '#582a72',
                          border: `1px solid ${authoring ? '#3a3a4e' : 'rgba(88, 42, 114,0.4)'}`,
                          borderRadius: '2px',
                          fontFamily: 'var(--font-terminal), Consolas, monospace',
                        }}
                      >
                        {authoring ? '⟳ God-heads forging...' : 'Not quite — forge something new'}
                      </button>
                    </div>
                  )}
                  {/* God-head result — review panel */}
                  {authorResult && (
                    <ForgeReviewPanel
                      result={authorResult}
                      onConfirm={handleConfirmAuthor}
                      onReject={() => setAuthorResult(null)}
                      onRetry={() => doAuthor(true)}
                    />
                  )}
                </div>
              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleAuthor}
                  disabled={!newName.trim() || !newDesc.trim() || authoring || checkingGlobal || !!authorResult || globalSuggestions.length > 0}
                  className="text-[14px] px-3 py-1 uppercase tracking-wider"
                  style={{
                    color: (!newName.trim() || !newDesc.trim() || authoring || checkingGlobal || !!authorResult || globalSuggestions.length > 0) ? '#666' : '#582a72',
                    border: `1px solid ${(!newName.trim() || !newDesc.trim() || authoring || checkingGlobal || !!authorResult || globalSuggestions.length > 0) ? '#3a3a4e' : 'rgba(88, 42, 114,0.5)'}`,
                    borderRadius: '2px',
                    fontFamily: 'var(--font-terminal), Consolas, monospace',
                  }}
                >
                  {checkingGlobal ? '⟳ Checking catalog...' : authoring ? '⟳ Forging...' : '⚡ Send to Forge'}
                </button>
                <button
                  onClick={() => { setShowCreateForm(false); setNewName(''); setNewDesc(''); setAuthorResult(null); setAuthorError(''); setGlobalSuggestions([]); }}
                  className="text-[14px] px-3 py-1 uppercase tracking-wider text-gray-500"
                  style={{ border: '1px solid #3a3a4e', borderRadius: '2px', fontFamily: 'var(--font-terminal), Consolas, monospace' }}
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Player Requests (GM sees pending, players see own) */}
        {pendingRequests.length > 0 && (
          <div>
            <div className="text-[16px] uppercase tracking-wider mb-2 flex items-center gap-2" style={{
              color: '#D0A030',
              fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif',
            }}>
              <span>{'\u25C8'}</span>
              Pending Requests ({pendingRequests.length})
            </div>
            <div className="space-y-1">
              {pendingRequests.map(req => (
                <RequestRow key={req.id} request={req} isGM={isGM} onResolve={handleResolve} onRefresh={fetchData} />
              ))}
            </div>
          </div>
        )}

        {/* Forge Items */}
        {loading ? (
          <div className="text-center py-8 text-[14px]" style={{
            fontFamily: 'var(--font-terminal), Consolas, monospace',
            color: 'rgba(255,204,120,0.3)',
          }}>Loading forge...</div>
        ) : items.length === 0 && pendingRequests.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-[14px] mb-1" style={{
              fontFamily: 'var(--font-terminal), Consolas, monospace',
              color: 'rgba(255,204,120,0.3)',
            }}>Forge is empty</div>
            <div className="text-[14px]" style={{
              fontFamily: 'var(--font-terminal), Consolas, monospace',
              color: 'rgba(255,255,255,0.15)',
            }}>{isGM ? 'Create designs for your campaign — skills, items, nectars, and more.' : 'Your GM hasn\'t published any designs yet.'}</div>
          </div>
        ) : (
          <div>
            <div className="text-[16px] uppercase tracking-wider mb-2 flex items-center gap-2" style={{
              color: '#ffcc78',
              fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif',
            }}>
              <span>{'\u2692'}</span>
              Designs ({items.length})
            </div>
            <div className="space-y-1">
              {items.map(item => (
                <ForgeItemRow
                  key={item.id}
                  item={item}
                  isGM={isGM}
                  onPublish={handlePublish}
                  onUnpublish={handleUnpublish}
                  onDelete={handleDelete}
                  onPlace={onPlaceItem && item.type === 'item' && item.status === 'published'
                    ? () => onPlaceItem(item.name, (item.data.itemType as string) || 'misc', item.data)
                    : undefined}
                />
              ))}
            </div>
          </div>
        )}

        {/* Resolved requests (collapsed) */}
        {resolvedRequests.length > 0 && (
          <div>
            <div className="text-[16px] uppercase tracking-wider mb-2" style={{
              color: '#666',
              fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif',
            }}>
              Resolved Requests ({resolvedRequests.length})
            </div>
            <div className="space-y-1">
              {resolvedRequests.map(req => (
                <RequestRow key={req.id} request={req} isGM={isGM} onResolve={handleResolve} onRefresh={fetchData} />
              ))}
            </div>
          </div>
        )}

        {/* Material Designer */}
        {isGM && <MaterialDesigner />}
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────

function ForgeItemRow({ item, isGM, onPublish, onUnpublish, onDelete, onPlace }: {
  item: ForgeItem;
  isGM: boolean;
  onPublish: (id: string) => void;
  onUnpublish: (id: string) => void;
  onDelete: (id: string) => void;
  onPlace?: () => void;
}) {
  const data = item.data || {};
  const governors = (data.governors as string[]) || [];
  const description = data.description as string | undefined;
  const isItemType = item.type === 'item';
  const itemSubType = data.itemType as string | undefined;
  const material = data.material as string | undefined;
  const rarity = data.rarity as string | undefined;

  return (
    <div className="p-2.5 border transition-colors group" style={{
      borderRadius: '2px',
      backgroundColor: '#1a1a2e',
      borderColor: item.status === 'published' ? 'rgba(34,171,148,0.3)' : '#3a3a4e',
    }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {/* Type badge */}
          <span className="text-[14px] px-1.5 py-0.5 uppercase flex-shrink-0" style={{
            fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif',
            letterSpacing: '0.05em',
            backgroundColor: `${TYPE_COLORS[item.type] || '#888'}20`,
            color: TYPE_COLORS[item.type] || '#888',
            borderRadius: '2px',
            border: `1px solid ${TYPE_COLORS[item.type] || '#888'}40`,
          }}>
            {isItemType && itemSubType ? itemSubType.replace('_', ' ') : item.type}
          </span>
          {/* Name */}
          <span className="text-[15px] text-white truncate" style={{
            fontFamily: 'var(--font-terminal), Consolas, monospace',
          }}>{item.name}</span>
          {/* Governor badges (skills) */}
          {governors.length > 0 && (
            <div className="flex gap-0.5 flex-shrink-0">
              {governors.map(gov => (
                <span key={gov} className="text-[11px] px-1 py-0.5" style={{
                  backgroundColor: `${GOV_COLOR[gov] || '#888'}30`,
                  color: GOV_COLOR[gov] || '#888',
                  borderRadius: '2px',
                  fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif',
                }}>{GOV_ABBREV[gov] || gov}</span>
              ))}
            </div>
          )}
          {/* Item detail badges */}
          {isItemType && (
            <div className="flex gap-1 flex-shrink-0">
              {material && (
                <span className="text-[12px] px-1.5 py-0.5" style={{ backgroundColor: '#2a2a3e', borderRadius: '2px', color: 'rgba(255,255,255,0.5)', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
                  {material}
                </span>
              )}
              {rarity && rarity !== 'common' && (
                <span className="text-[12px] px-1.5 py-0.5 uppercase" style={{ backgroundColor: 'rgba(255,255,255,0.04)', borderRadius: '2px', color: 'rgba(255,204,120,0.6)', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif' }}>
                  {rarity.replace('_', ' ')}
                </span>
              )}
            </div>
          )}
          {/* Description preview */}
          {description && !isItemType && (
            <span className="text-[14px] text-gray-500 truncate" style={{
              fontFamily: 'var(--font-terminal), Consolas, monospace',
            }}>{description}</span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Status badge */}
          <span className="text-[14px] px-1.5 py-0.5 uppercase" style={{
            fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif',
            color: STATUS_COLORS[item.status] || '#888',
            border: `1px solid ${STATUS_COLORS[item.status] || '#888'}40`,
            borderRadius: '2px',
          }}>
            {item.status}
          </span>
          {/* GM actions */}
          {isGM && (
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              {item.status === 'draft' && (
                <>
                  <button
                    onClick={() => onPublish(item.id)}
                    className="text-[14px] px-1.5 py-0.5 uppercase"
                    style={{ color: '#22ab94', border: '1px solid rgba(34,171,148,0.3)', borderRadius: '2px', fontFamily: 'var(--font-terminal), Consolas, monospace' }}
                  >Publish</button>
                  <button
                    onClick={() => onDelete(item.id)}
                    className="text-[14px] px-1.5 py-0.5 uppercase"
                    style={{ color: '#E8585A', border: '1px solid rgba(232,88,90,0.3)', borderRadius: '2px', fontFamily: 'var(--font-terminal), Consolas, monospace' }}
                  >Delete</button>
                </>
              )}
              {item.status === 'published' && (
                <>
                  {onPlace && (
                    <button
                      onClick={onPlace}
                      className="text-[14px] px-1.5 py-0.5 uppercase"
                      style={{ color: '#ffcc78', border: '1px solid rgba(255,204,120,0.4)', borderRadius: '2px', fontFamily: 'var(--font-terminal), Consolas, monospace' }}
                    >Place on Canvas</button>
                  )}
                  <button
                    onClick={() => onUnpublish(item.id)}
                    className="text-[14px] px-1.5 py-0.5 uppercase"
                    style={{ color: '#888', border: '1px solid #3a3a4e', borderRadius: '2px', fontFamily: 'var(--font-terminal), Consolas, monospace' }}
                  >Unpublish</button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RequestRow({ request, isGM, onResolve, onRefresh: _onRefresh }: {
  request: PlayerRequest;
  isGM: boolean;
  onResolve: (id: string, status: 'approved' | 'denied') => void;
  onRefresh: () => void;
}) {
  const data = request.data || {};
  const governors = (data.governors as string[]) || [];
  const description = data.description as string | undefined;

  return (
    <div className="p-2.5 border transition-colors group" style={{
      borderRadius: '2px',
      backgroundColor: request.status === 'pending' ? '#1a1a2e' : '#131320',
      borderColor: request.status === 'pending' ? 'rgba(208,160,48,0.3)' : '#2a2a3e',
    }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <span className="text-[14px] px-1.5 py-0.5 uppercase flex-shrink-0" style={{
            fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif',
            letterSpacing: '0.05em',
            backgroundColor: `${TYPE_COLORS[request.type] || '#888'}20`,
            color: TYPE_COLORS[request.type] || '#888',
            borderRadius: '2px',
            border: `1px solid ${TYPE_COLORS[request.type] || '#888'}40`,
          }}>
            {request.type}
          </span>
          <span className="text-[15px] text-white truncate" style={{
            fontFamily: 'var(--font-terminal), Consolas, monospace',
          }}>{request.name}</span>
          {governors.length > 0 && (
            <div className="flex gap-0.5 flex-shrink-0">
              {governors.map(gov => (
                <span key={gov} className="text-[11px] px-1 py-0.5" style={{
                  backgroundColor: `${GOV_COLOR[gov] || '#888'}30`,
                  color: GOV_COLOR[gov] || '#888',
                  borderRadius: '2px',
                  fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif',
                }}>{GOV_ABBREV[gov] || gov}</span>
              ))}
            </div>
          )}
          {description && (
            <span className="text-[13px] text-gray-500 truncate" style={{
              fontFamily: 'var(--font-terminal), Consolas, monospace',
            }}>{description}</span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-[14px] px-1.5 py-0.5 uppercase" style={{
            fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif',
            color: STATUS_COLORS[request.status] || '#888',
            border: `1px solid ${STATUS_COLORS[request.status] || '#888'}40`,
            borderRadius: '2px',
          }}>
            {request.status}
          </span>
          {isGM && request.status === 'pending' && (
            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={() => onResolve(request.id, 'approved')}
                className="text-[14px] px-1.5 py-0.5 uppercase"
                style={{ color: '#22ab94', border: '1px solid rgba(34,171,148,0.3)', borderRadius: '2px', fontFamily: 'var(--font-terminal), Consolas, monospace' }}
              >Approve</button>
              <button
                onClick={() => onResolve(request.id, 'denied')}
                className="text-[14px] px-1.5 py-0.5 uppercase"
                style={{ color: '#E8585A', border: '1px solid rgba(232,88,90,0.3)', borderRadius: '2px', fontFamily: 'var(--font-terminal), Consolas, monospace' }}
              >Deny</button>
            </div>
          )}
          {request.gmNotes && (
            <span className="text-[14px] text-gray-500 italic max-w-32 truncate" style={{
              fontFamily: 'var(--font-terminal), Consolas, monospace',
            }}>{request.gmNotes}</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Blueprint Review Panel ───────────────────────────────────────────────

function ForgeReviewPanel({ result, onConfirm, onReject, onRetry }: {
  result: { type: string; name: string; canonicalName: string; data: Record<string, unknown>; summary: string; suggestedKV: number };
  onConfirm: () => void;
  onReject: () => void;
  onRetry: () => void;
}) {
  const attrs = result.data.attributes as Record<string, number> | undefined;
  const skills = result.data.skills as Array<{ name: string; level: number } | string> | undefined;
  const nectars = result.data.nectars as string[] | undefined;
  const thorns = result.data.thorns as string[] | undefined;
  const description = result.data.description as string | undefined;
  const governors = result.data.governors as string[] | undefined;
  const mechanicalEffect = result.data.mechanicalEffect as string | undefined;
  const itemType = result.data.itemType as string | undefined;
  const material = result.data.material as string | undefined;
  const rarity = result.data.rarity as string | undefined;

  const ATTR_ORDER = ['clout', 'celerity', 'constitution', 'focus', 'flow', 'willpower', 'wisdom', 'wit'];

  return (
    <div className="p-3 border space-y-3" style={{
      borderColor: 'rgba(88, 42, 114,0.4)',
      borderRadius: '3px',
      backgroundColor: 'rgba(88, 42, 114,0.08)',
    }}>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[14px] uppercase tracking-wider" style={{
            color: '#8e7cc3',
            fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif',
          }}>God-head Blueprint</div>
          <div className="text-[15px] mt-1" style={{
            color: 'white',
            fontFamily: 'var(--font-terminal), Consolas, monospace',
          }}>
            {result.canonicalName}
            {result.canonicalName !== result.name && (
              <span className="text-[12px] ml-2" style={{ color: 'rgba(255,255,255,0.3)' }}>
                (was: {result.name})
              </span>
            )}
          </div>
        </div>
        <div className="text-[13px] px-2 py-0.5" style={{
          color: '#D0A030',
          backgroundColor: 'rgba(208,160,48,0.1)',
          border: '1px solid rgba(208,160,48,0.3)',
          borderRadius: '2px',
          fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif',
        }}>
          KV: {result.suggestedKV.toLocaleString()}
        </div>
      </div>

      {/* Description */}
      {description && (
        <div className="text-[13px] italic" style={{
          color: 'rgba(255,255,255,0.6)',
          fontFamily: 'var(--font-terminal), Consolas, monospace',
        }}>{description}</div>
      )}

      {/* Skill governors */}
      {governors && governors.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {governors.map(gov => (
            <span key={gov} className="text-[12px] px-1.5 py-0.5 uppercase" style={{
              backgroundColor: `${GOV_COLOR[gov] || '#888'}20`,
              color: GOV_COLOR[gov] || '#888',
              borderRadius: '2px',
              fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif',
              border: `1px solid ${GOV_COLOR[gov] || '#888'}30`,
            }}>{GOV_ABBREV[gov] || gov}</span>
          ))}
        </div>
      )}

      {/* Item details */}
      {itemType && (
        <div className="flex flex-wrap gap-2">
          <StatBadge label="Type" value={itemType.replace('_', ' ')} color="#22ab94" />
          {material ? <StatBadge label="Material" value={material} color="#ffcc78" /> : null}
          {rarity && rarity !== 'common' ? <StatBadge label="Rarity" value={rarity.replace('_', ' ')} color="#D0A030" /> : null}
        </div>
      )}

      {/* Mechanical effect (traits) */}
      {mechanicalEffect && (
        <div className="text-[12px] px-2 py-1" style={{
          color: 'rgba(255,255,255,0.5)',
          backgroundColor: 'rgba(255,255,255,0.03)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: '2px',
          fontFamily: 'var(--font-terminal), Consolas, monospace',
        }}>
          <span style={{ color: '#ffcc78', fontSize: '11px' }}>Effect: </span>{mechanicalEffect}
        </div>
      )}

      {/* Core stats row */}
      {(result.type === 'seed' || result.type === 'root' || result.type === 'branch') && (
        <div className="flex flex-wrap gap-2">
          {result.data.baseFateDie ? (
            <StatBadge label="Fate Die" value={String(result.data.baseFateDie)} color="#ffcc78" />
          ) : null}
          {result.data.frequency != null ? (
            <StatBadge label="Freq" value={String(result.data.frequency)} color="#582a72" />
          ) : null}
          {result.data.baseResist != null ? (
            <StatBadge label="Resist" value={String(result.data.baseResist)} color="#002f6c" />
          ) : null}
          {result.data.ageAdded != null ? (
            <StatBadge label="Age+" value={String(result.data.ageAdded)} color="#888" />
          ) : null}
        </div>
      )}

      {/* Attributes */}
      {attrs && (
        <div>
          <div className="text-[11px] uppercase tracking-wider mb-1" style={{
            color: 'rgba(255,255,255,0.35)',
            fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif',
          }}>Attributes</div>
          <div className="flex flex-wrap gap-1">
            {ATTR_ORDER.map(attr => {
              const val = attrs[attr] ?? 0;
              if (val === 0) return null;
              return (
                <span key={attr} className="text-[12px] px-1.5 py-0.5" style={{
                  backgroundColor: `${GOV_COLOR[attr] || '#888'}20`,
                  color: GOV_COLOR[attr] || '#888',
                  borderRadius: '2px',
                  fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif',
                  border: `1px solid ${GOV_COLOR[attr] || '#888'}30`,
                }}>
                  {GOV_ABBREV[attr]} {val}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Skills */}
      {skills && skills.length > 0 && (
        <div>
          <div className="text-[11px] uppercase tracking-wider mb-1" style={{
            color: 'rgba(255,255,255,0.35)',
            fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif',
          }}>Skills</div>
          <div className="flex flex-wrap gap-1">
            {skills.map((s, i) => {
              const name = typeof s === 'string' ? s : s.name;
              const level = typeof s === 'string' ? null : s.level;
              return (
                <span key={i} className="text-[12px] px-1.5 py-0.5" style={{
                  backgroundColor: '#ffcc7820',
                  color: '#ffcc78',
                  borderRadius: '2px',
                  fontFamily: 'var(--font-terminal), Consolas, monospace',
                  border: '1px solid #ffcc7830',
                }}>
                  {name}{level != null ? ` (${level})` : ''}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {/* Nectars & Thorns */}
      {nectars && nectars.length > 0 && (
        <div>
          <div className="text-[11px] uppercase tracking-wider mb-1" style={{
            color: 'rgba(255,255,255,0.35)',
            fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif',
          }}>Nectars</div>
          <div className="flex flex-wrap gap-1">
            {nectars.map((n, i) => (
              <span key={i} className="text-[12px] px-1.5 py-0.5" style={{
                backgroundColor: 'rgba(62,184,154,0.15)',
                color: '#3EB89A',
                borderRadius: '2px',
                fontFamily: 'var(--font-terminal), Consolas, monospace',
                border: '1px solid rgba(62,184,154,0.3)',
              }}>{n}</span>
            ))}
          </div>
        </div>
      )}
      {thorns && thorns.length > 0 && (
        <div>
          <div className="text-[11px] uppercase tracking-wider mb-1" style={{
            color: 'rgba(255,255,255,0.35)',
            fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif',
          }}>Thorns</div>
          <div className="flex flex-wrap gap-1">
            {thorns.map((t, i) => (
              <span key={i} className="text-[12px] px-1.5 py-0.5" style={{
                backgroundColor: 'rgba(232,88,90,0.15)',
                color: '#E8585A',
                borderRadius: '2px',
                fontFamily: 'var(--font-terminal), Consolas, monospace',
                border: '1px solid rgba(232,88,90,0.3)',
              }}>{t}</span>
            ))}
          </div>
        </div>
      )}

      {/* GM-facing summary — chain internals are intentionally hidden */}
      <div className="text-[12px] px-2 py-1.5" style={{
        color: 'rgba(255,255,255,0.7)',
        backgroundColor: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '2px',
        fontFamily: 'var(--font-terminal), Consolas, monospace',
      }}>
        {result.summary}
      </div>

      {/* Action buttons */}
      <div className="flex gap-2">
        <button
          onClick={onConfirm}
          className="text-[14px] px-3 py-1 uppercase tracking-wider"
          style={{
            color: '#22ab94',
            border: '1px solid rgba(34,171,148,0.4)',
            borderRadius: '2px',
            fontFamily: 'var(--font-terminal), Consolas, monospace',
          }}
        >
          ✓ Accept Blueprint
        </button>
        <button
          onClick={onRetry}
          className="text-[14px] px-3 py-1 uppercase tracking-wider"
          style={{
            color: '#D0A030',
            border: '1px solid rgba(208,160,48,0.3)',
            borderRadius: '2px',
            fontFamily: 'var(--font-terminal), Consolas, monospace',
          }}
        >
          ⟳ Reforge
        </button>
        <button
          onClick={onReject}
          className="text-[14px] px-3 py-1 uppercase tracking-wider"
          style={{
            color: '#888',
            border: '1px solid #3a3a4e',
            borderRadius: '2px',
            fontFamily: 'var(--font-terminal), Consolas, monospace',
          }}
        >
          ✗ Discard
        </button>
      </div>
    </div>
  );
}

function StatBadge({ label, value, color }: { label: string; value: string; color: string }) {
  return (
    <div className="text-[12px] px-1.5 py-0.5" style={{
      backgroundColor: `${color}15`,
      border: `1px solid ${color}30`,
      borderRadius: '2px',
      fontFamily: 'var(--font-terminal), Consolas, monospace',
    }}>
      <span style={{ color: 'rgba(255,255,255,0.4)', fontSize: '11px' }}>{label} </span>
      <span style={{ color }}>{value}</span>
    </div>
  );
}


// ── Material Designer ────────────────────────────────────────────────────

const ALL_MODS: MaterialMod[] = [
  'Dampening', 'Heat Resistant', 'Cold Resistant', 'Decay Resistant', 'Energy Resistant',
  'Piercing Resistant', 'Slashing Resistant', 'Bashing Resistant', 'Proof',
  'Vulnerable', 'Heat Intolerance', 'Cold Intolerance', 'Flammable', 'Combustible',
  'Flexible', 'Restrictive', 'Protective', 'Brittle', 'Fragile',
  'Sharp', 'Absorbent', 'Unrepairable', 'Conductive', 'Insulating',
];

const MOD_COLORS: Record<string, string> = {
  // Resistances — green
  'Dampening': '#4ade80', 'Heat Resistant': '#4ade80', 'Cold Resistant': '#4ade80',
  'Decay Resistant': '#4ade80', 'Energy Resistant': '#4ade80', 'Piercing Resistant': '#4ade80',
  'Slashing Resistant': '#4ade80', 'Bashing Resistant': '#4ade80', 'Proof': '#22d3ee',
  // Vulnerabilities — red/orange
  'Vulnerable': '#f87171', 'Heat Intolerance': '#f87171', 'Cold Intolerance': '#f87171',
  'Flammable': '#fb923c', 'Combustible': '#ef4444',
  // Physical — blue/white
  'Flexible': '#60a5fa', 'Restrictive': '#f87171', 'Protective': '#22d3ee',
  'Brittle': '#fb923c', 'Fragile': '#fb923c', 'Sharp': '#c4b5fd',
  'Absorbent': '#60a5fa', 'Unrepairable': '#f87171', 'Conductive': '#fbbf24', 'Insulating': '#60a5fa',
};

function MaterialDesigner() {
  const [isOpen, setIsOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [expandedMaterial, setExpandedMaterial] = useState<string | null>(null);

  // Create form state
  const [newName, setNewName] = useState('');
  const [newResistType, setNewResistType] = useState<ResistType>('hard');
  const [newBaseResist, setNewBaseResist] = useState(15);
  const [newBaseWeight, setNewBaseWeight] = useState(3);
  const [newValueRating, setNewValueRating] = useState(3);
  const [newMods, setNewMods] = useState<Set<MaterialMod>>(new Set());
  const [newDesc, setNewDesc] = useState('');
  const [customMaterials, setCustomMaterials] = useState<Material[]>([]);

  const allMaterials = [...Object.values(MATERIAL_CATALOG), ...customMaterials];

  const toggleMod = (mod: MaterialMod) => {
    const next = new Set(newMods);
    if (next.has(mod)) next.delete(mod); else next.add(mod);
    setNewMods(next);
  };

  const handleCreate = () => {
    if (!newName.trim()) return;
    const mat: Material = {
      name: newName.trim(),
      resistType: newResistType,
      baseResist: newBaseResist,
      baseWeight: newBaseWeight,
      valueRating: newValueRating,
      mods: Array.from(newMods) as MaterialMod[],
      description: newDesc.trim() || undefined,
    };
    setCustomMaterials(prev => [...prev, mat]);
    // Reset form
    setNewName('');
    setNewBaseResist(15);
    setNewBaseWeight(3);
    setNewValueRating(3);
    setNewMods(new Set());
    setNewDesc('');
    setShowCreate(false);
  };

  const inputStyle = {
    borderColor: '#3a3a4e', borderRadius: '2px', fontFamily: 'var(--font-terminal), Consolas, monospace',
    background: 'transparent', outline: 'none', color: 'white',
  };

  return (
    <div className="border-t pt-4" style={{ borderColor: 'rgba(255,204,120,0.15)' }}>
      {/* Header (always visible) */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between mb-2"
      >
        <div className="text-[16px] uppercase tracking-wider flex items-center gap-2" style={{
          color: '#22ab94',
          fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif',
        }}>
          <span>{'\u2B23'}</span>
          Material Catalog ({allMaterials.length})
        </div>
        <span style={{ color: '#22ab94', fontSize: 14 }}>{isOpen ? '\u25B2' : '\u25BC'}</span>
      </button>

      {isOpen && (
        <div className="space-y-2">
          {/* Create button */}
          <button
            onClick={() => setShowCreate(!showCreate)}
            className="px-3 py-1.5 text-[13px] uppercase tracking-wider transition-colors"
            style={{
              fontFamily: 'var(--font-terminal), Consolas, monospace',
              color: '#22ab94',
              border: '1px solid rgba(34,171,148,0.4)',
              backgroundColor: showCreate ? 'rgba(34,171,148,0.15)' : 'transparent',
              borderRadius: '2px',
            }}
          >
            + New Material
          </button>

          {/* Create Form */}
          {showCreate && (
            <div className="p-4 border space-y-3" style={{ borderColor: 'rgba(34,171,148,0.3)', borderRadius: '3px', backgroundColor: '#1a1a2e' }}>
              <div className="text-[15px] uppercase tracking-wider" style={{ color: '#22ab94', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif' }}>
                Design New Material
              </div>

              {/* Name */}
              <div className="flex gap-2 items-center">
                <label className="text-[14px] text-gray-400 w-16 flex-shrink-0">Name:</label>
                <input type="text" value={newName} onChange={e => setNewName(e.target.value)}
                  placeholder="Material name..."
                  className="flex-1 text-[14px] px-2 py-1 border" style={inputStyle} autoFocus />
              </div>

              {/* Resist Type */}
              <div className="flex gap-2 items-center">
                <label className="text-[14px] text-gray-400 w-16 flex-shrink-0">Type:</label>
                <div className="flex gap-2">
                  {(['soft', 'hard'] as ResistType[]).map(rt => (
                    <button key={rt} type="button" onClick={() => setNewResistType(rt)}
                      className="text-[14px] px-3 py-1 uppercase"
                      style={{
                        borderRadius: '2px',
                        fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif',
                        backgroundColor: newResistType === rt ? '#22ab94' : '#2a2a3e',
                        color: newResistType === rt ? 'white' : '#666',
                        border: `1px solid ${newResistType === rt ? '#22ab94' : '#3a3a4e'}`,
                      }}
                    >{rt}</button>
                  ))}
                </div>
              </div>

              {/* Stats */}
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="text-[12px] text-gray-500 block">Resist (1-50)</label>
                  <input type="number" min={1} max={50} value={newBaseResist} onChange={e => setNewBaseResist(Number(e.target.value))}
                    className="w-full text-[14px] px-1 py-1 border" style={inputStyle} />
                </div>
                <div>
                  <label className="text-[12px] text-gray-500 block">Weight (1-6)</label>
                  <input type="number" min={1} max={6} value={newBaseWeight} onChange={e => setNewBaseWeight(Number(e.target.value))}
                    className="w-full text-[14px] px-1 py-1 border" style={inputStyle} />
                </div>
                <div>
                  <label className="text-[12px] text-gray-500 block">Value (1-10)</label>
                  <input type="number" min={1} max={10} value={newValueRating} onChange={e => setNewValueRating(Number(e.target.value))}
                    className="w-full text-[14px] px-1 py-1 border" style={inputStyle} />
                </div>
              </div>

              {/* Modifiers */}
              <div>
                <label className="text-[12px] text-gray-500 block mb-1">Modifiers</label>
                <div className="flex flex-wrap gap-1">
                  {ALL_MODS.map(mod => (
                    <button key={mod} type="button" onClick={() => toggleMod(mod)}
                      className="text-[12px] px-2 py-0.5 transition-colors"
                      style={{
                        borderRadius: '2px',
                        fontFamily: 'var(--font-terminal), Consolas, monospace',
                        backgroundColor: newMods.has(mod) ? `${MOD_COLORS[mod] || '#888'}25` : '#2a2a3e',
                        color: newMods.has(mod) ? (MOD_COLORS[mod] || '#888') : '#555',
                        border: `1px solid ${newMods.has(mod) ? `${MOD_COLORS[mod] || '#888'}50` : '#3a3a4e'}`,
                      }}
                    >{mod}</button>
                  ))}
                </div>
              </div>

              {/* Description */}
              <div className="flex gap-2 items-start">
                <label className="text-[14px] text-gray-400 w-16 flex-shrink-0 pt-1">Desc:</label>
                <input type="text" value={newDesc} onChange={e => setNewDesc(e.target.value)}
                  placeholder="Flavor text..."
                  className="flex-1 text-[14px] px-2 py-1 border" style={inputStyle} />
              </div>

              {/* Actions */}
              <div className="flex gap-2 pt-1">
                <button onClick={handleCreate} disabled={!newName.trim()}
                  className="text-[14px] px-3 py-1 uppercase tracking-wider"
                  style={{
                    color: newName.trim() ? '#22ab94' : '#666',
                    border: `1px solid ${newName.trim() ? 'rgba(34,171,148,0.4)' : '#3a3a4e'}`,
                    borderRadius: '2px',
                    fontFamily: 'var(--font-terminal), Consolas, monospace',
                  }}
                >Create</button>
                <button onClick={() => setShowCreate(false)}
                  className="text-[14px] px-3 py-1 uppercase tracking-wider text-gray-500"
                  style={{ border: '1px solid #3a3a4e', borderRadius: '2px', fontFamily: 'var(--font-terminal), Consolas, monospace' }}
                >Cancel</button>
              </div>
            </div>
          )}

          {/* Material List */}
          <div className="space-y-1">
            {allMaterials.map(mat => {
              const isCustom = customMaterials.includes(mat);
              const isExpanded = expandedMaterial === mat.name;
              return (
                <div key={mat.name}
                  className="border transition-colors cursor-pointer"
                  style={{
                    borderRadius: '2px',
                    backgroundColor: isExpanded ? '#1a1a2e' : '#131320',
                    borderColor: isCustom ? 'rgba(34,171,148,0.3)' : '#2a2a3e',
                    padding: isExpanded ? '10px 12px' : '6px 12px',
                  }}
                  onClick={() => setExpandedMaterial(isExpanded ? null : mat.name)}
                >
                  {/* Compact row */}
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-[15px] text-white" style={{ fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
                        {mat.name}
                      </span>
                      <span className="text-[12px] px-1.5 py-0.5 uppercase" style={{
                        borderRadius: '2px',
                        fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif',
                        backgroundColor: mat.resistType === 'soft' ? 'rgba(96,165,250,0.15)' : 'rgba(251,191,36,0.15)',
                        color: mat.resistType === 'soft' ? '#60a5fa' : '#fbbf24',
                        border: `1px solid ${mat.resistType === 'soft' ? 'rgba(96,165,250,0.3)' : 'rgba(251,191,36,0.3)'}`,
                      }}>
                        {mat.resistType}
                      </span>
                      {isCustom && (
                        <span className="text-[11px] px-1 py-0.5" style={{
                          borderRadius: '2px', backgroundColor: 'rgba(34,171,148,0.15)',
                          color: '#22ab94', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif',
                        }}>custom</span>
                      )}
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-[13px]" style={{ color: '#22ab94', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
                        R{mat.baseResist}
                      </span>
                      <span className="text-[13px]" style={{ color: '#c0c0c0', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
                        W{mat.baseWeight}
                      </span>
                    </div>
                  </div>

                  {/* Expanded details */}
                  {isExpanded && (
                    <div className="mt-2 pt-2 border-t space-y-2" style={{ borderColor: '#3a3a4e' }}>
                      {mat.description && (
                        <div className="text-[13px]" style={{ color: 'rgba(255,255,255,0.5)', fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
                          {mat.description}
                        </div>
                      )}
                      <div className="grid grid-cols-3 gap-3 text-center">
                        <div>
                          <div className="text-[11px] uppercase" style={{ color: 'rgba(255,255,255,0.3)', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif' }}>Resist</div>
                          <div className="text-[16px] font-bold" style={{ color: '#22ab94', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif' }}>{mat.baseResist}</div>
                        </div>
                        <div>
                          <div className="text-[11px] uppercase" style={{ color: 'rgba(255,255,255,0.3)', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif' }}>Weight</div>
                          <div className="text-[16px] font-bold" style={{ color: '#c0c0c0', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif' }}>{mat.baseWeight}</div>
                        </div>
                        <div>
                          <div className="text-[11px] uppercase" style={{ color: 'rgba(255,255,255,0.3)', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif' }}>Value</div>
                          <div className="text-[16px] font-bold" style={{ color: '#c4b5fd', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif' }}>{mat.valueRating}</div>
                        </div>
                      </div>
                      {mat.mods.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {mat.mods.map(mod => (
                            <span key={mod} className="text-[12px] px-2 py-0.5" style={{
                              borderRadius: '2px',
                              fontFamily: 'var(--font-terminal), Consolas, monospace',
                              backgroundColor: `${MOD_COLORS[mod] || '#888'}15`,
                              color: MOD_COLORS[mod] || '#888',
                              border: `1px solid ${MOD_COLORS[mod] || '#888'}30`,
                            }}>{mod}</span>
                          ))}
                        </div>
                      )}
                      {isCustom && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setCustomMaterials(prev => prev.filter(m => m.name !== mat.name));
                            setExpandedMaterial(null);
                          }}
                          className="text-[13px] px-2 py-1 uppercase tracking-wider"
                          style={{ color: '#E8585A', border: '1px solid rgba(232,88,90,0.3)', borderRadius: '2px', fontFamily: 'var(--font-terminal), Consolas, monospace' }}
                        >Delete</button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
