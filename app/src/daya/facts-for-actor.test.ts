import { describe, it, expect } from 'vitest';
import { factsForActor, splitHeld, heldLines, subjectHead } from './facts-for-actor';

const facts = [
  { subjectKey: 'violet_apartment.door', fact: 'Entry door, deadbolt and knob lock, both locked.' },
  { subjectKey: 'kitchenette:fridge', fact: 'The fridge holds milk and eggs.' },
  { subjectKey: 'kristopher.legal.status', fact: 'Kristopher is awaiting trial.' },
  { subjectKey: 'kristopher.hotel-room.description', fact: 'A budget hotel room.' },
  { subjectKey: 'violet', fact: 'Violet keeps the door locked.' },
  { subjectKey: 'rosemary_marsh.status', fact: 'Rosemary is the landlady.' },
  { subjectKey: 'mainRoom.doors', fact: 'The bathroom door is on the left wall.' },
];

describe('factsForActor — privacy (hello world 2026-10-17)', () => {
  it("another character's own facts never reach the actor", () => {
    const out = factsForActor(facts, { actorName: 'Violet', otherNames: ['Kristopher', 'Rosemary Marsh'], intent: 'open the door' });
    expect(out.map((f) => f.subjectKey)).not.toContain('kristopher.legal.status');
    expect(out.map((f) => f.subjectKey)).not.toContain('kristopher.hotel-room.description');
    expect(out.map((f) => f.subjectKey)).not.toContain('rosemary_marsh.status');
  });
  it("the actor's own facts, the place's and the things' stay", () => {
    const out = factsForActor(facts, { actorName: 'Violet', otherNames: ['Kristopher'], intent: 'look at the fridge' });
    expect(out.map((f) => f.subjectKey)).toEqual(['violet_apartment.door', 'kitchenette:fridge', 'violet', 'rosemary_marsh.status', 'mainRoom.doors']);
  });
  it('a first name alone keys a character too', () => {
    const out = factsForActor(facts, { actorName: 'Kristopher', otherNames: ['Rosemary Marsh'], intent: 'wait' });
    expect(out.map((f) => f.subjectKey)).not.toContain('rosemary_marsh.status');
    expect(out.map((f) => f.subjectKey)).toContain('kristopher.legal.status');
  });
});

describe('factsForActor — relevance and the cap', () => {
  const many = Array.from({ length: 100 }, (_, i) => ({ subjectKey: `room.thing${i}`, fact: `Thing ${i} sits there.` }));
  it('cuts at the cap, the intent\'s subjects first, then the newest, original order kept', () => {
    const all = [...many, { subjectKey: 'room.kettle', fact: 'A kettle on the stove, cold.' }, ...many.map((f, i) => ({ ...f, subjectKey: `other.late${i}` }))];
    const out = factsForActor(all, { actorName: 'Violet', otherNames: [], intent: 'fill the kettle', cap: 10 });
    expect(out).toHaveLength(10);
    expect(out.map((f) => f.subjectKey)).toContain('room.kettle');
    expect(out[out.length - 1].subjectKey).toBe('other.late99');
    expect(out.indexOf(out.find((f) => f.subjectKey === 'room.kettle')!)).toBe(0);
  });
  it('under the cap everything allowed comes back unsorted', () => {
    const out = factsForActor(facts, { actorName: 'Violet', otherNames: [], intent: 'anything', cap: 60 });
    expect(out).toEqual(facts);
  });
  it('subjectHead reads dots and colons', () => {
    expect(subjectHead('kitchenette:fridge')).toBe('kitchenette');
    expect(subjectHead('violet_apartment.door.knock')).toBe('violet_apartment');
  });
});

describe('what a being is told about its own body', () => {
  it('splits worn from carried by equippedTo', () => {
    const h = splitHeld([
      { name: 'Jeans', data: JSON.stringify({ equippedTo: 'hips' }) },
      { name: 'Apartment key', data: JSON.stringify({}) },
      { name: 'Broken', data: '{not json' },
    ]);
    expect(h).toEqual({ wearing: ['Jeans'], carrying: ['Apartment key', 'Broken'], written: [] });
    expect(heldLines(h)).toEqual(['You are wearing: Jeans.', 'You have on you: Apartment key, Broken.']);
  });
  it('says plainly when there is nothing — never a jacket that is not there', () => {
    expect(heldLines({ wearing: [], carrying: [] })).toEqual([
      'You are wearing nothing but what is on your sheet as underwear.',
      'You carry nothing else.',
    ]);
  });
});

describe('what is written on a held thing is told to the being (HW8 2026-10-25)', () => {
  it('splitHeld carries data.text and heldLines reads it out', () => {
    const h = splitHeld([
      { name: 'Chess Pizza receipt', data: JSON.stringify({ text: ['TOTAL DUE 22.97', 'NOT PAID'].join('\n') }) },
      { name: 'Chess Pizza polo', data: JSON.stringify({ equippedTo: 'torso' }) },
    ]);
    expect(h.written).toEqual([{ name: 'Chess Pizza receipt', text: ['TOTAL DUE 22.97', 'NOT PAID'].join('\n') }]);
    const lines = heldLines(h);
    expect(lines[0]).toBe('You are wearing: Chess Pizza polo.');
    expect(lines[1]).toBe('You have on you: Chess Pizza receipt.');
    expect(lines[2]).toBe(['Written on the Chess Pizza receipt:', 'TOTAL DUE 22.97', 'NOT PAID'].join('\n'));
    expect(heldLines(h, { written: false })).toHaveLength(2);
  });
});
