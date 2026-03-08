'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import type { GrowthCharacter } from '@/types/growth';

const RelationsCanvas = dynamic(() => import('@/components/canvas/RelationsCanvas'), { ssr: false });
const CampaignTerminal = dynamic(() => import('@/components/terminal/CampaignTerminal'), { ssr: false });
const ForgePanel = dynamic(() => import('@/components/forge/ForgePanel'), { ssr: false });

interface CanvasNode {
  id: string;
  type: 'character' | 'npc' | 'location' | 'quest';
  name: string;
  x: number;
  y: number;
  status?: string;
  color?: string;
  portrait?: string | null;
  characterData?: Record<string, unknown> | null;
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

type Tab = 'relations' | 'forge' | 'essence';

const MIN_TERMINAL_HEIGHT = 150;
const MAX_TERMINAL_FRACTION = 0.8;

export default function CampaignCanvas({ campaign, nodes: initialNodes, connections, userId, username, userRole, userCharacter }: CampaignCanvasProps) {
  const [activeTab, setActiveTab] = useState<Tab>('relations');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [nodes, setNodes] = useState(initialNodes);
  const [showTerminal, setShowTerminal] = useState(false);
  const router = useRouter();

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

          {/* Right: invite code */}
          <div className="text-right">
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
          />
        )}

        {activeTab === 'forge' && (
          <ForgePanel
            campaignId={campaign.id}
            isGM={userRole === 'WATCHER' || userRole === 'ADMIN' || userRole === 'GODHEAD'}
            userId={userId || ''}
          />
        )}

        {activeTab === 'essence' && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center space-y-3">
              <div className="text-[var(--accent-gold)] text-xs font-[family-name:var(--font-terminal)] tracking-[0.2em] uppercase">
                [ESSENCE]
              </div>
              <p className="text-white/30 text-[10px] font-[family-name:var(--font-terminal)] tracking-wider">
                Character essence and narrative threads. Coming soon.
              </p>
              <div className="text-[var(--accent-teal)]/20 text-[9px] font-[family-name:var(--font-terminal)]">
                {'='.repeat(30)}
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
