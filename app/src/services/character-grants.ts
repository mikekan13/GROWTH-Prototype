/**
 * Character creation grants — pure functions that apply Seed/Root/Branch
 * Forge data onto a character's GrowthCharacter blob.
 *
 * Called by services/character.ts assignMechanics() once the GM has chosen
 * the seed and (optional) roots/branches for a player whose backstory has
 * been approved.
 */
import { prisma } from '@/lib/db';
import { NotFoundError, ValidationError } from '@/lib/errors';
import type { GrowthCharacter, FateDie, SkillGovernor } from '@/types/growth';
import { SKILL_GOVERNORS } from '@/types/growth';

type AttrKey = 'clout' | 'celerity' | 'constitution' | 'focus' | 'flow' | 'willpower' | 'wisdom' | 'wit';
const ATTR_KEYS: AttrKey[] = ['clout', 'celerity', 'constitution', 'focus', 'flow', 'willpower', 'wisdom', 'wit'];

interface SeedData {
  description: string;
  baseFateDie: FateDie;
  frequency: number;
  fatedAge: number;
  baseResist: number;
  attributes: Record<AttrKey, number>; // augments
  skills: string[];
  nectars: string[];
  thorns: string[];
}

interface RootBranchData {
  description: string;
  frequency: number;
  ageAdded: number;
  attributes: Record<AttrKey, number>; // starting levels (additive)
  skills: Array<{ name: string; level: number; governors?: SkillGovernor[] }>;
  nectars: string[];
  thorns: string[];
}

export interface AssignMechanicsInput {
  seedForgeItemId: string;
  rootForgeItemIds?: string[];
  branchForgeItemIds?: string[];
}

/**
 * Apply seed + roots + branches to a character's GrowthCharacter blob.
 * Pure function — caller is responsible for persisting the result.
 */
export function applyCreationGrants(
  character: GrowthCharacter,
  seed: { id: string; name: string; data: SeedData },
  roots: Array<{ id: string; name: string; data: RootBranchData }>,
  branches: Array<{ id: string; name: string; data: RootBranchData }>,
): GrowthCharacter {
  // Deep-ish clone — JSON round-trip is fine for our shape.
  const next: GrowthCharacter = JSON.parse(JSON.stringify(character));

  // ── Seed: augments + Fate Die + Fated Age + Frequency + Base Resist + traits + seed skills
  next.creation = next.creation ?? { seed: { baseFateDie: 'd6' } };
  next.creation.seed = {
    name: seed.name,
    description: seed.data.description,
    baseFateDie: seed.data.baseFateDie,
  };
  next.creation.seedForgeItemId = seed.id;
  next.creation.fatedAge = seed.data.fatedAge;
  // Persist seed aug contributions so they survive recomputeAugments on canvas load.
  next.creation.seed.augments = { ...seed.data.attributes };

  next.fatedAge = seed.data.fatedAge;
  next.identity.fatedAge = seed.data.fatedAge;

  // Frequency starting level + current pool from seed
  next.attributes.frequency = {
    level: seed.data.frequency,
    current: seed.data.frequency,
  };

  // Base Resist
  next.vitals = next.vitals ?? {
    bodyParts: {}, baseResist: 0, restRate: 1, carryLevel: 1, weightStatus: 'Fine',
  };
  next.vitals.baseResist = seed.data.baseResist;

  // Seed augments (positive only by canon; thorns drive negatives)
  for (const k of ATTR_KEYS) {
    const aug = seed.data.attributes[k] ?? 0;
    if (!next.attributes[k]) {
      next.attributes[k] = { level: 1, current: 1, augmentPositive: 0, augmentNegative: 0 };
    }
    next.attributes[k].augmentPositive = (next.attributes[k].augmentPositive ?? 0) + aug;
  }

  // ── Roots: attribute LEVELS (additive), skills, traits
  next.creation.root = roots[0]
    ? { name: roots[0].name, description: roots[0].data.description, gmCreated: true }
    : undefined;

  // ── Branches: attribute LEVELS (additive), skills, traits
  next.creation.branches = branches.map((b, i) => ({
    name: b.name,
    description: b.data.description,
    gmCreated: true,
    order: i,
  }));

  // Apply attribute level grants from all roots + branches
  for (const rb of [...roots, ...branches]) {
    for (const k of ATTR_KEYS) {
      const delta = rb.data.attributes[k] ?? 0;
      if (delta <= 0) continue;
      const a = next.attributes[k];
      a.level = (a.level ?? 0) + delta;
      a.current = a.level; // start at full
    }
    // ageAdded → identity.age
    if (rb.data.ageAdded) {
      next.identity.age = (next.identity.age ?? 0) + rb.data.ageAdded;
    }
  }

  // ── Skills: roots & branches contribute typed skills; seed contributes free-form names
  const skillByName = new Map<string, { name: string; level: number; governors: SkillGovernor[] }>();
  for (const s of next.skills ?? []) {
    skillByName.set(s.name.toLowerCase(), { ...s, governors: (s.governors as SkillGovernor[]) ?? ['focus'] });
  }
  for (const rb of [...roots, ...branches]) {
    for (const s of rb.data.skills ?? []) {
      const key = s.name.toLowerCase();
      const existing = skillByName.get(key);
      const governors = (s.governors ?? ['focus']).filter(g => SKILL_GOVERNORS.includes(g as SkillGovernor)) as SkillGovernor[];
      if (existing) {
        existing.level = Math.max(existing.level, s.level);
        if (!existing.governors.length) existing.governors = governors.length ? governors : ['focus'];
      } else {
        skillByName.set(key, { name: s.name, level: s.level, governors: governors.length ? governors : ['focus'] });
      }
    }
  }
  for (const name of seed.data.skills ?? []) {
    const key = name.toLowerCase();
    if (!skillByName.has(key)) {
      skillByName.set(key, { name, level: 4, governors: ['focus'] }); // seed-granted defaults to d4
    }
  }
  next.skills = Array.from(skillByName.values());

  // ── Traits: nectars + thorns from all three sources (deduped by name)
  const traitByKey = new Map<string, { name: string; type: 'nectar' | 'thorn'; category: 'utility'; description: string; source: string }>();
  for (const t of next.traits ?? []) {
    traitByKey.set(`${t.type}::${t.name.toLowerCase()}`, t as never);
  }
  const pushTraits = (names: string[], type: 'nectar' | 'thorn', source: string) => {
    for (const name of names) {
      const key = `${type}::${name.toLowerCase()}`;
      if (traitByKey.has(key)) continue;
      traitByKey.set(key, {
        name,
        type,
        category: 'utility',
        description: '',
        source,
      });
    }
  };
  pushTraits(seed.data.nectars ?? [], 'nectar', `Seed: ${seed.name}`);
  pushTraits(seed.data.thorns ?? [], 'thorn', `Seed: ${seed.name}`);
  for (const r of roots) {
    pushTraits(r.data.nectars ?? [], 'nectar', `Root: ${r.name}`);
    pushTraits(r.data.thorns ?? [], 'thorn', `Root: ${r.name}`);
  }
  for (const b of branches) {
    pushTraits(b.data.nectars ?? [], 'nectar', `Branch: ${b.name}`);
    pushTraits(b.data.thorns ?? [], 'thorn', `Branch: ${b.name}`);
  }
  next.traits = Array.from(traitByKey.values()) as GrowthCharacter['traits'];

  return next;
}

