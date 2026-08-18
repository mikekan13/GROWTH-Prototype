/**
 * Body Spawn — turns a seed's `bodyStructure {parts, vitals}` TEMPLATE into
 * REAL body-part items at character mechanics-assembly time.
 *
 * Canon (Mike ruling 2026-08-17, building on body-as-items lock 2026-05-19):
 *  - The seed's bodyStructure is the anatomy TEMPLATE. When a seed lands on a
 *    character (applyCreationGrants), the template spawns a body-part item
 *    tree: `GrowthWorldItem` nodes with `isBodyPart` + `partName`, nested via
 *    `contains` — exactly the shape the damage cascade engine
 *    (lib/body-damage.ts routeDamage) already consumes.
 *  - TORSO is the root container; the rest attach per humanoid convention
 *    (lower limbs chain under their upper counterparts).
 *  - HEAD and every template vital are flagged `isVital`.
 *  - Every part's baseResist = the SEED's baseResist (outer absorbs to
 *    baseResist; routeDamage reads `node.baseResist` per part).
 *  - Finer anatomy (organs) lazy-spawns when a scene demands it — see
 *    `ensureInternalPath`, called from services/damage.ts on the piercing path.
 *
 * PURE module — no prisma, no 'server-only'. The paperdoll UI imports the
 * naming helpers; character-grants (server) does the spawning.
 */

import type { SeedBodyStructure } from '@/types/growth';
import type { GrowthWorldItem } from '@/types/item';

const FULL_CONDITION = 3;

/** 'LEFT_UPPER_ARM' → 'Left Upper Arm' (partName display convention). */
export function humanizePartToken(token: string): string {
  return token
    .trim()
    .split(/[_\s]+/)
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');
}

/** 'Left Upper Arm' → 'LEFT_UPPER_ARM' (template/descriptor token convention). */
export function partTokenFromName(name: string): string {
  return name.trim().split(/\s+/).join('_').toUpperCase();
}

interface PartDefaults {
  primaryMaterial: string;
  materialClass: 'Soft' | 'Hard';
  /** Default-vital regardless of the template's vitals list (mirrors the
   *  Human baseline marking Brain and Heart) — used for lazy-spawned organs. */
  vital?: boolean;
}

/**
 * Sensible material defaults per part token. Outer parts are Flesh/Soft;
 * Bone/Hard where obvious (the skull — matches HUMAN_BASELINE_ANATOMY's
 * Hard head). Deliberately small: seeds that want richer materials should
 * declare a full bodyAnatomy tree instead.
 */
export function partDefaultsFor(token: string): PartDefaults {
  const t = token.toUpperCase();
  if (t === 'HEAD' || t.includes('SKULL')) {
    return { primaryMaterial: 'Bone', materialClass: 'Hard' };
  }
  if (t === 'BRAIN' || t === 'HEART') {
    return { primaryMaterial: 'Flesh', materialClass: 'Soft', vital: true };
  }
  return { primaryMaterial: 'Flesh', materialClass: 'Soft' };
}

export interface SpawnBodyOptions {
  /** The seed's baseResist — applied to EVERY spawned part (Mike 2026-08-17). */
  baseResist: number;
}

/**
 * Humanoid attachment convention: which template token a part hangs under.
 * Returns null for "directly under the root".
 */
function parentTokenFor(token: string, present: Set<string>): string | null {
  const candidates: string[] = [];
  if (token.includes('LOWER_')) candidates.push(token.replace('LOWER_', 'UPPER_'));
  if (token.endsWith('HAND')) {
    candidates.push(token.replace(/HAND$/, 'LOWER_ARM'), token.replace(/HAND$/, 'UPPER_ARM'));
  }
  if (token.endsWith('FOOT')) {
    candidates.push(token.replace(/FOOT$/, 'LOWER_LEG'), token.replace(/FOOT$/, 'UPPER_LEG'));
  }
  for (const c of candidates) {
    if (c !== token && present.has(c)) return c;
  }
  return null;
}

