/**
 * ONE WRITER FOR WHERE A THING STANDS (Mike 2026-10-29: "if a GM moves something then all facts about it must be
 * updated too"). The map is the truth; the thing's placement WorldFact is derived from its spot here, the way
 * `door-facts` derives a door's fact from the map. Every write of a thing's position (a GM drag, JEWL's
 * draw_place_map) ends with `thingPlaced`, which rewrites the placement sentence of every current fact that speaks
 * for the thing and keeps the rest of those facts (what sits on it, what it holds).
 *
 * The wording is DERIVED from geometry, never prompted: the room's frame (front = the wall with the window, else the
 * wall opposite the entry, else the bottom; left/right as seen from the rear looking to the front — the frame
 * Violet's facts use), which third of the room, against or how far from which wall, and the nearest opening.
 * Facing cannot be read off a position and is not written.
 */
import 'server-only';
import { prisma } from '@/lib/db';
import { currentFacts, supersede, establishFact } from '@/daya/world-ledger';
import { DEFAULT_SCALE_FT_PER_UNIT, footprintBounds, type Point } from '@/lib/canvas-geometry';
import { splitSentences } from '@/services/tidbits-shape';
import { slug } from '@/services/door-facts';

export type Side = 'N' | 'S' | 'W' | 'E';
export interface RoomLike { id: string; name: string; points: Point[] }
export interface PortalLike { name?: string; kind?: string; a: Point; b: Point; between: string[] }
export interface Frame { front: Side; rear: Side; left: Side; right: Side }

const FT = 1 / DEFAULT_SCALE_FT_PER_UNIT; // world units per foot
const AGAINST_FT = 1;
const NEAR_FT = 4;
const opposite: Record<Side, Side> = { N: 'S', S: 'N', W: 'E', E: 'W' };

/** Which side of the room's box a point lies nearest. Pure. */
export function nearestSide(p: Point, room: RoomLike): Side {
  const b = footprintBounds(room.points);
  const d: Array<[Side, number]> = [['N', p.y - b.y], ['S', b.y + b.height - p.y], ['W', p.x - b.x], ['E', b.x + b.width - p.x]];
  return d.sort((x, y) => x[1] - y[1])[0][0];
}

const touches = (portal: PortalLike, room: RoomLike) => portal.between.some((s) => s.trim().toLowerCase() === room.name.trim().toLowerCase());
const mid = (p: PortalLike): Point => ({ x: (p.a.x + p.b.x) / 2, y: (p.a.y + p.b.y) / 2 });

/** The room's frame: front = its window's wall, else opposite the wall of its door to another room/outside, else S. Pure. */
export function roomFrame(room: RoomLike, portals: PortalLike[]): Frame {
  const mine = portals.filter((p) => touches(p, room));
  const window = mine.find((p) => p.kind === 'window');
  const door = mine.find((p) => p.kind === 'door');
  const front: Side = window ? nearestSide(mid(window), room) : door ? opposite[nearestSide(mid(door), room)] : 'S';
  const rear = opposite[front];
  // Seen from the rear looking to the front: front S → left W; front N → left E; front W → left S; front E → left N.
  const left: Side = front === 'S' ? 'W' : front === 'N' ? 'E' : front === 'W' ? 'S' : 'N';
  return { front, rear, left, right: opposite[left] };
}

const sideLabel = (side: Side, f: Frame): string => side === f.front ? 'front' : side === f.rear ? 'rear' : side === f.left ? 'left' : 'right';

/** Distance from a point to a segment. Pure. */
function segDist(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x, dy = b.y - a.y;
  const l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / l2)) : 0;
  const q = { x: a.x + t * dx, y: a.y + t * dy };
  return Math.hypot(p.x - q.x, p.y - q.y);
}

/** A thing's footprint corners in world units from its centre and its map shape (feet about the centre). Pure. */
export function cornersOf(at: Point, shape: { points: Point[] } | null | undefined): Point[] | undefined {
  if (!shape || shape.points.length < 3) return undefined;
  return shape.points.map((p) => ({ x: at.x + p.x * FT, y: at.y + p.y * FT }));
}

export interface Standing {
  /** The thing's centre in world units. */
  at: Point;
  /** Its footprint corners in world units (absent = a point). */
  corners?: Point[];
}

/**
 * The derived placement sentence. Pure. e.g. "The green couch stands in the Main Room, in the left third, 2.5 ft
 * from the left wall, 4 ft from the Bathroom door."
 */
