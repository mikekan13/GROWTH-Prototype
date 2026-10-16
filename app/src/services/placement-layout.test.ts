/**
 * applyLayout / moveItems (2026-10-16): JEWL plans once, code applies; the
 * placement facts are DERIVED from the map and a hand-written placement key
 * is rejected — three stores, one truth.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Edge = { targetId: string; targetType: string };

const { db, graph, ledger, locSvc } = vi.hoisted(() => {
  const graph = { parents: new Map<string, Edge>() };
  const ledger = { establishFact: vi.fn(), supersede: vi.fn() };
  const locSvc = { createLocation: vi.fn(), setLocationParent: vi.fn(), updateLocation: vi.fn() };
  const db = {
    location: { findMany: vi.fn(), findUnique: vi.fn() },
    campaignItem: { findMany: vi.fn(), findFirst: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    entityRelationship: { findFirst: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn(), create: vi.fn() },
    worldFact: { findMany: vi.fn(), aggregate: vi.fn(), update: vi.fn() },
    $transaction: vi.fn(async (ops: unknown[]) => ops),
  };
  return { db, graph, ledger, locSvc };
});
vi.mock('@/lib/db', () => ({ prisma: db }));
vi.mock('@/daya/world-ledger', () => ledger);
vi.mock('@/services/location', () => locSvc);

import { applyLayout, moveItems, derivePlacement, slugKey } from './placement';

const LOCS = [
  { id: 'loc_home', name: "Violet's Apartment", data: '{"description":"old","tags":["a"]}' },
  { id: 'loc_main', name: 'Main Room', data: '{"description":"old main"}' },
  { id: 'loc_kitchen', name: 'Kitchenette', data: '{}' },
];
const ITEMS = [
  { id: 'i_shelf', name: 'The reading corner shelf', locationId: 'loc_main' },
  { id: 'i_rabbit', name: 'The mended rabbit', locationId: 'loc_main' },
  { id: 'i_box', name: "Rosemary's sewing box", locationId: 'loc_main' },
];
const actor = { userId: 'u_gm', role: 'ADMIN' };

let seq = 0;
beforeEach(() => {
  vi.clearAllMocks();
  seq = 0;
  graph.parents = new Map<string, Edge>([
    ['loc_main', { targetId: 'loc_home', targetType: 'LOCATION' }],
    ['loc_kitchen', { targetId: 'loc_home', targetType: 'LOCATION' }],
    ['i_shelf', { targetId: 'loc_main', targetType: 'LOCATION' }],
    ['i_rabbit', { targetId: 'loc_main', targetType: 'LOCATION' }],
    ['i_box', { targetId: 'loc_main', targetType: 'LOCATION' }],
  ]);
  db.location.findMany.mockImplementation(async () => LOCS.map(l => ({ id: l.id, name: l.name })));
  db.location.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => LOCS.find(l => l.id === where.id) ?? null);
  db.campaignItem.findMany.mockImplementation(async ({ where }: { where: { OR?: Array<{ id?: string; name?: string }> } }) => {
    const ref = where.OR?.[0]?.id ?? '';
    return ITEMS.filter(i => i.id === ref || i.name.toLowerCase() === ref.toLowerCase());
  });
  db.campaignItem.findFirst.mockResolvedValue(null);
  db.campaignItem.findUnique.mockImplementation(async ({ where }: { where: { id: string } }) => ITEMS.find(i => i.id === where.id) ?? null);
  db.campaignItem.update.mockReturnValue({ op: 'update' });
  db.entityRelationship.findFirst.mockImplementation(async ({ where }: { where: { sourceId: string } }) => graph.parents.get(where.sourceId) ?? null);
  db.entityRelationship.deleteMany.mockImplementation(({ where }: { where: { sourceId: string } }) => { graph.parents.delete(where.sourceId); return { op: 'del' }; });
  db.entityRelationship.create.mockImplementation(({ data }: { data: { sourceId: string; targetId: string; targetType: string } }) => {
    graph.parents.set(data.sourceId, { targetId: data.targetId, targetType: data.targetType });
    return { op: 'create' };
  });
  db.worldFact.aggregate.mockResolvedValue({ _max: { establishedAtCycle: 3 } });
  db.worldFact.findMany.mockResolvedValue([
    { id: 'f_stale', subjectKey: 'violet_apartment.main_room.green_couch.mended_rabbit', fact: 'The mended rabbit is in Main Room, inside The green couch.' },
    { id: 'f_state', subjectKey: 'violet_apartment.couch', fact: 'Deep green studio couch.' },
  ]);
  db.worldFact.update.mockResolvedValue({});
  ledger.establishFact.mockImplementation(async (_c: string, subjectKey: string, fact: string) => ({ id: `new_${++seq}`, subjectKey, fact }));
  ledger.supersede.mockImplementation(async (oldId: string, n: { fact: string }) => ({ id: `sup_${oldId}`, fact: n.fact }));
  locSvc.createLocation.mockImplementation(async (_c: string, _u: string, _r: string, input: { name: string }) => ({ id: 'loc_new', name: input.name }));
  locSvc.setLocationParent.mockResolvedValue({});
  locSvc.updateLocation.mockResolvedValue({});
});

describe('slugKey / derivePlacement (pure)', () => {
  it('slugs stable key segments', () => {
    expect(slugKey('The reading corner shelf')).toBe('reading_corner_shelf');
    expect(slugKey("Rosemary's sewing box")).toBe('rosemarys_sewing_box');
    expect(slugKey('Her writing machine')).toBe('writing_machine');
  });
  it('derives <prefix>.<room>.<container...>.<item> and the sentence from the chain', () => {
    const chain = [
      { kind: 'location' as const, id: 'h', name: 'Home' },
      { kind: 'location' as const, id: 'm', name: 'Main Room' },
      { kind: 'item' as const, id: 'd', name: 'The desk' },
      { kind: 'item' as const, id: 'dr', name: 'The drawer' },
    ];
    expect(derivePlacement('violet_apartment', 'The key', chain)).toEqual({
      key: 'violet_apartment.main_room.desk.drawer.key',
      fact: 'The key is in Main Room, inside The desk, inside The drawer.',
    });
    // directly in the root place: no room segment
    expect(derivePlacement('p', 'The rug', [{ kind: 'location', id: 'h', name: 'Home' }]).key).toBe('p.rug');
  });
});

describe('applyLayout', () => {
  it('creates missing rooms under their parent and rewrites an existing room\'s description', async () => {
    const r = await applyLayout('c1', actor, {
      rooms: [
        { name: 'Bathroom', parent: "Violet's Apartment", description: 'Small bathroom.' },
        { name: 'Main Room', parent: "Violet's Apartment", description: 'The main room.' },
      ],
    });
    expect(r.roomsCreated).toEqual(['Bathroom']);
    expect(locSvc.createLocation).toHaveBeenCalledTimes(1);
    expect(locSvc.setLocationParent).toHaveBeenCalledWith('c1', 'u_gm', 'ADMIN', 'loc_new', 'loc_home');
    expect(locSvc.updateLocation).toHaveBeenCalledWith('loc_main', 'c1', 'u_gm', 'ADMIN', { data: { description: 'The main room.' } });
    expect(r.described).toBe(1);
    expect(r.errors).toEqual([]);
  });

  it('places things, DERIVES one placement fact per thing from the map, and retires the stale derived fact', async () => {
    const r = await applyLayout('c1', actor, {
      factPrefix: 'violet_apartment',
      placements: [
        { item: 'The mended rabbit', into: 'The reading corner shelf' },
        { item: "Rosemary's sewing box", into: 'Kitchenette' },
      ],
    });
    expect(r.placed).toBe(2);
    expect(r.derivedKeys).toEqual([
      'violet_apartment.main_room.reading_corner_shelf.mended_rabbit',
      'violet_apartment.kitchenette.rosemarys_sewing_box',
    ]);
    expect(ledger.establishFact).toHaveBeenCalledWith('c1', 'violet_apartment.main_room.reading_corner_shelf.mended_rabbit', 'The mended rabbit is in Main Room, inside The reading corner shelf.', 3);
    expect(ledger.establishFact).toHaveBeenCalledWith('c1', 'violet_apartment.kitchenette.rosemarys_sewing_box', "Rosemary's sewing box is in Kitchenette.", 3);
    // the old "rabbit on the couch" derived fact now points at the new truth
    expect(db.worldFact.update).toHaveBeenCalledWith({ where: { id: 'f_stale' }, data: { supersededById: 'new_1' } });
    expect(r.factsWritten).toBe(2);
    expect(r.errors).toEqual([]);
  });

  it('rejects a hand-written placement key, supersedes a state fact on an existing key, writes a new one', async () => {
    const r = await applyLayout('c1', actor, {
      factPrefix: 'violet_apartment',
      placements: [{ item: 'The mended rabbit', into: 'The reading corner shelf' }],
      facts: [
        { subjectKey: 'violet_apartment.main_room.reading_corner_shelf.mended_rabbit', fact: 'The rabbit sits on the shelf.' },
        { subjectKey: 'violet_apartment.couch', fact: 'Deep green studio couch, cushions compressed.' },
        { subjectKey: 'violet_apartment.light_now', fact: 'Late afternoon sun.' },
      ],
    });
    expect(r.rejected).toHaveLength(1);
    expect(r.rejected[0]).toMatchObject({ subjectKey: 'violet_apartment.main_room.reading_corner_shelf.mended_rabbit' });
    expect(r.rejected[0].reason).toMatch(/placement key/);
    expect(ledger.supersede).toHaveBeenCalledWith('f_state', { fact: 'Deep green studio couch, cushions compressed.', cycle: 3 });
    expect(ledger.establishFact).toHaveBeenCalledWith('c1', 'violet_apartment.light_now', 'Late afternoon sun.', 3);
    expect(r.factsWritten).toBe(3); // 1 derived + 2 state
  });

  it('one bad entry fails alone', async () => {
    const r = await applyLayout('c1', actor, {
      factPrefix: 'violet_apartment',
      placements: [{ item: 'ghost', into: 'Kitchenette' }, { item: 'The mended rabbit', into: 'Kitchenette' }],
      descriptions: [{ location: 'Nowhere', description: 'x' }],
    });
    expect(r.placed).toBe(1);
    expect(r.errors).toHaveLength(2);
    expect(r.errors[0]).toMatch(/ghost/);
    expect(r.errors[1]).toMatch(/Nowhere/);
  });
});

describe('moveItems', () => {
  it('moves a batch, each failing alone, and re-derives facts when a prefix is given', async () => {
    const r = await moveItems('c1', [
      { item: "Rosemary's sewing box", into: 'Kitchenette' },
      { item: 'nothing', into: 'Kitchenette' },
    ], { factPrefix: 'violet_apartment' });
    expect(r.moved).toBe(1);
    expect(r.results.map(x => x.ok)).toEqual([true, false]);
    expect(r.results[1].error).toMatch(/No item/);
    expect(r.derivedKeys).toEqual(['violet_apartment.kitchenette.rosemarys_sewing_box']);
  });
  it('without a prefix it only moves', async () => {
    const r = await moveItems('c1', [{ item: 'The mended rabbit', into: 'The reading corner shelf' }]);
    expect(r.moved).toBe(1);
    expect(r.derivedKeys).toEqual([]);
    expect(ledger.establishFact).not.toHaveBeenCalled();
  });
});
