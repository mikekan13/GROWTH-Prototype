'use client';

import { useState, useEffect, useCallback } from 'react';
import EntitiesPanel from './EntitiesPanel';
import ProfileSummary from '@/components/profile/ProfileSummary';

interface CanvasNode {
  id: string;
  name: string;
  type: string;
  characterData?: unknown;
}

interface TapestryTabProps {
  campaignId: string;
  isGM: boolean;
  nodes: CanvasNode[];
  // In-canvas selection: when an entity is clicked, fire this callback with the
  // character/entity id so the parent can switch to the Character tab loaded with
  // that entity (no /character/[id] navigation).
  onSelectCharacter?: (characterId: string) => void;
}

// --- Member types ---
interface CampaignMemberData {
  id: string;
  status: string;
  joinedAt: string;
  // T28: player has submitted their backstory for the GM's approval.
  backstorySubmitted?: boolean;
  user: {
    id: string;
    username: string;
    role: string;
    profile: string | null;
  };
}

type SubTab = 'applications' | 'entities';

// --- Applications Panel (Interested Players) ---
function ApplicationsPanel({ campaignId }: { campaignId: string }) {
  const [members, setMembers] = useState<CampaignMemberData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actioningId, setActioningId] = useState<string | null>(null);
  const [viewingProfile, setViewingProfile] = useState<CampaignMemberData | null>(null);

  const fetchMembers = useCallback(async () => {
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/members`);
      if (!res.ok) throw new Error('Failed to fetch');
      const data = await res.json();
      setMembers(data.members || []);
    } catch {
      setError('Failed to load members');
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => { fetchMembers(); }, [fetchMembers]);

  const handleAction = async (memberId: string, action: 'BACKSTORY' | 'REJECTED') => {
    setActioningId(memberId);
    try {
      const res = await fetch(`/api/campaigns/${campaignId}/members/${memberId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Action failed');
        return;
      }
      await fetchMembers();
    } catch {
      alert('Network error');
    } finally {
      setActioningId(null);
    }
  };

  if (loading) {
    return (
      <div className="text-center py-12 text-white/20 text-[10px] font-[family-name:var(--font-terminal)]">
        Loading...
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-12 text-[#E8585A]/60 text-[10px] font-[family-name:var(--font-terminal)]">
        {error}
      </div>
    );
  }

  const interested = members.filter(m => m.status === 'INTERESTED');
  const currentPlayers = members.filter(m => ['BACKSTORY', 'CHARACTER_CREATION', 'ACTIVE'].includes(m.status));
  const rejected = members.filter(m => m.status === 'REJECTED');

  const statusColor = (status: string) => {
    switch (status) {
      case 'INTERESTED': return 'var(--accent-gold)';
      case 'BACKSTORY': return '#582a72';
      case 'CHARACTER_CREATION': return 'var(--accent-gold)';
      case 'ACTIVE': return 'var(--accent-teal)';
      case 'REJECTED': return '#888';
      default: return 'rgba(255,255,255,0.25)';
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case 'BACKSTORY': return 'Backstory';
      case 'CHARACTER_CREATION': return 'Character Creation';
      case 'ACTIVE': return 'Active';
      default: return status;
    }
  };

  const renderMemberRow = (member: CampaignMemberData) => {
    const profile = member.user.profile ? (() => { try { return JSON.parse(member.user.profile!); } catch { return null; } })() : null;
    const isInterested = member.status === 'INTERESTED';
    const initial = member.user.username.charAt(0).toUpperCase();
    return (
      <div
        key={member.id}
        className="border p-4"
        style={{ borderColor: `${statusColor(member.status)}33`, background: 'rgba(0,0,0,0.3)' }}
      >
        <div className="flex items-start gap-4">
          {/* Avatar */}
          <button
            onClick={() => setViewingProfile(member)}
            className="shrink-0 w-14 h-14 flex items-center justify-center text-xl font-[family-name:var(--font-header)] border border-white/20 hover:border-[var(--accent-teal)] transition-colors"
            style={{ background: 'rgba(88, 42, 114,0.2)', color: '#fff' }}
          >
            {initial}
          </button>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1">
              <button
                onClick={() => setViewingProfile(member)}
                className="text-white text-sm font-bold font-[family-name:var(--font-header)] tracking-wider hover:text-[var(--accent-teal)] transition-colors"
              >
                {member.user.username}
              </button>
              {profile?.pronouns && (
                <span className="text-white/30 text-[10px] font-[family-name:var(--font-terminal)]">{profile.pronouns}</span>
              )}
              <span
                className="text-[9px] uppercase tracking-[0.15em] font-[family-name:var(--font-terminal)] px-2 py-0.5"
                style={{ background: `${statusColor(member.status)}20`, color: statusColor(member.status) }}
              >
                {statusLabel(member.status)}
              </span>
              {/* T28: player has submitted their backstory for approval. */}
              {member.status === 'BACKSTORY' && member.backstorySubmitted && (
                <span
                  className="text-[9px] uppercase tracking-[0.15em] font-[family-name:var(--font-terminal)] px-2 py-0.5"
                  style={{ background: 'rgba(34,171,148,0.15)', color: 'var(--accent-teal)' }}
                  title="This player submitted their backstory for your approval. Review it, then build their character with them."
                >
                  ✓ Backstory ready
                </span>
              )}
            </div>
            {profile?.bio && (
              <div className="text-white/40 text-xs font-[family-name:var(--font-terminal)] leading-relaxed mb-2 line-clamp-2">
                {profile.bio}
              </div>
            )}
            {profile?.experienceLevel && (
              <div className="text-white/25 text-[10px] font-[family-name:var(--font-terminal)]">
                Experience: <span className="text-white/40">{profile.experienceLevel}</span>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="shrink-0 flex items-center gap-2">
            {isInterested && (
              <>
                <button
                  onClick={() => handleAction(member.id, 'BACKSTORY')}
                  disabled={actioningId === member.id}
                  className="px-4 py-1.5 text-[10px] uppercase tracking-[0.1em] font-[family-name:var(--font-terminal)] bg-[var(--accent-teal)] text-black hover:brightness-110 disabled:opacity-50 transition-colors"
                >
                  {actioningId === member.id ? '...' : 'Accept'}
                </button>
                <button
                  onClick={() => handleAction(member.id, 'REJECTED')}
                  disabled={actioningId === member.id}
                  className="px-4 py-1.5 text-[10px] uppercase tracking-[0.1em] font-[family-name:var(--font-terminal)] border border-white/10 text-white/30 hover:border-[#E8585A]/40 hover:text-[#E8585A] disabled:opacity-50 transition-colors"
                >
                  {actioningId === member.id ? '...' : 'Reject'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  if (members.length === 0) {
    return (
      <div className="text-center py-12 text-white/20 text-[10px] font-[family-name:var(--font-terminal)]">
        No players yet. List your campaign on the Hub to receive interest.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Profile popup */}
      {viewingProfile && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center" style={{ background: 'rgba(0,0,0,0.7)' }} onClick={() => setViewingProfile(null)}>
          <div className="bg-white p-6 max-w-lg w-full max-h-[80vh] overflow-y-auto relative" style={{ borderRadius: '4px' }} onClick={e => e.stopPropagation()}>
            <button
              onClick={() => setViewingProfile(null)}
              className="absolute top-3 right-3 text-[var(--surface-dark)]/40 hover:text-[var(--surface-dark)] text-lg"
            >
              &#x2715;
            </button>
            <ProfileSummary
              username={viewingProfile.user.username}
              role={viewingProfile.user.role}
              profile={viewingProfile.user.profile ? (() => { try { return JSON.parse(viewingProfile.user.profile!); } catch { return null; } })() : null}
            />
            {!viewingProfile.user.profile && (
              <div className="text-sm text-[var(--surface-dark)]/40 italic mt-2">No profile set up yet.</div>
            )}
            {viewingProfile.status === 'INTERESTED' && (
              <div className="flex items-center gap-2 mt-6 pt-4 border-t border-[var(--surface-dark)]/10">
                <button
                  onClick={() => { handleAction(viewingProfile.id, 'BACKSTORY'); setViewingProfile(null); }}
                  className="px-4 py-1.5 text-[10px] uppercase tracking-[0.1em] font-[family-name:var(--font-terminal)] bg-[var(--accent-teal)] text-black hover:brightness-110 transition-colors"
                >
                  Accept
                </button>
                <button
                  onClick={() => { handleAction(viewingProfile.id, 'REJECTED'); setViewingProfile(null); }}
                  className="px-4 py-1.5 text-[10px] uppercase tracking-[0.1em] font-[family-name:var(--font-terminal)] border border-[var(--surface-dark)]/20 text-[var(--surface-dark)]/40 hover:border-[#E8585A]/40 hover:text-[#E8585A] transition-colors"
                >
                  Reject
                </button>
                <button
                  disabled
                  className="px-4 py-1.5 text-[10px] uppercase tracking-[0.1em] font-[family-name:var(--font-terminal)] border border-[var(--surface-dark)]/10 text-[var(--surface-dark)]/20 cursor-not-allowed ml-auto"
                >
                  Message (coming soon)
                </button>
              </div>
            )}
          </div>
        </div>
      )}
      {interested.length > 0 && (
        <div>
          <div className="text-[9px] font-[family-name:var(--font-terminal)] tracking-[0.2em] uppercase mb-2 pb-1 border-b" style={{ color: 'var(--accent-gold)', borderColor: 'rgba(208,160,48,0.2)' }}>
            Interested ({interested.length})
          </div>
          <div className="space-y-2">{interested.map(renderMemberRow)}</div>
        </div>
      )}
      {currentPlayers.length > 0 && (
        <div>
          <div className="text-[9px] font-[family-name:var(--font-terminal)] tracking-[0.2em] uppercase mb-2 pb-1 border-b" style={{ color: 'var(--accent-teal)', borderColor: 'rgba(34,171,148,0.2)' }}>
            Current Players ({currentPlayers.length})
          </div>
          <div className="space-y-2">{currentPlayers.map(renderMemberRow)}</div>
        </div>
      )}
      {rejected.length > 0 && (
        <div>
          <div className="text-[9px] font-[family-name:var(--font-terminal)] tracking-[0.2em] uppercase mb-2 pb-1 border-b" style={{ color: '#888', borderColor: 'rgba(136,136,136,0.2)' }}>
            Rejected ({rejected.length})
          </div>
          <div className="space-y-2">{rejected.map(renderMemberRow)}</div>
        </div>
      )}
    </div>
  );
}

// --- GRO.vines Panel ---
function GrovinesPanel({ nodes }: { nodes: CanvasNode[] }) {
  const characterNodes = nodes.filter(n => n.type === 'character' && n.characterData);

  const nodesWithActiveVines = characterNodes.filter(node => {
    const charData = node.characterData as Record<string, unknown>;
    const grovines = (charData?.grovines as Array<{ status: string }>) || [];
    return grovines.some(v => v.status === 'active');
  });

  if (nodesWithActiveVines.length === 0) {
    return (
      <div className="text-center py-12 text-white/20 text-[10px] font-[family-name:var(--font-terminal)]">
        No active GRO.vines. Characters can set goals during play or Harvests.
      </div>
    );
  }

  return (
    <>
      {nodesWithActiveVines.map(node => {
        const charData = node.characterData as Record<string, unknown>;
        const grovines = (charData?.grovines as Array<{ id: string; goal: string; resistance: string; opportunity: string; status: string }>) || [];
        const active = grovines.filter(v => v.status === 'active');
        return (
          <div key={node.id} className="mb-4">
            <div className="text-white text-xs font-bold font-[family-name:var(--font-header)] tracking-wider uppercase mb-2">
              {node.name}
            </div>
            {active.map(vine => (
              <div key={vine.id} className="ml-4 mb-2 p-3 border-l-2 border-[var(--accent-teal)]/30" style={{ background: 'rgba(34,171,148,0.05)' }}>
                <div className="text-white text-[11px] font-bold mb-1">{vine.goal}</div>
                <div className="grid grid-cols-3 gap-3 text-[9px]">
                  <div>
                    <span className="text-[#4ade80] font-bold">G</span>
                    <span className="text-white/40 ml-1">{vine.goal.length > 30 ? `${vine.goal.substring(0, 30)}...` : vine.goal}</span>
                  </div>
                  <div>
                    <span className="text-[#E8585A] font-bold">R</span>
                    <span className="text-white/40 ml-1">{vine.resistance || 'Hidden'}</span>
                  </div>
                  <div>
                    <span className="text-[#ffcc78] font-bold">O</span>
                    <span className="text-white/40 ml-1">{vine.opportunity || 'Awaiting'}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        );
      })}
    </>
  );
}

// --- Main TapestryTab ---
export default function TapestryTab({ campaignId, isGM, nodes, onSelectCharacter }: TapestryTabProps) {
  const [subTab, setSubTab] = useState<SubTab>(isGM ? 'applications' : 'entities');

  const subTabs: { key: SubTab; label: string; gmOnly?: boolean }[] = [
    ...(isGM ? [{ key: 'applications' as SubTab, label: 'Trailblazers', gmOnly: true }] : []),
    { key: 'entities', label: 'Entities' },
  ];

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--surface-dark)' }}>
      {/* Header with sub-tabs */}
      <div className="flex items-center gap-1 px-6 pt-4 pb-0">
        {subTabs.map(tab => (
          <button
            key={tab.key}
            onClick={() => setSubTab(tab.key)}
            className={`text-[10px] font-[family-name:var(--font-terminal)] tracking-[0.2em] uppercase px-4 py-1.5 transition-colors ${
              subTab === tab.key
                ? 'text-[var(--accent-teal)] border-b-2 border-[var(--accent-teal)]'
                : 'text-white/25 hover:text-white/40 border-b-2 border-transparent'
            }`}
          >
            {tab.label}
          </button>
        ))}
        <span className="text-white/15 text-[8px] font-[family-name:var(--font-terminal)] tracking-wider ml-auto">
          TAPESTRY://narrative.threads
        </span>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto">
          {subTab === 'applications' && isGM && (
            <ApplicationsPanel campaignId={campaignId} />
          )}
          {subTab === 'entities' && (
            <EntitiesPanel campaignId={campaignId} isGM={isGM} onSelectCharacter={onSelectCharacter} />
          )}
        </div>
      </div>
    </div>
  );
}
