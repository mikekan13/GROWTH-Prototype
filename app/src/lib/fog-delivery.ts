/**
 * Fog of war on the map, one viewer's copy of a map event (pure, shared by the server's delivery filter and
 * the Watcher's canvas when it views the map as a character — Mike 2026-10-28: "when switching viewpoint on
 * the terminal as a Watcher it should let you see that entity's view too").
 *
 *   seen   → the event whole, minus the grades;
 *   heard  → `known: 'room'`: the token at the room's centre, no path, no seconds; a thing without its point;
 *   nothing → null (the viewer's map keeps the last known).
 * A viewer's own token, and a thing in their own hands, always arrive whole. A door heard or seen arrives
 * in the state that viewer can see. An ungraded event (no map) passes whole.
 */
import type { StreamEventData, PerceptionGrade } from '@/types/campaign-events';

export type MapEventData = Extract<StreamEventData, { kind: 'token_moved' | 'door_changed' | 'item_changed' }>;

function gradeFor(perceivedBy: Record<string, PerceptionGrade>, characterId: string | null): PerceptionGrade {
  return (characterId && perceivedBy[characterId]) || 'none';
}

export function isMapEvent(data: StreamEventData): data is MapEventData {
  return data.kind === 'token_moved' || data.kind === 'door_changed' || data.kind === 'item_changed';
}

export function fogMapEventFor(data: MapEventData, characterId: string | null): MapEventData | null {
  const mine = (id: string | null | undefined) => !!characterId && id === characterId;
  switch (data.kind) {
    case 'token_moved': {
      const { perceivedBy, roomPoint, ...rest } = data;
      if (!perceivedBy) return rest;
      const grade = mine(data.entityId) ? 'point' : gradeFor(perceivedBy, characterId);
      if (grade === 'none') return null;
      if (grade === 'point') return rest;
      const { path: _path, seconds: _s, ...heard } = rest;
      void _path; void _s;
      return { ...heard, ...(roomPoint ? { x: roomPoint.x, y: roomPoint.y } : {}), known: 'room' };
    }
    case 'door_changed': {
      const { perceivedBy, visibleState, ...rest } = data;
      if (!perceivedBy) return rest;
      if (gradeFor(perceivedBy, characterId) === 'none') return null;
      const seenAs = characterId ? visibleState?.[characterId] : undefined;
      return seenAs ? { ...rest, state: seenAs } : rest;
    }
    case 'item_changed': {
      const { perceivedBy, ...rest } = data;
      if (!perceivedBy) return rest;
      const grade = mine(data.holderId) ? 'point' : gradeFor(perceivedBy, characterId);
      if (grade === 'none') return null;
      if (grade === 'point') return rest;
      const { x: _x, y: _y, ...heard } = rest;
      void _x; void _y;
      return { ...heard, known: 'room' };
    }
  }
}
