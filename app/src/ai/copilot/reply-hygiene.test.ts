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
  it('removes a leading [System: …] history marker line, keeping the rest', () => {
    const m = '[System: A new session has begun. The campaign log below was compressed and summarized. The last user message is the current turn.]';
    expect(stripEchoedStamps(`${m}\nShe nods.`)).toBe('She nods.');
  });
  it('removes stamps and System lines in any order', () => {
    const m = '[System: A new session has begun.]';
    expect(stripEchoedStamps(`[2026-11-01T02:33:42.992Z]: ${m}\n${m}\n[2026-11-01T02:22:10.000Z]: She nods.`)).toBe('She nods.');
  });
  it('keeps a [System: …] mention that is not a leading line', () => {
    const s = 'She reads [System: x] aloud.';
    expect(stripEchoedStamps(s)).toBe(s);
  });
  it('keeps a stamp in the middle of a sentence', () => {
    const s = 'At [2026-11-01T02:22:10.000Z]: she left.';
    expect(stripEchoedStamps(s)).toBe(s);
  });
});
