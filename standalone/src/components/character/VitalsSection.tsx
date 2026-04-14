'use client';

import { useState } from 'react';
import type { GrowthVitals, BodyPart, ArmorLayer, EquipmentSlot } from '@/types/growth';
import { ComplexTooltip } from '@/components/ui/ComplexTooltip';

const BODY_PARTS: { key: BodyPart; label: string; shortLabel: string }[] = [
  { key: 'HEAD', label: 'Head', shortLabel: 'HD' },
  { key: 'NECK', label: 'Neck', shortLabel: 'NK' },
  { key: 'TORSO', label: 'Torso', shortLabel: 'TO' },
  { key: 'RIGHTARM', label: 'Right Arm', shortLabel: 'RA' },
  { key: 'LEFTARM', label: 'Left Arm', shortLabel: 'LA' },
  { key: 'RIGHTUPPERLEG', label: 'R. Upper Leg', shortLabel: 'RU' },
  { key: 'LEFTUPPERLEG', label: 'L. Upper Leg', shortLabel: 'LU' },
  { key: 'RIGHTLOWERLEG', label: 'R. Lower Leg', shortLabel: 'RL' },
  { key: 'LEFTLOWERLEG', label: 'L. Lower Leg', shortLabel: 'LL' },
];

const LAYER_META: Record<ArmorLayer, { label: string; color: string; desc: string; maxLayers: number; resistMult: string }> = {
  body: { label: 'BODY', color: '#E8585A', desc: 'Natural armor, skin, tattoos', maxLayers: 1, resistMult: 'Varies' },
  clothing: { label: 'CLOTHING', color: '#7050A8', desc: 'Soft materials, up to 3 layers, half base resist', maxLayers: 3, resistMult: '0.5x' },
  lightArmor: { label: 'LIGHT ARMOR', color: '#3EB89A', desc: '1 layer, full base resist, no mobility penalty', maxLayers: 1, resistMult: '1x' },
  heavyArmor: { label: 'HEAVY ARMOR', color: '#002f6c', desc: '1 layer, 1.5x base resist, -1 Celerity', maxLayers: 1, resistMult: '1.5x' },
};

const CONDITION_LABELS: Record<number, { label: string; color: string }> = {
  4: { label: 'Undamaged', color: '#22ab94' },
  3: { label: 'Worn', color: '#D0A030' },
  2: { label: 'Broken', color: '#D07818' },
  1: { label: 'Destroyed', color: '#E84040' },
};

// SVG Paperdoll coordinates for body parts
const PAPERDOLL_PARTS: Record<BodyPart, { x: number; y: number; w: number; h: number }> = {
  HEAD: { x: 52, y: 4, w: 36, h: 32 },
  NECK: { x: 58, y: 36, w: 24, h: 14 },
  TORSO: { x: 42, y: 50, w: 56, h: 64 },
  RIGHTARM: { x: 14, y: 52, w: 28, h: 56 },
  LEFTARM: { x: 98, y: 52, w: 28, h: 56 },
  RIGHTUPPERLEG: { x: 42, y: 114, w: 28, h: 40 },
  LEFTUPPERLEG: { x: 70, y: 114, w: 28, h: 40 },
  RIGHTLOWERLEG: { x: 42, y: 154, w: 28, h: 40 },
  LEFTLOWERLEG: { x: 70, y: 154, w: 28, h: 40 },
};

function getDamageColor(dmg: number): string {
  if (dmg === 0) return 'rgba(34, 171, 148, 0.15)';
  if (dmg <= 2) return 'rgba(208, 160, 48, 0.4)';
  if (dmg <= 4) return 'rgba(208, 120, 24, 0.5)';
  return 'rgba(232, 64, 64, 0.6)';
}

function getDamageStroke(dmg: number): string {
  if (dmg === 0) return 'rgba(34, 171, 148, 0.3)';
  if (dmg <= 2) return '#D0A030';
  if (dmg <= 4) return '#D07818';
  return '#E84040';
}

function buildEquipmentModifiers(slot: EquipmentSlot) {
  const mods: Array<{ name: string; value: number; source?: { name: string; type: string; description?: string; stats?: Record<string, string | number> } }> = [];
  mods.push({
    name: `${slot.material || 'Base'} Resistance`,
    value: slot.resistance,
    source: {
      name: slot.name,
      type: `${LAYER_META[slot.layer].label} (${slot.material || 'Standard'})`,
      description: slot.properties?.join(', '),
      stats: {
        Condition: CONDITION_LABELS[slot.condition]?.label || 'Unknown',
        ...(slot.weight != null ? { Weight: slot.weight } : {}),
        ...(slot.coveredParts ? { Coverage: slot.coveredParts.length + ' parts' } : {}),
      },
    },
  });
  return mods;
}

