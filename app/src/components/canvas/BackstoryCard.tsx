"use client";

import React, { useState } from 'react';
import type { PhysicalDescription } from '@/types/growth';

export interface BackstoryData {
  description?: string;
  personality?: string;
  background?: string;
  motivations?: string;
  fears?: string;
  notes?: string;
  prompts?: Array<{ question: string; answer: string }>;
}

interface BackstoryCardProps {
  backstory: BackstoryData;
  physicalDescription?: PhysicalDescription;
  onPhysicalDescriptionChange?: (field: keyof PhysicalDescription, value: string) => void;
  onClose?: () => void;
}

const SECTION_ORDER: { key: keyof BackstoryData; label: string; icon: string }[] = [
  { key: 'description', label: 'DESCRIPTION', icon: '\u2606' },
  { key: 'personality', label: 'PERSONALITY', icon: '\u263A' },
  { key: 'background', label: 'BACKGROUND', icon: '\u2302' },
  { key: 'motivations', label: 'MOTIVATIONS', icon: '\u2191' },
  { key: 'fears', label: 'FEARS', icon: '\u2620' },
  { key: 'notes', label: 'NOTES', icon: '\u270E' },
];

const HEIGHT_OPTIONS = ['', 'Short', 'Average', 'Tall', 'Very Tall'] as const;
const BUILD_OPTIONS = ['', 'Slim', 'Lean', 'Average', 'Stocky', 'Muscular', 'Heavy'] as const;

