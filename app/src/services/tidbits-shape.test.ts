import { describe, it, expect } from 'vitest';
import { sampleTidbits, shapeTidbit, wholeSentences, splitSentences, isProse, startsLikeSentence, memoryOpensCleanly, FALLBACK_TIDBITS, TIDBIT_COUNT, type TidbitSource } from './tidbits-shape';

const seq = (xs: number[]) => { let i = 0; return () => xs[i++ % xs.length]; };
const fact = (text: string): TidbitSource => ({ kind: 'fact', text });

describe('shapeTidbit rejects the template dumps and placeholders Mike saw', () => {
  const bad: TidbitSource[] = [
    fact('Main Room is a point of interest.'),
    fact('Kristopher — npc, active.'),
    fact('Violet — player character, active.'),
    fact('Rosemary Marsh — npc, draft.'),
    fact('The desk lamp is out in the world.'),
    fact('Violet holds The errand bag.'),
    fact("Derek is a character in Violet's world — role, relationship to Violet, and current status not yet established. He exists as a named person the story…"),
    { kind: 'history', text: 'Derek exists as a named person the story has not yet used.' },
    { kind: 'memory', text: 'Status not yet established.', owner: 'Violet' },
  ];
  it.each(bad.map((b) => [JSON.stringify(b), b] as const))('%s → null', (_n, src) => {
    expect(shapeTidbit(src)).toBeNull();
  });
});

describe('shapeTidbit keeps prose and shapes it', () => {
  it('a world fact is whole sentences, at most two, at most 160 characters', () => {
    const f = shapeTidbit(fact('Aged black iron fire escape beyond the street-facing window. Casts a grid of shadows across the floor at dusk. A third sentence that should not appear.'));
    expect(f).toBe('Aged black iron fire escape beyond the street-facing window. Casts a grid of shadows across the floor at dusk.');
    expect(f!.length).toBeLessThanOrEqual(160);
  });

  it('a long memory is cut at a sentence boundary, never mid-word, and closed with the owner', () => {
    const memory = 'The hotel room has a window that faces a parking lot. I leave the curtain open a crack because the dark feels heavier without the orange light from the lot, and I count the cars until I fall asleep every single night';
    const m = shapeTidbit({ kind: 'memory', text: memory, owner: 'Kristopher' })!;
    expect(m).toBe('The hotel room has a window that faces a parking lot. \u2014 Kristopher');
    expect(m).not.toMatch(/because/);
  });

  it('a memory whose first sentence is too long (or unfinished) yields nothing', () => {
    expect(shapeTidbit({ kind: 'memory', text: `${'word '.repeat(60)}and on`, owner: 'Violet' })).toBeNull();
    expect(shapeTidbit({ kind: 'memory', text: 'I leave the curtain open a crack because', owner: 'Violet' })).toBeNull();
  });

  it('an intention is a teaser', () => {
    expect(shapeTidbit({ kind: 'intention', description: 'Answer the door tonight', trigger: 'he knocks', cadence: 'nightly', owner: 'Violet' })).toBe('Every night, when he knocks\u2026 \u2014 Violet');
    expect(shapeTidbit({ kind: 'intention', description: 'Order the usual pizza from the same driver.', owner: 'Violet' })).toBe('Order the usual pizza from the same driver. — Violet');
  });

  it('familiarity becomes one sentence from the score band', () => {
    expect(shapeTidbit({ kind: 'familiarity', subject: 'Kristopher', score: 0.8, owner: 'Violet', second: true })).toBe('You know Kristopher well.');
    expect(shapeTidbit({ kind: 'familiarity', subject: 'the door', score: 0.5, owner: 'Violet' })).toBe('Violet knows the door a little.');
    expect(shapeTidbit({ kind: 'familiarity', subject: 'X', score: 0.05, owner: 'Violet' })).toBeNull();
  });

  it('wholeSentences never emits a fragment', () => {
    expect(wholeSentences('One. Two without end')).toBe('One.');
    expect(wholeSentences('No terminator at all')).toBeNull();
  });
});

