'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import type { GrowthCharacter } from '@/types/growth';
import type { GrowthLocation } from '@/types/location';
import type { GrowthWorldItem } from '@/types/item';

function formatKrma(value: string): string {
  return Number(value).toLocaleString();
}

const RelationsCanvas = dynamic(() => import('@/components/canvas/RelationsCanvas'), { ssr: false });
const CampaignTerminal = dynamic(() => import('@/components/terminal/CampaignTerminal'), { ssr: false });
const ForgePanel = dynamic(() => import('@/components/forge/ForgePanel'), { ssr: false });

interface CanvasNode {
  id: string;
  type: 'character' | 'npc' | 'location' | 'quest' | 'item';
  name: string;
  x: number;
  y: number;
  status?: string;
  color?: string;
  portrait?: string | null;
  characterData?: Record<string, unknown> | null;
  locationType?: string;
  locationData?: GrowthLocation | null;
  itemType?: string;
  itemData?: GrowthWorldItem | null;
  holderName?: string;
  locationName?: string;
}

interface Connection {
  from: string;
  to: string;
  type: 'alliance' | 'conflict' | 'goal' | 'resistance' | 'opportunity';
  strength: number;
}

interface CampaignCanvasProps {
  campaign: {
    id: string;
    name: string;
    inviteCode: string | null;
    genre: string | null;
  };
  nodes: CanvasNode[];
  connections: Connection[];
  userId?: string;
  username?: string;
  userRole?: string;
  userCharacter?: { id: string; name: string; data: string } | null;
}

type Tab = 'relations' | 'forge' | 'encounters' | 'essence';

const MIN_TERMINAL_HEIGHT = 150;
const MAX_TERMINAL_FRACTION = 0.8;

interface CampaignEconomyData {
  fluid: string;
  crystallized: string;
  total: string;
}