/**
 * Load Seed/Root/Branch ForgeItems by id and validate they match the requested types.
 */
export async function loadMechanicsForgeItems(
  campaignId: string,
  input: AssignMechanicsInput,
) {
  const allIds = [
    input.seedForgeItemId,
    ...(input.rootForgeItemIds ?? []),
    ...(input.branchForgeItemIds ?? []),
  ];
  if (!allIds.length) throw new ValidationError('At least a seed is required');

  const items = await prisma.forgeItem.findMany({
    where: { id: { in: allIds }, campaignId },
  });

  const byId = new Map(items.map(i => [i.id, i]));

  const seedRow = byId.get(input.seedForgeItemId);
  if (!seedRow) throw new NotFoundError('Seed forge item');
  if (seedRow.type !== 'seed') throw new ValidationError(`${seedRow.name} is not a seed`);
  if (seedRow.status !== 'published') throw new ValidationError(`Seed "${seedRow.name}" must be published first`);

  const roots = (input.rootForgeItemIds ?? []).map(id => {
    const row = byId.get(id);
    if (!row) throw new NotFoundError(`Root forge item ${id}`);
    if (row.type !== 'root') throw new ValidationError(`${row.name} is not a root`);
    if (row.status !== 'published') throw new ValidationError(`Root "${row.name}" must be published first`);
    return row;
  });

  const branches = (input.branchForgeItemIds ?? []).map(id => {
    const row = byId.get(id);
    if (!row) throw new NotFoundError(`Branch forge item ${id}`);
    if (row.type !== 'branch') throw new ValidationError(`${row.name} is not a branch`);
    if (row.status !== 'published') throw new ValidationError(`Branch "${row.name}" must be published first`);
    return row;
  });

  return {
    seed: { id: seedRow.id, name: seedRow.name, data: JSON.parse(seedRow.data) as SeedData },
    roots: roots.map(r => ({ id: r.id, name: r.name, data: JSON.parse(r.data) as RootBranchData })),
    branches: branches.map(b => ({ id: b.id, name: b.name, data: JSON.parse(b.data) as RootBranchData })),
  };
}
