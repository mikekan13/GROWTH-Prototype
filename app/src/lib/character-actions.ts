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

import type { GrowthCharacter, GrowthAttributes, GrowthConditions, GrowthSkill, GrowthTrait, SkillGovernor, AugmentSource, AttributeName, TraitMechanic } from '@/types/growth';

// ── Types ──────────────────────────────────────────────────────────────────

export type { AttributeName };

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

// ── Trait mechanics (Dialed to Eleven, Michael 2026-11-05) ──────────────────
// Mechanics are DATA on traits; these readers are generic.

/** Mechanics carried by the sheet's nectars/thorns and LIVE blossoms (blossoms are rows in traits). */
function liveMechanics(c: GrowthCharacter): Array<{ trait: GrowthTrait; m: TraitMechanic }> {
  const out: Array<{ trait: GrowthTrait; m: TraitMechanic }> = [];
  for (const t of c.traits ?? []) for (const m of t.mechanics ?? []) out.push({ trait: t, m });
  return out;
}

/** Product of every pool_multiplier that touches `attr` in `dir` ('out' = spend, 'in' = restore). */
function poolFactor(c: GrowthCharacter, attr: AttributeName, dir: 'in' | 'out'): number {
  let f = 1;
  for (const { m } of liveMechanics(c)) {
    if (m.kind === 'pool_multiplier' && m.pools.includes(attr) && (m.direction === 'both' || m.direction === dir)) f *= m.factor;
  }
  return f;
}

/** Name of a live trait that makes Effort all-or-nothing, else null. */
export function effortAllOrNothingSource(c: GrowthCharacter | null | undefined): string | null {
  if (!c) return null;
  for (const { trait, m } of liveMechanics(c)) if (m.kind === 'effort_all_or_nothing') return trait.name;
  return null;
}

/**
 * The all-or-nothing rule as a check: returns the error text when `effort` is a partial wager
 * of `available` under a live all-or-nothing trait, else null.
 */
export function effortAllOrNothingViolation(c: GrowthCharacter | null | undefined, effort: number, available: number): string | null {
  const src = effortAllOrNothingSource(c);
  if (!src || effort <= 0 || effort >= available) return null;
  return `${src}: all or nothing — wager the whole ${available} or none`;
}

/**
 * Generate blossoms whose `when` is met and remove blossoms whose trigger expiry is met.
 * Idempotent (dedupe by name + source). Mutates the (already cloned) character.
 */
function settleTraitTriggers(c: GrowthCharacter, changes: string[]): void {
  if (!Array.isArray(c.traits)) return;
  for (const { trait, m } of liveMechanics(c)) {
    if (m.kind !== 'generate_blossom' || trait.type === 'blossom') continue;
    const cur = c.attributes[m.when.pool]?.current;
    if (cur === undefined || cur > m.when.at) continue;
    if (c.traits.some(t => t.type === 'blossom' && t.name === m.blossom.name && t.source === trait.name)) continue;
    c.traits.push({
      name: m.blossom.name, type: 'blossom', category: 'fatigue', pillar: m.blossom.pillar,
      description: m.blossom.description, source: trait.name,
      mechanics: m.blossom.mechanics, expiry: m.blossom.expiry,
    });
    changes.push(`Blossom generated: ${m.blossom.name} (from ${trait.name})`);
  }
  c.traits = c.traits.filter(t => {
    const e = t.expiry;
    if (t.type !== 'blossom' || !e || e.kind !== 'trigger' || !e.pool || e.above === undefined) return true;
    const cur = c.attributes[e.pool]?.current;
    if (cur !== undefined && cur > e.above) { changes.push(`Blossom expired: ${t.name}`); return false; }
    return true;
  });
}

/** Blossoms generated/expired between two sheets (for the campaign event). */
export function diffBlossoms(before: GrowthCharacter, after: GrowthCharacter): Array<{ action: 'generated' | 'expired'; name: string; source?: string }> {
  const key = (t: GrowthTrait) => `${t.name}|${t.source ?? ''}`;
  const b = new Map((before.traits ?? []).filter(t => t.type === 'blossom').map(t => [key(t), t]));
  const a = new Map((after.traits ?? []).filter(t => t.type === 'blossom').map(t => [key(t), t]));
  const out: Array<{ action: 'generated' | 'expired'; name: string; source?: string }> = [];
  for (const [k, t] of a) if (!b.has(k)) out.push({ action: 'generated', name: t.name, source: t.source });
  for (const [k, t] of b) if (!a.has(k)) out.push({ action: 'expired', name: t.name, source: t.source });
  return out;
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

  settleTraitTriggers(c, changes);
  return { character: c, changes };
}

