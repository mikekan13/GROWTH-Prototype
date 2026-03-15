'use client';

import { useState } from 'react';
import dynamic from 'next/dynamic';

const ApplicationTemplateEditor = dynamic(() => import('@/components/application/ApplicationTemplateEditor'), { ssr: false });
const ApplicationReviewPanel = dynamic(() => import('@/components/application/ApplicationReviewPanel'), { ssr: false });

interface CanvasNode {
  id: string;
  name: string;
  type: string;
  characterData?: unknown;
}

type TapestrySubTab = 'trailblazers' | 'characters' | 'grovines';

interface TapestryTabProps {
  campaignId: string;
  isGM: boolean;
  nodes: CanvasNode[];
}

export default function TapestryTab({ campaignId, isGM, nodes }: TapestryTabProps) {
  const [subTab, setSubTab] = useState<TapestrySubTab>('trailblazers');

  const subTabs: { key: TapestrySubTab; label: string }[] = [
    { key: 'trailblazers', label: 'Trailblazers' },
    { key: 'characters', label: 'Characters' },
    { key: 'grovines', label: 'GRO.vines' },
  ];

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--surface-dark)' }}>
      {/* Sub-tab bar */}
      <div className="flex items-center gap-0 px-6 pt-4 pb-0">
        {subTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setSubTab(tab.key)}
            className={`px-4 py-1.5 text-[10px] uppercase tracking-[0.2em] font-[family-name:var(--font-terminal)] border-b-2 transition-colors ${
              subTab === tab.key
                ? 'border-[var(--accent-teal)] text-[var(--accent-teal)]'
                : 'border-transparent text-white/30 hover:text-white/50'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Sub-tab content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-4xl mx-auto space-y-6">

          {subTab === 'trailblazers' && (
            <>
              {isGM && (
                <ApplicationTemplateEditor campaignId={campaignId} />
              )}
              {isGM && (
                <div className="mt-8">
                  <ApplicationReviewPanel campaignId={campaignId} />
                </div>
              )}
              {!isGM && (
                <div className="text-center py-12 text-white/20 text-[10px] font-[family-name:var(--font-terminal)]">
                  Your application status is shown in the Trailblazer Portal.
                </div>
              )}
            </>
          )}

          {subTab === 'characters' && (
            <div className="text-center py-12">
              <div className="text-[var(--accent-teal)]/40 text-[10px] font-[family-name:var(--font-terminal)] tracking-[0.2em] uppercase mb-2">
                Character Creation
              </div>
              <div className="text-white/20 text-[10px] font-[family-name:var(--font-terminal)]">
                Backstory development, character concepts, and collaborative worldbuilding — coming soon.
              </div>
            </div>
          )}

          {subTab === 'grovines' && (
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
          )}

        </div>
      </div>
    </div>
  );
}
