import { describe, it, expect } from 'vitest';
import { parseSegments, segmentMarks, splitEntities, presentCycle, realClock } from './feed-segments';

describe('parseSegments — colour marks WHAT, never WHO (Mike 2026-10-07)', () => {
  it('reads the three AOL-RP markers in order', () => {
    expect(parseSegments('::sets the lamp on the stair:: "Sit down." ((he is lying))')).toEqual([
      { kind: 'action', text: 'sets the lamp on the stair' },
      { kind: 'speech', text: 'Sit down.' },
      { kind: 'thought', text: 'he is lying' },
    ]);
  });

  it('curly quotes are speech too', () => {
    expect(parseSegments('“Sit down.”')).toEqual([{ kind: 'speech', text: 'Sit down.' }]);
  });

  it("the engine's *act* form is an action", () => {
    expect(parseSegments('*stays quiet*')).toEqual([{ kind: 'action', text: 'stays quiet' }]);
  });

  it('an unmarked line is speech (a being\'s Say: line, a lone "Ruth: …")', () => {
    expect(parseSegments('Sit down.')).toEqual([{ kind: 'speech', text: 'Sit down.' }]);
  });

  it('unmarked prose beside a quote is what the character does', () => {
    expect(parseSegments('She looks up. "Hi."')).toEqual([
      { kind: 'action', text: 'She looks up.' },
      { kind: 'speech', text: 'Hi.' },
    ]);
  });

  it('unmarked text beside an action marker is speech', () => {
    expect(parseSegments('::nods:: fine, then')).toEqual([
      { kind: 'action', text: 'nods' },
      { kind: 'speech', text: 'fine, then' },
    ]);
  });

  it('the bare kind can be forced', () => {
    expect(parseSegments('walks to the door', { bare: 'action' })).toEqual([{ kind: 'action', text: 'walks to the door' }]);
  });

  it('drops punctuation-only gaps and joins neighbours of one kind', () => {
    expect(parseSegments('"One." , "Two."')).toEqual([{ kind: 'speech', text: 'One. Two.' }]);
  });

  it('collapses whitespace inside a segment, empty input gives nothing', () => {
    expect(parseSegments('::  leans\n  in ::')).toEqual([{ kind: 'action', text: 'leans in' }]);
    expect(parseSegments('   ')).toEqual([]);
  });

  it('an unclosed marker stays plain text', () => {
    expect(parseSegments('::half an action')).toEqual([{ kind: 'speech', text: '::half an action' }]);
  });

  it('draws each kind with its own marks', () => {
    expect(segmentMarks('action')).toEqual(['::', '::']);
    expect(segmentMarks('speech')).toEqual(['“', '”']);
    expect(segmentMarks('thought')).toEqual(['((', '))']);
  });
});

describe('splitEntities — names of things in the world', () => {
  const world = [
    { id: 'loc-1', name: 'Stairwell' },
    { id: 'loc-2', name: 'Main Room' },
    { id: 'loc-3', name: 'Room' },
    { id: 'item-1', name: 'lamp' },
    { id: 'npc-1', name: 'Al' },
  ];

  it('marks whole-word, case-insensitive matches', () => {
    expect(splitEntities('The stairwell is darker than it should be.', world)).toEqual([
      { text: 'The ' },
      { text: 'stairwell', entityId: 'loc-1' },
      { text: ' is darker than it should be.' },
    ]);
  });

  it('the longest name wins', () => {
    expect(splitEntities('back in the main room', world).filter((p) => p.entityId)).toEqual([{ text: 'main room', entityId: 'loc-2' }]);
  });

  it('never inside a word, never a too-short name', () => {
    expect(splitEntities('lamplight and Alice', world)).toEqual([{ text: 'lamplight and Alice' }]);
  });

  it('excluded ids are left as plain text', () => {
    expect(splitEntities('the lamp', world, ['item-1'])).toEqual([{ text: 'the lamp' }]);
  });

  it('no world, one plain piece', () => {
    expect(splitEntities('anything', [])).toEqual([{ text: 'anything' }]);
  });
});

describe('time — in-world first, real second', () => {
  it('presents a cycle on the standard reckoning', () => {
    expect(presentCycle(0)).toBe('1st Jan, Y1 · 00:00 · 0.000 cyc');
    // 0.004 of a 365-day year = 1.46 days → 2nd January, 11:02
    expect(presentCycle(0.004)).toBe('2nd Jan, Y1 · 11:02 · 0.004 cyc');
  });

  it('honours the campaign timescale (two local years per cycle)', () => {
    expect(presentCycle(0.5, { unitsPerMetaCycle: 2, calendar: null, unitName: 'year' })).toBe('1st Jan, Y2 · 00:00 · 0.500 cyc');
  });

  it('keeps short month names whole', () => {
    expect(presentCycle(130 / 365)).toMatch(/^11th May, Y1/);
  });

  it('real clock is 24 h with seconds', () => {
    const iso = new Date(2026, 9, 7, 21, 7, 12).toISOString();
    expect(realClock(iso)).toBe('21:07:12');
    expect(realClock('nope')).toBe('');
  });
});
