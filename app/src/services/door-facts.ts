/**
 * ONE WRITER FOR DOOR STATE (2026-10-27). The map (`Location.data.openings[].state`)
 * is the truth; the door's WorldFact is derived from it here, never written
 * on its own. Before this, the adjudicator wrote "Entry door … open" facts
 * while the map refused the same change and still said locked — the canvas
 * never moved.
 *
 * `syncDoorFact` supersedes whatever current fact speaks for that door with
 * the map's wording; `doorWritten` is what every door write ends with (sync +
 * one `map_changed` broadcast).
 */
import 'server-only';
import { prisma } from '@/lib/db';
import { currentFacts, establishFact, supersede } from '@/daya/world-ledger';
import { broadcastEvent } from '@/lib/campaign-stream';
import { perceiveMapChange } from '@/services/spatial-perception';
import type { DoorState } from '@/lib/canvas-geometry';

export function slug(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

/** The sim's wording family for a door, from the map's state. Pure. */
export function doorFactText(name: string, state: DoorState): string {
  if (state === 'open') return `${name} is open.`;
  if (state === 'locked') return `${name} is closed, locked from the inside.`;
  return `${name} is closed, not locked.`;
}

/** Does a current fact's subject speak for this door? (`entry_door`, `violet_apartment.entry_door`, or `….door` naming it.) Pure. */
export function speaksForDoor(subjectKey: string, factText: string, doorName: string): boolean {
  const last = subjectKey.split('.').pop() ?? subjectKey;
  const s = slug(doorName);
  if (last === s) return true;
  return last === 'door' && factText.toLowerCase().includes(doorName.toLowerCase());
}

/** Rewrite the door's current WorldFact(s) from the map state. Idempotent. */
export async function syncDoorFact(
  campaignId: string,
  home: { name: string },
  door: { name: string; state: DoorState },
  cycle?: number,
): Promise<'written' | 'unchanged'> {
  const text = doorFactText(door.name, door.state);
  const nowCycle = cycle ?? (await prisma.campaign.findUnique({ where: { id: campaignId }, select: { currentCycle: true } }))?.currentCycle ?? 0;
  const current = (await currentFacts(campaignId)).filter((f) => speaksForDoor(f.subjectKey, f.fact, door.name));
  if (!current.length) {
    await establishFact(campaignId, `${slug(home.name)}.${slug(door.name)}`, text, nowCycle);
    return 'written';
  }
  if (current.every((f) => f.fact === text)) return 'unchanged';
  // One live row speaks for the door: the first is superseded by the map's wording, the rest retire into it.
  const [first, ...rest] = current;
  const fresh = await supersede(first.id, { fact: text, cycle: nowCycle });
  for (const f of rest) await prisma.worldFact.update({ where: { id: f.id }, data: { supersededById: fresh.id } });
  return 'written';
}

/** The tail of every door write: fact follows the map, canvases redraw the door in place (`door_changed`; `map_changed` only when the opening id is unknown). Never throws. */
export async function doorWritten(
  campaignId: string,
  home: { id: string; name: string },
  door: { id?: string; name: string; state: DoorState },
): Promise<void> {
  try { await syncDoorFact(campaignId, home, door); } catch (err) { console.warn('[door-facts] fact sync failed', err); }
  try {
    if (door.id) {
      // Fog of war: who saw or heard the door — a viewer who perceived nothing keeps it as last known.
      const seen = await perceiveMapChange(campaignId, { kind: 'door', portalId: door.id, homeId: home.id });
      broadcastEvent(campaignId, { kind: 'door_changed', locationId: home.id, openingId: door.id, state: door.state, name: door.name, ...seen });
    } else broadcastEvent(campaignId, { kind: 'map_changed', locationIds: [home.id], characterIds: [] });
  } catch { /* canvases re-read on their own */ }
}
