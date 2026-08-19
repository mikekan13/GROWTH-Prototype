/**
 * Block condition enforcement (Mike ruling 2026-08-19): "Any block can have
 * requirements or even restrictions. These have to be enforced for balance
 * sake across the meta — it can't be left up to a GM."
 *
 * Pure functions. `requires`: ALL conditions must hold. `restricted`: NONE
 * may hold. The context is assembled from the FULL creation set so ordering
 * doesn't matter (a root may require a branch chosen later in the list).
 * Enforced at character assembly (character-grants.applyCreationGrants);
 * later attach paths (traits, skills, items) reuse evaluateBlockConditions.
 */

import type { BlockCondition } from './forge-schemas';

export interface ConditionContext {
  /** The character's seed name. */
  seedName: string;
  /** Names of every root/branch/nectar/thorn/blossom in the set, by type. */
  blocks: Array<{ type: string; name: string }>;
  /** Starting age = Σ ageAdded (ruling 2026-08-19). */
  age: number;
  /** Assembled attribute LEVELS (after root/branch grants). */
  attributeLevels: Record<string, number>;
  /** Assembled skill levels (highest grant per name). */
  skillLevels: Record<string, number>;
}

const norm = (s: string) => s.trim().toLowerCase();

/** Deterministic evaluation; 'custom' returns null (needs JEWL adjudication). */
function holds(c: BlockCondition, ctx: ConditionContext): boolean | null {
  switch (c.type) {
    case 'seed':
      return norm(ctx.seedName) === norm(c.name);
    case 'block':
      return ctx.blocks.some(b =>
        norm(b.name) === norm(c.name) && (!c.blockType || b.type === c.blockType));
    case 'minAge':
      return ctx.age >= c.years;
    case 'attribute':
      return (ctx.attributeLevels[norm(c.name)] ?? 0) >= c.min;
    case 'skill': {
      const key = Object.keys(ctx.skillLevels).find(k => norm(k) === norm(c.name));
      return key != null && ctx.skillLevels[key] >= c.min;
    }
    case 'custom':
      return null;
  }
}

function describe(c: BlockCondition): string {
  switch (c.type) {
    case 'seed': return `seed ${c.name}`;
    case 'block': return `${c.blockType ?? 'block'} "${c.name}"`;
    case 'minAge': return `age ${c.years}+`;
    case 'attribute': return `${c.name} ${c.min}+`;
    case 'skill': return `${c.name} level ${c.min}+`;
    case 'custom': return `"${c.text}"`;
  }
}

export interface PendingAdjudication {
  blockName: string;
  /** 'requires' = must be TRUE of the character; 'restricted' = must be FALSE. */
  mode: 'requires' | 'restricted';
  text: string;
}

export interface ConditionResult {
  ok: boolean;
  failures: string[];
  /** Custom (prose) conditions JEWL must adjudicate against the character's
   *  actual state. Fail CLOSED: crystallization blocks until cleared. */
  pendingAdjudications: PendingAdjudication[];
}

export function evaluateBlockConditions(
  blockName: string,
  data: { requires?: BlockCondition[]; restricted?: BlockCondition[] },
  ctx: ConditionContext,
): ConditionResult {
  const failures: string[] = [];
  const pendingAdjudications: PendingAdjudication[] = [];
  for (const c of data.requires ?? []) {
    const h = holds(c, ctx);
    if (h === null) pendingAdjudications.push({ blockName, mode: 'requires', text: (c as { text: string }).text });
    else if (!h) failures.push(`"${blockName}" requires ${describe(c)}`);
  }
  for (const c of data.restricted ?? []) {
    const h = holds(c, ctx);
    if (h === null) pendingAdjudications.push({ blockName, mode: 'restricted', text: (c as { text: string }).text });
    else if (h) failures.push(`"${blockName}" is restricted: ${describe(c)} not allowed`);
  }
  return { ok: failures.length === 0, failures, pendingAdjudications };
}

/** Assemble the context from a full creation set (order-independent).
 *  attributeLevels = POOL MAX: root/branch levels + seed augs, so
 *  requirements like "Wit 30+" read the real assembled character. */
export function buildConditionContext(
  seed: { name: string; data?: { attributes?: Record<string, number> } },
  roots: Array<{ name: string; data: { ageAdded?: number; attributes?: Record<string, number>; skills?: Array<{ name: string; level: number }>; nectars?: unknown[]; thorns?: unknown[] } }>,
  branches: Array<{ name: string; data: { ageAdded?: number; attributes?: Record<string, number>; skills?: Array<{ name: string; level: number }>; nectars?: unknown[]; thorns?: unknown[] } }>,
): ConditionContext {
  const blocks: ConditionContext['blocks'] = [
    ...roots.map(r => ({ type: 'root', name: r.name })),
    ...branches.map(b => ({ type: 'branch', name: b.name })),
  ];
  const attributeLevels: Record<string, number> = {};
  const skillLevels: Record<string, number> = {};
  let age = 0;

  const traitName = (t: unknown): string | null =>
    typeof t === 'string' ? t
      : t && typeof t === 'object' && typeof (t as { name?: string }).name === 'string'
        ? (t as { name: string }).name : null;

  for (const blk of [...roots.map(r => ({ ...r, _t: 'root' })), ...branches.map(b => ({ ...b, _t: 'branch' }))]) {
    age += Math.max(0, blk.data.ageAdded ?? 0);
    for (const [k, v] of Object.entries(blk.data.attributes ?? {})) {
      attributeLevels[norm(k)] = (attributeLevels[norm(k)] ?? 0) + Math.max(0, v || 0);
    }
    for (const s of blk.data.skills ?? []) {
      if (!s?.name) continue;
      skillLevels[s.name] = Math.max(skillLevels[s.name] ?? 0, s.level ?? 0);
    }
    for (const t of [...(blk.data.nectars ?? []), ...(blk.data.thorns ?? [])]) {
      const name = traitName(t);
      if (name) blocks.push({ type: 'trait', name });
    }
  }

  // Seed augs stack on top of levels — pool max semantics.
  for (const [k, v] of Object.entries(seed.data?.attributes ?? {})) {
    attributeLevels[norm(k)] = (attributeLevels[norm(k)] ?? 0) + Math.max(0, v || 0);
  }

  return { seedName: seed.name, blocks, age, attributeLevels, skillLevels };
}
