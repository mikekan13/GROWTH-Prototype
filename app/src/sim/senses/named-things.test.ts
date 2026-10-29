import { describe, it, expect } from 'vitest';
import { matchNamedThings, headNoun, holderVerdict } from './named-things';

const VIOLET = { id: 'v', name: 'Violet' };
const KRIS = { id: 'k', name: 'Kristopher' };
const THINGS = [
  { id: 'phone-v', name: 'Her phone', holderId: 'v', locationId: null },
  { id: 'phone-k', name: 'Work phone', holderId: 'k', locationId: null },
  { id: 'phone-k2', name: 'Personal phone', holderId: 'k', locationId: null },
  { id: 'pizza', name: 'Pizza (Hawaiian + black olives)', holderId: 'k', locationId: null },
  { id: 'couch', name: 'The green couch', holderId: null, locationId: 'main' },
  { id: 'key', name: 'Her key', holderId: 'v', locationId: null },
];

describe('the things a line names (HW9: the phone call)', () => {
  it('head nouns', () => {
    expect(headNoun('Her phone')).toBe('phone');
    expect(headNoun('Pizza (Hawaiian + black olives)')).toBe('pizza');
    expect(headNoun('The green couch')).toBe('couch');
  });

  it("Kristopher calls Violet's cell phone from his work phone: both phones, hers by her name", () => {
    const m = matchNamedThings("Kristopher pulls out his work phone and uses the chess delivery app to call Violet's cell phone.", THINGS, [VIOLET, KRIS]);
    expect(m.map((x) => x.id).sort()).toEqual(['phone-k', 'phone-v']);
    expect(m.find((x) => x.id === 'phone-v')?.as.toLowerCase()).toBe("violet's cell phone");
  });

  it("'Violets cell phone begins to ring' (no apostrophe) names her phone", () => {
    const m = matchNamedThings('Violets cell phone begins to ring.', THINGS, [VIOLET, KRIS]);
    expect(m.map((x) => x.id)).toEqual(['phone-v']);
  });

  it('a bare "her key" names the one held key; the key is not confused with the couch', () => {
    const m = matchNamedThings('She turns her key over in her hand.', THINGS, [VIOLET, KRIS]);
    expect(m.map((x) => x.id)).toEqual(['key']);
  });

  it('a bare "her phone" with several held phones is dropped as vague; the couch is matched by its own name', () => {
    const m = matchNamedThings('She looks at her phone, then at the green couch.', THINGS, [VIOLET, KRIS]);
    // "her phone" could be any phone whose head noun is phone held by anyone → vague when more than one → only the couch stays
    expect(m.map((x) => x.id)).toEqual(['couch']);
  });

  it('the pizza is named by its head noun with its holder', () => {
    const m = matchNamedThings("Violet glances at Kristopher's pizza.", THINGS, [VIOLET, KRIS]);
    expect(m.map((x) => x.id)).toEqual(['pizza']);
  });
});

describe('the holder perceives what happens to the thing, whole', () => {
  it('adds sight, hearing and touch and makes it noticed', () => {
    const m = matchNamedThings('Violets cell phone begins to ring.', THINGS, [VIOLET, KRIS]);
    const v = holderVerdict('v', m, { beingId: 'v', reaches: true, via: ['hearing'], noticed: false, salience: 0.2 });
    expect(v).toEqual({ beingId: 'v', reaches: true, via: ['hearing', 'sight', 'touch'], noticed: true, salience: 0.7 });
    expect(holderVerdict('k', m, undefined)).toBeUndefined();
  });
});
