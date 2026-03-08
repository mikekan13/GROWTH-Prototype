"use client";

import React, { useState, useEffect, useCallback } from 'react';
import type { SkillGovernor } from '@/types/growth';
import { SKILL_GOVERNORS } from '@/types/growth';

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
}

// ── Constants ─────────────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
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
  modified: '#7050A8',
};

const GOV_ABBREV: Record<string, string> = {
  clout: 'CLO', celerity: 'CEL', constitution: 'CON',
  flow: 'FLO', focus: 'FOC',
  willpower: 'WIL', wisdom: 'WIS', wit: 'WIT',
};

const GOV_COLOR: Record<string, string> = {
  clout: '#E8585A', celerity: '#E8585A', constitution: '#E8585A',
  flow: '#7050A8', focus: '#7050A8',
  willpower: '#3E78C0', wisdom: '#3E78C0', wit: '#3E78C0',
};

// ── Component ─────────────────────────────────────────────────────────────

export default function ForgePanel({ campaignId, isGM, userId }: ForgePanelProps) {
  const [items, setItems] = useState<ForgeItem[]>([]);
  const [requests, setRequests] = useState<PlayerRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeType, setActiveType] = useState<string>('all');
  const [showCreateForm, setShowCreateForm] = useState(false);

  // Create form state
  const [newType, setNewType] = useState<string>('skill');
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newGovs, setNewGovs] = useState<Set<SkillGovernor>>(new Set());

  const fetchData = useCallback(async () => {
    try {
      const [itemsRes, reqRes] = await Promise.all([
        fetch(`/api/campaigns/${campaignId}/forge${activeType !== 'all' ? `?type=${activeType}` : ''}`),
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

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleCreate = async () => {
    if (!newName.trim()) return;

    const data: Record<string, unknown> = {};
    if (newType === 'skill') {
      if (newGovs.size === 0) return;
      data.governors = Array.from(newGovs);
      if (newDesc.trim()) data.description = newDesc.trim();
    } else if (newType === 'item') {
      if (newDesc.trim()) data.description = newDesc.trim();
    } else {
      data.description = newDesc.trim() || 'No description';
    }

    try {
      const res = await fetch(`/api/campaigns/${campaignId}/forge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: newType, name: newName.trim(), data }),
      });
      if (res.ok) {
        setNewName('');
        setNewDesc('');
        setNewGovs(new Set());
        setShowCreateForm(false);
        fetchData();
      } else {
        const err = await res.json();
        alert(err.error || 'Failed to create');
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

  const toggleGov = (gov: SkillGovernor) => {
    setNewGovs(prev => {
      const next = new Set(prev);
      if (next.has(gov)) next.delete(gov); else next.add(gov);
      return next;
    });
  };

  const canSubmit = newName.trim() && (newType !== 'skill' || newGovs.size > 0);

  const types = ['all', 'skill', 'item', 'nectar', 'blossom', 'thorn'];
  const pendingRequests = requests.filter(r => r.status === 'pending');
  const resolvedRequests = requests.filter(r => r.status !== 'pending');

  return (
    <div className="h-full flex flex-col" style={{ backgroundColor: '#0a0a1a' }}>
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4 border-b" style={{ borderColor: 'rgba(255,204,120,0.2)' }}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <span style={{ color: '#ffcc78', fontSize: '16px' }}>{'\u2692'}</span>
            <h2 className="text-sm uppercase tracking-[0.2em]" style={{
              fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif',
              color: '#ffcc78',
              fontSize: '20px',
            }}>THE FORGE</h2>
          </div>
          {isGM && (
            <button
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="px-3 py-1 text-[12px] uppercase tracking-wider transition-colors"
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
              className="px-2 py-1 text-[11px] uppercase tracking-wider transition-colors"
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
            <div className="text-[12px] uppercase tracking-wider mb-3" style={{ color: '#ffcc78', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif' }}>
              New Design
            </div>
            <div className="space-y-3">
              <div className="flex gap-2 items-center">
                <label className="text-[11px] text-gray-400 w-10">Type:</label>
                <select
                  value={newType}
                  onChange={e => setNewType(e.target.value)}
                  className="text-[12px] bg-transparent text-white outline-none px-2 py-1 border"
                  style={{ borderColor: '#3a3a4e', borderRadius: '2px', fontFamily: 'var(--font-terminal), Consolas, monospace' }}
                >
                  {['skill', 'item', 'nectar', 'blossom', 'thorn'].map(t => (
                    <option key={t} value={t} style={{ backgroundColor: '#1a1a2e' }}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2 items-center">
                <label className="text-[11px] text-gray-400 w-10">Name:</label>
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
                <label className="text-[11px] text-gray-400 w-10 pt-1">Desc:</label>
                <input
                  type="text"
                  value={newDesc}
                  onChange={e => setNewDesc(e.target.value)}
                  placeholder="Description..."
                  className="flex-1 bg-transparent outline-none text-[12px] text-gray-300 px-2 py-1 border"
                  style={{ borderColor: '#3a3a4e', borderRadius: '2px', fontFamily: 'var(--font-terminal), Consolas, monospace' }}
                />
              </div>
              {newType === 'skill' && (
                <div>
                  <label className="text-[11px] text-gray-400 block mb-1">Governors (at least one):</label>
                  <div className="flex flex-wrap gap-1">
                    {SKILL_GOVERNORS.map(gov => (
                      <button
                        key={gov}
                        type="button"
                        onClick={() => toggleGov(gov)}
                        className="text-[10px] px-1.5 py-0.5 transition-colors uppercase"
                        style={{
                          borderRadius: '2px',
                          fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif',
                          letterSpacing: '0.05em',
                          backgroundColor: newGovs.has(gov) ? GOV_COLOR[gov] : '#2a2a3e',
                          color: newGovs.has(gov) ? 'white' : '#666',
                          border: `1px solid ${newGovs.has(gov) ? GOV_COLOR[gov] : '#3a3a4e'}`,
                        }}
                      >
                        {GOV_ABBREV[gov]}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <button
                  onClick={handleCreate}
                  disabled={!canSubmit}
                  className="text-[11px] px-3 py-1 uppercase tracking-wider"
                  style={{
                    color: canSubmit ? '#ffcc78' : '#666',
                    border: `1px solid ${canSubmit ? 'rgba(255,204,120,0.4)' : '#3a3a4e'}`,
                    borderRadius: '2px',
                    fontFamily: 'var(--font-terminal), Consolas, monospace',
                  }}
                >
                  Create
                </button>
                <button
                  onClick={() => { setShowCreateForm(false); setNewName(''); setNewDesc(''); setNewGovs(new Set()); }}
                  className="text-[11px] px-3 py-1 uppercase tracking-wider text-gray-500"
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
            <div className="text-[12px] uppercase tracking-wider mb-2 flex items-center gap-2" style={{
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
          <div className="text-center py-8 text-[13px]" style={{
            fontFamily: 'var(--font-terminal), Consolas, monospace',
            color: 'rgba(255,204,120,0.3)',
          }}>Loading forge...</div>
        ) : items.length === 0 && pendingRequests.length === 0 ? (
          <div className="text-center py-12">
            <div className="text-[13px] mb-1" style={{
              fontFamily: 'var(--font-terminal), Consolas, monospace',
              color: 'rgba(255,204,120,0.3)',
            }}>Forge is empty</div>
            <div className="text-[11px]" style={{
              fontFamily: 'var(--font-terminal), Consolas, monospace',
              color: 'rgba(255,255,255,0.15)',
            }}>{isGM ? 'Create designs for your campaign — skills, items, nectars, and more.' : 'Your GM hasn\'t published any designs yet.'}</div>
          </div>
        ) : (
          <div>
            <div className="text-[12px] uppercase tracking-wider mb-2 flex items-center gap-2" style={{
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
                />
              ))}
            </div>
          </div>
        )}

        {/* Resolved requests (collapsed) */}
        {resolvedRequests.length > 0 && (
          <div>
            <div className="text-[12px] uppercase tracking-wider mb-2" style={{
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
      </div>
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────

function ForgeItemRow({ item, isGM, onPublish, onUnpublish, onDelete }: {
  item: ForgeItem;
  isGM: boolean;
  onPublish: (id: string) => void;
  onUnpublish: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const data = item.data || {};
  const governors = (data.governors as string[]) || [];
  const description = data.description as string | undefined;

  return (
    <div className="p-2.5 border transition-colors group" style={{
      borderRadius: '2px',
      backgroundColor: '#1a1a2e',
      borderColor: item.status === 'published' ? 'rgba(34,171,148,0.3)' : '#3a3a4e',
    }}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {/* Type badge */}
          <span className="text-[10px] px-1.5 py-0.5 uppercase flex-shrink-0" style={{
            fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif',
            letterSpacing: '0.05em',
            backgroundColor: `${TYPE_COLORS[item.type] || '#888'}20`,
            color: TYPE_COLORS[item.type] || '#888',
            borderRadius: '2px',
            border: `1px solid ${TYPE_COLORS[item.type] || '#888'}40`,
          }}>
            {item.type}
          </span>
          {/* Name */}
          <span className="text-sm text-white truncate" style={{
            fontFamily: 'var(--font-terminal), Consolas, monospace',
          }}>{item.name}</span>
          {/* Governor badges (skills) */}
          {governors.length > 0 && (
            <div className="flex gap-px flex-shrink-0">
              {governors.map(gov => (
                <span key={gov} className="text-[7px] px-0.5" style={{
                  backgroundColor: `${GOV_COLOR[gov] || '#888'}30`,
                  color: GOV_COLOR[gov] || '#888',
                  borderRadius: '1px',
                  fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif',
                }}>{GOV_ABBREV[gov] || gov}</span>
              ))}
            </div>
          )}
          {/* Description preview */}
          {description && (
            <span className="text-[11px] text-gray-500 truncate" style={{
              fontFamily: 'var(--font-terminal), Consolas, monospace',
            }}>{description}</span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {/* Status badge */}
          <span className="text-[10px] px-1.5 py-0.5 uppercase" style={{
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
                    className="text-[10px] px-1.5 py-0.5 uppercase"
                    style={{ color: '#22ab94', border: '1px solid rgba(34,171,148,0.3)', borderRadius: '2px', fontFamily: 'var(--font-terminal), Consolas, monospace' }}
                  >Publish</button>
                  <button
                    onClick={() => onDelete(item.id)}
                    className="text-[10px] px-1.5 py-0.5 uppercase"
                    style={{ color: '#E8585A', border: '1px solid rgba(232,88,90,0.3)', borderRadius: '2px', fontFamily: 'var(--font-terminal), Consolas, monospace' }}
                  >Delete</button>
                </>
              )}
              {item.status === 'published' && (
                <button
                  onClick={() => onUnpublish(item.id)}
                  className="text-[10px] px-1.5 py-0.5 uppercase"
                  style={{ color: '#888', border: '1px solid #3a3a4e', borderRadius: '2px', fontFamily: 'var(--font-terminal), Consolas, monospace' }}
                >Unpublish</button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RequestRow({ request, isGM, onResolve, onRefresh }: {
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
          <span className="text-[10px] px-1.5 py-0.5 uppercase flex-shrink-0" style={{
            fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif',
            letterSpacing: '0.05em',
            backgroundColor: `${TYPE_COLORS[request.type] || '#888'}20`,
            color: TYPE_COLORS[request.type] || '#888',
            borderRadius: '2px',
            border: `1px solid ${TYPE_COLORS[request.type] || '#888'}40`,
          }}>
            {request.type}
          </span>
          <span className="text-sm text-white truncate" style={{
            fontFamily: 'var(--font-terminal), Consolas, monospace',
          }}>{request.name}</span>
          {governors.length > 0 && (
            <div className="flex gap-px flex-shrink-0">
              {governors.map(gov => (
                <span key={gov} className="text-[7px] px-0.5" style={{
                  backgroundColor: `${GOV_COLOR[gov] || '#888'}30`,
                  color: GOV_COLOR[gov] || '#888',
                  borderRadius: '1px',
                  fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif',
                }}>{GOV_ABBREV[gov] || gov}</span>
              ))}
            </div>
          )}
          {description && (
            <span className="text-[11px] text-gray-500 truncate" style={{
              fontFamily: 'var(--font-terminal), Consolas, monospace',
            }}>{description}</span>
          )}
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="text-[10px] px-1.5 py-0.5 uppercase" style={{
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
                className="text-[10px] px-1.5 py-0.5 uppercase"
                style={{ color: '#22ab94', border: '1px solid rgba(34,171,148,0.3)', borderRadius: '2px', fontFamily: 'var(--font-terminal), Consolas, monospace' }}
              >Approve</button>
              <button
                onClick={() => onResolve(request.id, 'denied')}
                className="text-[10px] px-1.5 py-0.5 uppercase"
                style={{ color: '#E8585A', border: '1px solid rgba(232,88,90,0.3)', borderRadius: '2px', fontFamily: 'var(--font-terminal), Consolas, monospace' }}
              >Deny</button>
            </div>
          )}
          {request.gmNotes && (
            <span className="text-[10px] text-gray-500 italic max-w-32 truncate" style={{
              fontFamily: 'var(--font-terminal), Consolas, monospace',
            }}>{request.gmNotes}</span>
          )}
        </div>
      </div>
    </div>
  );
}
