'use client';

import { useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';

const RelationsCanvas = dynamic(() => import('@/components/canvas/RelationsCanvas'), { ssr: false });

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
}

type Tab = 'relations' | 'forge' | 'essence';

export default function CampaignCanvas({ campaign, nodes, connections }: CampaignCanvasProps) {
  const [activeTab, setActiveTab] = useState<Tab>('relations');
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const router = useRouter();

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

  const tabs: { key: Tab; label: string }[] = [
    { key: 'relations', label: 'Relations' },
    { key: 'forge', label: 'Forge' },
    { key: 'essence', label: 'Essence' },
  ];

  return (
    <div className="min-h-screen bg-[var(--surface-dark)] flex flex-col">
      {/* Compact header bar */}
      <header className="bg-[var(--surface-dark)] border-b border-[var(--accent-teal)]/30 flex-shrink-0">
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
      <main className="flex-1 relative overflow-hidden">
        {activeTab === 'relations' && (
          <RelationsCanvas
            nodes={nodes}
            connections={connections}
            campaignId={campaign.id}
            onCreateCharacter={handleCreateCharacter}
            onDeleteCharacter={(nodeId) => setDeleteTarget(nodeId)}
          />
        )}

        {activeTab === 'forge' && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center space-y-3">
              <div className="text-[var(--accent-gold)] text-xs font-[family-name:var(--font-terminal)] tracking-[0.2em] uppercase">
                [FORGE]
              </div>
              <p className="text-white/30 text-[10px] font-[family-name:var(--font-terminal)] tracking-wider">
                Character creation and mechanical shaping. Coming soon.
              </p>
              <div className="text-[var(--accent-teal)]/20 text-[9px] font-[family-name:var(--font-terminal)]">
                {'='.repeat(30)}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'essence' && (
          <div className="flex items-center justify-center h-full">
            <div className="text-center space-y-3">
              <div className="text-[var(--accent-gold)] text-xs font-[family-name:var(--font-terminal)] tracking-[0.2em] uppercase">
                [ESSENCE]
              </div>
              <p className="text-white/30 text-[10px] font-[family-name:var(--font-terminal)] tracking-wider">
                Campaign themes, world context, and narrative threads. Coming soon.
              </p>
              <div className="text-[var(--accent-teal)]/20 text-[9px] font-[family-name:var(--font-terminal)]">
                {'='.repeat(30)}
              </div>
            </div>
          </div>
        )}
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
