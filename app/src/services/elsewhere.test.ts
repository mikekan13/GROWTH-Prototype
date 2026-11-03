import { describe, it, expect, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { placesByLevel, withoutPlacesElsewhere } from './elsewhere';
import { factsForActor } from '@/daya/facts-for-actor';
import { signalCause } from './item-signal';
import { soundMayLandAt, addressedBeings, whereaboutsLines, signalReachLines } from './world-apply';

const places = [
  { id: 'a', name: 'Main Room', parentId: null, level: 0 },
  { id: 'h', name: 'The Hotel', parentId: null, level: 10 },
  { id: 'l', name: 'Hotel Parking Lot', parentId: 'h', level: 10 },
  { id: 'r', name: 'Room 214', parentId: 'h', level: null },
  { id: 'c', name: 'Chess Pizza', parentId: null, level: 20 },
];

describe('placesByLevel', () => {
  it('splits by the being level; a levelless place takes its parent\'s', () => {
    const r = placesByLevel(places, 0);
    expect(r.here).toEqual(['Main Room']);
    expect(r.away).toEqual(['The Hotel', 'Hotel Parking Lot', 'Room 214', 'Chess Pizza']);
  });
  it('a being on no level has nothing elsewhere', () => {
    expect(placesByLevel(places, null)).toEqual({ here: [], away: [] });
  });
});

describe('factsForActor with elsewhere', () => {
  const all = [
    { subjectKey: 'kristopher_hotel.2017_ford_fusion', fact: 'Fusion stands in the Asphalt.' },
    { subjectKey: 'the_hotel.mozzarella_cooler', fact: 'Mozzarella stands in The Hotel.' },
    { subjectKey: 'hotel_parking_lot.light', fact: 'Sodium lamps.' },
    { subjectKey: 'violet_apartment.entry_door', fact: 'Entry door locked.' },
  ];
  const base = { actorName: 'Violet', otherNames: ['Kristopher'], intent: 'the ringing car lot' };
  it('drops facts keyed to another character by prefix and to places on other levels', () => {
    const r = factsForActor(all, { ...base, elsewhere: ['The Hotel', 'Hotel Parking Lot'], here: ['Main Room'] });
    expect(r.map((f) => f.subjectKey)).toEqual(['violet_apartment.entry_door']);
  });
  it('a visitor keeps the facts of the place he stands in even if it carries the owner\'s name', () => {
    const r = factsForActor(all, { actorName: 'Kristopher', otherNames: ['Violet'], intent: '', here: ['Violet apartment'] });
    expect(r.map((f) => f.subjectKey)).toContain('violet_apartment.entry_door');
  });
});

describe('withoutPlacesElsewhere', () => {
  it('drops only the sentences that speak of a place on another level', () => {
    const out = withoutPlacesElsewhere(['The Hotel Parking Lot is empty. A lamp burns in the room.'], ['Hotel Parking Lot']);
    expect(out).toEqual(['A lamp burns in the room.']);
  });
});

describe('soundMayLandAt', () => {
  const o = { actorId: 'k', actorRoomIds: ['lot'], addressedIds: ['v'] };
  it('allows held by actor, held by the addressed, lying in the actor\'s place', () => {
    expect(soundMayLandAt({ ...o, holderId: 'k', thingRoomId: null })).toBe(true);
    expect(soundMayLandAt({ ...o, holderId: 'v', thingRoomId: 'main' })).toBe(true);
    expect(soundMayLandAt({ ...o, holderId: null, thingRoomId: 'lot' })).toBe(true);
  });
  it('refuses a free item in another place and a stranger\'s held thing', () => {
    expect(soundMayLandAt({ ...o, holderId: null, thingRoomId: 'pizza' })).toBe(false);
    expect(soundMayLandAt({ ...o, holderId: 'x', thingRoomId: 'pizza' })).toBe(false);
  });
  it('addressedBeings names the callee, never the actor', () => {
    const b = [{ id: 'k', name: 'Kristopher Kantack' }, { id: 'v', name: 'Violet' }];
    expect(addressedBeings(['Kristopher phones Violet.', "Violet's phone"], b, 'k')).toEqual(['v']);
  });
});

describe('signalCause', () => {
  it('another\'s thing: the actor caused it', () => expect(signalCause({ holderId: 'v', actorId: 'k' })).toEqual({ record: true, by: 'k' }));
  it('own thing, own act: nothing recorded', () => expect(signalCause({ holderId: 'v', actorId: 'v' })).toEqual({ record: false }));
  it('own thing, narrated: recorded, keeps a call\'s caller', () => {
    expect(signalCause({ holderId: 'v', actorId: 'v', narrated: true, existingBy: 'k' })).toEqual({ record: true, by: 'k' });
    expect(signalCause({ holderId: 'v', actorId: 'v', narrated: true })).toEqual({ record: true });
  });
});

describe('whereaboutsLines elsewhere', () => {
  it('does not hand over the far place\'s name', () => {
    const l = whereaboutsLines('Main Room', [{ id: 'k', name: 'Kristopher', roomName: 'Hotel Parking Lot', route: null, elsewhere: true }]);
    expect(l[0]).toMatch(/ELSEWHERE/);
    expect(l[0]).not.toMatch(/Parking/);
  });
});

describe('signalReachLines', () => {
  const rows = [
    { id: 'v', name: 'Violet Hart', elsewhere: true, carried: ['Her phone', 'Keys'] },
    { id: 't', name: 'Tess', carried: ['Tess phone'] },
  ];
  it('lists a named far person\'s carried things, no room', () => {
    const out = signalReachLines(['Kristopher dials Violet'], rows, 'k').join('\n');
    expect(out).toContain('Violet Hart carries: Her phone, Keys');
    expect(out).not.toMatch(/Tess/);
  });
  it('nothing when nobody far is named', () => {
    expect(signalReachLines(['Kristopher looks at the road'], rows, 'k')).toEqual([]);
  });
  it('same-level person is untouched', () => {
    expect(signalReachLines(['he calls Tess'], rows, 'k')).toEqual([]);
  });
  it('the sound lands at the callee\'s held phone', () => {
    expect(soundMayLandAt({ holderId: 'v', thingRoomId: null, actorId: 'k', actorRoomIds: ['lot'], addressedIds: addressedBeings(['calls Violet'], [{ id: 'v', name: 'Violet Hart' }], 'k') })).toBe(true);
  });
});
