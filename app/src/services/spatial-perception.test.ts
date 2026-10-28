/** Fog of war grading (Mike 2026-10-28): seen = the point, heard = the room, nothing = last known. Pure parts, on the Incubator fixture. */
import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ prisma: {} }));
vi.mock('@/services/spatial-world', () => ({ loadWorldLevel: vi.fn(), beingStanding: vi.fn(), roomCentre: vi.fn(), levelOfLocation: vi.fn() }));

import { gradeMove, gradeDoor, roomsJoinedTo } from './spatial-perception';
import { fixture, P } from '@/lib/spatial/test-fixture';
import { roomAt, type LevelMap } from '@/lib/spatial';
import type { Point } from '@/lib/canvas-geometry';

const standing = (map: LevelMap, p: Point) => ({ point: p, room: roomAt(map, p), stored: true });
const move = (at: Point, roomId: string, path?: Point[]) => ({ kind: 'being' as const, entityId: 'violet', at, roomId, path });

describe('what a viewer perceives of a move', () => {
  it('seen through an open door = the point; the same move behind a locked door = the room (heard)', () => {
    const open = fixture({ entry: 'open' });
    const kris = standing(open, P(-100, 650));
    expect(gradeMove(open, kris, move(P(150, 650), 'main'))).toBe('point');
    const locked = fixture({ entry: 'locked' });
    expect(gradeMove(locked, standing(locked, P(-100, 650)), move(P(150, 650), 'main'))).toBe('room');
  });

  it('a room not joined to the viewer\'s = nothing; a viewer nowhere on the map = nothing', () => {
    const map = fixture();
    const inBath = standing(map, P(50, 975));
    expect(gradeMove(map, inBath, move(P(350, 700), 'kitchen'))).toBe('none');
    expect(gradeMove(map, null, move(P(150, 650), 'main'))).toBe('none');
  });

  it('a glimpse on the way (past the open door) tells the room, not the spot', () => {
    const map = fixture({ entry: 'open' });
    const kris = standing(map, P(-100, 650));
    expect(gradeMove(map, kris, move(P(50, 975), 'bath'))).toBe('none');
    expect(gradeMove(map, kris, move(P(50, 975), 'bath', [P(150, 950), P(150, 650), P(50, 975)]))).toBe('room');
  });

  it('the same room is heard even without sight (furniture or a corner between)', () => {
    const map = fixture();
    const violet = standing(map, P(150, 950));
    expect(gradeMove(map, violet, move(P(350, 1000), 'main'))).toBe('point');
    expect(roomsJoinedTo(map, violet.room!).map((r) => r.id).sort()).toEqual(['bath', 'kitchen', 'landing']);
  });
});

describe('what a viewer perceives of a door', () => {
  it('seen from the room it opens into; heard from the other side; nothing from a room it does not touch', () => {
    const map = fixture({ entry: 'locked' });
    const door = map.portals.find((p) => p.id === 'op-1')!;
    expect(gradeDoor(map, standing(map, P(150, 650)), door)).toBe('point');
    expect(gradeDoor(map, standing(map, P(-100, 900)), door)).not.toBe('none');
    expect(gradeDoor(map, standing(map, P(50, 975)), door)).toBe('none');
  });
});
