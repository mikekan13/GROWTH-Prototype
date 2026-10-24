import { describe, it, expect } from 'vitest';
import { stripSpeechQuotes } from './speech-quotes';
import { parseSpiritOutput } from './prompts/roles/spirit';
import { createSpeechGate } from './listening';

describe('stripSpeechQuotes (HW3 2026-10-24: the feed paints speech; the marks are not hers)', () => {
  it('takes one wrapping pair off', () => {
    expect(stripSpeechQuotes('"It\'s still warm."')).toBe("It's still warm.");
    expect(stripSpeechQuotes('“It’s still warm.”')).toBe('It’s still warm.');
    expect(stripSpeechQuotes('  "Go away."  ')).toBe('Go away.');
  });

  it('leaves a line that quotes inside itself alone', () => {
    expect(stripSpeechQuotes('"Yes," she said, "now."')).toBe('"Yes," she said, "now."');
    expect(stripSpeechQuotes('He said "no" and left.')).toBe('He said "no" and left.');
  });

  it('drops a lone opening quote the model never closed', () => {
    expect(stripSpeechQuotes('"I think that\'s what I was waiting for')).toBe("I think that's what I was waiting for");
  });

  it('leaves plain words and the empty line as they are', () => {
    expect(stripSpeechQuotes('Just pay the pizza.')).toBe('Just pay the pizza.');
    expect(stripSpeechQuotes('')).toBe('');
    expect(stripSpeechQuotes('"')).toBe('"');
  });

  it('is applied by the Say: parser and by the streamed gate', () => {
    const a = parseSpiritOutput('A breath.\nSay: "It\'s still warm."');
    expect(a.kind).toBe('speak');
    if (a.kind === 'speak') expect(a.content).toBe("It's still warm.");

    const gate = createSpeechGate(() => {});
    gate.push('Say: "It\'s still');
    gate.push(' warm."');
    const out = gate.end();
    expect(out.kind).toBe('speak');
    expect(out.content).toBe("It's still warm.");
  });
});
