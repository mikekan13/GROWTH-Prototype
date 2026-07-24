/**
 * Advancement service — the trainable → Long-Rest upgrade loop (r-2026-07-15-01).
 *
 * Pure sheet math (no db, no ledger). "Frequency is the character's wallet /
 * health": raising a number on the sheet SPENDS Frequency — 1 per attribute or
 * non-magic skill level, 2 per magic-school level (r-2026-07-23-06: schools are
 * marked by wild-cast failures into magic.<pillar>.trainableSchools).
 *
 * The KRMA does not move owner or amount — the GM owns the players' KRMA, and
 * advancing a stat just shifts 1 KRMA "folder" within that pool (liquid
 * Frequency → crystallized stat), so advancement is TKV-NEUTRAL (max Freq
 * −cost, stat +1) and carries NO ledger transfer (Mike, 2026-07-15).
 *
 * Not capped: the player may advance as many trainables as their max Frequency
 * can pay for; after the Long Rest, ALL trainable marks clear.
 */

import type { GrowthCharacter, MagicSchool } from '@/types/growth';
import { PILLARS, MAGIC_SCHOOLS } from '@/types/growth';
import { setAttributeLevel, updateSkillLevel } from '@/lib/character-actions';
import type { AttributeName } from '@/lib/character-actions';

export type Pillar = 'body' | 'spirit' | 'soul';

/** attribute name → its pillar, derived from PILLARS (single source of truth). */
const ATTRIBUTE_PILLAR: Record<string, Pillar> = (() => {
  const map: Record<string, Pillar> = {};
  (Object.keys(PILLARS) as Pillar[]).forEach((p) => {
    for (const attr of PILLARS[p].attributes) map[attr] = p;
  });
  return map;
})();

export const ADVANCE_COST_ATTRIBUTE = 1;
export const ADVANCE_COST_SKILL = 1;
/** Magic-school levels cost 2 (r-2026-07-15-01) — reserved for the magic follow-up. */
export const ADVANCE_COST_MAGIC_SKILL = 2;

export interface TrainableItem {
  kind: 'attribute' | 'skill' | 'school';
  name: string;
  currentLevel: number;
  /** Frequency to raise this by +1. */
  cost: number;
  /** Pillars this item touches (attribute → its pillar; skill → its governors'
   *  pillars; magic schools have NO body/spirit/soul pillar → empty, see
   *  magicPillar). */
  pillars: Pillar[];
  /** School kind only: which magic pillar (mercy/severity/balance) it belongs to. */
  magicPillar?: 'mercy' | 'severity' | 'balance';
}

export interface AdvancementPick {
  kind: 'attribute' | 'skill' | 'school';
  name: string;
}

export interface AppliedAdvancement {
  kind: 'attribute' | 'skill' | 'school';
  name: string;
  from: number;
  to: number;
  cost: number;
}

export interface AdvancementResult {
  character: GrowthCharacter;
  applied: AppliedAdvancement[];
  frequencySpent: number;
  changes: string[];
}

export class AdvancementError extends Error {}

// ── Marking (set by failed checks; the check routes call these) ──

/** Mark an attribute trainable after a failed raw/unskilled check. No-op for frequency. */
export function markAttributeTrainable(
  character: GrowthCharacter,
  attributeName: string,
): GrowthCharacter {
  if (attributeName === 'frequency') return character; // Frequency is never check-governed.
  const attr = character.attributes[attributeName as keyof typeof character.attributes];
  if (!attr) return character;
  (attr as { trainable?: boolean }).trainable = true;
  return character;
}

/** Mark a skill trainable after a failed skill check. */
export function markSkillTrainable(
  character: GrowthCharacter,
  skillName: string,
): GrowthCharacter {
  const skill = (character.skills ?? []).find(
    (s) => s.name.toLowerCase() === skillName.toLowerCase(),
  );
  if (skill) skill.trainable = true;
  return character;
}

/**
 * Mark a magic school trainable after a failed WILD cast (r-2026-07-23-06;
 * Woven misses never mark). Lives in magic.<pillar>.trainableSchools.
 */
export function markSchoolTrainable(
  character: GrowthCharacter,
  school: MagicSchool,
): GrowthCharacter {
  const pillar = MAGIC_SCHOOLS[school]?.pillar;
  if (!pillar) return character;
  character.magic ??= {
    mercy: { schools: [], knownSpells: [] },
    severity: { schools: [], knownSpells: [] },
    balance: { schools: [], knownSpells: [] },
  };
  const block = character.magic[pillar];
  block.trainableSchools ??= [];
  if (!block.trainableSchools.includes(school)) block.trainableSchools.push(school);
  return character;
}

// ── Listing ──

