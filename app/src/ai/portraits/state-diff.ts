/**
 * GRO.WTH Portrait Pipeline — State Diff
 *
 * Detects whether a character's visual state has changed enough
 * to warrant a portrait regeneration.
 */

import type { PortraitCharacterData } from './types';

export interface StateDiffResult {
  hasVisualChanges: boolean;
  changes: VisualChange[];
  severity: 'none' | 'minor' | 'major';
}

export interface VisualChange {
  category: 'equipment' | 'wound' | 'condition' | 'trait' | 'identity' | 'environment';
  description: string;
  severity: 'minor' | 'major';
}

/**
 * Compare two character states and determine if the portrait needs regeneration.
 *
 * @param previous - Character state when last portrait was generated (from stateSnapshot)
 * @param current - Current character state
 * @returns Diff result with list of visual changes
 */
export function diffVisualState(
  previous: PortraitCharacterData,
  current: PortraitCharacterData,
): StateDiffResult {
  const changes: VisualChange[] = [];

  // Check equipment changes
  diffEquipment(previous, current, changes);

  // Check wound changes
  diffWounds(previous, current, changes);

  // Check condition changes
  diffConditions(previous, current, changes);

  // Check trait changes
  diffTraits(previous, current, changes);

  // Check identity changes (rare — re-lock territory)
  diffIdentity(previous, current, changes);

  // Check environment changes
  diffEnvironment(previous, current, changes);

  const hasMajor = changes.some(c => c.severity === 'major');
  const severity = changes.length === 0 ? 'none' : hasMajor ? 'major' : 'minor';

  return {
    hasVisualChanges: changes.length > 0,
    changes,
    severity,
  };
}

function diffEquipment(
  prev: PortraitCharacterData,
  curr: PortraitCharacterData,
  changes: VisualChange[],
): void {
  const prevSlots = new Map(prev.visibleEquipment.map(e => [e.slot, e]));
  const currSlots = new Map(curr.visibleEquipment.map(e => [e.slot, e]));

  // New equipment
  for (const [slot, equip] of currSlots) {
    const prevEquip = prevSlots.get(slot);
    if (!prevEquip) {
      changes.push({
        category: 'equipment',
        description: `Equipped ${equip.name} (${slot})`,
        severity: 'major',
      });
    } else if (prevEquip.name !== equip.name) {
      changes.push({
        category: 'equipment',
        description: `Changed ${slot}: ${prevEquip.name} → ${equip.name}`,
        severity: 'major',
      });
    } else if (prevEquip.condition !== equip.condition) {
      changes.push({
        category: 'equipment',
        description: `${equip.name} condition changed (${prevEquip.condition} → ${equip.condition})`,
        severity: 'minor',
      });
    }
  }

  // Removed equipment
  for (const [slot, equip] of prevSlots) {
    if (!currSlots.has(slot)) {
      changes.push({
        category: 'equipment',
        description: `Removed ${equip.name} (${slot})`,
        severity: 'major',
      });
    }
  }
}

function diffWounds(
  prev: PortraitCharacterData,
  curr: PortraitCharacterData,
  changes: VisualChange[],
): void {
  const prevVisible = prev.wounds.filter(w => w.isVisible);
  const currVisible = curr.wounds.filter(w => w.isVisible);

  // Simplified: compare wound count and severity on visible body parts
  const prevMap = new Map(prevVisible.map(w => [w.bodyPart, w]));
  const currMap = new Map(currVisible.map(w => [w.bodyPart, w]));

  for (const [part, wound] of currMap) {
    const prevWound = prevMap.get(part);
    if (!prevWound) {
      changes.push({
        category: 'wound',
        description: `New ${wound.severity} wound on ${part.toLowerCase()}`,
        severity: wound.severity === 'critical' || wound.severity === 'severe' ? 'major' : 'minor',
      });
    } else if (prevWound.severity !== wound.severity) {
      changes.push({
        category: 'wound',
        description: `Wound on ${part.toLowerCase()} changed: ${prevWound.severity} → ${wound.severity}`,
        severity: 'minor',
      });
    }
  }

  for (const [part] of prevMap) {
    if (!currMap.has(part)) {
      changes.push({
        category: 'wound',
        description: `Wound healed on ${part.toLowerCase()}`,
        severity: 'minor',
      });
    }
  }
}

function diffConditions(
  prev: PortraitCharacterData,
  curr: PortraitCharacterData,
  changes: VisualChange[],
): void {
  const prevNames = new Set(prev.conditions.map(c => c.name));
  const currNames = new Set(curr.conditions.map(c => c.name));

  for (const name of currNames) {
    if (!prevNames.has(name)) {
      changes.push({
        category: 'condition',
        description: `Now ${name}`,
        severity: 'minor',
      });
    }
  }

  for (const name of prevNames) {
    if (!currNames.has(name)) {
      changes.push({
        category: 'condition',
        description: `No longer ${name}`,
        severity: 'minor',
      });
    }
  }
}

function diffTraits(
  prev: PortraitCharacterData,
  curr: PortraitCharacterData,
  changes: VisualChange[],
): void {
  const prevNames = new Set(prev.visualTraits.map(t => t.name));
  const currNames = new Set(curr.visualTraits.map(t => t.name));

  for (const trait of curr.visualTraits) {
    if (!prevNames.has(trait.name)) {
      changes.push({
        category: 'trait',
        description: `New visual trait: ${trait.name} (${trait.visualDescription})`,
        severity: 'major',
      });
    }
  }

  for (const trait of prev.visualTraits) {
    if (!currNames.has(trait.name)) {
      changes.push({
        category: 'trait',
        description: `Lost visual trait: ${trait.name}`,
        severity: 'major',
      });
    }
  }
}

function diffIdentity(
  prev: PortraitCharacterData,
  curr: PortraitCharacterData,
  changes: VisualChange[],
): void {
  const pi = prev.identity;
  const ci = curr.identity;

  if (pi.hairColor !== ci.hairColor || pi.hairStyle !== ci.hairStyle) {
    changes.push({
      category: 'identity',
      description: 'Hair changed',
      severity: 'major',
    });
  }

  if (pi.age !== ci.age && pi.age !== undefined && ci.age !== undefined) {
    const ageDiff = Math.abs(ci.age - pi.age);
    if (ageDiff >= 5) {
      changes.push({
        category: 'identity',
        description: `Aged ${ageDiff} years`,
        severity: 'major',
      });
    }
  }

  // Check distinguishing features
  const prevFeatures = new Set(pi.distinguishingFeatures || []);
  const currFeatures = new Set(ci.distinguishingFeatures || []);
  for (const f of currFeatures) {
    if (!prevFeatures.has(f)) {
      changes.push({
        category: 'identity',
        description: `New distinguishing feature: ${f}`,
        severity: 'major',
      });
    }
  }
}

function diffEnvironment(
  prev: PortraitCharacterData,
  curr: PortraitCharacterData,
  changes: VisualChange[],
): void {
  if (prev.environment?.location !== curr.environment?.location) {
    changes.push({
      category: 'environment',
      description: 'Location changed',
      severity: 'minor',
    });
  }

  if (prev.environment?.timeOfDay !== curr.environment?.timeOfDay) {
    changes.push({
      category: 'environment',
      description: 'Time of day changed',
      severity: 'minor',
    });
  }
}