/**
 * Spawn the body-part item tree from a seed's bodyStructure template.
 * Returns null when the template is absent/empty (caller falls back to
 * HUMAN_BASELINE_ANATOMY). TORSO (when present) is the root container.
 */
export function spawnBodyFromStructure(
  structure: SeedBodyStructure | undefined | null,
  opts: SpawnBodyOptions,
): GrowthWorldItem | null {
  const rawParts = structure?.parts?.filter(p => typeof p === 'string' && p.trim().length > 0) ?? [];
  if (rawParts.length === 0) return null;

  // Normalize + dedupe while preserving template order.
  const tokens: string[] = [];
  const seen = new Set<string>();
  for (const p of rawParts) {
    const t = p.trim().toUpperCase().split(/\s+/).join('_');
    if (!seen.has(t)) { seen.add(t); tokens.push(t); }
  }
  const vitals = new Set((structure?.vitals ?? []).map(v => v.trim().toUpperCase().split(/\s+/).join('_')));

  // Root: TORSO per humanoid convention; non-humanoid templates fall back to
  // their first vital, then their first part.
  const rootToken =
    (seen.has('TORSO') && 'TORSO') ||
    tokens.find(t => vitals.has(t)) ||
    tokens[0];

  const buildNode = (token: string): GrowthWorldItem => {
    const defaults = partDefaultsFor(token);
    return {
      description: structure?.descriptors?.[token] ?? `${humanizePartToken(token)} — body part.`,
      isBodyPart: true,
      partName: humanizePartToken(token),
      baseResist: opts.baseResist,
      condition: FULL_CONDITION,
      primaryMaterial: defaults.primaryMaterial,
      materialClass: defaults.materialClass,
      // HEAD and template vitals are flagged (Mike 2026-08-17).
      ...(vitals.has(token) || token === 'HEAD' || defaults.vital ? { isVital: true } : {}),
    };
  };

  const nodes = new Map<string, GrowthWorldItem>();
  for (const t of tokens) nodes.set(t, buildNode(t));
  const root = nodes.get(rootToken)!;

  for (const t of tokens) {
    if (t === rootToken) continue;
    const parentToken = parentTokenFor(t, seen);
    const parent = (parentToken && parentToken !== t ? nodes.get(parentToken) : null) ?? root;
    (parent.contains ??= []).push(nodes.get(t)!);
  }
  return root;
}

/** True when the character already carries a spawned body-part tree. */
export function hasSpawnedBody(bodyAnatomy: unknown): bodyAnatomy is GrowthWorldItem {
  return !!bodyAnatomy
    && typeof bodyAnatomy === 'object'
    && (bodyAnatomy as GrowthWorldItem).isBodyPart === true
    && typeof (bodyAnatomy as GrowthWorldItem).partName === 'string';
}

export interface EnsurePathResult {
  /** partNames of parts created on demand (empty when the path already existed). */
  spawned: string[];
}

/**
 * Lazy organs (canon 2026-05-19: "finer anatomy lazy-spawns when a scene
 * demands it"): walk `relativePath` (partName segments BELOW the root — same
 * shape as routeDamage's piercingTargetPath) and create any missing internal
 * under its parent. Mutates `root` in place; caller persists.
 */
export function ensureInternalPath(
  root: GrowthWorldItem,
  relativePath: string[],
  opts: SpawnBodyOptions,
): EnsurePathResult {
  const spawned: string[] = [];
  let node = root;
  for (const rawSeg of relativePath) {
    const seg = rawSeg.trim();
    if (!seg) continue;
    let child = (node.contains ?? []).find(c => c.isBodyPart && c.partName === seg);
    if (!child) {
      const defaults = partDefaultsFor(partTokenFromName(seg));
      child = {
        description: `${seg} — body part (lazy-spawned).`,
        isBodyPart: true,
        partName: seg,
        baseResist: opts.baseResist,
        condition: FULL_CONDITION,
        primaryMaterial: defaults.primaryMaterial,
        materialClass: defaults.materialClass,
        ...(defaults.vital ? { isVital: true } : {}),
      };
      (node.contains ??= []).push(child);
      spawned.push(seg);
    }
    node = child;
  }
  return { spawned };
}
