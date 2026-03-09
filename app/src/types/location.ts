/**
 * GRO.WTH Location System — TypeScript Interfaces
 * Locations are first-class campaign entities that appear on the Relations Canvas.
 */

export type LocationType = 'settlement' | 'wilderness' | 'dungeon' | 'building' | 'point_of_interest' | 'region';

export interface GrowthLocation {
  description: string;
  environment?: string;        // Climate, terrain, atmosphere
  techLevel?: number;          // 1-10: Available technology at this location
  wealthLevel?: number;        // 1-10: General prosperity
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
};

export const LOCATION_TYPE_COLORS: Record<LocationType, string> = {
  settlement: '#7050A8',       // Soul purple
  wilderness: '#4ade80',       // Green
  dungeon: '#E8585A',          // Body red
  building: '#60a5fa',         // Blue
  point_of_interest: '#ffcc78', // Gold
  region: '#22ab94',           // Teal
};
