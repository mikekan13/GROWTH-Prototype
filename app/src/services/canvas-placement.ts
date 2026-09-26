/**
 * Canvas placement — JEWL positions what he spins up so a human can see
 * and interpret the scene (Mike 2026-09-26: "One thing we need before
 * beginning is JEWL to position objects on the canvas so a human can see
 * and interpret details correctly").
 *
 * The canvas only renders what has coordinates (a Location without
 * canvasX/Y stays in the Tapestry; a DRAFT NPC shows once placed), and it
 * shelf-packs a location folder's located_at members inside the folder on
 * the client. So the server's job is: give every new thing a sensible
 * spot — the new place next to where the scene was, its people inside it,
 * the beings that moved there beside it — without stacking on anything.
 *
 * Pure placement math (`placeNear`) is unit-tested; the DB-facing helpers
 * read occupied rects from locations, placed characters and items.
 */
import 'server-only';
import { prisma } from '@/lib/db';

export interface Rect { x: number; y: number; w: number; h: number }
export interface Pt { x: number; y: number }

/** Compact card extents (RelationsCanvas CARD_SIZES: center-anchored). */
export const CARD: Record<'location' | 'character' | 'item', { w: number; h: number }> = {
  location: { w: 340, h: 180 },
  character: { w: 520, h: 240 },
  item: { w: 300, h: 160 },
};
const GAP = 40;

function overlaps(a: Rect, b: Rect): boolean {
  return Math.abs(a.x - b.x) * 2 < a.w + b.w + GAP && Math.abs(a.y - b.y) * 2 < a.h + b.h + GAP;
}

/**
 * First free centre for a card of `size` near `anchor`, trying the anchor
 * itself, then rings of offsets (right, below, left, above, diagonals) at
 * growing distances. Deterministic. Pure.
 */
export function placeNear(anchor: Pt, size: { w: number; h: number }, occupied: Rect[], stepX = size.w + GAP, stepY = size.h + GAP): Pt {
  const free = (p: Pt) => !occupied.some((o) => overlaps({ ...p, ...size }, o));
  if (free(anchor)) return anchor;
  for (let ring = 1; ring <= 12; ring++) {
    const candidates: Pt[] = [
      { x: anchor.x + ring * stepX, y: anchor.y },
      { x: anchor.x, y: anchor.y + ring * stepY },
      { x: anchor.x - ring * stepX, y: anchor.y },
      { x: anchor.x, y: anchor.y - ring * stepY },
      { x: anchor.x + ring * stepX, y: anchor.y + ring * stepY },
      { x: anchor.x - ring * stepX, y: anchor.y + ring * stepY },
      { x: anchor.x + ring * stepX, y: anchor.y - ring * stepY },
      { x: anchor.x - ring * stepX, y: anchor.y - ring * stepY },
    ];
    for (const c of candidates) if (free(c)) return c;
  }
  return { x: anchor.x + 13 * stepX, y: anchor.y };
}

/** Everything on the campaign canvas that takes space. */
export async function occupiedRects(campaignId: string): Promise<Rect[]> {
  const rects: Rect[] = [];
  const locs = await prisma.location.findMany({ where: { campaignId }, select: { data: true } });
  for (const l of locs) {
    try { const d = JSON.parse(l.data) as { canvasX?: number; canvasY?: number }; if (typeof d.canvasX === 'number' && typeof d.canvasY === 'number') rects.push({ x: d.canvasX, y: d.canvasY, ...CARD.location }); } catch { /* skip */ }
  }
  const chars = await prisma.character.findMany({ where: { campaignId }, select: { data: true } });
  for (const c of chars) {
    try { const d = JSON.parse(c.data) as { canvasX?: number; canvasY?: number }; if (typeof d.canvasX === 'number' && typeof d.canvasY === 'number') rects.push({ x: d.canvasX, y: d.canvasY, ...CARD.character }); } catch { /* skip */ }
  }
  const items = await prisma.campaignItem.findMany({ where: { campaignId }, select: { data: true } });
  for (const i of items) {
    try { const d = JSON.parse(i.data) as { x?: number; y?: number }; if (typeof d.x === 'number' && typeof d.y === 'number') rects.push({ x: d.x, y: d.y, ...CARD.item }); } catch { /* skip */ }
  }
  return rects;
}

export async function locationCanvasPos(locationId: string | null): Promise<Pt | null> {
  if (!locationId) return null;
  const loc = await prisma.location.findUnique({ where: { id: locationId }, select: { data: true } });
  if (!loc) return null;
  try { const d = JSON.parse(loc.data) as { canvasX?: number; canvasY?: number }; return typeof d.canvasX === 'number' && typeof d.canvasY === 'number' ? { x: d.canvasX, y: d.canvasY } : null; } catch { return null; }
}

export async function characterCanvasPos(characterId: string): Promise<Pt | null> {
  const c = await prisma.character.findUnique({ where: { id: characterId }, select: { data: true } });
  if (!c) return null;
  try { const d = JSON.parse(c.data) as { canvasX?: number; canvasY?: number }; return typeof d.canvasX === 'number' && typeof d.canvasY === 'number' ? { x: d.canvasX, y: d.canvasY } : null; } catch { return null; }
}

/** Stamp a Location's canvas position (the same fields the drag writes). */
export async function stampLocationCanvas(locationId: string, p: Pt): Promise<void> {
  const loc = await prisma.location.findUnique({ where: { id: locationId }, select: { data: true } });
  if (!loc) return;
  let d: Record<string, unknown> = {};
  try { d = JSON.parse(loc.data) as Record<string, unknown>; } catch { d = {}; }
  await prisma.location.update({ where: { id: locationId }, data: { data: JSON.stringify({ ...d, canvasX: p.x, canvasY: p.y }) } });
}

/** Stamp a character card's canvas position (the same fields the drag writes). */
export async function stampCharacterCanvas(characterId: string, p: Pt): Promise<void> {
  const c = await prisma.character.findUnique({ where: { id: characterId }, select: { data: true } });
  if (!c) return;
  let d: Record<string, unknown> = {};
  try { d = JSON.parse(c.data) as Record<string, unknown>; } catch { d = {}; }
  await prisma.character.update({ where: { id: characterId }, data: { data: JSON.stringify({ ...d, canvasX: p.x, canvasY: p.y }) } });
}

/**
 * Put a character's card beside a location's card (below it, first free
 * slot), so a narrated move is visible on the canvas. No-op when the
 * location has no canvas position yet.
 */
export async function snapCharacterToLocation(campaignId: string, characterId: string, locationId: string): Promise<Pt | null> {
  const at = await locationCanvasPos(locationId);
  if (!at) return null;
  const occupied = await occupiedRects(campaignId);
  const p = placeNear({ x: at.x, y: at.y + CARD.location.h / 2 + CARD.character.h / 2 + GAP }, CARD.character, occupied);
  await stampCharacterCanvas(characterId, p);
  return p;
}

/**
 * Place a new location beside where the scene was (the previous location's
 * card, else the first traveller's card, else the canvas origin).
 */
export async function placeNewLocation(campaignId: string, locationId: string, near: { locationId?: string | null; characterId?: string | null }): Promise<Pt> {
  const anchor = (await locationCanvasPos(near.locationId ?? null)) ?? (near.characterId ? await characterCanvasPos(near.characterId) : null) ?? { x: 0, y: 0 };
  const occupied = await occupiedRects(campaignId);
  const p = placeNear({ x: anchor.x + CARD.location.w + GAP * 2, y: anchor.y }, CARD.location, occupied);
  await stampLocationCanvas(locationId, p);
  return p;
}