/**
 * Spend points from an attribute pool (reduce current by amount).
 * If the attribute depletes, overflow damage goes to Frequency.
 */
export function spendAttribute(
  character: GrowthCharacter,
  attributeName: AttributeName,
  amount: number,
  opts?: { exempt?: boolean }
): ActionResult {
  if (amount <= 0) {
    return { character, changes: [] };
  }

  const attr = character.attributes[attributeName];
  if (!attr) {
    return { character, changes: [`Unknown attribute: ${attributeName}`] };
  }

  // Dialed to Eleven (Michael 2026-11-05): pool_multiplier mechanics scale the hit. `exempt` =
  // "Feelings are the instrument" (the player chose to move someone). The overflow to Frequency
  // below is not re-scaled: frequency is in no multiplier's pool list.
  const factor = opts?.exempt ? 1 : poolFactor(character, attributeName, 'out');
  if (factor !== 1) amount = Math.round(amount * factor);
  if (amount <= 0) return { character, changes: [] };

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

  // Dialed to Eleven (Michael 2026-11-05): recovery is scaled too (updateAttribute clamps at max).
  const factor = poolFactor(character, attributeName, 'in');
  if (factor !== 1) amount = Math.round(amount * factor);

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

// ── Skill Actions ──────────────────────────────────────────────────────────

/**
 * Add a new skill to the character. Requires at least one governor.
 */
export function addSkill(
  character: GrowthCharacter,
  skill: { name: string; level?: number; governors: SkillGovernor[]; description?: string; forgeItemId?: string }
): ActionResult {
  const c = deepCloneCharacter(character);
  if (!Array.isArray(c.skills)) c.skills = [];
  const existing = c.skills.find(s => s.name.toLowerCase() === skill.name.toLowerCase());
  if (existing) {
    return { character: c, changes: [`Skill "${skill.name}" already exists`] };
  }
  if (!skill.governors || skill.governors.length === 0) {
    return { character: c, changes: [`Skill "${skill.name}" requires at least one governor attribute`] };
  }
  const newSkill: GrowthSkill = {
    name: skill.name,
    level: Math.max(1, Math.min(20, skill.level || 1)),
    governors: skill.governors,
    description: skill.description,
    forgeItemId: skill.forgeItemId,
  };
  c.skills.push(newSkill);
  const govStr = newSkill.governors.join(', ');
  return { character: c, changes: [`Added skill: ${newSkill.name} (level ${newSkill.level}, gov: ${govStr})`] };
}

/**
 * Remove a skill by name.
 */
export function removeSkill(
  character: GrowthCharacter,
  skillName: string
): ActionResult {
  const c = deepCloneCharacter(character);
  if (!Array.isArray(c.skills)) c.skills = [];
  const idx = c.skills.findIndex(s => s.name.toLowerCase() === skillName.toLowerCase());
  if (idx === -1) {
    return { character: c, changes: [`Skill "${skillName}" not found`] };
  }
  c.skills.splice(idx, 1);
  return { character: c, changes: [`Removed skill: ${skillName}`] };
}

/**
 * Update a skill's level (1-20).
 */
export function updateSkillLevel(
  character: GrowthCharacter,
  skillName: string,
  newLevel: number
): ActionResult {
  const c = deepCloneCharacter(character);
  if (!Array.isArray(c.skills)) c.skills = [];
  const skill = c.skills.find(s => s.name.toLowerCase() === skillName.toLowerCase());
  if (!skill) {
    return { character: c, changes: [`Skill "${skillName}" not found`] };
  }
  const oldLevel = skill.level;
  skill.level = Math.max(1, Math.min(20, newLevel));
  if (skill.level === oldLevel) {
    return { character: c, changes: [] };
  }
  return { character: c, changes: [`${skill.name} level: ${oldLevel} → ${skill.level}`] };
}

/**
 * Update a skill's properties (governors, description).
 */
export function updateSkill(
  character: GrowthCharacter,
  skillName: string,
  updates: { governors?: SkillGovernor[]; description?: string }
): ActionResult {
  const c = deepCloneCharacter(character);
  if (!Array.isArray(c.skills)) c.skills = [];
  const skill = c.skills.find(s => s.name.toLowerCase() === skillName.toLowerCase());
  if (!skill) {
    return { character: c, changes: [`Skill "${skillName}" not found`] };
  }
  const changes: string[] = [];
  if (updates.governors !== undefined && updates.governors.length > 0) {
    const oldGov = skill.governors.join(', ');
    skill.governors = updates.governors;
    const newGov = skill.governors.join(', ');
    if (oldGov !== newGov) changes.push(`${skill.name} governors: ${oldGov} → ${newGov}`);
  }
  if (updates.description !== undefined && updates.description !== skill.description) {
    skill.description = updates.description;
    changes.push(`${skill.name} description updated`);
  }
  return { character: c, changes };
}

// ── Rest Actions ──────────────────────────────────────────────────────────

const ALL_ATTRIBUTES: AttributeName[] = [
  'clout', 'celerity', 'constitution',
  'flow', 'frequency', 'focus',
  'willpower', 'wisdom', 'wit',
];

export interface RestResult extends ActionResult {
  applied: boolean;
  reason?: string;
}

/**
 * Short Rest: deplete 1 Frequency → restore 1 point to every other attribute pool.
 * Cannot rest if Overwhelmed (Willpower=0) or Frequency current=0.
 */
export function restShort(character: GrowthCharacter): RestResult {
  // Check Overwhelmed condition
  if (character.conditions.overwhelmed) {
    return { character, changes: [], applied: false, reason: 'Overwhelmed (Willpower depleted — cannot take Short Rest)' };
  }

  // Check Frequency available
  const freq = character.attributes.frequency;
  if (!freq || freq.current <= 0) {
    return { character, changes: [], applied: false, reason: 'Frequency depleted (no pool to spend)' };
  }

  // Spend 1 Frequency
  let result = spendAttribute(character, 'frequency', 1);
  const changes = [...result.changes];

  // Restore 1 to every other attribute
  for (const attr of ALL_ATTRIBUTES) {
    if (attr === 'frequency') continue;
    const restoreResult = restoreAttribute(result.character, attr, 1);
    result = { character: restoreResult.character, changes: [] };
    changes.push(...restoreResult.changes);
  }

  return { character: result.character, changes, applied: true };
}

/**
 * Long Rest: refill ALL attribute pools (including Frequency) to max.
 * Clears all depletion conditions. No cost, no restrictions.
 *
 * Also clears ALL trainable marks (r-2026-07-15-01): advancement picks are
 * applied BEFORE calling this (see the rest route), then the Long Rest wipes
 * every remaining mark — trained or not. Inlined here (not imported from
 * services/advancement) because advancement.ts imports from this module.
 */
export function restLong(character: GrowthCharacter): RestResult {
  const c = deepCloneCharacter(character);
  const changes: string[] = [];

  let marksCleared = 0;
  for (const attr of Object.values(c.attributes)) {
    const a = attr as { trainable?: boolean };
    if (a.trainable) { a.trainable = false; marksCleared++; }
  }
  for (const skill of c.skills ?? []) {
    if (skill.trainable) { skill.trainable = false; marksCleared++; }
  }
  for (const pillar of ['mercy', 'severity', 'balance'] as const) {
    const block = c.magic?.[pillar];
    if (block?.trainableSchools?.length) {
      marksCleared += block.trainableSchools.length;
      block.trainableSchools = [];
    }
  }
  if (marksCleared > 0) changes.push(`Trainable marks cleared: ${marksCleared}`);

  for (const attrName of ALL_ATTRIBUTES) {
    const attr = c.attributes[attrName];
    if (!attr) continue;

    const max = attrName === 'frequency'
      ? attr.level
      : getPoolMax(attr as { level: number; augmentPositive?: number; augmentNegative?: number });

    if (attr.current < max) {
      const old = attr.current;
      attr.current = max;
      changes.push(`${attrName}: ${old} → ${max}`);
    }

    // Clear depletion condition
    const conditionKey = DEPLETION_CONDITIONS[attrName];
    if (conditionKey && c.conditions[conditionKey]) {
      c.conditions[conditionKey] = false;
      changes.push(`Condition cleared: ${conditionKey}`);
    }
  }

  return { character: c, changes, applied: true };
}

// ── Augment Recomputation ──────────────────────────────────────────────────

interface InventoryItemLike {
  id: string;
  name: string;
  type: string;
  equipped?: boolean;
  description?: string;
  rarity?: string;
  weight?: number;
  value?: number;
  augments?: Array<{ attribute: string; value: number }>;
}

interface TraitLike {
  name: string;
  type: 'nectar' | 'blossom' | 'thorn';
  description?: string;
  augments?: Array<{ attribute: string; value: number }>;
}

const STANDARD_ATTRS = ['clout', 'celerity', 'constitution', 'flow', 'focus', 'willpower', 'wisdom', 'wit'] as const;

/**
 * Recompute augmentPositive, augmentNegative, and augmentSources for all attributes
 * from equipped inventory items and traits. Pure function — returns updated character.
 */
export function recomputeAugments(character: GrowthCharacter): ActionResult {
  const c = deepCloneCharacter(character);
  const changes: string[] = [];

  // Build per-attribute source lists
  const sourcesMap: Record<string, AugmentSource[]> = {};
  for (const attr of STANDARD_ATTRS) {
    sourcesMap[attr] = [];
  }

  // Collect from equipped inventory items
  const inventory = (c as unknown as Record<string, unknown>).inventory;
  if (Array.isArray(inventory)) {
    for (const item of inventory as InventoryItemLike[]) {
      if (!item.equipped || !item.augments) continue;
      for (const aug of item.augments) {
        if (sourcesMap[aug.attribute]) {
          sourcesMap[aug.attribute].push({
            name: item.name,
            value: aug.value,
            sourceType: 'item',
            sourceId: item.id,
            description: item.description,
            stats: {
              'Type': `${item.type}${item.rarity ? ` — ${item.rarity}` : ''}`,
              ...(item.weight != null ? { 'Weight': `${item.weight} lb` } : {}),
              ...(item.value != null ? { 'Value': `${item.value} \u049CV` } : {}),
              'Status': 'Equipped',
            },
          });
        }
      }
    }
  }

  // Collect from traits
  const traits = c.traits;
  if (Array.isArray(traits)) {
    for (const trait of traits as TraitLike[]) {
      if (!trait.augments) continue;
      for (const aug of trait.augments) {
        if (sourcesMap[aug.attribute]) {
          sourcesMap[aug.attribute].push({
            name: trait.name,
            value: aug.value,
            sourceType: trait.type,
            description: trait.description,
          });
        }
      }
    }
  }

  // Collect from seed (creation.seed.augments) — set by applyCreationGrants.
  // Treated as a permanent positive source so it shows up in the breakdown UI.
  const seedAugs = c.creation?.seed?.augments;
  const seedName = c.creation?.seed?.name;
  if (seedAugs && seedName) {
    for (const attr of STANDARD_ATTRS) {
      const v = (seedAugs as Record<string, number | undefined>)[attr] ?? 0;
      if (v && v !== 0 && sourcesMap[attr]) {
        sourcesMap[attr].push({
          name: `Seed: ${seedName}`,
          value: v,
          sourceType: 'other',
          description: 'Seed-granted augment',
        });
      }
    }
  }

  // Apply to each attribute
  for (const attrName of STANDARD_ATTRS) {
    const attr = c.attributes[attrName];
    if (!attr || !('augmentPositive' in attr)) continue;

    const sources = sourcesMap[attrName];
    const oldPos = attr.augmentPositive || 0;
    const oldNeg = attr.augmentNegative || 0;
    const newPos = sources.filter(s => s.value > 0).reduce((sum, s) => sum + s.value, 0);
    const newNeg = sources.filter(s => s.value < 0).reduce((sum, s) => sum + Math.abs(s.value), 0);

    attr.augmentPositive = newPos;
    attr.augmentNegative = newNeg;
    attr.augmentSources = sources.length > 0 ? sources : undefined;

    if (oldPos !== newPos || oldNeg !== newNeg) {
      changes.push(`${attrName}: augments changed from +${oldPos}/-${oldNeg} to +${newPos}/-${newNeg}`);
    }
  }

  return { character: c, changes };
}

// ── Trait Actions ──────────────────────────────────────────────────────────

/**
 * Add a trait (nectar / blossom / thorn) to the character. Idempotent on
 * (type, lowercased name) — duplicates are silently merged.
 */
export function addTrait(
  character: GrowthCharacter,
  trait: { name: string; type: 'nectar' | 'blossom' | 'thorn'; pillar?: 'body' | 'spirit' | 'soul'; category?: string; description?: string; source?: string; mechanicalEffect?: string; durationCycles?: number; expiresAtCycle?: number },
): ActionResult {
  const c = deepCloneCharacter(character);
  if (!Array.isArray(c.traits)) c.traits = [];
  const name = trait.name.trim();
  if (!name) return { character: c, changes: ['Trait name is required'] };
  const key = `${trait.type}::${name.toLowerCase()}`;
  const existing = c.traits.find(t => `${t.type}::${t.name.toLowerCase()}` === key);
  if (existing) return { character: c, changes: [`Trait "${name}" already exists`] };

  // INV-07: Nectar+Thorn count cap = Fate Die value. Blossoms are exempt.
  if (trait.type !== 'blossom') {
    const fdStr = c.creation?.seed?.baseFateDie || 'd6';
    const cap = parseInt(fdStr.replace(/\D/g, ''), 10) || 6;
    const permanentCount = c.traits.filter(t => t.type === 'nectar' || t.type === 'thorn').length;
    if (permanentCount >= cap) {
      return { character: c, changes: [`Trait cap reached: ${permanentCount}/${cap} permanent traits (Fate Die ${fdStr}). Blossoms are exempt.`] };
    }
  }

  const next: GrowthTrait = {
    name,
    type: trait.type,
    pillar: trait.pillar ?? 'spirit',
    category: (trait.category as GrowthTrait['category']) ?? 'utility',
    description: trait.description ?? '',
    source: trait.source,
    mechanicalEffect: trait.mechanicalEffect,
    ...(trait.type === 'blossom' && trait.durationCycles ? { durationCycles: trait.durationCycles } : {}),
    ...(trait.type === 'blossom' && trait.expiresAtCycle !== undefined ? { expiresAtCycle: trait.expiresAtCycle } : {}),
  };
  c.traits.push(next);
  return { character: c, changes: [`Added ${trait.type} (${next.pillar}): ${name}`] };
}

/**
 * Remove a trait by (type, name). Case-insensitive on name.
 */
export function removeTrait(
  character: GrowthCharacter,
  type: 'nectar' | 'blossom' | 'thorn',
  name: string,
): ActionResult {
  const c = deepCloneCharacter(character);
  if (!Array.isArray(c.traits)) c.traits = [];
  const key = `${type}::${name.toLowerCase()}`;
  const idx = c.traits.findIndex(t => `${t.type}::${t.name.toLowerCase()}` === key);
  if (idx === -1) return { character: c, changes: [`Trait "${name}" not found`] };
  c.traits.splice(idx, 1);
  return { character: c, changes: [`Removed ${type}: ${name}`] };
}

/**
 * Patch a trait's editable fields. Identified by (type, name) — the original key.
 */
export function updateTrait(
  character: GrowthCharacter,
  type: 'nectar' | 'blossom' | 'thorn',
  name: string,
  updates: { description?: string; mechanicalEffect?: string; source?: string; category?: string; pillar?: 'body' | 'spirit' | 'soul' },
): ActionResult {
  const c = deepCloneCharacter(character);
  if (!Array.isArray(c.traits)) c.traits = [];
  const key = `${type}::${name.toLowerCase()}`;
  const trait = c.traits.find(t => `${t.type}::${t.name.toLowerCase()}` === key);
  if (!trait) return { character: c, changes: [`Trait "${name}" not found`] };
  const changes: string[] = [];
  if (updates.description !== undefined && updates.description !== trait.description) {
    trait.description = updates.description;
    changes.push(`${name}: description updated`);
  }
  if (updates.mechanicalEffect !== undefined && updates.mechanicalEffect !== trait.mechanicalEffect) {
    trait.mechanicalEffect = updates.mechanicalEffect;
    changes.push(`${name}: mechanical effect updated`);
  }
  if (updates.source !== undefined && updates.source !== trait.source) {
    trait.source = updates.source;
    changes.push(`${name}: source updated`);
  }
  if (updates.category !== undefined && updates.category !== trait.category) {
    trait.category = updates.category as GrowthTrait['category'];
    changes.push(`${name}: category → ${updates.category}`);
  }
  if (updates.pillar !== undefined && updates.pillar !== trait.pillar) {
    trait.pillar = updates.pillar;
    changes.push(`${name}: pillar → ${updates.pillar}`);
  }
  return { character: c, changes };
}
