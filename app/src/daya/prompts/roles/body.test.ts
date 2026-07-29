import { describe, it, expect } from 'vitest';
import { outcomeBandFor, parseBodyOutwardResponse, buildBodyOutwardPrompt } from './body';

describe('outcomeBandFor', () => {
  it('success with wide margin -> cleanly', () => {
    expect(outcomeBandFor(true, 6)).toBe('cleanly');
  });
  it('success with narrow margin -> barely', () => {
    expect(outcomeBandFor(true, 1)).toBe('barely');
  });
  it('failure with narrow negative margin -> not-quite', () => {
    expect(outcomeBandFor(false, -1)).toBe('not-quite');
  });
  it('failure with wide negative margin -> badly', () => {
    expect(outcomeBandFor(false, -6)).toBe('badly');
  });
});

describe('parseBodyOutwardResponse', () => {
  it('parses a well-formed JSON response', () => {
    const raw = JSON.stringify({ intent: 'reach for the mug', subjectKeys: ['kitchen.counter.mug'], effortContext: 'casual' });
    const parsed = parseBodyOutwardResponse(raw);
    expect(parsed).not.toBeNull();
    expect(parsed?.intent).toBe('reach for the mug');
    expect(parsed?.subjectKeys).toEqual(['kitchen.counter.mug']);
    expect(parsed?.effortContext).toBe('casual');
  });

  it('strips a markdown code fence', () => {
    const raw = '```json\n' + JSON.stringify({ intent: 'open the window', subjectKeys: [], effortContext: 'deliberate' }) + '\n```';
    const parsed = parseBodyOutwardResponse(raw);
    expect(parsed?.intent).toBe('open the window');
    expect(parsed?.effortContext).toBe('deliberate');
  });

  it('defaults effortContext to casual on an invalid value', () => {
    const raw = JSON.stringify({ intent: 'push the door', subjectKeys: [], effortContext: 'heroic' });
    const parsed = parseBodyOutwardResponse(raw);
    expect(parsed?.effortContext).toBe('casual');
  });

  it('returns null on unparseable JSON', () => {
    expect(parseBodyOutwardResponse('not json at all')).toBeNull();
  });

  it('returns null when intent is missing', () => {
    expect(parseBodyOutwardResponse(JSON.stringify({ subjectKeys: [] }))).toBeNull();
  });
});

describe('buildBodyOutwardPrompt', () => {
  it('includes the intent and facts block', () => {
    const prompt = buildBodyOutwardPrompt({ intent: 'grab the mug', facts: [{ subjectKey: 'kitchen.counter.mug', fact: 'A mug sits on the counter.' }] });
    expect(prompt).toContain('grab the mug');
    expect(prompt).toContain('kitchen.counter.mug');
  });
});
