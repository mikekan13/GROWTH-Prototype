/**
 * Canvas Folder — groups cards on the Relations Canvas.
 * Persisted to localStorage per campaign.
 */
import type { Footprint, PassageLink, Opening } from '@/lib/canvas-geometry';
import type { GrowthLocation } from '@/types/location';
import type { GrowthWorldItem } from '@/types/item';

/** A card / token on the canvas (built by services/canvas-model, drawn by RelationsCanvas). */
export interface CanvasNode {
  id: string;
  type: 'character' | 'npc' | 'location' | 'quest' | 'item';
  name: string;
  x: number;
  y: number;
  placedAt?: number;
  status?: string;
  color?: string;
  portrait?: string | null;
  /** BORN ≠ DONE (2026-10-12): born, official portrait still to come. */
  awaitingImage?: boolean;
  characterData?: Record<string, unknown> | null;
  /** Character has a GodHead row (AI persona exists). */
  hasAIPersona?: boolean;
  /** AI is currently choosing this character's actions. */
  aiActionMode?: boolean;
  /** Current human owner/controller. Either a player or the GM's userId. */
  controllerUserId?: string;
  locationType?: string;
  locationData?: GrowthLocation | null;
  itemType?: string;
  itemData?: GrowthWorldItem | null;
  holderId?: string | null;
  holderName?: string;
  locationName?: string;
  /** The map (2026-10-16): the item's located_at edge to its room, the room, and how many things it holds. */
  tokenEdgeId?: string;
  roomId?: string;
  containsCount?: number;
}

/** A tether between two canvas entities. */
export interface Connection {
  from: string;
  to: string;
  type: 'alliance' | 'conflict' | 'goal' | 'resistance' | 'opportunity' | 'owns' | 'located_at';
  strength: number;
}

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
  /** Server: when a placement (JEWL / the sim) last wrote this location's anchor (ms). A placement newer than the GM's last drag wins over the browser-stored position (2026-09-26). */
  placedAt?: number;
  /** Client: when the GM last dragged/resized this folder (ms). Stored in localStorage with the folder. */
  movedAt?: number;
  /** When true, folder collapses to just the header bar */
  collapsed?: boolean;
  /** When true, the location details panel shows in full (description/
   *  environment/tags/notes). Default = compact one-line essence — the
   *  full panel made every folder header a billboard (A6, 2026-08-03). */
  detailsOpen?: boolean;
  /**
   * Optional Location info, set by server-generated auto-folders so the
   * folder IS the location (no separate Location card). Renders a KRMA
   * reserve readout in the header in place of the party TKV box.
   */
  locationInfo?: {
    locationId: string;
    /** Nesting depth from the root place (0 = a root). Drives the depth palette (canvas-lod). */
    depth?: number;
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
    /** Full Location detail fields surfaced so the folder can display
     *  everything JEWL generated (and what the GM edits later) without a
     *  separate Location sheet panel. */
    environment?: string;
    population?: string;
    dangerLevel?: number;
    controlledBy?: string;
    notes?: string;
    tags?: string[];
    /** Per-Location timescale override (slow-time realms etc.). Absent =
     *  inherit up the located_at chain to the campaign default. */
    timescaleId?: string;
    /** The place's shape on the map (2026-10-16): polygon + feet/unit +
     *  story. Absent = the folder rectangle (default footprint). */
    footprint?: Footprint;
    /** A passage (stairs, fire escape, elevator): the levels it links. */
    connects?: PassageLink[];
    /** Doors, windows, archways on this place's walls (absolute map units, 2026-10-17). */
    openings?: Opening[];
  };
}
