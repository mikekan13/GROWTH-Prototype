/**
 * The one writer for a door's state on the map (2026-10-27). Every path that
 * opens, closes or locks a door — the adjudicator's effects, a being walking
 * through a closed door, the canvas tap and JEWL's set_door (via
 * place-map.setDoorState, which adds the GM permission check) — ends here:
 * the home's `openings[].state` is written, the door's WorldFact follows it
 * and every open canvas is told (`door_changed`).
 */
import 'server-only';
import { prisma } from '@/lib/db';
import { parseOpenings, type DoorState } from '@/lib/canvas-geometry';
import { doorWritten } from '@/services/door-facts';

function parseData(raw: string | null): Record<string, unknown> {
  try { const d = raw ? JSON.parse(raw) : {}; return d && typeof d === 'object' && !Array.isArray(d) ? d : {}; } catch { return {}; }
}

/** Write a door's state on its home; the fact and the canvases follow. No-op when the opening is unknown. */
export async function writeDoorState(campaignId: string, homeId: string, openingId: string, state: DoorState): Promise<boolean> {
  const loc = await prisma.location.findUnique({ where: { id: homeId }, select: { name: true, data: true } });
  if (!loc) return false;
  const data = parseData(loc.data);
  const openings = parseOpenings(data.openings);
  const o = openings.find((x) => x.id === openingId);
  if (!o) return false;
  o.state = state;
  await prisma.location.update({ where: { id: homeId }, data: { data: JSON.stringify({ ...data, openings }) } });
  await doorWritten(campaignId, { id: homeId, name: loc.name }, { id: o.id, name: o.name ?? 'Door', state });
  return true;
}
