"use client";

import React, { useState } from 'react';
import { ComplexTooltip } from '@/components/ui/ComplexTooltip';

// ── Types ──

interface BodyPartDamage {
  HEAD?: number; NECK?: number; TORSO?: number;
  RIGHTARM?: number; LEFTARM?: number;
  RIGHTUPPERLEG?: number; LEFTUPPERLEG?: number;
  RIGHTLOWERLEG?: number; LEFTLOWERLEG?: number;
}

interface EquipmentSlot {
  name: string;
  layer: string;
  material?: string;
  resistance: number;
  condition: number;
  weight?: number;
  properties?: string[];
}

interface VitalsData {
  bodyParts?: BodyPartDamage;
  baseResist?: number;
  restRate?: number;
  carryLevel?: number;
  weightStatus?: string;
  equipment?: {
    body?: EquipmentSlot[];
    clothing?: EquipmentSlot[];
    lightArmor?: EquipmentSlot[];
    heavyArmor?: EquipmentSlot[];
  };
}

interface VitalsCardProps {
  vitals: VitalsData;
  onClose?: () => void;
}

// ── Constants ──

const BODY_PARTS: { key: keyof BodyPartDamage; label: string }[] = [
  { key: 'HEAD', label: 'Head' },
  { key: 'NECK', label: 'Neck' },
  { key: 'TORSO', label: 'Torso' },
  { key: 'RIGHTARM', label: 'R.Arm' },
  { key: 'LEFTARM', label: 'L.Arm' },
  { key: 'RIGHTUPPERLEG', label: 'R.ULeg' },
  { key: 'LEFTUPPERLEG', label: 'L.ULeg' },
  { key: 'RIGHTLOWERLEG', label: 'R.LLeg' },
  { key: 'LEFTLOWERLEG', label: 'L.LLeg' },
];

const LAYER_META: Record<string, { label: string; color: string; mult: string }> = {
  body: { label: 'BODY', color: '#E8585A', mult: 'Varies' },
  clothing: { label: 'CLOTHING', color: '#7050A8', mult: '0.5x' },
  lightArmor: { label: 'LIGHT ARMOR', color: '#3EB89A', mult: '1x' },
  heavyArmor: { label: 'HEAVY ARMOR', color: '#002f6c', mult: '1.5x' },
};

const COND_LABELS: Record<number, { label: string; color: string }> = {
  4: { label: 'Undamaged', color: '#22ab94' },
  3: { label: 'Worn', color: '#D0A030' },
  2: { label: 'Broken', color: '#D07818' },
  1: { label: 'Destroyed', color: '#E84040' },
};

// Paperdoll SVG regions
const PD: Record<string, { x: number; y: number; w: number; h: number }> = {
  HEAD: { x: 52, y: 4, w: 36, h: 30 },
  NECK: { x: 58, y: 34, w: 24, h: 12 },
  TORSO: { x: 42, y: 46, w: 56, h: 58 },
  RIGHTARM: { x: 16, y: 48, w: 26, h: 50 },
  LEFTARM: { x: 98, y: 48, w: 26, h: 50 },
  RIGHTUPPERLEG: { x: 44, y: 104, w: 26, h: 36 },
  LEFTUPPERLEG: { x: 70, y: 104, w: 26, h: 36 },
  RIGHTLOWERLEG: { x: 44, y: 140, w: 26, h: 36 },
  LEFTLOWERLEG: { x: 70, y: 140, w: 26, h: 36 },
};

function dmgColor(d: number) { return d === 0 ? 'rgba(34,171,148,0.15)' : d <= 2 ? 'rgba(208,160,48,0.4)' : d <= 4 ? 'rgba(208,120,24,0.5)' : 'rgba(232,64,64,0.6)'; }
function dmgStroke(d: number) { return d === 0 ? 'rgba(34,171,148,0.3)' : d <= 2 ? '#D0A030' : d <= 4 ? '#D07818' : '#E84040'; }