/** All currently-trainable items (attributes + regular skills), with cost + pillars. */
export function listTrainables(character: GrowthCharacter): TrainableItem[] {
  const items: TrainableItem[] = [];

  for (const [name, attr] of Object.entries(character.attributes)) {
    if (name === 'frequency') continue;
    if ((attr as { trainable?: boolean }).trainable) {
      items.push({
        kind: 'attribute',
        name,
        currentLevel: (attr as { level: number }).level,
        cost: ADVANCE_COST_ATTRIBUTE,
        pillars: ATTRIBUTE_PILLAR[name] ? [ATTRIBUTE_PILLAR[name]] : [],
      });
    }
  }

  for (const skill of character.skills ?? []) {
    if (!skill.trainable) continue;
    const pillars = Array.from(
      new Set((skill.governors ?? []).map((g) => ATTRIBUTE_PILLAR[g]).filter(Boolean)),
    ) as Pillar[];
    items.push({
      kind: 'skill',
      name: skill.name,
      currentLevel: skill.level,
      cost: ADVANCE_COST_SKILL,
      pillars,
    });
  }

  for (const magicPillar of ['mercy', 'severity', 'balance'] as const) {
    const block = character.magic?.[magicPillar];
    for (const school of block?.trainableSchools ?? []) {
      items.push({
        kind: 'school',
        name: school,
        currentLevel: block?.skillLevels?.[school] ?? 0,
        cost: ADVANCE_COST_MAGIC_SKILL,
        pillars: [],
        magicPillar,
      });
    }
  }

  return items;
}

// ── Apply ──

function findTrainable(
  items: TrainableItem[],
  pick: AdvancementPick,
): TrainableItem | undefined {
  return items.find(
    (i) => i.kind === pick.kind && i.name.toLowerCase() === pick.name.toLowerCase(),
  );
}

/**
 * Apply a set of advancement picks atomically. Each pick raises its item +1 and
 * spends its cost from max Frequency. All-or-nothing: if any pick is not
 * trainable, is duplicated, or the total cost would drop max Frequency below 1,
 * nothing is applied. Pure — returns a new character.
 */
export function applyAdvancements(
  character: GrowthCharacter,
  picks: AdvancementPick[],
): AdvancementResult {
  const items = listTrainables(character);
  const seen = new Set<string>();
  const resolved: TrainableItem[] = [];

  for (const pick of picks) {
    const key = `${pick.kind}:${pick.name.toLowerCase()}`;
    if (seen.has(key)) {
      throw new AdvancementError(`Duplicate advancement pick: ${pick.kind} "${pick.name}"`);
    }
    seen.add(key);
    const item = findTrainable(items, pick);
    if (!item) {
      throw new AdvancementError(`"${pick.name}" is not a trainable ${pick.kind}`);
    }
    resolved.push(item);
  }

  const totalCost = resolved.reduce((sum, i) => sum + i.cost, 0);
  const maxFreqBefore = character.attributes.frequency.level;
  if (maxFreqBefore - totalCost < 1) {
    throw new AdvancementError(
      `Not enough Frequency: ${totalCost} needed, max is ${maxFreqBefore} (must stay ≥ 1)`,
    );
  }

  let working = character;
  const applied: AppliedAdvancement[] = [];
  const changes: string[] = [];

  for (const item of resolved) {
    if (item.kind === 'attribute') {
      const res = setAttributeLevel(working, item.name as AttributeName, item.currentLevel + 1);
      working = res.character;
      changes.push(...res.changes);
    } else if (item.kind === 'school') {
      const block = working.magic![item.magicPillar!];
      block.skillLevels ??= {};
      block.skillLevels[item.name as MagicSchool] = item.currentLevel + 1;
      changes.push(`${item.name} (${item.magicPillar}) school: ${item.currentLevel} → ${item.currentLevel + 1}`);
    } else {
      const res = updateSkillLevel(working, item.name, item.currentLevel + 1);
      working = res.character;
      changes.push(...res.changes);
    }
    applied.push({
      kind: item.kind,
      name: item.name,
      from: item.currentLevel,
      to: item.currentLevel + 1,
      cost: item.cost,
    });
  }

  // Spend the Frequency: reduce MAX by the total cost (folder move, TKV-neutral).
  const freqRes = setAttributeLevel(working, 'frequency', maxFreqBefore - totalCost);
  working = freqRes.character;
  changes.push(...freqRes.changes);

  return { character: working, applied, frequencySpent: totalCost, changes };
}

/** Clear ALL trainable marks (attributes + skills + magic schools). Called at Long Rest. */
export function clearTrainables(character: GrowthCharacter): GrowthCharacter {
  for (const attr of Object.values(character.attributes)) {
    if ((attr as { trainable?: boolean }).trainable) (attr as { trainable?: boolean }).trainable = false;
  }
  for (const skill of character.skills ?? []) {
    if (skill.trainable) skill.trainable = false;
  }
  for (const pillar of ['mercy', 'severity', 'balance'] as const) {
    const block = character.magic?.[pillar];
    if (block?.trainableSchools?.length) block.trainableSchools = [];
  }
  return character;
}
