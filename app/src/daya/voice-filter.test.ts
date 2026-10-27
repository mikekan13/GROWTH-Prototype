import { describe, it, expect } from 'vitest';
import { filterVoice, hasLightFact, stockImageOf, droppedLog } from './voice-filter';

describe('voice filter — the table\'s vocabulary never stays in a being\'s mouth (HW8 run 6)', () => {
  it('drops a sentence with our prompt words, keeps the rest', () => {
    const r = filterVoice('I am waiting for the next beat. The wood is cold under my palm. The next instruction from the quiet will come.');
    expect(r.text).toBe('The wood is cold under my palm.');
    expect(r.dropped.map((d) => d.why)).toEqual(['table vocabulary: beat', 'table vocabulary: instruction from the quiet']);
  });
  it('leaves a real table and a heartbeat alone', () => {
    expect(filterVoice('I set the pizza box on the table. My heartbeat is loud. A beat passes.').text).toBe('I set the pizza box on the table. My heartbeat is loud. A beat passes.');
  });
});

describe('voice filter — stock images (HW8 run 6)', () => {
  it('knows the shared stock images', () => {
    expect(stockImageOf('A held breath fills the hallway.')).toBe('held breath');
    expect(stockImageOf('The sound presses against my eardrums.')).toBe('eardrums');
    expect(stockImageOf('Dust motes hang in the light.')).toBe('dust motes');
    expect(stockImageOf('I stand like a statue.')).toBe('statue');
    expect(stockImageOf('A hum in my teeth, a different frequency.')).toBe('hum in the teeth');
    expect(stockImageOf('The weight of the air presses down.')).toBe('weight of the air');
    expect(stockImageOf('He knocks twice.')).toBeNull();
  });
  it('drops an image used in the last three thoughts', () => {
    const r = filterVoice('A held breath in the hall. He is still there.', { prior: ['I hold a held breath behind the door.'] });
    expect(r.text).toBe('He is still there.');
  });
  it('drops an image once it has appeared twice in the history, even when not recent', () => {
    const prior = ['One.', 'Two.', 'Three.', 'Dust motes turn in the lamp.', 'Dust motes again, always.'];
    expect(filterVoice('Dust motes. The floor creaks.', { prior }).text).toBe('The floor creaks.');
    expect(filterVoice('Dust motes. The floor creaks.', { prior: prior.slice(0, 4) }).text).toBe('Dust motes. The floor creaks.');
  });
  it('an image once is fine, twice in one go is not', () => {
    expect(filterVoice('Dust motes drift. Dust motes everywhere.').text).toBe('Dust motes drift.');
  });
});

describe('voice filter — counting and light (HW8 run 6)', () => {
  it('drops counted knocks and seconds nobody gave the being', () => {
    const r = filterVoice('Two knocks. Not three. Thirty seconds. I count them like a metronome. The wood is cold.');
    expect(r.text).toBe('The wood is cold.');
  });
  it('keeps a count the heard stretch itself made', () => {
    expect(filterVoice('Three knocks. Someone wants in.', { heard: 'Someone knocks three knocks on the door.' }).text).toBe('Three knocks. Someone wants in.');
  });
  it('drops light and dark when the room has no light fact; keeps it when it has', () => {
    expect(filterVoice('The dark is absolute. I stay still.', { hasLightFact: false }).text).toBe('I stay still.');
    expect(filterVoice('The dark is absolute. I stay still.', { hasLightFact: true }).text).toBe('The dark is absolute. I stay still.');
    expect(filterVoice('The dark is absolute.', {}).text).toBe('The dark is absolute.');
  });
  it('hasLightFact reads the facts', () => {
    expect(hasLightFact(['entry_door: closed, locked from the inside'])).toBe(false);
    expect(hasLightFact(['kitchenette.light: the overhead bulb is off'])).toBe(true);
  });
});

describe('voice filter — the replay at sentence level, on every path (HW8 run 6)', () => {
  it('drops a sentence thought verbatim in the last three, markdown and punctuation aside', () => {
    const r = filterVoice("The wood doesn't vibrate; it just is. Something shifts in the hall.", { prior: ["The wood doesn't vibrate; it just *is*."] });
    expect(r.text).toBe('Something shifts in the hall.');
  });
  it('returns an empty text when nothing is left, and logs what went', () => {
    const r = filterVoice('The wood is cold.', { prior: ['The wood is cold.'] });
    expect(r.text).toBe('');
    expect(droppedLog('Violet', 'monologue', r.dropped)).toContain('repeat of a recent thought');
    expect(droppedLog('Violet', 'monologue', [])).toBeNull();
  });
});

describe('voice filter — a count the stretch itself made is licensed in any form (HW8 run 6)', () => {
  it('"30 seconds" in the stretch licenses "Thirty seconds"', () => {
    expect(filterVoice('Thirty seconds. The wood is cold.', { heard: 'Kristopher waits in the hallway for 30 seconds.' }).text).toBe('Thirty seconds. The wood is cold.');
    expect(filterVoice('Thirty seconds. The wood is cold.', { heard: 'Kristopher waits.' }).text).toBe('The wood is cold.');
  });
  it('an act loses only the table\'s words ("knocks three times" is a doing)', () => {
    expect(filterVoice('I knock three times.', { rules: 'vocab' }).text).toBe('I knock three times.');
    expect(filterVoice('I wait for the next beat.', { rules: 'vocab' }).text).toBe('');
  });
});