describe('sampling', () => {
  it('keeps the fallback list tiny', () => {
    expect(FALLBACK_TIDBITS.length).toBeLessThanOrEqual(6);
  });

  it('at most one line in three is a memory, and kinds are spread', () => {
    const r = sampleTidbits({
      facts: Array.from({ length: 10 }, (_, i) => `Fact ${i}.`),
      history: ['History one.', 'History two.'],
      intentions: ['Tonight, when he knocks\u2026 \u2014 Violet'],
      economy: ['The campaign holds 99,900 KRMA.'],
      memories: Array.from({ length: 30 }, (_, i) => `Memory ${i}. \u2014 Kristopher`),
    }, seq([0.1, 0.5, 0.9, 0.3]));
    const mem = r.tidbits.filter((t) => t.startsWith('Memory')).length;
    expect(r.fallback).toBe(false);
    expect(r.tidbits.length).toBeLessThanOrEqual(TIDBIT_COUNT);
    expect(mem).toBeLessThanOrEqual(Math.floor(r.tidbits.length / 3));
    expect(r.tidbits).toContain('The campaign holds 99,900 KRMA.');
  });

  it('is deterministic for a given random source', () => {
    const pool = { facts: ['a.', 'b.', 'c.', 'd.', 'e.'], history: ['p.', 'q.'] };
    expect(sampleTidbits(pool, seq([0.2, 0.7])).tidbits).toEqual(sampleTidbits(pool, seq([0.2, 0.7])).tidbits);
  });

  it('only memories → fallback tops up the rest and memories stay under a third', () => {
    const r = sampleTidbits({ memories: ['M1. \u2014 V', 'M2. \u2014 V', 'M3. \u2014 V', 'M4. \u2014 V'] });
    expect(r.fallback).toBe(true);
    expect(r.tidbits.filter((t) => t.endsWith(' — V')).length).toBeLessThanOrEqual(Math.floor(r.tidbits.length / 3));
  });

  it('an empty pool is all fallback', () => {
    const r = sampleTidbits({});
    expect(r.fallback).toBe(true);
    expect(r.tidbits.every((t) => FALLBACK_TIDBITS.includes(t))).toBe(true);
  });
});

describe('fault 1: leaked keys and fragments', () => {
  it('rejects a bare identifier, a single token, snake_case, and anything under four words', () => {
    for (const t of ['reincarnation_book.', 'Reincarnation.', 'The reincarnation_book is here today.', 'Too short here.']) {
      expect(isProse(t)).toBe(false);
      expect(shapeTidbit({ kind: 'fact', text: t })).toBeNull();
    }
    expect(isProse('A real sentence has words.')).toBe(true);
  });
});

describe('fault 2: the sentence splitter', () => {
  it('never breaks on a decimal point, an abbreviation, or inside an ellipsis', () => {
    const text = 'The flat has 9.5 ft ceilings. It has three rooms: Main Room, Kitchenette, Bathroom.';
    expect(splitSentences(text).map((x) => x.text)).toEqual(['The flat has 9.5 ft ceilings.', 'It has three rooms: Main Room, Kitchenette, Bathroom.']);
    expect(wholeSentences(text)).toBe(text);
    expect(splitSentences("Mr. Hale waited at St. Anne's with Dr. Voss.").length).toBe(1);
    expect(splitSentences('It was 4 ft. long and e.g. heavy.').length).toBe(1);
    expect(splitSentences('She waited... and waited. Then left.').map((x) => x.text)).toEqual(['She waited... and waited.', 'Then left.']);
  });
  it('the cut-number fragment from the live sample is rejected', () => {
    expect(startsLikeSentence('5 ft ceilings. It has three rooms: Main Room, Kitchenette, Bathroom.')).toBe(false);
    expect(startsLikeSentence('and then it rained.')).toBe(false);
    expect(startsLikeSentence('“Stay,” she said.')).toBe(true);
    expect(shapeTidbit({ kind: 'fact', text: '5 ft ceilings. It has three rooms: Main Room, Kitchenette, Bathroom.' })).toBeNull();
  });
  it('a trailing unfinished sentence is never kept', () => {
    expect(wholeSentences('The door is oak. It was once painted')).toBe('The door is oak.');
  });
});

describe('fault 3: a memory is its OPENING, and the opening must stand alone', () => {
  const mem = (text: string) => shapeTidbit({ kind: 'memory', text, owner: 'Violet' });
  it('rejects the live samples', () => {
    expect(mem('And if I know for certain I will have to decide what that means.')).toBeNull();
    expect(mem("It's the one I always reach for.")).toBeNull();
    expect(mem("It's the most expensive single thing in the kitchen and I think of her every time I use it.")).toBeNull();
    expect(mem('That was the last time I saw the old place.')).toBeNull();
    expect(mem('This is how the evening always starts for me.')).toBeNull();
    expect(mem('But the lamp stayed on all night long.')).toBeNull();
  });
  it('rejects an unresolved her/him/it with no name earlier in the line', () => {
    expect(memoryOpensCleanly('I think of her every time I use the kettle.')).toBe(false);
    expect(memoryOpensCleanly('I think of Rosemary and what I owe her.')).toBe(true);
  });
  it('takes the opening, never an interior sentence', () => {
    expect(mem('The kettle is the one I trust. The lid rattles at dawn.')).toBe('The kettle is the one I trust. The lid rattles at dawn. — Violet');
    expect(mem("It's late. The kettle is the one I trust and use daily.")).toBeNull();
  });
});
