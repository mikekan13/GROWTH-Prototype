/**
 * Spatial types — the top-down map as rooms, walls, portals and obstacles on
 * one storey, plus the nav/path/pace vocabulary. Pure data; no React, no
 * Prisma, no I/O. World units: 20 units = 1 ft (canvas-geometry's
 * DEFAULT_SCALE_FT_PER_UNIT = 0.05).
 */
import type { Point, Rect, OpeningKind, DoorState } from '@/lib/canvas-geometry';

/** World units in one foot. */
export const UNITS_PER_FT = 20;
/** Nav grid cell = 1 ft. */
export const CELL_UNITS = 20;

/** A room: a location polygon on the level, with its area for innermost-first lookup. */
export interface RoomPoly { id: string; name: string; points: Point[]; level: number; area: number }
/** An opening on a wall: what it is, its state (doors), where it lies, what it joins. */
export interface Portal { id: string; homeId: string; kind: OpeningKind; state?: DoorState; a: Point; b: Point; name: string; between: string[] }
/** A blocking segment: a room wall (blocks move + sight) or a furniture edge (blocks move only). */
export interface WallSeg { a: Point; b: Point; ownerId: string; kind: 'wall' | 'furniture' }
/** A thing that takes up floor: its polygon in world units. */
export interface Obstacle { id: string; name: string; points: Point[] }
/** Everything the spatial helpers need for one storey. Treated as immutable — rebuild after a door changes. */
export interface LevelMap { level: number; rooms: RoomPoly[]; walls: WallSeg[]; portals: Portal[]; obstacles: Obstacle[]; bounds: Rect; /** Home shells on this level (a footprint wholly containing others): walls, not rooms. */ homes?: RoomPoly[] }
/** What a portal lets through: movement, whether moving through it opens it, and sight. */
export interface Passability { move: boolean; opens: boolean; sight: boolean }
/** A found path: the smoothed polyline, its length in feet, the portals crossed in order, and the locked door it stopped at (if any). */
export interface PathResult { points: Point[]; feet: number; portals: Portal[]; blockedBy?: Portal }
/** How fast a mover goes. */
export type Pace = 'creep' | 'walk' | 'hurry' | 'run';