export function placementSentence(name: string, room: RoomLike, portals: PortalLike[], standing: Standing, others: RoomLike[] = []): string {
  const f = roomFrame(room, portals);
  const b = footprintBounds(room.points);
  const pts = standing.corners?.length ? standing.corners : [standing.at];
  const EPS = 0.5;
  const onBoxSide = (a: Point, c: Point): Side | null => {
    if (Math.abs(a.y - b.y) < EPS && Math.abs(c.y - b.y) < EPS) return 'N';
    if (Math.abs(a.y - (b.y + b.height)) < EPS && Math.abs(c.y - (b.y + b.height)) < EPS) return 'S';
    if (Math.abs(a.x - b.x) < EPS && Math.abs(c.x - b.x) < EPS) return 'W';
    if (Math.abs(a.x - (b.x + b.width)) < EPS && Math.abs(c.x - (b.x + b.width)) < EPS) return 'E';
    return null;
  };
  // A wall on the room's box is named by the frame (front/rear/left/right); a wall inside the box is the wall of
  // the room on its other side (an alcove), else by which way it faces.
  const wallName = (a: Point, c: Point): string => {
    const side = onBoxSide(a, c);
    if (side) return `${sideLabel(side, f)} wall`;
    const m = { x: (a.x + c.x) / 2, y: (a.y + c.y) / 2 };
    const other = others.find((r) => r.id !== room.id && r.points.some((q, i) => segDist(m, q, r.points[(i + 1) % r.points.length]) < EPS));
    if (other) return `${other.name} wall`;
    const vertical = Math.abs(a.x - c.x) < Math.abs(a.y - c.y);
    const facing: Side = vertical ? (standing.at.x > a.x ? 'W' : 'E') : (standing.at.y > a.y ? 'N' : 'S');
    return `${sideLabel(facing, f)} wall`;
  };
  // Which third, along the left→right axis of the frame.
  const across = f.left === 'W' ? (standing.at.x - b.x) / b.width : f.left === 'E' ? 1 - (standing.at.x - b.x) / b.width : f.left === 'S' ? 1 - (standing.at.y - b.y) / b.height : (standing.at.y - b.y) / b.height;
  const third = across < 1 / 3 ? 'left' : across > 2 / 3 ? 'right' : 'middle';
  // Nearest wall of the room polygon to the thing's edge, with which side of the box it belongs to.
  let best: { d: number; wall: string; box: boolean } | null = null;
  const TIE = 0.25 * FT;
  for (let i = 0; i < room.points.length; i++) {
    const a = room.points[i], c = room.points[(i + 1) % room.points.length];
    const d = Math.min(...pts.map((p) => segDist(p, a, c)));
    const box = onBoxSide(a, c) !== null;
    // On a tie the room's own wall (front/rear/left/right) names the spot before an alcove's wall does.
    if (!best || d < best.d - TIE || (Math.abs(d - best.d) <= TIE && box && !best.box)) best = { d, wall: wallName(a, c), box };
  }
  const wallFt = best ? best.d / FT : Infinity;
  const wall = best ? (wallFt <= AGAINST_FT ? `against the ${best.wall}` : `${fmt(wallFt)} ft from the ${best.wall}`) : '';
  // The nearest opening of this room within reach.
  let near = '';
  let nearD = Infinity;
  for (const p of portals.filter((q) => touches(q, room) && q.name)) {
    const d = Math.min(...pts.map((q) => segDist(q, p.a, p.b))) / FT;
    if (d < nearD) { nearD = d; near = d <= AGAINST_FT ? `${p.kind === 'window' ? 'under' : 'at'} the ${p.name}` : d <= NEAR_FT ? `${fmt(d)} ft from the ${p.name}` : ''; }
  }
  const parts = [`in the ${third} third`, wall, near].filter(Boolean);
  return `${cap(name)} stands in the ${room.name}, ${parts.join(', ')}.`;
}

const fmt = (ft: number) => (Math.round(ft * 2) / 2).toString();
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const PLACEMENT_RE = /\b(stands?|anchors?|against|under|near|beside|next to|by the|corner|wall|third|left of|right of|facing|pulled up to|recessed|mounted|placed|sits?|leans?|rests?)\b/i;
const LIST_RE = /:\s|\bholds\b|\bon it\b|\binside\b|\bcontains?\b/i;

/** A name's key words ("the green couch" → couch, green). Pure. */
function nameWords(name: string): string[] {
  return name.toLowerCase().replace(/^the\s+/, '').split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !['with', 'from', 'that', 'this', 'under', 'over'].includes(w));
}

/**
 * Does a current fact speak for this thing? Its SUBJECT is the thing (`couch`, `main_room.green_couch`), or the fact
 * opens by naming it ("The green couch anchors…"). A fact about something else that merely mentions the thing
 * ("The rust blanket is … inside the green couch") is not its fact. Pure.
 */
export function speaksForThing(subjectKey: string, factText: string, name: string): boolean {
  const last = subjectKey.split('.').pop() ?? subjectKey;
  const bare = name.toLowerCase().replace(/^the\s+/, '').trim();
  if (last === slug(bare) || last === slug(name)) return true;
  const words = nameWords(name);
  const lastWords = last.split('_');
  if (words.length && words.every((w) => lastWords.includes(w))) return true;
  if (words.length && lastWords[lastWords.length - 1] === words[words.length - 1]) return true;
  const opening = factText.trim().toLowerCase().replace(/^the\s+/, '');
  return opening.startsWith(bare);
}

/**
 * Rewrite a fact's placement with the derived sentence: sentences about where the thing stands go, the rest (what
 * is on it, what it holds) stays after the new sentence. Pure.
 */
