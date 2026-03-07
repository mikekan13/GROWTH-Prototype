'use client';

import type { GrowthInventory } from '@/types/growth';

export default function InventorySection({ inventory }: { inventory: GrowthInventory }) {
  if (inventory.items.length === 0) return null;

  return (
    <div>
      <div className="section-badge inline-block text-sm mb-3">
        Inventory
        <span className="ml-3 text-[var(--accent-teal)] text-xs">
          Weight: {inventory.weight}
        </span>
      </div>

      <div className="space-y-1">
        {inventory.items.map((item, i) => (
          <div key={i} className="flex items-center justify-between text-sm py-1 border-b border-[var(--surface-dark)]/5">
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
              <span>T{item.techLevel}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
