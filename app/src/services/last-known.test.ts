/** Fog of war on load (Mike 2026-10-28): the map as one character last knew it. Pure fogging of the canvas model. */
import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ prisma: {} }));

import { fogCanvasModel, type LastKnownRow, type FoggableModel } from './last-known';
import type { CanvasNode, CanvasFolder } from '@/types/canvas';

const node = (p: Partial<CanvasNode> & { id: string; type: CanvasNode['type'] }): CanvasNode => ({ name: p.id, x: 0, y: 0, ...p });
const room = (locId: string, nodeIds: string[], extra: Partial<NonNullable<CanvasFolder['locationInfo']>> = {}): CanvasFolder => ({
  id: `auto-${locId}`, name: locId, type: 'group', nodeIds, locationInfo: { locationId: locId, ...extra },
});
const row = (p: Partial<LastKnownRow> & { subjectId: string; kind: LastKnownRow['kind'] }): LastKnownRow => ({ viewerId: 'kris', known: 'point', x: null, y: null, roomId: null, state: null, ...p });

function truth(): FoggableModel {
  return {
    nodes: [
      node({ id: 'kris', type: 'character', x: -100, y: 800 }),
      node({ id: 'violet', type: 'character', x: 150, y: 950 }),
      node({ id: 'rosemary', type: 'character', x: 900, y: 900 }),
      node({ id: 'bill', type: 'item', x: 50, y: 700, roomId: 'main' }),
      node({ id: 'phone', type: 'item', holderId: 'violet' }),
      node({ id: 'keys', type: 'item', holderId: 'kris' }),
    ],
    connections: [{ from: 'kris', to: 'violet', type: 'alliance', strength: 1 }, { from: 'kris', to: 'rosemary', type: 'conflict', strength: 1 }],
    autoFolders: [
      room('landing', ['kris']),
      room('main', ['violet', 'bill', 'bath'], { openings: [{ id: 'op-1', kind: 'door', a: { x: 0, y: 600 }, b: { x: 0, y: 700 }, between: ['main', 'landing'], state: 'locked' }, { id: 'op-3', kind: 'archway', a: { x: 300, y: 600 }, b: { x: 300, y: 750 }, between: ['kitchen', 'main'] }] }),
      room('bath', []),
      room('far', ['rosemary']),
    ],
    locatedAtEdges: [{ child: 'kris', parent: 'landing' }, { child: 'violet', parent: 'main' }, { child: 'bill', parent: 'main' }, { child: 'rosemary', parent: 'far' }, { child: 'bath', parent: 'main' }],
  };
}

describe('the map as Kristopher last knew it', () => {
  it('nothing perceived yet: only himself and what he holds; places stay; the locked door is drawn closed', () => {
    const m = fogCanvasModel(truth(), 'kris', []);
    expect(m.nodes.map((n) => n.id).sort()).toEqual(['keys', 'kris']);
    expect(m.autoFolders.map((f) => f.id)).toEqual(['auto-landing', 'auto-main', 'auto-bath', 'auto-far']);
    expect(m.autoFolders[1].nodeIds).toEqual(['bath']); // the child place stays filed
    expect(m.autoFolders[1].locationInfo?.openings?.map((o) => o.state)).toEqual(['closed', undefined]);
    expect(m.locatedAtEdges).toEqual([{ child: 'kris', parent: 'landing' }, { child: 'bath', parent: 'main' }]);
    expect(m.connections).toEqual([]);
  });

  it('a being heard in the main room stands greyed at its centre, filed there; one seen stands at its point; a seen door keeps its state', () => {
    const rows = [
      row({ subjectId: 'violet', kind: 'being', known: 'room', x: 205, y: 825, roomId: 'main' }),
      row({ subjectId: 'bill', kind: 'thing', known: 'point', x: 50, y: 700, roomId: 'main' }),
      row({ subjectId: 'op-1', kind: 'door', state: 'locked' }),
    ];
    const m = fogCanvasModel(truth(), 'kris', rows);
    const violet = m.nodes.find((n) => n.id === 'violet')!;
    expect(violet).toMatchObject({ x: 205, y: 825, unseen: true });
    expect(m.nodes.find((n) => n.id === 'bill')).toMatchObject({ x: 50, y: 700, unseen: false });
    expect(m.nodes.find((n) => n.id === 'phone')).toBeTruthy(); // on a perceived holder
    expect(m.nodes.find((n) => n.id === 'rosemary')).toBeUndefined();
    expect(m.autoFolders[1].nodeIds.sort()).toEqual(['bath', 'bill', 'violet']);
    expect(m.autoFolders[1].locationInfo?.openings?.[0].state).toBe('locked');
    expect(m.connections).toEqual([{ from: 'kris', to: 'violet', type: 'alliance', strength: 1 }]);
  });

  it('a being last known in another room than the truth is filed where he last knew it', () => {
    const m = fogCanvasModel(truth(), 'kris', [row({ subjectId: 'violet', kind: 'being', known: 'point', x: 50, y: 975, roomId: 'bath' })]);
    expect(m.autoFolders.find((f) => f.id === 'auto-bath')!.nodeIds).toEqual(['violet']);
    expect(m.autoFolders.find((f) => f.id === 'auto-main')!.nodeIds).toEqual(['bath']);
    expect(m.locatedAtEdges).toContainEqual({ child: 'violet', parent: 'bath' });
    expect(m.locatedAtEdges).not.toContainEqual({ child: 'violet', parent: 'main' });
  });
});
