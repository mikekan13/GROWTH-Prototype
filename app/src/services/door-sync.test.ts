import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  loc: { id: 'apt', name: "Violet's Apartment", data: '' },
  facts: [] as Array<{ id: string; campaignId: string; subjectKey: string; fact: string; establishedAtCycle: number; supersededById: string | null }>,
  broadcast: vi.fn(),
  n: 0,
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/campaign-stream', () => ({ broadcastEvent: h.broadcast }));
vi.mock('@/services/placement', () => ({ placeItem: vi.fn() }));
vi.mock('@/services/character-location', () => ({ moveCharacterToLocation: vi.fn() }));
vi.mock('@/services/being-movement', () => ({ resolveMoveRef: vi.fn(async () => null), moveBeing: vi.fn(), describeMove: vi.fn() }));
vi.mock('@/services/spatial-perception', () => ({ perceiveMapChange: vi.fn(async () => undefined) }));
vi.mock('@/services/spatial-world', () => ({ loadWorldLevel: vi.fn(async () => { throw new Error('no map'); }), levelOfLocation: vi.fn(async () => null), thingStanding: vi.fn(async () => null) }));
vi.mock('@/daya/world-ledger', () => ({
  currentFacts: async () => h.facts.filter((f) => !f.supersededById),
  establishFact: async (campaignId: string, subjectKey: string, fact: string, cycle: number) => {
    const r = { id: `f${++h.n}`, campaignId, subjectKey, fact, establishedAtCycle: cycle, supersededById: null };
    h.facts.push(r); return r;
  },
  supersede: async (oldId: string, nf: { fact: string; cycle: number }) => {
    const old = h.facts.find((f) => f.id === oldId)!;
    const r = { ...old, id: `f${++h.n}`, fact: nf.fact, establishedAtCycle: nf.cycle, supersededById: null };
    h.facts.push(r); old.supersededById = r.id; return r;
  },
}));
vi.mock('@/lib/db', () => ({
  prisma: {
    character: { findUnique: async () => ({ id: 'vi', name: 'Violet', campaignId: 'c1', campaign: { gmUserId: 'gm' } }) },
    entityRelationship: { findFirst: async (a: { where: { sourceId: string } }) => (a.where.sourceId === 'vi' ? { targetId: 'apt' } : null) },
    location: {
      findUnique: async () => ({ ...h.loc }),
      update: async (a: { data: { data: string } }) => { h.loc.data = a.data.data; },
    },
    campaign: { findUnique: async () => ({ currentCycle: 3 }) },
    worldFact: { update: async (a: { where: { id: string }; data: { supersededById: string } }) => { h.facts.find((f) => f.id === a.where.id)!.supersededById = a.data.supersededById; } },
  },
}));

import { applyActEffects, actWorksTheLock } from './world-apply';
import { doorFactText, speaksForDoor } from './door-facts';

const opening = (state: string) => ({ id: 'op-1', kind: 'door', a: { x: 0, y: 0 }, b: { x: 3, y: 0 }, between: ['Violet\'s Apartment', 'Landing'], state, name: 'Entry door' });
const doorState = () => JSON.parse(h.loc.data).openings[0].state as string;
const liveFacts = () => h.facts.filter((f) => !f.supersededById);

beforeEach(() => {
  h.facts.length = 0; h.n = 0; h.broadcast.mockClear();
  h.loc.data = JSON.stringify({ openings: [opening('locked')] });
  h.facts.push({ id: 'f0', campaignId: 'c1', subjectKey: 'entry_door', fact: 'Entry door open. Deadbolt retracted.', establishedAtCycle: 1, supersededById: null });
  h.n = 1;
});

describe('compound door acts', () => {
  it('"turns the deadbolt and then the knob": locked + open → unlocked then opened, fact follows the map', async () => {
    const r = await applyActEffects('c1', 'vi', [{ op: 'door', door: 'Entry door', state: 'open' }], 'I turn the deadbolt, then the knob.');
    expect(r.refused).toEqual([]);
    expect(r.applied).toEqual(['door "Entry door" unlocked, then opened']);
    expect(doorState()).toBe('open');
    expect(liveFacts().map((f) => f.fact)).toEqual([doorFactText('Entry door', 'open')]);
  });
  it('a bare "opens the door" on her OWN locked door, from inside, unlocks and opens it (a lock is worked from the inside — HW10 2026-10-29; the 10-17 refusal law is gone)', async () => {
    const r = await applyActEffects('c1', 'vi', [{ op: 'door', door: 'Entry door', state: 'open' }], 'She opens the door.');
    expect(r.applied).toEqual(['door "Entry door" unlocked, then opened']);
    expect(r.refused).toEqual([]);
    expect(doorState()).toBe('open');
    expect(liveFacts().map((f) => f.fact)).toEqual([doorFactText('Entry door', 'open')]);
  });
  it('"shuts and bolts it": open → locked in one act is applied', async () => {
    h.loc.data = JSON.stringify({ openings: [opening('open')] });
    const r = await applyActEffects('c1', 'vi', [{ op: 'door', door: 'Entry door', state: 'locked' }], 'She shuts the door and bolts it.');
    expect(r.applied).toEqual(['door "Entry door" shut, then locked']);
    expect(doorState()).toBe('locked');
  });
  it('recognises the lock being worked', () => {
    expect(actWorksTheLock('I turn the deadbolt')).toBe(true);
    expect(actWorksTheLock('slides the bolt back')).toBe(true);
    expect(actWorksTheLock('she opens the door')).toBe(false);
  });
});

describe('one writer for door state', () => {
  it('a door write upserts the fact (one live row) and broadcasts door_changed', async () => {
    await applyActEffects('c1', 'vi', [{ op: 'door', door: 'Entry door', state: 'closed' }]);
    expect(doorState()).toBe('closed');
    expect(liveFacts()).toHaveLength(1);
    expect(liveFacts()[0].fact).toBe(doorFactText('Entry door', 'closed'));
    expect(h.broadcast).toHaveBeenCalledWith('c1', { kind: 'door_changed', locationId: 'apt', openingId: 'op-1', state: 'closed', name: 'Entry door' });
  });
  it('subject matching covers the three keys the sim used', () => {
    expect(speaksForDoor('entry_door', '', 'Entry door')).toBe(true);
    expect(speaksForDoor('violet_apartment.entry_door', '', 'Entry door')).toBe(true);
    expect(speaksForDoor('violet_apartment.door', 'Entry door at the rear-left corner', 'Entry door')).toBe(true);
    expect(speaksForDoor('violet_apartment.key', 'her entry door key', 'Entry door')).toBe(false);
  });
});
