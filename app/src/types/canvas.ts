/**
 * Canvas Folder — groups cards on the Relations Canvas.
 * Persisted to localStorage per campaign.
 */
export interface CanvasFolder {
  id: string;
  name: string;
  type: 'party' | 'group';
  nodeIds: string[];
  color?: string;
  /** User-set size overrides. Folder won't shrink below content minimum. */
  userWidth?: number;
  userHeight?: number;
  /** When true, folder collapses to just the header bar */
  collapsed?: boolean;
}
