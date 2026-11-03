/**
 * WHAT IS ELSEWHERE (2026-11-02, the phone call: Violet at home was handed the hotel, its lot and Kristopher's car as if they
 * were around her). The world is drawn in levels; a place on another level than a being's own is ANOTHER PLACE, and what is
 * keyed to it, drawn in it or standing in it is not part of that being's surroundings — only what it carries (a call) crosses.
 *
 * `placesByLevel` is pure: places with their parent and their own drawn level (a place with none takes its nearest parent's),
 * and the level the being stands on, in → the names of the places on that level (`here`) and on every other (`away`).
 */
/**
 * The page's blocks without the sentences that speak of a place on another level (the page is every being's shared record; one
 * being's card is framed by its own place — Kristopher's "Hotel Parking Lot" sentence is not set before Violet). A place is spoken
 * of by its name, less a leading article. Pure.
 */
export function withoutPlacesElsewhere(blocks: string[], awayNames: string[]): string[] {
  const names = awayNames.map((n) => n.toLowerCase().replace(/^the\s+/, '').trim()).filter((n) => n.length >= 3);
  if (!names.length) return blocks;
  return blocks.map((b) => (b.match(/[^.!?…]+[.!?…]*\s*/g) ?? [b]).filter((s) => !names.some((n) => s.toLowerCase().includes(n))).join('').trim()).filter(Boolean);
}

export interface PlaceRow { id: string; name: string; parentId: string | null; level: number | null }

export function placesByLevel(places: PlaceRow[], beingLevel: number | null): { here: string[]; away: string[] } {
  const byId = new Map(places.map((p) => [p.id, p]));
  const levelOf = (p: PlaceRow): number | null => {
    for (let cur: PlaceRow | undefined = p, i = 0; cur && i < 8; cur = cur.parentId ? byId.get(cur.parentId) : undefined, i++) if (cur.level !== null) return cur.level;
    return null;
  };
  const here: string[] = [];
  const away: string[] = [];
  if (beingLevel === null) return { here, away };
  for (const p of places) {
    const lvl = levelOf(p);
    if (lvl === null) continue;
    (lvl === beingLevel ? here : away).push(p.name);
  }
  return { here, away };
}
