/**
 * GRO.WTH Location System — TypeScript Interfaces
 * Locations are first-class campaign entities that appear on the Relations Canvas.
 */

export type LocationType =
  | 'settlement'
  | 'wilderness'
  | 'dungeon'
  | 'building'
  | 'point_of_interest'
  | 'region'
  /** Meta-tier container — for Terminal-level / cosmological entities that
   *  hold domains. Renders distinctly so it reads as out-of-world. */
  | 'meta'
  /** Cosmic-landmark — the seeded type for Tree of Life / River Styx etc. */
  | 'cosmic_landmark'
  /** A force/army/collective — Undead Army etc. */
  | 'force';

export interface GrowthLocation {
  description: string;
  environment?: string;        // Climate, terrain, atmosphere
  population?: string;         // Narrative description (e.g. "sparse", "bustling city")
  dangerLevel?: number;        // 1-10: General threat level
  controlledBy?: string;       // Faction, NPC name, or "contested"
  notes?: string;              // GM-only notes
  tags?: string[];             // Searchable tags (e.g. "tavern", "port", "underground")
  connections?: LocationConnection[];
  features?: LocationFeature[];
  // [PLACEHOLDER] Ley line data for mana sourcing — needs magic system integration
  leyLines?: {
    present: boolean;
    strength?: number;         // 1-10
    schools?: string[];        // Which magic schools are amplified
  };
  /**
   * Generalized "ambient mass" KRMA allocation for the area itself —
   * what it costs to *be* this place at all, distinct from specific
   * items/NPCs inside it (which carry their own KV). Scale-free magnitude:
   * a room may be in the thousands, a city in the millions, a planet in
   * the trillions+. "Slightly quantum" per Mike — not pinned to anything
   * concrete, but commits against the GM's wallet capacity.
   * See memory: location-krma-reserve-2026-06-02.
   */
  krmaReserve?: number;
  /**
   * Portrait-style image for the location. Always AI-generated via the
   * unified pipeline (no uploads — see ai-image-generation-pipeline memory).
   * Renders in the folder header so the location reads visually at a glance.
   */
  imageUrl?: string;
  /**
   * Battlemap is a PROPERTY of a leaf Location, not a child entity. When
   * present, the leaf Location can be played on as a tactical grid.
   * Per the world-as-recursive-locations design pillar, items + people
   * at the leaf use `located_at` edges; the battlemap is the visible
   * grid those entities stand on.
   */
  battlemap?: {
    imageUrl?: string;       // AI-generated battlemap image
    gridWidth?: number;      // In 5 ft squares
    gridHeight?: number;
    gridOriginX?: number;    // Image pixel coords of the grid's top-left
    gridOriginY?: number;
    gridCellPx?: number;     // Image pixels per grid square
  };
  /**
   * GM-placed canvas coordinates (SVG world units). When set, the canvas
   * renders this Location at the stored position; when null, it falls back
   * to the deterministic index-based default in the page's canvas builder.
   */
  canvasX?: number;
  canvasY?: number;
}

export interface LocationConnection {
  targetId: string;            // ID of connected location
  type: 'road' | 'path' | 'river' | 'portal' | 'border' | 'secret';
  description?: string;
  travelTime?: string;         // Narrative (e.g. "2 days by horse")
}

export interface LocationFeature {
  name: string;
  description: string;
  type: 'landmark' | 'resource' | 'hazard' | 'shop' | 'quest_hook' | 'other';
}

// Icon mapping for canvas rendering
export const LOCATION_TYPE_ICONS: Record<LocationType, string> = {
  settlement: '\u{1F3D8}',     // houses
  wilderness: '\u{1F332}',     // tree
  dungeon: '\u{1F5FF}',        // moai (cave-like)
  building: '\u{1F3DB}',       // classical building
  point_of_interest: '\u{2B50}', // star
  region: '\u{1F5FA}',         // map
  meta: '\u{1F310}',           // globe with meridians — meta-tier
  cosmic_landmark: '\u{2734}', // eight-pointed star
  force: '\u{2694}️',     // crossed swords
};

export const LOCATION_TYPE_COLORS: Record<LocationType, string> = {
  settlement: '#582a72',       // Soul purple
  wilderness: '#4ade80',       // Green
  dungeon: '#E8585A',          // Body red
  building: '#60a5fa',         // Blue
  point_of_interest: '#ffcc78', // Gold
  region: '#22ab94',           // Teal
  meta: '#ffffff',             // White — Terminal / out-of-world
  cosmic_landmark: '#ffcc78',  // KRMA gold
  force: '#E8585A',            // Body red — armies/forces
};
