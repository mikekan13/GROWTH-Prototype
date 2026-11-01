import { describe, it, expect } from 'vitest';
import { stripEchoedStamps } from './reply-hygiene';

describe('stripEchoedStamps', () => {
  it('leaves a clean reply alone', () => {
    expect(stripEchoedStamps('She nods.')).toBe('She nods.');
  });
  it('removes one leading stamp', () => {
    expect(stripEchoedStamps('[2026-11-01T02:33:42.992Z]: She nods.')).toBe('She nods.');
  });
  it('removes stacked stamps, even after a leading newline', () => {
    expect(stripEchoedStamps('\n[2026-11-01T02:33:42.992Z]: [2026-11-01T02:22:10.000Z]: She nods.')).toBe('She nods.');
  });
  it('keeps a stamp in the middle of a sentence', () => {
    const s = 'At [2026-11-01T02:22:10.000Z]: she left.';
    expect(stripEchoedStamps(s)).toBe(s);
  });
});