export default function VitalsCard({ vitals, onClose }: VitalsCardProps) {
  const [activeLayer, setActiveLayer] = useState<string>('all');
  const [isExpanded, setIsExpanded] = useState(true);

  const bp = vitals.bodyParts || {};
  const eq = vitals.equipment || {};
  const layers: [string, EquipmentSlot[]][] = [
    ['body', eq.body || []],
    ['clothing', eq.clothing || []],
    ['lightArmor', eq.lightArmor || []],
    ['heavyArmor', eq.heavyArmor || []],
  ];
  const hasEquipment = layers.some(([, s]) => s.length > 0);

  return (
    <div className="border transition-all duration-200" style={{ display: 'flex', flexDirection: 'column', backgroundColor: '#1a1a2e', borderColor: '#ffcc78', borderRadius: '3px', width: '420px' }}>
      {/* Header */}
      <div className="p-3 text-white cursor-grab" style={{ background: 'linear-gradient(135deg, #582a72 0%, #3d1952 100%)', borderRadius: '2px 2px 0 0' }}>
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <span className="text-lg">{'\u2695'}</span>
            <div>
              <h3 className="font-semibold text-sm" style={{ fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', letterSpacing: '0.08em', fontSize: '15px' }}>VITALS & EQUIPMENT</h3>
              <p className="text-xs" style={{ color: '#ffcc78', fontFamily: 'var(--font-terminal), Consolas, monospace', fontSize: '10px' }}>
                Base Resist {vitals.baseResist || 0} {'\u2022'} Rest Rate {vitals.restRate || 0} {'\u2022'} Carry {vitals.carryLevel || 0}
                {vitals.weightStatus === 'Encumbered' && <span style={{ color: '#E84040' }}> ENCUMBERED</span>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={(e) => { e.stopPropagation(); setIsExpanded(!isExpanded); }} onMouseDown={e => e.stopPropagation()} className="p-1 hover:bg-white/20 transition-colors" style={{ borderRadius: '2px' }}>
              <svg className={`w-4 h-4 transition-transform ${isExpanded ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
            </button>
            {onClose && (
              <button onClick={(e) => { e.stopPropagation(); onClose(); }} onMouseDown={e => e.stopPropagation()} className="p-1 hover:bg-white/20 transition-colors" style={{ borderRadius: '2px' }}>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="p-3" style={{ fontFamily: 'var(--font-terminal), Consolas, monospace' }}>
          <div className="flex gap-3">
            {/* Paperdoll SVG */}
            <div style={{ width: '140px', flexShrink: 0 }}>
              <svg viewBox="0 0 140 180" width="140" height="180">
                <rect x="0" y="0" width="140" height="180" fill="rgba(42,42,62,0.8)" rx="2" />
                {BODY_PARTS.map(({ key }) => {
                  const p = PD[key];
                  const d = (bp as Record<string, number>)[key] || 0;
                  return (
                    <g key={key}>
                      <rect x={p.x} y={p.y} width={p.w} height={p.h} fill={dmgColor(d)} stroke={dmgStroke(d)} strokeWidth={d > 0 ? 1.5 : 0.5} rx="2" />
                      <text x={p.x + p.w / 2} y={p.y + p.h / 2 + (d > 0 ? -4 : 0)} textAnchor="middle" dominantBaseline="middle" fill={d > 0 ? dmgStroke(d) : 'rgba(255,255,255,0.3)'} fontSize="8" fontFamily="Consolas, monospace">R{vitals.baseResist || 0}</text>
                      {d > 0 && <text x={p.x + p.w / 2} y={p.y + p.h / 2 + 6} textAnchor="middle" dominantBaseline="middle" fill={dmgStroke(d)} fontSize="9" fontFamily="Consolas, monospace" fontWeight="bold">-{d}</text>}
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* Equipment + Damage */}
            <div className="flex-1" style={{ minWidth: 0 }}>
              {/* Layer filter */}
              {hasEquipment && (
                <div className="flex flex-wrap gap-1 mb-2">
                  {['all', 'body', 'clothing', 'lightArmor', 'heavyArmor'].map(l => (
                    <button key={l} onClick={e => { e.stopPropagation(); setActiveLayer(l); }} onMouseDown={e => e.stopPropagation()}
                      className="px-2 py-0.5 text-xs transition-colors uppercase"
                      style={{
                        borderRadius: '2px', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', letterSpacing: '0.05em', fontSize: '10px',
                        backgroundColor: activeLayer === l ? '#582a72' : '#2a2a3e', color: activeLayer === l ? '#ffcc78' : '#888',
                        border: `1px solid ${activeLayer === l ? '#ffcc78' : '#3a3a4e'}`,
                      }}>
                      {l === 'all' ? 'ALL' : (LAYER_META[l]?.label || l)}
                    </button>
                  ))}
                </div>
              )}

              {/* Equipment slots */}
              <div className="space-y-1 max-h-52 overflow-y-auto">
                {layers.map(([layerKey, slots]) => {
                  if (activeLayer !== 'all' && activeLayer !== layerKey) return null;
                  if (slots.length === 0) return null;
                  const meta = LAYER_META[layerKey];
                  return (
                    <div key={layerKey}>
                      <div className="text-[9px] uppercase mb-0.5" style={{ color: meta.color, fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', letterSpacing: '0.05em' }}>
                        {meta.label} ({meta.mult})
                      </div>
                      {slots.map((slot, i) => {
                        const cond = COND_LABELS[slot.condition] || { label: '?', color: '#888' };
                        return (
                          <ComplexTooltip key={i} title={slot.name} baseValue={slot.resistance}
                            modifiers={[
                              { name: `${slot.material || 'Base'} Resistance`, value: slot.resistance, source: { name: slot.name, type: `${meta.label} (${slot.material || 'Standard'})`, description: slot.properties?.join(', '), stats: { Condition: cond.label, ...(slot.weight != null ? { Weight: slot.weight } : {}) } } },
                            ]} totalValue={slot.resistance}>
                            <div className="p-1.5 border transition-colors cursor-pointer" onMouseDown={e => e.stopPropagation()}
                              style={{ borderRadius: '2px', backgroundColor: '#2a2a3e', borderColor: '#3a3a4e', borderLeftColor: meta.color, borderLeftWidth: '3px' }}>
                              <div className="flex items-center justify-between">
                                <div className="flex items-center gap-1.5">
                                  <span className="text-xs text-white">{slot.name}</span>
                                  {slot.material && <span className="text-[9px]" style={{ color: meta.color }}>({slot.material})</span>}
                                </div>
                                <div className="flex items-center gap-2 text-[9px]">
                                  <span style={{ color: cond.color }}>{cond.label}</span>
                                  <span style={{ color: '#ffcc78' }}>R{slot.resistance}</span>
                                </div>
                              </div>
                              {slot.properties && slot.properties.length > 0 && (
                                <div className="flex gap-1 mt-0.5">
                                  {slot.properties.map((p, j) => (
                                    <span key={j} className="text-[8px] px-1" style={{ backgroundColor: 'rgba(88,42,114,0.3)', color: '#c4a0e8', borderRadius: '2px' }}>{p}</span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </ComplexTooltip>
                        );
                      })}
                    </div>
                  );
                })}
              </div>

              {/* Damage summary */}
              {BODY_PARTS.some(({ key }) => ((bp as Record<string, number>)[key] || 0) > 0) && (
                <div className="mt-2 pt-2" style={{ borderTop: '1px solid #3a3a4e' }}>
                  <div className="text-[9px] uppercase mb-1" style={{ color: '#E84040', fontFamily: 'var(--font-bebas-neue), Bebas Neue, sans-serif', letterSpacing: '0.05em' }}>DAMAGE</div>
                  <div className="grid grid-cols-3 gap-1">
                    {BODY_PARTS.map(({ key, label }) => {
                      const d = (bp as Record<string, number>)[key] || 0;
                      if (d === 0) return null;
                      return (
                        <div key={key} className="text-[9px] px-1 py-0.5" style={{ backgroundColor: '#2a2a3e', color: dmgStroke(d), borderRadius: '2px' }}>
                          {label}: -{d}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