function EquipmentLayerRow({ layer, slots }: { layer: ArmorLayer; slots: EquipmentSlot[] }) {
  const meta = LAYER_META[layer];

  return (
    <div className="mb-2">
      <div className="flex items-center gap-2 mb-1">
        <div className="px-2 py-0.5" style={{
          backgroundColor: meta.color,
          fontFamily: 'var(--font-header)',
          fontSize: '10px',
          letterSpacing: '0.05em',
          color: 'white',
          textTransform: 'uppercase' as const,
        }}>
          {meta.label}
        </div>
        <span className="text-[10px]" style={{ color: 'var(--surface-dark)', opacity: 0.4 }}>
          {meta.resistMult} resist | max {meta.maxLayers} layer{meta.maxLayers > 1 ? 's' : ''}
        </span>
      </div>

      {slots.length > 0 ? (
        <div className="space-y-1">
          {slots.map((slot, i) => (
            <ComplexTooltip
              key={i}
              title={slot.name}
              baseValue={slot.resistance}
              modifiers={buildEquipmentModifiers(slot)}
              totalValue={slot.resistance}
            >
              <div className="flex items-center justify-between py-1 px-2 text-sm"
                style={{ backgroundColor: 'rgba(30, 45, 64, 0.05)', borderLeft: `3px solid ${meta.color}` }}>
                <div className="flex items-center gap-2">
                  <span>{slot.name}</span>
                  {slot.material && (
                    <span className="text-[10px]" style={{ color: meta.color }}>({slot.material})</span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-xs" style={{ color: 'var(--surface-dark)', opacity: 0.5 }}>
                  <span style={{ color: CONDITION_LABELS[slot.condition]?.color }}>
                    {CONDITION_LABELS[slot.condition]?.label}
                  </span>
                  <span>R{slot.resistance}</span>
                  {slot.properties?.map((p, j) => (
                    <span key={j} className="px-1" style={{
                      backgroundColor: 'rgba(112, 80, 168, 0.15)',
                      color: '#7050A8',
                      fontSize: '9px',
                    }}>{p}</span>
                  ))}
                </div>
              </div>
            </ComplexTooltip>
          ))}
        </div>
      ) : (
        <div className="text-[10px] px-2 py-1" style={{ color: 'var(--surface-dark)', opacity: 0.3 }}>
          No {meta.label.toLowerCase()} equipped
        </div>
      )}
    </div>
  );
}

export default function VitalsSection({ vitals }: { vitals: GrowthVitals }) {
  const [activeLayer, setActiveLayer] = useState<ArmorLayer | 'all'>('all');
  const hasDamage = Object.values(vitals.bodyParts).some(v => v > 0);
  const hasEquipment = vitals.equipment && (
    vitals.equipment.body.length > 0 ||
    vitals.equipment.clothing.length > 0 ||
    vitals.equipment.lightArmor.length > 0 ||
    vitals.equipment.heavyArmor.length > 0
  );

  // Calculate total resist per body part from equipment
  const getPartResist = (part: BodyPart): number => {
    if (!vitals.equipment) return vitals.baseResist;
    let total = vitals.baseResist;
    const layers: ArmorLayer[] = ['body', 'clothing', 'lightArmor', 'heavyArmor'];
    for (const layer of layers) {
      for (const slot of vitals.equipment[layer]) {
        if (!slot.coveredParts || slot.coveredParts.includes(part)) {
          total += slot.resistance;
        }
      }
    }
    return total;
  };

  return (
    <div>
      <div className="section-badge inline-block text-sm mb-3">Vitals</div>

      {/* Quick Stats Row */}
      <div className="flex gap-6 text-sm mb-4">
        <ComplexTooltip
          title="Base Resist"
          baseValue={vitals.baseResist}
          modifiers={[{ name: 'Constitution-derived', value: vitals.baseResist }]}
          totalValue={vitals.baseResist}
        >
          <div className="cursor-help">
            <span className="text-xs uppercase" style={{ color: 'var(--surface-dark)', opacity: 0.4 }}>Base Resist</span>
            <span className="ml-2 font-bold">{vitals.baseResist}</span>
          </div>
        </ComplexTooltip>
        <div>
          <span className="text-xs uppercase" style={{ color: 'var(--surface-dark)', opacity: 0.4 }}>Rest Rate</span>
          <span className="ml-2">{vitals.restRate}</span>
        </div>
        <div>
          <span className="text-xs uppercase" style={{ color: 'var(--surface-dark)', opacity: 0.4 }}>Carry</span>
          <span className="ml-2">{vitals.carryLevel}</span>
          {vitals.weightStatus === 'Encumbered' && (
            <span className="ml-1 text-xs" style={{ color: 'var(--accent-coral)' }}>(Encumbered)</span>
          )}
        </div>
      </div>

      {/* Paperdoll + Equipment Grid */}
      <div className="flex gap-4">
        {/* SVG Paperdoll */}
        <div className="flex-shrink-0" style={{ width: '140px' }}>
          <svg viewBox="0 0 140 200" width="140" height="200" style={{ display: 'block' }}>
            {/* Background */}
            <rect x="0" y="0" width="140" height="200" fill="rgba(30, 45, 64, 0.05)" rx="2" />

            {/* Body part regions */}
            {BODY_PARTS.map(({ key }) => {
              const p = PAPERDOLL_PARTS[key];
              const dmg = vitals.bodyParts[key];
              const resist = getPartResist(key);
              return (
                <g key={key}>
                  <rect
                    x={p.x} y={p.y} width={p.w} height={p.h}
                    fill={getDamageColor(dmg)}
                    stroke={getDamageStroke(dmg)}
                    strokeWidth={dmg > 0 ? 1.5 : 0.5}
                    rx="2"
                  />
                  {/* Resist value */}
                  <text
                    x={p.x + p.w / 2} y={p.y + p.h / 2 - 4}
                    textAnchor="middle" dominantBaseline="middle"
                    fill={dmg > 0 ? getDamageStroke(dmg) : 'rgba(30, 45, 64, 0.4)'}
                    fontSize="8" fontFamily="Consolas, monospace"
                  >
                    R{resist}
                  </text>
                  {/* Damage value */}
                  {dmg > 0 && (
                    <text
                      x={p.x + p.w / 2} y={p.y + p.h / 2 + 6}
                      textAnchor="middle" dominantBaseline="middle"
                      fill={getDamageStroke(dmg)}
                      fontSize="9" fontFamily="Consolas, monospace" fontWeight="bold"
                    >
                      -{dmg}
                    </text>
                  )}
                </g>
              );
            })}

            {/* Connecting lines for body shape */}
            <line x1="70" y1="36" x2="70" y2="50" stroke="rgba(30, 45, 64, 0.15)" strokeWidth="1" />
            <line x1="42" y1="80" x2="14" y2="60" stroke="rgba(30, 45, 64, 0.15)" strokeWidth="1" />
            <line x1="98" y1="80" x2="126" y2="60" stroke="rgba(30, 45, 64, 0.15)" strokeWidth="1" />
          </svg>
        </div>

        {/* Equipment Layers + Damage Table */}
        <div className="flex-1">
          {/* Layer filter tabs */}
          {hasEquipment && (
            <div className="flex gap-1 mb-3 flex-wrap">
              {(['all', 'body', 'clothing', 'lightArmor', 'heavyArmor'] as const).map((layer) => (
                <button
                  key={layer}
                  onClick={() => setActiveLayer(layer)}
                  className="px-2 py-0.5 text-[10px] uppercase transition-colors"
                  style={{
                    fontFamily: 'var(--font-header)',
                    letterSpacing: '0.05em',
                    backgroundColor: activeLayer === layer ? 'var(--surface-dark)' : 'rgba(30, 45, 64, 0.08)',
                    color: activeLayer === layer ? 'var(--accent-gold)' : 'rgba(30, 45, 64, 0.4)',
                    border: `1px solid ${activeLayer === layer ? 'var(--accent-gold)' : 'rgba(30, 45, 64, 0.1)'}`,
                  }}
                >
                  {layer === 'all' ? 'ALL' : LAYER_META[layer].label}
                </button>
              ))}
            </div>
          )}

          {/* Equipment layers */}
          {hasEquipment && vitals.equipment && (
            <div>
              {(activeLayer === 'all' || activeLayer === 'body') && (
                <EquipmentLayerRow layer="body" slots={vitals.equipment.body} />
              )}
              {(activeLayer === 'all' || activeLayer === 'clothing') && (
                <EquipmentLayerRow layer="clothing" slots={vitals.equipment.clothing} />
              )}
              {(activeLayer === 'all' || activeLayer === 'lightArmor') && (
                <EquipmentLayerRow layer="lightArmor" slots={vitals.equipment.lightArmor} />
              )}
              {(activeLayer === 'all' || activeLayer === 'heavyArmor') && (
                <EquipmentLayerRow layer="heavyArmor" slots={vitals.equipment.heavyArmor} />
              )}
            </div>
          )}

          {/* Body Damage Grid (shown if any damage, regardless of equipment) */}
          {hasDamage && (
            <div className="mt-2">
              <div className="text-[10px] uppercase mb-1" style={{
                color: 'var(--accent-coral)',
                fontFamily: 'var(--font-header)',
                letterSpacing: '0.05em',
              }}>
                Damage
              </div>
              <div className="grid grid-cols-3 gap-1">
                {BODY_PARTS.map(({ key, label }) => {
                  const dmg = vitals.bodyParts[key];
                  return (
                    <div
                      key={key}
                      className={`text-xs py-1 px-2 ${
                        dmg > 0 ? 'highlight-bar' : ''
                      }`}
                      style={dmg > 0 ? { color: 'var(--accent-coral)' } : { color: 'var(--surface-dark)', opacity: 0.3 }}
                    >
                      {label}: {dmg > 0 ? dmg : '-'}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
