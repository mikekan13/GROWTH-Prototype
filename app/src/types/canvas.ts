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
  /** Folder position (used as fallback when folder has no nodes) */
  posX?: number;
  posY?: number;
  /** When true, folder collapses to just the header bar */
  collapsed?: boolean;
  /**
   * Optional Location info, set by server-generated auto-folders so the
   * folder IS the location (no separate Location card). Renders a KRMA
   * reserve readout in the header in place of the party TKV box.
   */
  locationInfo?: {
    locationId: string;
    locationType?: string;
    krmaReserve?: number;
    description?: string;
    /** Optional portrait/banner image URL for the location. */
    imageUrl?: string;
    /** Per-entity-type child counts for the at-a-glance summary row. */
    contentCounts?: {
      locations?: number;
      characters?: number;
      npcs?: number;
      items?: number;
      godheads?: number;
      goals?: number;
    };
    /** PLANNING vs ACTIVE etc. When PLANNING, the folder shows a
     *  CRYSTALLIZE button in the header that flips status to ACTIVE. */
    status?: string;
  };
}