export default function CampaignCanvas({ campaign, nodes: initialNodes, connections, userId, username, userRole, userCharacter }: CampaignCanvasProps) {
  const [activeTab, setActiveTab] = useState<Tab>('relations');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [nodes, setNodes] = useState(initialNodes);
  const [showTerminal, setShowTerminal] = useState(false);
  const router = useRouter();

  // KRMA economy data (GM / Admin)
  const isGM = userRole === 'WATCHER' || userRole === 'ADMIN' || userRole === 'GODHEAD';
  const [economy, setEconomy] = useState<CampaignEconomyData | null>(null);

  useEffect(() => {
    if (!isGM) return;
    let cancelled = false;

    async function fetchEconomy() {
      try {
        const res = await fetch(`/api/krma/campaigns/${campaign.id}/economy`);
        if (!res.ok) return;
        if (!cancelled) {
          const data = await res.json();
          setEconomy({ fluid: data.fluid, crystallized: data.crystallized, total: data.total });
        }
      } catch { /* silent */ }
    }

    fetchEconomy();
    const interval = setInterval(fetchEconomy, 30000);
    return () => { cancelled = true; clearInterval(interval); };
  }, [isGM, campaign.id]);

  // Resizable terminal height — persisted per campaign
  const storageKey = `terminal-height-${campaign.id}`;
  const [terminalHeight, setTerminalHeight] = useState(() => {
    if (typeof window === 'undefined') return 350;
    try {
      const stored = localStorage.getItem(storageKey);
      return stored ? parseInt(stored) : 350;
    } catch { return 350; }
  });
  const isResizing = useRef(false);
  const mainRef = useRef<HTMLElement>(null);

  // Persist terminal height
  useEffect(() => {
    try { localStorage.setItem(storageKey, String(terminalHeight)); } catch { /* ignore */ }
  }, [terminalHeight, storageKey]);

  // Parse user's character data for terminal
  const parsedCharacter = userCharacter ? (() => {
    try {
      return {
        id: userCharacter.id,
        name: userCharacter.name,
        data: JSON.parse(userCharacter.data) as GrowthCharacter,
      };
    } catch { return null; }
  })() : null;

  // Sync local nodes when server re-fetches (e.g. after revert)
  useEffect(() => {
    setNodes(initialNodes);
  }, [initialNodes]);

  // Debounced save: collect rapid changes and persist once after settling
  const saveTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const handleCharacterUpdate = useCallback((nodeId: string, character: GrowthCharacter, changes: string[]) => {
    // Update local state immediately for responsive UI
    setNodes(prev => prev.map(n =>
      n.id === nodeId ? { ...n, characterData: character as unknown as Record<string, unknown> } : n
    ));

    // Debounce the API save (300ms) so rapid slider drags don't spam requests
    const existing = saveTimersRef.current.get(nodeId);
    if (existing) clearTimeout(existing);

    saveTimersRef.current.set(nodeId, setTimeout(async () => {
      saveTimersRef.current.delete(nodeId);
      try {
        await fetch(`/api/characters/${nodeId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ data: character }),
        });
      } catch {
        // Silent fail — next interaction will retry
      }
    }, 300));
  }, []);

  const handleCreateCharacter = useCallback(async (name: string) => {
    try {
      const res = await fetch('/api/characters', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, campaignId: campaign.id }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Failed to create character');
        return;
      }
      router.refresh();
    } catch {
      alert('Connection failed');
    }
  }, [campaign.id, router]);

  const handleCreateLocation = useCallback(async (name: string, type: string) => {
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}/locations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, type }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Failed to create location');
        return;
      }
      router.refresh();
    } catch {
      alert('Connection failed');
    }
  }, [campaign.id, router]);

  const handleCreateItem = useCallback(async (name: string, type: string) => {
    try {
      const res = await fetch(`/api/campaigns/${campaign.id}/items`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, type }),
      });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Failed to create item');
        return;
      }
      router.refresh();
    } catch {
      alert('Connection failed');
    }
  }, [campaign.id, router]);

  const handleDeleteLocation = useCallback(async (nodeId: string) => {
    if (!confirm('Delete this location?')) return;
    try {
      await fetch(`/api/campaigns/${campaign.id}/locations/${nodeId}`, { method: 'DELETE' });
      router.refresh();
    } catch {
      alert('Connection failed');
    }
  }, [campaign.id, router]);

  const handleDeleteItem = useCallback(async (nodeId: string) => {
    if (!confirm('Delete this item?')) return;
    try {
      await fetch(`/api/campaigns/${campaign.id}/items/${nodeId}`, { method: 'DELETE' });
      router.refresh();
    } catch {
      alert('Connection failed');
    }
  }, [campaign.id, router]);

  const handleDeleteCharacter = useCallback(async () => {
    if (!deleteTarget) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/characters/${deleteTarget}`, { method: 'DELETE' });
      if (!res.ok) {
        const data = await res.json();
        alert(data.error || 'Failed to delete character');
        return;
      }
      router.refresh();
    } catch {
      alert('Connection failed');
    } finally {
      setIsDeleting(false);
      setDeleteTarget(null);
    }
  }, [deleteTarget, router]);

  // ── Resize handler ──────────────────────────────────────────────────────

  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;

    const startY = e.clientY;
    const startHeight = terminalHeight;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!isResizing.current) return;
      const dy = startY - moveEvent.clientY;
      const mainEl = mainRef.current;
      const maxHeight = mainEl ? mainEl.clientHeight * MAX_TERMINAL_FRACTION : 600;
      const newHeight = Math.max(MIN_TERMINAL_HEIGHT, Math.min(maxHeight, startHeight + dy));
      setTerminalHeight(newHeight);
    };

    const handleMouseUp = () => {
      isResizing.current = false;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.body.style.cursor = 'ns-resize';
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [terminalHeight]);

  const tabs: { key: Tab; label: string }[] = [
    { key: 'relations', label: 'Relations' },
    { key: 'forge', label: 'Forge' },
    { key: 'encounters', label: 'Encounters' },
    { key: 'essence', label: 'Essence' },
  ];

  return (
    <div className="h-screen bg-[var(--surface-dark)] flex flex-col overflow-hidden">
      {/* Compact header bar */}
      <header className="bg-[var(--surface-dark)] border-b border-[var(--accent-teal)]/30 flex-shrink-0 relative z-[60]">
        {/* Micro bar — window controls */}
        <div className="flex items-center justify-between px-3 py-0.5 bg-black/20 border-b border-[var(--accent-teal)]/20">
          <div className="flex items-center gap-1.5">
            <div className="w-[6px] h-[6px] bg-[var(--pillar-body)]" />
            <div className="w-[6px] h-[6px] bg-[var(--pillar-soul)]" />
            <div className="w-[6px] h-[6px] bg-[#002F6C]" />
          </div>
          <span className="text-[var(--accent-teal)]/40 text-[8px] tracking-[0.3em] font-[family-name:var(--font-terminal)]">
            CANVAS://relations.layer.0
          </span>
          <span className="text-[var(--accent-teal)]/30 text-[8px]">&#x2298; &#x2295;</span>
        </div>

        {/* Main header content */}
        <div className="px-4 py-2 flex items-center justify-between">
          {/* Left: back + campaign name */}
          <div className="flex items-center gap-4">
            <Link
              href="/terminal"
              className="text-[var(--accent-teal)]/50 hover:text-[var(--accent-teal)] text-sm font-[family-name:var(--font-terminal)] transition-colors"
            >
              &larr;
            </Link>
            <div>
              <h1 className="text-white text-sm font-[family-name:var(--font-header)] uppercase tracking-[0.15em]">
                {campaign.name}
              </h1>
              {campaign.genre && (
                <span className="text-white/30 text-[9px] font-[family-name:var(--font-terminal)]">
                  {campaign.genre}
                </span>
              )}
            </div>
          </div>

          {/* Center: tab navigation */}
          <div className="flex">
            {tabs.map((tab, i) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`py-1.5 px-4 text-xs uppercase tracking-[0.2em] font-[family-name:var(--font-terminal)] border border-[var(--accent-teal)]/40 transition-colors ${
                  i > 0 ? 'border-l-0' : ''
                } ${
                  activeTab === tab.key
                    ? 'bg-[var(--accent-teal)] text-black'
                    : 'bg-transparent text-[var(--accent-teal)]/50 hover:text-[var(--accent-teal)]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Right: KRMA readout + invite code */}
          <div className="text-right flex items-center gap-4">
            {isGM && economy && (
              <div className="flex items-center gap-0">
                {/* Gold KRMA bar — purple text */}
                <div
                  className="px-5 py-2 flex items-center gap-3"
                  style={{ background: 'linear-gradient(90deg, #D4A830, #E8C848, #D4A830)' }}
                >
                  <span
                    className="uppercase leading-none"
                    style={{ fontFamily: '"Bebas Neue", Impact, sans-serif', fontSize: '32px', color: '#582a72', fontWeight: 'bold', letterSpacing: '-0.01em' }}
                  >
                    {formatKrma(economy.total)}
                  </span>
                  <span className="leading-none" style={{ fontSize: '28px', color: '#582a72', fontWeight: 'bold', letterSpacing: '0.02em' }}>
                    <span style={{ fontFamily: 'var(--font-inknut-antiqua), "Inknut Antiqua", serif', fontSize: '22px', fontWeight: 900 }}>Ҝ</span>
                    <span style={{ fontFamily: '"Bebas Neue", Impact, sans-serif' }}>RMA</span>
                  </span>
                </div>
                {/* Purple box — fluid */}
                <div
                  className="h-16 min-w-16 px-3 flex flex-col items-center justify-center"
                  style={{ background: '#582a72' }}
                >
                  <span className="text-white text-[18px] font-bold font-[family-name:var(--font-terminal)] leading-none whitespace-nowrap">{formatKrma(economy.fluid)}</span>
                  <span className="text-white/50 text-[10px] tracking-[0.1em] font-[family-name:var(--font-terminal)] leading-none mt-1">FLD</span>
                </div>
                {/* Red box with ] */}
                <div
                  className="h-16 flex items-center"
                  style={{ background: '#E8585A' }}
                >
                  <div className="flex flex-col items-center justify-center px-3">
                    <span className="text-white text-[18px] font-bold font-[family-name:var(--font-terminal)] leading-none whitespace-nowrap">{formatKrma(economy.crystallized)}</span>
                    <span className="text-white/50 text-[10px] tracking-[0.1em] font-[family-name:var(--font-terminal)] leading-none mt-1">CRY</span>
                  </div>
                  <span className="text-white font-bold font-[family-name:var(--font-terminal)] text-[32px] leading-none pr-1.5">]</span>
                </div>
              </div>
            )}
            {campaign.inviteCode && (
              <div className="text-[10px] text-white/40 font-[family-name:var(--font-terminal)]">
                Invite: <span className="text-[var(--accent-gold)]">{campaign.inviteCode}</span>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Canvas content area — fills remaining space */}
      <main ref={mainRef} className="flex-1 relative overflow-hidden">
        {activeTab === 'relations' && (
          <RelationsCanvas
            nodes={nodes}
            connections={connections}
            campaignId={campaign.id}
            onCreateCharacter={handleCreateCharacter}
            onDeleteCharacter={(nodeId) => setDeleteTarget(nodeId)}
            onCharacterUpdate={handleCharacterUpdate}
            onCreateLocation={handleCreateLocation}
            onDeleteLocation={handleDeleteLocation}
            onCreateItem={handleCreateItem}
            onDeleteItem={handleDeleteItem}
          />
        )}

        {activeTab === 'forge' && (
          <ForgePanel
            campaignId={campaign.id}
            isGM={userRole === 'WATCHER' || userRole === 'ADMIN' || userRole === 'GODHEAD'}
            userId={userId || ''}
          />
        )}

        {activeTab === 'encounters' && (
          <div className="h-full overflow-y-auto p-6" style={{ background: 'var(--surface-dark)' }}>
            <div className="max-w-4xl mx-auto space-y-6">
              <div className="text-center mb-6">
                <div className="text-[var(--pillar-body)] text-xs font-[family-name:var(--font-terminal)] tracking-[0.3em] uppercase mb-1">
                  Encounter Manager
                </div>
                <div className="text-white/20 text-[9px] font-[family-name:var(--font-terminal)]">
                  Combat &middot; Social &middot; Exploration &middot; Events
                </div>
              </div>

              {/* Create encounter button */}
              {(userRole === 'WATCHER' || userRole === 'ADMIN' || userRole === 'GODHEAD') && (
                <button
                  onClick={async () => {
                    const name = window.prompt('Encounter name:');
                    if (!name?.trim()) return;
                    try {
                      await fetch(`/api/campaigns/${campaign.id}/encounters`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ name: name.trim(), type: 'combat' }),
                      });
                      router.refresh();
                    } catch { alert('Failed to create encounter'); }
                  }}
                  className="w-full py-3 border border-dashed border-[var(--pillar-body)]/30 text-[var(--pillar-body)]/60 text-xs uppercase tracking-[0.15em] font-[family-name:var(--font-terminal)] hover:border-[var(--pillar-body)]/60 hover:text-[var(--pillar-body)] transition-colors"
                  style={{ background: 'rgba(232,88,90,0.05)' }}
                >
                  + New Encounter
                </button>
              )}

              {/* Encounter list placeholder */}
              <div className="text-center py-12 text-white/20 text-[10px] font-[family-name:var(--font-terminal)]">
                <div className="mb-2">Encounters will appear here once created.</div>
                <div className="text-white/10">
                  Three-phase combat: Intention &rarr; Resolution &rarr; Impact
                </div>
                <div className="text-white/10 mt-1">
                  Action economy: Body / Spirit / Soul pools per participant
                </div>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'essence' && (
          <div className="h-full overflow-y-auto p-6" style={{ background: 'var(--surface-dark)' }}>
            <div className="max-w-4xl mx-auto space-y-6">
              <div className="text-center mb-8">
                <div className="text-[var(--accent-teal)] text-xs font-[family-name:var(--font-terminal)] tracking-[0.3em] uppercase mb-1">
                  Campaign Essence
                </div>
                <div className="text-white/20 text-[9px] font-[family-name:var(--font-terminal)]">
                  GRO.vines &middot; Narrative Threads &middot; Character Arcs
                </div>
              </div>

              {/* GRO.vines overview */}
              <div>
                <div className="text-[var(--accent-teal)] text-[10px] font-[family-name:var(--font-terminal)] tracking-[0.2em] uppercase mb-3 border-b border-[var(--accent-teal)]/20 pb-1">
                  Active GRO.vines
                </div>
                {nodes.filter(n => n.type === 'character' && n.characterData).map(node => {
                  const charData = node.characterData as Record<string, unknown>;
                  const grovines = (charData?.grovines as Array<{ id: string; goal: string; resistance: string; opportunity: string; status: string }>) || [];
                  const active = grovines.filter(v => v.status === 'active');
                  if (active.length === 0) return null;
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
                {nodes.filter(n => n.type === 'character' && n.characterData).every(n => {
                  const charData = n.characterData as Record<string, unknown>;
                  const grovines = (charData?.grovines as Array<{ status: string }>) || [];
                  return grovines.filter(v => v.status === 'active').length === 0;
                }) && (
                  <div className="text-center py-8 text-white/20 text-[10px] font-[family-name:var(--font-terminal)]">
                    No active GRO.vines. Characters can set goals during play or Harvests.
                  </div>
                )}
              </div>

              {/* Traits overview */}
              <div>
                <div className="text-[var(--accent-gold)] text-[10px] font-[family-name:var(--font-terminal)] tracking-[0.2em] uppercase mb-3 border-b border-[var(--accent-gold)]/20 pb-1">
                  Nectars &middot; Blossoms &middot; Thorns
                </div>
                {nodes.filter(n => n.type === 'character' && n.characterData).map(node => {
                  const charData = node.characterData as Record<string, unknown>;
                  const traits = (charData?.traits as Array<{ name: string; type: string; description: string }>) || [];
                  if (traits.length === 0) return null;
                  const nectars = traits.filter(t => t.type === 'nectar');
                  const blossoms = traits.filter(t => t.type === 'blossom');
                  const thorns = traits.filter(t => t.type === 'thorn');
                  return (
                    <div key={node.id} className="mb-4">
                      <div className="text-white text-xs font-bold font-[family-name:var(--font-header)] tracking-wider uppercase mb-2">
                        {node.name}
                      </div>
                      <div className="ml-4 flex flex-wrap gap-2">
                        {nectars.map((t, i) => (
                          <span key={`n-${i}`} className="px-2 py-1 text-[8px] uppercase tracking-wider border rounded-sm" style={{ color: '#4ade80', borderColor: 'rgba(74,222,128,0.3)', background: 'rgba(74,222,128,0.08)' }}>
                            {t.name}
                          </span>
                        ))}
                        {blossoms.map((t, i) => (
                          <span key={`b-${i}`} className="px-2 py-1 text-[8px] uppercase tracking-wider border rounded-sm" style={{ color: '#ffcc78', borderColor: 'rgba(255,204,120,0.3)', background: 'rgba(255,204,120,0.08)' }}>
                            {t.name}
                          </span>
                        ))}
                        {thorns.map((t, i) => (
                          <span key={`t-${i}`} className="px-2 py-1 text-[8px] uppercase tracking-wider border rounded-sm" style={{ color: '#E8585A', borderColor: 'rgba(232,88,90,0.3)', background: 'rgba(232,88,90,0.08)' }}>
                            {t.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Harvests overview */}
              <div>
                <div className="text-[var(--pillar-body)] text-[10px] font-[family-name:var(--font-terminal)] tracking-[0.2em] uppercase mb-3 border-b border-[var(--pillar-body)]/20 pb-1">
                  Harvest Log
                </div>
                {nodes.filter(n => n.type === 'character' && n.characterData).map(node => {
                  const charData = node.characterData as Record<string, unknown>;
                  const harvests = (charData?.harvests as Array<{ id: string; name: string; status: string; activity: string }>) || [];
                  if (harvests.length === 0) return null;
                  return (
                    <div key={node.id} className="mb-3">
                      <div className="text-white text-xs font-bold font-[family-name:var(--font-header)] tracking-wider uppercase mb-1">
                        {node.name}
                      </div>
                      {harvests.map(h => (
                        <div key={h.id} className="ml-4 mb-1 text-[9px] flex items-center gap-2">
                          <span className={`w-1.5 h-1.5 rounded-full ${h.status === 'completed' ? 'bg-[#4ade80]' : h.status === 'active' ? 'bg-[#ffcc78]' : 'bg-white/20'}`} />
                          <span className="text-white/60">{h.name}</span>
                          <span className="text-white/30">&mdash; {h.activity}</span>
                        </div>
                      ))}
                    </div>
                  );
                })}
                {nodes.filter(n => n.type === 'character' && n.characterData).every(n => {
                  const charData = n.characterData as Record<string, unknown>;
                  return ((charData?.harvests as unknown[]) || []).length === 0;
                }) && (
                  <div className="text-center py-4 text-white/20 text-[10px] font-[family-name:var(--font-terminal)]">
                    No harvests recorded yet.
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Campaign Terminal — resizable bottom overlay */}
        <div
          className="absolute bottom-0 left-0 right-0"
          style={{
            height: showTerminal ? `${terminalHeight}px` : '0',
            zIndex: 50,
            pointerEvents: showTerminal ? 'auto' : 'none',
            transition: showTerminal ? 'none' : 'height 0.3s ease-in-out',
          }}
        >
          {/* Toggle tab */}
          <button
            onClick={() => setShowTerminal(prev => !prev)}
            className="absolute -top-6 left-1/2 -translate-x-1/2 px-4 py-1 text-[9px] uppercase tracking-[0.2em] transition-colors"
            style={{
              fontFamily: 'var(--font-terminal), Consolas, monospace',
              color: showTerminal ? '#0a0a1a' : '#22ab94',
              backgroundColor: showTerminal ? '#22ab94' : 'rgba(10, 10, 26, 0.9)',
              border: '1px solid rgba(34, 171, 148, 0.4)',
              borderBottom: showTerminal ? 'none' : undefined,
              borderRadius: '3px 3px 0 0',
              pointerEvents: 'auto',
              zIndex: 51,
            }}
          >
            {showTerminal ? '\u25BC TERMINAL' : '\u25B2 TERMINAL'}
          </button>

          {/* Resize handle */}
          {showTerminal && (
            <div
              onMouseDown={handleResizeStart}
              className="absolute top-0 left-0 right-0 h-[6px] cursor-ns-resize"
              style={{
                zIndex: 52,
                backgroundColor: 'transparent',
              }}
            >
              <div className="absolute top-0 left-1/2 -translate-x-1/2 w-12 h-[3px] rounded-full" style={{
                backgroundColor: 'rgba(34, 171, 148, 0.4)',
                marginTop: '1px',
              }} />
            </div>
          )}

          {/* Panel content */}
          {showTerminal && (
            <div className="h-full border-t" style={{
              borderColor: 'rgba(34, 171, 148, 0.4)',
              backgroundColor: 'rgba(10, 10, 26, 0.95)',
              backdropFilter: 'blur(8px)',
            }}>
              <CampaignTerminal
                campaignId={campaign.id}
                visible={showTerminal}
                character={parsedCharacter}
                onCharacterUpdate={(charId, char, changes) => handleCharacterUpdate(charId, char, changes)}
                onRevert={() => router.refresh()}
                userId={userId}
                username={username}
                userRole={userRole}
              />
            </div>
          )}
        </div>
      </main>

      {/* Delete confirmation dialog */}
      <ConfirmDialog
        isOpen={deleteTarget !== null}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDeleteCharacter}
        title="Delete Character"
        message="Are you sure you want to delete this character? This action cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        isLoading={isDeleting}
        variant="danger"
      />
    </div>
  );
}