export function rewritePlacement(factText: string, sentence: string): string {
  const kept = splitSentences(factText)
    .map((s) => s.text)
    .filter((s) => !(PLACEMENT_RE.test(s) && !LIST_RE.test(s)));
  return [sentence, ...kept].join(' ').replace(/\s+/g, ' ').trim();
}

/** Rewrite every current fact that speaks for the thing from its spot on the map; one fact is written when none did. Idempotent. */
export async function syncThingFact(campaignId: string, thing: { id: string; name: string }, room: RoomLike, portals: PortalLike[], standing: Standing, others: RoomLike[] = [], cycle?: number): Promise<'written' | 'unchanged'> {
  const sentence = placementSentence(thing.name, room, portals, standing, others);
  const nowCycle = cycle ?? (await prisma.campaign.findUnique({ where: { id: campaignId }, select: { currentCycle: true } }))?.currentCycle ?? 0;
  const current = (await currentFacts(campaignId)).filter((f) => speaksForThing(f.subjectKey, f.fact, thing.name));
  if (!current.length) {
    await establishFact(campaignId, `${slug(room.name)}.${slug(thing.name.replace(/^the\s+/i, ''))}`, sentence, nowCycle);
    return 'written';
  }
  let written = false;
  for (const f of current) {
    const text = rewritePlacement(f.fact, sentence);
    if (text === f.fact) continue;
    await supersede(f.id, { fact: text, cycle: nowCycle });
    written = true;
  }
  return written ? 'written' : 'unchanged';
}

/** The tail of every write of a thing's spot: its facts follow the map. Never throws. */
export async function thingPlaced(campaignId: string, thing: { id: string; name: string }, room: RoomLike, portals: PortalLike[], standing: Standing, others: RoomLike[] = []): Promise<void> {
  try { await syncThingFact(campaignId, thing, room, portals, standing, others); } catch (err) { console.warn('[thing-facts] placement fact not written', err instanceof Error ? err.message : err); }
}

/** The room's polygon, its home's openings and its sibling rooms, from a room Location id; null when not drawn. */
export async function roomContext(campaignId: string, roomId: string): Promise<{ room: RoomLike; portals: PortalLike[]; others: RoomLike[] } | null> {
  const { parseFootprint, parseOpenings } = await import('@/lib/canvas-geometry');
  const parse = (raw: string | null): Record<string, unknown> => { try { const d = raw ? JSON.parse(raw) : {}; return d && typeof d === 'object' ? d : {}; } catch { return {}; } };
  const row = await prisma.location.findUnique({ where: { id: roomId }, select: { id: true, name: true, data: true } });
  const fp = row ? parseFootprint(parse(row.data).footprint) : null;
  if (!row || !fp) return null;
  const up = await prisma.entityRelationship.findFirst({ where: { campaignId, sourceId: roomId, relationshipType: 'located_at', targetType: 'LOCATION' }, select: { targetId: true } });
  const home = up ? await prisma.location.findUnique({ where: { id: up.targetId }, select: { id: true, data: true } }) : null;
  const portals: PortalLike[] = home ? parseOpenings(parse(home.data).openings).map((o) => ({ name: o.name, kind: o.kind, a: o.a, b: o.b, between: o.between })) : [];
  const sibs = home ? await prisma.entityRelationship.findMany({ where: { campaignId, targetId: home.id, relationshipType: 'located_at', sourceType: 'LOCATION' }, select: { sourceId: true } }) : [];
  const sibRows = sibs.length ? await prisma.location.findMany({ where: { id: { in: sibs.map((e) => e.sourceId) } }, select: { id: true, name: true, data: true } }) : [];
  const others: RoomLike[] = sibRows.flatMap((r) => { const f = parseFootprint(parse(r.data).footprint); return f && r.id !== roomId ? [{ id: r.id, name: r.name, points: f.points }] : []; });
  return { room: { id: row.id, name: row.name, points: fp.points }, portals, others };
}

/**
 * A BEING's position fact (`<first name>_position`, as Violet's seed fact is keyed): one sentence derived from where it
 * stands, rewritten on every GM drag or walk. Never throws.
 */
export async function beingPlaced(campaignId: string, being: { id: string; name: string }, roomId: string | null, at: Point): Promise<void> {
  try {
    if (!roomId) return;
    const ctx = await roomContext(campaignId, roomId);
    if (!ctx) return;
    const sentence = placementSentence(being.name, ctx.room, ctx.portals, { at }, ctx.others).replace(/ stands in the (Fourth-floor landing|[^,]*landing|[^,]*hall)/, ' stands on the $1');
    const cycle = (await prisma.campaign.findUnique({ where: { id: campaignId }, select: { currentCycle: true } }))?.currentCycle ?? 0;
    const key = `${slug(being.name.split(/\s+/)[0])}_position`;
    const cur = (await currentFacts(campaignId)).filter((f) => f.subjectKey === key);
    if (!cur.length) await establishFact(campaignId, key, sentence, cycle);
    else if (cur[0].fact !== sentence) await supersede(cur[0].id, { fact: sentence, cycle });
  } catch (err) { console.warn('[thing-facts] position fact not written', err instanceof Error ? err.message : err); }
}
