/**
 * Character Actions — Tool-based operations on GrowthCharacter data.
 *
 * Design principle: every action is a pure function that takes character data
 * + parameters and returns updated character data + a description of what changed.
 * This makes every operation callable by both the UI and future AI agents.
 *
 * Each action returns { character, changes } where `changes` is a human-readable
 * array of what happened (for logging, undo, AI audit trail).
 */

import type { GrowthCharacter, GrowthAttributes, GrowthConditions } from '@/types/growth';

// ── Types ──────────────────────────────────────────────────────────────────

export type AttributeName = keyof GrowthAttributes;

export interface ActionResult {
  character: GrowthCharacter;
  changes: string[];
}

// Condition mapping: attribute name → condition key triggered at 0
const DEPLETION_CONDITIONS: Record<string, keyof GrowthConditions> = {
  clout: 'weak',
  celerity: 'clumsy',
  constitution: 'exhausted',
  flow: 'deafened',
  frequency: 'deathsDoor',
  focus: 'muted',
  willpower: 'overwhelmed',
  wisdom: 'confused',
  wit: 'incoherent',
};

// ── Helpers ─────────────────────────────────────────────────────────────────

function getPoolMax(attr: { level: number; augmentPositive?: number; augmentNegative?: number }): number {
  return attr.level + (attr.augmentPositive || 0) - (attr.augmentNegative || 0);
}

function clampCurrent(value: number, max: number): number {
  return Math.max(0, Math.min(max, value));
}

function deepCloneCharacter(c: GrowthCharacter): GrowthCharacter {
  return JSON.parse(JSON.stringify(c));
}

// ── Actions ─────────────────────────────────────────────────────────────────

/**
 * Set an attribute's current pool to a specific value.
 * Clamps to [0, poolMax]. Auto-triggers/clears depletion conditions.
 */
export function updateAttribute(
  character: GrowthCharacter,
  attributeName: AttributeName,
  newCurrent: number
): ActionResult {
  const c = deepCloneCharacter(character);
  const changes: string[] = [];

  const attr = c.attributes[attributeName];
  if (!attr) {
    return { character: c, changes: [`Unknown attribute: ${attributeName}`] };
  }

  const max = attributeName === 'frequency'
    ? attr.level
    : getPoolMax(attr as { level: number; augmentPositive?: number; augmentNegative?: number });

  const clamped = clampCurrent(newCurrent, max);
  const oldCurrent = attr.current;

  if (clamped === oldCurrent) {
    return { character: c, changes: [] };
  }

  attr.current = clamped;
  changes.push(`${attributeName}: ${oldCurrent} → ${clamped}`);

  // Auto-manage depletion conditions
  const conditionKey = DEPLETION_CONDITIONS[attributeName];
  if (conditionKey) {
    const wasConditioned = c.conditions[conditionKey];
    if (clamped <= 0 && !wasConditioned) {
      c.conditions[conditionKey] = true;
      changes.push(`Condition triggered: ${conditionKey}`);
    } else if (clamped > 0 && wasConditioned) {
      c.conditions[conditionKey] = false;
      changes.push(`Condition cleared: ${conditionKey}`);
    }
  }

  return { character: c, changes };
}

/**
 * Spend points from an attribute pool (reduce current by amount).
 * If the attribute depletes, overflow damage goes to Frequency.
 */
export function spendAttribute(
  character: GrowthCharacter,
  attributeName: AttributeName,
  amount: number
): ActionResult {
  if (amount <= 0) {
    return { character, changes: [] };
  }

  const attr = character.attributes[attributeName];
  if (!attr) {
    return { character, changes: [`Unknown attribute: ${attributeName}`] };
  }

  const newCurrent = attr.current - amount;

  // If this would go below 0 and it's not frequency, overflow to frequency
  if (newCurrent < 0 && attributeName !== 'frequency') {
    const overflow = Math.abs(newCurrent);
    const result1 = updateAttribute(character, attributeName, 0);
    const result2 = spendAttribute(result1.character, 'frequency', overflow);
    return {
      character: result2.character,
      changes: [
        ...result1.changes,
        `Overflow: ${overflow} damage to Frequency`,
        ...result2.changes,
      ],
    };
  }

  return updateAttribute(character, attributeName, newCurrent);
}

/**
 * Restore points to an attribute pool (increase current by amount).
 */
export function restoreAttribute(
  character: GrowthCharacter,
  attributeName: AttributeName,
  amount: number
): ActionResult {
  if (amount <= 0) {
    return { character, changes: [] };
  }

  const attr = character.attributes[attributeName];
  if (!attr) {
    return { character, changes: [`Unknown attribute: ${attributeName}`] };
  }

  return updateAttribute(character, attributeName, attr.current + amount);
}

/**
 * Set an attribute's base level.
 * Adjusts current pool if it exceeds new max.
 */
export function setAttributeLevel(
  character: GrowthCharacter,
  attributeName: AttributeName,
  newLevel: number
): ActionResult {
  const c = deepCloneCharacter(character);
  const changes: string[] = [];

  const attr = c.attributes[attributeName];
  if (!attr) {
    return { character: c, changes: [`Unknown attribute: ${attributeName}`] };
  }

  const oldLevel = attr.level;
  attr.level = Math.max(1, newLevel);
  changes.push(`${attributeName} level: ${oldLevel} → ${attr.level}`);

  // Clamp current to new max
  const newMax = attributeName === 'frequency'
    ? attr.level
    : getPoolMax(attr as { level: number; augmentPositive?: number; augmentNegative?: number });

  if (attr.current > newMax) {
    const oldCurrent = attr.current;
    attr.current = newMax;
    changes.push(`${attributeName} current clamped: ${oldCurrent} → ${newMax}`);
  }

  // Check conditions
  const conditionKey = DEPLETION_CONDITIONS[attributeName];
  if (conditionKey) {
    if (attr.current <= 0 && !c.conditions[conditionKey]) {
      c.conditions[conditionKey] = true;
      changes.push(`Condition triggered: ${conditionKey}`);
    } else if (attr.current > 0 && c.conditions[conditionKey]) {
      c.conditions[conditionKey] = false;
      changes.push(`Condition cleared: ${conditionKey}`);
    }
  }

  return { character: c, changes };
}
