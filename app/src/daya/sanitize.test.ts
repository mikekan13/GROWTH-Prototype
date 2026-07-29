import { describe, it, expect } from 'vitest';
import { classifyTraffic, stripAndForward, assertClean } from './sanitize';

describe('classifyTraffic (code-first sensitivity heuristics)', () => {
  it('flags known identifiers as sensitive', () => {
    const result = classifyTraffic({ content: 'Violet walked into the kitchen.', knownIdentifiers: ['Violet'] });
    expect(result.sensitivity).toBe('sensitive');
    expect(result.rationaleTag).toBe('names-present');
  });

  it('flags memory-ledger verbatim content as sensitive regardless of wording', () => {
    const result = classifyTraffic({ content: 'The stew smelled like home.', isMemoryVerbatim: true });
    expect(result.sensitivity).toBe('sensitive');
    expect(result.rationaleTag).toBe('memory-verbatim');
  });

  it('flags intimate/trauma/relationship context as sensitive', () => {
    const result = classifyTraffic({ content: 'How do I process the grief of losing a loved one?' });
    expect(result.sensitivity).toBe('sensitive');
  });

  it('flags session/meta context as sensitive', () => {
    const result = classifyTraffic({ content: 'The GM intervention changed the scene out of character.' });
    expect(result.sensitivity).toBe('sensitive');
  });

  it('classifies a pure abstract domain question as safe', () => {
    const result = classifyTraffic({ content: 'How long does a sprained wrist typically limit grip strength?' });
    expect(result.sensitivity).toBe('safe');
    expect(result.rationaleTag).toBe('abstract-domain-question');
  });

  it('fails local to sensitive when the heuristics are inconclusive', () => {
    const result = classifyTraffic({ content: 'the door creaked' });
    expect(result.sensitivity).toBe('sensitive');
    expect(result.rationaleTag).toBe('inconclusive-fail-local');
  });
});

describe('stripAndForward', () => {
  it('replaces every known identifier with a role token', () => {
    const { text, roleMap } = stripAndForward('Violet asked Kai about the mug.', ['Violet', 'Kai']);
    expect(text).not.toContain('Violet');
    expect(text).not.toContain('Kai');
    expect(Object.keys(roleMap)).toEqual(expect.arrayContaining(['Violet', 'Kai']));
  });

  it('does not let a short name clobber a longer overlapping one', () => {
    const { text } = stripAndForward('Val spoke with Valentina in the hall.', ['Val', 'Valentina']);
    expect(text).not.toMatch(/\bValentina\b/);
    expect(text).not.toMatch(/\bVal\b/);
  });

  it('strips narrativeCycle and session markers', () => {
    const { text } = stripAndForward('At cycle 42.5 during session 7 the door opened.', []);
    expect(text).not.toMatch(/cycle\s*42\.5/i);
    expect(text).not.toMatch(/session\s*7/i);
    expect(text).toContain('CYCLE_REF');
    expect(text).toContain('SESSION_REF');
  });

  it('strips __DAYA-prefixed internal strings', () => {
    const { text } = stripAndForward('reference __DAYA_TEST_WP7__ campaign', []);
    expect(text).not.toContain('__DAYA_TEST_WP7__');
  });
});

describe('assertClean (hard-fail sweep)', () => {
  it('reports clean text as clean', () => {
    const result = assertClean('PERSON_A asked about grip strength.', ['Violet']);
    expect(result.clean).toBe(true);
    expect(result.hits).toEqual([]);
  });

  it('hard-fails when a forbidden identifier survived stripping', () => {
    const result = assertClean('Violet asked about the wound.', ['Violet']);
    expect(result.clean).toBe(false);
    expect(result.hits).toContain('Violet');
  });

  it('hard-fails on any surviving __DAYA-prefixed string even with no identifier match', () => {
    const result = assertClean('leaked reference: __DAYA_INTERNAL_KEY__', []);
    expect(result.clean).toBe(false);
    expect(result.hits).toContain('__DAYA-prefixed-string');
  });
});
