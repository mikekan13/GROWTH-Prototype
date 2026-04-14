/**
 * Changelog Utilities — Pure functions for diffing character data.
 */

import type { FieldChange, ChangeCategory } from '@/types/changelog';

/**
 * Deep-diff two objects and return FieldChange[] for all changed leaf values.
 * Only diffs primitive values (string, number, boolean, null).
 * Arrays are compared by JSON stringification.
 */
export function diffObjects(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  prefix = ''
): FieldChange[] {
  const changes: FieldChange[] = [];
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after)]);

  for (const key of allKeys) {
    const path = prefix ? `${prefix}.${key}` : key;
    const oldVal = before[key];
    const newVal = after[key];

    if (oldVal === newVal) continue;

    // Both are plain objects — recurse
    if (
      oldVal && newVal &&
      typeof oldVal === 'object' && typeof newVal === 'object' &&
      !Array.isArray(oldVal) && !Array.isArray(newVal)
    ) {
      changes.push(
        ...diffObjects(
          oldVal as Record<string, unknown>,
          newVal as Record<string, unknown>,
          path
        )
      );
      continue;
    }

    // Arrays — compare by JSON
    if (Array.isArray(oldVal) || Array.isArray(newVal)) {
      if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
        changes.push({ path, previousValue: oldVal, newValue: newVal });
      }
      continue;
    }

    // Primitives
    changes.push({ path, previousValue: oldVal ?? null, newValue: newVal ?? null });
  }

  return changes;
}

/**
 * Infer the primary ChangeCategory from a set of FieldChanges.
 */
export function inferCategory(changes: FieldChange[]): ChangeCategory {
  if (changes.length === 0) return 'attribute';

  const firstPath = changes[0].path;
  if (firstPath.startsWith('attributes.')) return 'attribute';
  if (firstPath.startsWith('conditions.')) return 'condition';
  if (firstPath.startsWith('inventory.')) return 'inventory';
  if (firstPath.startsWith('vitals.equipment')) return 'equipment';
  if (firstPath.startsWith('vitals.')) return 'vitals';
  if (firstPath.startsWith('skills')) return 'skill';
  if (firstPath.startsWith('magic.')) return 'magic';
  if (firstPath.startsWith('traits')) return 'trait';
  if (firstPath.startsWith('grovines')) return 'grovine';
  if (firstPath.startsWith('identity.')) return 'identity';
  if (firstPath.startsWith('levels.')) return 'levels';
  if (firstPath.startsWith('fears')) return 'fear';
  if (firstPath.startsWith('harvests')) return 'harvest';
  if (firstPath.startsWith('backstory.')) return 'backstory';

  return 'attribute';
}

/**
 * Generate a human-readable summary from FieldChanges.
 */
export function summarizeChanges(changes: FieldChange[]): string {
  if (changes.length === 0) return 'No changes';
  if (changes.length === 1) {
    const c = changes[0];
    return formatSingleChange(c);
  }

  // Group by category
  const categories = new Set(changes.map(c => c.path.split('.')[0]));
  if (categories.size === 1) {
    const cat = [...categories][0];
    // Multiple attribute changes
    if (cat === 'attributes') {
      const attrChanges = changes.filter(c => c.path.endsWith('.current'));
      if (attrChanges.length > 0) {
        const parts = attrChanges.map(c => {
          const attrName = c.path.split('.')[1];
          return `${attrName}: ${c.previousValue} → ${c.newValue}`;
        });
        return parts.join(', ');
      }
    }
  }

  return `${changes.length} fields changed`;
}

function formatSingleChange(c: FieldChange): string {
  const parts = c.path.split('.');

  // attributes.X.current
  if (parts[0] === 'attributes' && parts[2] === 'current') {
    const attr = parts[1];
    const prev = c.previousValue as number;
    const next = c.newValue as number;
    const delta = next - prev;
    if (delta < 0) return `${attr}: spent ${Math.abs(delta)} (${prev} → ${next})`;
    return `${attr}: restored ${delta} (${prev} → ${next})`;
  }

  // conditions.X
  if (parts[0] === 'conditions') {
    const condition = parts[1];
    return c.newValue ? `Condition: ${condition} triggered` : `Condition: ${condition} cleared`;
  }

  return `${c.path}: ${JSON.stringify(c.previousValue)} → ${JSON.stringify(c.newValue)}`;
}
