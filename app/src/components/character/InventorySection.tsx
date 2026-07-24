'use client';

import type { GrowthInventory } from '@/types/growth';
import type { HeldItemData } from '@/types/item';
import {
  ITEM_TYPE_ICONS,
  formatDamage,
  getConditionLabel,
  getConditionColor,
  getRarityColor,
  getRarityLabel,
} from '@/types/item';
import { getItemWeightLbs, getCarryCapacityLbs } from '@/types/material';

interface InventorySectionProps {
  items?: HeldItemData[];
  inventory?: GrowthInventory;
  carryLevel?: number;
}

function formatLbs(lbs: number): string {
  if (Number.isInteger(lbs)) return `${lbs}`;
  return lbs.toFixed(1);
}

export default function InventorySection({ items, inventory, carryLevel }: InventorySectionProps) {
  const heldItems = items && items.length > 0 ? items : null;
  const legacyItems = inventory?.items ?? [];

  if (!heldItems && legacyItems.length === 0) {
    return (
      <div>
        <div className="section-badge inline-block text-sm mb-3">Inventory</div>
        <div className="text-xs text-[var(--surface-dark)]/40 italic">No items.</div>
      </div>
    );
  }

  const totalLbs = heldItems
    ? heldItems.reduce((sum, it) => sum + getItemWeightLbs(it.data), 0)
    : (inventory?.weight ?? 0);
  const capacityLbs = carryLevel != null ? getCarryCapacityLbs(carryLevel) : null;

  return (
    <div>
      <div className="section-badge inline-block text-sm mb-3">
        Inventory
        <span className="ml-3 text-[var(--accent-teal)] text-xs">
          {formatLbs(totalLbs)}{capacityLbs != null ? ` / ${capacityLbs}` : ''} lbs
        </span>
      </div>

      {heldItems ? (
        <div className="space-y-2">
          {heldItems.map(item => (
            <ItemRow key={item.id} item={item} />
          ))}
        </div>
      ) : (
        <div className="space-y-1">
          {legacyItems.map((item, i) => (
            <div
              key={i}
              className="flex items-center justify-between text-sm py-1 border-b border-[var(--surface-dark)]/5"
            >
              <div>
                <span>{item.name}</span>
                {item.quantity && item.quantity > 1 && (
                  <span className="text-[var(--surface-dark)]/40 ml-1">x{item.quantity}</span>
                )}
                {item.description && (
                  <span className="text-[var(--surface-dark)]/40 ml-2 text-xs">— {item.description}</span>
                )}
              </div>
              <div className="flex gap-3 text-xs text-[var(--surface-dark)]/40">
                <span>W{item.weightLevel}</span>
                <span>C{item.condition}/4</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function uniqueProps(...lists: (string[] | undefined)[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const list of lists) {
    if (!list) continue;
    for (const p of list) if (!seen.has(p)) { seen.add(p); out.push(p); }
  }
  return out;
}

function ItemRow({ item }: { item: HeldItemData }) {
  const data = item.data;
  const icon = ITEM_TYPE_ICONS[item.type] || '\u{1F4E6}';
  const rarityColor = getRarityColor(data.rarity) || 'inherit';
  const conditionLabel = data.condition != null ? getConditionLabel(data.condition) : '—';
  const conditionColor = data.condition != null ? getConditionColor(data.condition) : '#808080';
  const weightLbs = getItemWeightLbs(data);
  const isDestroyed = item.status === 'DESTROYED' || data.condition === 0;
  const primaryMaterial = data.primaryMaterial || data.material;
  const properties = uniqueProps(data.properties, data.weaponProperties, data.materialModifiers);
  const effectiveResist = data.baseResist ?? data.resistance;

  return (
    <div
      className="py-2 px-2 border-b border-[var(--surface-dark)]/5"
      style={{ opacity: isDestroyed ? 0.5 : 1 }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-start gap-2 min-w-0 flex-1">
          <span className="text-base leading-tight">{icon}</span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-sm font-medium" style={{ color: rarityColor }}>
                {item.name}
              </span>
              {data.equipped && (
                <span
                  className="text-white px-1.5 py-px text-[9px] uppercase tracking-wider"
                  style={{ backgroundColor: 'var(--terminal-prime)', borderRadius: 2 }}
                >
                  Equipped
                </span>
              )}
              {data.materialClass && (
                <span
                  className="px-1.5 py-px text-[9px] uppercase tracking-wider"
                  style={{
                    backgroundColor: data.materialClass === 'Hard' ? 'rgba(120,120,120,0.15)' : 'rgba(180,140,90,0.15)',
                    color: data.materialClass === 'Hard' ? '#666' : '#a07840',
                    border: `1px solid ${data.materialClass === 'Hard' ? 'rgba(120,120,120,0.3)' : 'rgba(180,140,90,0.3)'}`,
                    borderRadius: 2,
                  }}
                >
                  {data.materialClass}
                </span>
              )}
              {item.type === 'armor' && data.armorCategory && (
                <span
                  className="px-1.5 py-px text-[9px] uppercase tracking-wider"
                  style={{
                    backgroundColor: 'rgba(0, 47, 108,0.12)',
                    color: '#6fa8dc',
                    border: '1px solid rgba(0, 47, 108,0.25)',
                    borderRadius: 2,
                  }}
                >
                  {data.armorCategory}
                </span>
              )}
              <span style={{ fontSize: 10, color: rarityColor, opacity: 0.7 }}>
                {getRarityLabel(data.rarity)}
              </span>
            </div>
            <div className="text-xs mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[var(--surface-dark)]/55">
              <span style={{ color: conditionColor }}>{conditionLabel}</span>
              <span>{formatLbs(weightLbs)} lbs</span>
              {primaryMaterial && <span>{primaryMaterial}</span>}
              {data.subordinateMaterials && data.subordinateMaterials.length > 0 && (
                <span className="text-[var(--surface-dark)]/40">+ {data.subordinateMaterials.join(', ')}</span>
              )}
              {effectiveResist != null && (
                <span style={{ color: '#6fa8dc' }}>Resist {effectiveResist}</span>
              )}
              {data.quality != null && (
                <span style={{ color: '#7a4faa' }}>Q{data.quality}</span>
              )}
              {item.type === 'weapon' && data.damage && (
                <span style={{ color: '#E8585A' }}>
                  DMG {formatDamage(data.damage)}
                  {data.damageScaling ? ' +scl' : ''}
                </span>
              )}
              {item.type === 'weapon' && data.range && (
                <span className="text-[var(--surface-dark)]/40">Range {data.range}</span>
              )}
              {item.type === 'weapon' && data.targetAttribute && (
                <span className="text-[var(--surface-dark)]/40">Targets {data.targetAttribute}</span>
              )}
              {data.shots != null && (
                <span className="text-[var(--surface-dark)]/40">Shots {data.shots}</span>
              )}
              {data.reload && (
                <span className="text-[var(--surface-dark)]/40">Reload {data.reload}</span>
              )}
              {data.value != null && (
                <span style={{ color: '#a07a30' }}>{data.value}&#x049C;V</span>
              )}
            </div>
            {data.description && (
              <div className="text-xs mt-1 text-[var(--surface-dark)]/55 leading-snug">
                {data.description}
              </div>
            )}
            {data.itemAbilities && data.itemAbilities.length > 0 && (
              <ul className="mt-1.5 space-y-1">
                {data.itemAbilities.map((ab, i) => (
                  <li key={i} className="text-xs">
                    <span className="font-medium">{ab.name}</span>
                    <span className="text-[var(--surface-dark)]/55"> — {ab.description}</span>
                    {ab.mechanicalEffect && (
                      <span className="ml-1 text-[var(--accent-teal)]">[{ab.mechanicalEffect}]</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
            {properties.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {properties.map(p => (
                  <Tag key={`p-${p}`} label={p} tone="neutral" />
                ))}
              </div>
            )}
            {data.tags && data.tags.length > 0 && (
              <div className="mt-1 flex flex-wrap gap-1">
                {data.tags.map(t => (
                  <Tag key={`t-${t}`} label={`#${t}`} tone="tag" />
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function Tag({ label, tone }: { label: string; tone: 'neutral' | 'weapon' | 'tag' }) {
  const styles =
    tone === 'weapon'
      ? { background: 'rgba(232,88,90,0.08)', border: '1px solid rgba(232,88,90,0.2)', color: '#E8585A' }
      : tone === 'tag'
      ? { background: 'rgba(88,42,114,0.1)', border: '1px solid rgba(88,42,114,0.25)', color: '#8e7cc3' }
      : { background: 'rgba(0,0,0,0.04)', border: '1px solid rgba(0,0,0,0.08)', color: 'inherit' };
  return (
    <span
      className="text-[9px] uppercase tracking-wider px-1.5 py-px"
      style={{ ...styles, borderRadius: 2 }}
    >
      {label}
    </span>
  );
}
