/**
 * Body-tree walking helpers (T26, INV-55).
 *
 * The paperdoll has NO hardcoded slot list — equip regions are DERIVED from
 * the character's actual body-part item tree (`bodyAnatomy`, parts are items
 * with `isBodyPart` + nested `contains`). A hand-built non-humanoid tree
 * (tails, wings, hulls) produces its own regions with zero code changes.
 */

import type { GrowthWorldItem } from '@/types/item';

export interface BodyRegion {
  /** partName segments from root to this part, e.g. ['Body','Torso']. */
  path: string[];
  /** Stable string key: path joined with '/', e.g. 'Body/Torso'. */
  key: string;
  partName: string;
  depth: number;
  baseResist: number;
  condition: number;
}

/**
 * Walk the anatomy tree and return every body part as an equip region,
 * in depth-first order (matches how the tree reads visually).
 */
export function deriveRegions(root: GrowthWorldItem): BodyRegion[] {
  const regions: BodyRegion[] = [];
  function walk(node: GrowthWorldItem, parentPath: string[], depth: number) {
    if (!node.isBodyPart || !node.partName) return;
    const path = [...parentPath, node.partName];
    regions.push({
      path,
      key: path.join('/'),
      partName: node.partName,
      depth,
      baseResist: node.baseResist ?? 0,
      condition: node.condition ?? 3,
    });
    for (const child of node.contains ?? []) {
      walk(child, path, depth + 1);
    }
  }
  walk(root, [], 0);
  return regions;
}

/** Find a part by its region key ('Body/Torso'). Returns null if absent. */
export function findPartByKey(root: GrowthWorldItem, key: string): GrowthWorldItem | null {
  const segments = key.split('/');
  let node: GrowthWorldItem | undefined = root;
  if (!node?.isBodyPart || node.partName !== segments[0]) return null;
  for (const seg of segments.slice(1)) {
    node = (node.contains ?? []).find(c => c.isBodyPart && c.partName === seg);
    if (!node) return null;
  }
  return node ?? null;
}