export default function BackstoryCard({ backstory, physicalDescription, onPhysicalDescriptionChange, onClose }: BackstoryCardProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const pd = physicalDescription || {};

  const sections = SECTION_ORDER.filter(s => backstory[s.key] && typeof backstory[s.key] === 'string');
  const prompts = backstory.prompts || [];
  const totalSections = sections.length + (prompts.length > 0 ? 1 : 0);

  return (
    <div className="border transition-all duration-200" style={{ display: 'flex', flexDirection: 'column', backgroundColor: '#1a1a2e', borderColor: '#ffcc78', borderRadius: '3px', width: '420px' }}>
      {/* Header */}
      <div className="p-3 text-white cursor-grab" style={{ background: 'linear-gradient(135deg, #582a72 0%, #3d1952 100%)', borderRadius: '2px 2px 0 0' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-lg">{'\u270E'}</span>
            <div>
              <h3 className="font-semibold text-sm" style={{ fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', letterSpacing: '0.08em', fontSize: '15px' }}>BACKSTORY & NOTES</h3>
              <p className="text-xs" style={{ color: '#ffcc78', fontFamily: 'var(--font-terminal), Consolas, monospace', fontSize: '10px' }}>
                {totalSections} sections{prompts.length > 0 && ` \u2022 ${prompts.length} prompts`}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={e => { e.stopPropagation(); setIsExpanded(!isExpanded); }} onMouseDown={e => e.stopPropagation()} className="p-1 hover:bg-white/20 transition-colors" style={{ borderRadius: '2px' }}>
              <svg className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            {onClose && (
              <button onClick={e => { e.stopPropagation(); onClose(); }} onMouseDown={e => e.stopPropagation()} className="p-1 hover:bg-white/20 transition-colors" style={{ borderRadius: '2px' }}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="p-3 space-y-3 max-h-96 overflow-y-auto" style={{ fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
          {/* Physical Description */}
          <div>
            <div className="text-[9px] uppercase mb-2" style={{ color: '#ffcc78', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', letterSpacing: '0.05em' }}>
              PHYSICAL DESCRIPTION
            </div>
            <div className="grid grid-cols-2 gap-2">
              {/* Height */}
              <div>
                <label className="text-[9px] uppercase block mb-1" style={{ color: '#8e7cc3' }}>Height</label>
                {onPhysicalDescriptionChange ? (
                  <select
                    value={pd.height || ''}
                    onChange={e => onPhysicalDescriptionChange('height', e.target.value)}
                    className="w-full text-xs p-1"
                    style={{ backgroundColor: '#2a2a3e', color: '#ccc', border: '1px solid #582a72', borderRadius: '2px' }}
                  >
                    {HEIGHT_OPTIONS.map(o => <option key={o} value={o}>{o || '—'}</option>)}
                  </select>
                ) : (
                  <div className="text-xs p-1" style={{ color: '#ccc' }}>{pd.height || '—'}</div>
                )}
              </div>
              {/* Build */}
              <div>
                <label className="text-[9px] uppercase block mb-1" style={{ color: '#8e7cc3' }}>Build</label>
                {onPhysicalDescriptionChange ? (
                  <select
                    value={pd.build || ''}
                    onChange={e => onPhysicalDescriptionChange('build', e.target.value)}
                    className="w-full text-xs p-1"
                    style={{ backgroundColor: '#2a2a3e', color: '#ccc', border: '1px solid #582a72', borderRadius: '2px' }}
                  >
                    {BUILD_OPTIONS.map(o => <option key={o} value={o}>{o || '—'}</option>)}
                  </select>
                ) : (
                  <div className="text-xs p-1" style={{ color: '#ccc' }}>{pd.build || '—'}</div>
                )}
              </div>
              {/* Skin Tone */}
              <div>
                <label className="text-[9px] uppercase block mb-1" style={{ color: '#8e7cc3' }}>Skin Tone</label>
                {onPhysicalDescriptionChange ? (
                  <input
                    type="text"
                    value={pd.skinTone || ''}
                    onChange={e => onPhysicalDescriptionChange('skinTone', e.target.value)}
                    placeholder="e.g. olive, pale, dark brown"
                    className="w-full text-xs p-1"
                    style={{ backgroundColor: '#2a2a3e', color: '#ccc', border: '1px solid #582a72', borderRadius: '2px' }}
                  />
                ) : (
                  <div className="text-xs p-1" style={{ color: '#ccc' }}>{pd.skinTone || '—'}</div>
                )}
              </div>
              {/* Hair Color */}
              <div>
                <label className="text-[9px] uppercase block mb-1" style={{ color: '#8e7cc3' }}>Hair Color</label>
                {onPhysicalDescriptionChange ? (
                  <input
                    type="text"
                    value={pd.hairColor || ''}
                    onChange={e => onPhysicalDescriptionChange('hairColor', e.target.value)}
                    placeholder="e.g. black, auburn, silver"
                    className="w-full text-xs p-1"
                    style={{ backgroundColor: '#2a2a3e', color: '#ccc', border: '1px solid #582a72', borderRadius: '2px' }}
                  />
                ) : (
                  <div className="text-xs p-1" style={{ color: '#ccc' }}>{pd.hairColor || '—'}</div>
                )}
              </div>
              {/* Hair Style */}
              <div>
                <label className="text-[9px] uppercase block mb-1" style={{ color: '#8e7cc3' }}>Hair Style</label>
                {onPhysicalDescriptionChange ? (
                  <input
                    type="text"
                    value={pd.hairStyle || ''}
                    onChange={e => onPhysicalDescriptionChange('hairStyle', e.target.value)}
                    placeholder="e.g. long braided, cropped"
                    className="w-full text-xs p-1"
                    style={{ backgroundColor: '#2a2a3e', color: '#ccc', border: '1px solid #582a72', borderRadius: '2px' }}
                  />
                ) : (
                  <div className="text-xs p-1" style={{ color: '#ccc' }}>{pd.hairStyle || '—'}</div>
                )}
              </div>
              {/* Eye Color */}
              <div>
                <label className="text-[9px] uppercase block mb-1" style={{ color: '#8e7cc3' }}>Eye Color</label>
                {onPhysicalDescriptionChange ? (
                  <input
                    type="text"
                    value={pd.eyeColor || ''}
                    onChange={e => onPhysicalDescriptionChange('eyeColor', e.target.value)}
                    placeholder="e.g. green, hazel, amber"
                    className="w-full text-xs p-1"
                    style={{ backgroundColor: '#2a2a3e', color: '#ccc', border: '1px solid #582a72', borderRadius: '2px' }}
                  />
                ) : (
                  <div className="text-xs p-1" style={{ color: '#ccc' }}>{pd.eyeColor || '—'}</div>
                )}
              </div>
              {/* Distinguishing Marks */}
              <div className="col-span-2">
                <label className="text-[9px] uppercase block mb-1" style={{ color: '#8e7cc3' }}>Distinguishing Marks</label>
                {onPhysicalDescriptionChange ? (
                  <textarea
                    value={pd.distinguishingMarks || ''}
                    onChange={e => onPhysicalDescriptionChange('distinguishingMarks', e.target.value)}
                    placeholder="Scars, tattoos, birthmarks..."
                    rows={2}
                    className="w-full text-xs p-1 resize-none"
                    style={{ backgroundColor: '#2a2a3e', color: '#ccc', border: '1px solid #582a72', borderRadius: '2px' }}
                  />
                ) : (
                  <div className="text-xs p-1" style={{ color: '#ccc' }}>{pd.distinguishingMarks || '—'}</div>
                )}
              </div>
              {/* Notable Features */}
              <div className="col-span-2">
                <label className="text-[9px] uppercase block mb-1" style={{ color: '#8e7cc3' }}>Notable Features</label>
                {onPhysicalDescriptionChange ? (
                  <textarea
                    value={pd.notableFeatures || ''}
                    onChange={e => onPhysicalDescriptionChange('notableFeatures', e.target.value)}
                    placeholder="Horns, wings, tail, unusual seed traits..."
                    rows={2}
                    className="w-full text-xs p-1 resize-none"
                    style={{ backgroundColor: '#2a2a3e', color: '#ccc', border: '1px solid #582a72', borderRadius: '2px' }}
                  />
                ) : (
                  <div className="text-xs p-1" style={{ color: '#ccc' }}>{pd.notableFeatures || '—'}</div>
                )}
              </div>
            </div>
          </div>

          {/* Divider */}
          <div style={{ height: '1px', backgroundColor: '#582a72', opacity: 0.5 }} />

          {/* Narrative Sections */}
          {sections.map(({ key, label, icon }) => (
            <div key={key}>
              <div className="text-[9px] uppercase mb-1" style={{ color: '#ffcc78', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', letterSpacing: '0.05em' }}>
                {icon} {label}
              </div>
              <div className="p-2 text-xs leading-relaxed" style={{ backgroundColor: '#2a2a3e', borderRadius: '2px', color: '#ccc', borderLeft: '3px solid #582a72' }}>
                {backstory[key] as string}
              </div>
            </div>
          ))}

          {prompts.length > 0 && (
            <div>
              <div className="text-[9px] uppercase mb-1" style={{ color: '#ffcc78', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', letterSpacing: '0.05em' }}>
                {'\u2753'} BACKSTORY PROMPTS
              </div>
              <div className="space-y-2">
                {prompts.map((p, i) => (
                  <div key={i} className="p-2" style={{ backgroundColor: '#2a2a3e', borderRadius: '2px', borderLeft: '3px solid #7050A8' }}>
                    <div className="text-[10px] mb-1" style={{ color: '#c4a0e8' }}>{p.question}</div>
                    <div className="text-xs" style={{ color: '#ccc' }}>{p.answer}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {totalSections === 0 && (
            <div className="text-center text-gray-400 text-sm py-4">No backstory written yet</div>
          )}
        </div>
      )}
    </div>
  );
}
