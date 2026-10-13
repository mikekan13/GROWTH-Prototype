import { describe, it, expect } from 'vitest';
import {
  CORPUS_GROUPS,
  CORPUS_LANDSCAPE,
  CORPUS_PORTRAIT,
  CORPUS_SQUARE,
  buildCorpusContentPrompt,
  buildCorpusPrompts,
  corpusSeed,
} from './corpus-prompts';

const STYLE_WORDS = /painted|illustration|brush|ink|matte|concept art|anime|style/i;

describe('buildCorpusPrompts', () => {
  const list = buildCorpusPrompts();
  const count = (g: string) => list.filter(p => p.group === g).length;

  it('~120+ prompts with the planned count per group', () => {
    expect(count('people')).toBe(48);
    expect(count('beings')).toBe(24);
    expect(count('creatures')).toBe(12);
    expect(count('items')).toBe(20);
    expect(count('scenes')).toBe(20);
    expect(count('groups')).toBe(6);
    expect(list.length).toBeGreaterThanOrEqual(120);
    expect(new Set(list.map(p => p.group))).toEqual(new Set(CORPUS_GROUPS));
  });

  it('ids are unique', () => {
    expect(new Set(list.map(p => p.id)).size).toBe(list.length);
  });

  it('no art-medium / style words in any prompt (nor in the content suffix)', () => {
    for (const p of list) expect(p.prompt, p.id).not.toMatch(STYLE_WORDS);
    expect(buildCorpusContentPrompt('A lamp.')).not.toMatch(STYLE_WORDS);
  });

  it('every prompt writes its lighting ("lit by …")', () => {
    for (const p of list) expect(p.prompt, p.id).toMatch(/\blit\b/);
  });

  it('sizes: figures portrait, items square, scenes/groups/creatures landscape; all /16', () => {
    const size = (p: { width: number; height: number }) => ({ width: p.width, height: p.height });
    for (const p of list) {
      expect(p.width % 16, p.id).toBe(0);
      expect(p.height % 16, p.id).toBe(0);
      if (p.group === 'people' || p.group === 'beings') expect(size(p)).toEqual(CORPUS_PORTRAIT);
      else if (p.group === 'items') expect(size(p)).toEqual(CORPUS_SQUARE);
      else expect(size(p)).toEqual(CORPUS_LANDSCAPE);
    }
  });

  it('covers every genre and a spread of shots', () => {
    expect(new Set(list.map(p => p.genre)).size).toBe(8);
    const figures = list.filter(p => p.group === 'people' || p.group === 'beings').map(p => p.prompt);
    for (const shot of [/Head-and-shoulders/, /Half-length/, /Full-length view/, /Back view/, /profile/, /Three-quarter/, /Low-angle/, /High-angle/, /running/, /swinging/, /casting/, /seated/, /lying/]) {
      expect(figures.some(t => shot.test(t)), String(shot)).toBe(true);
    }
  });

  it('deterministic: same list and seeds on a rebuild; seed = hash of id', () => {
    const again = buildCorpusPrompts();
    expect(again).toEqual(list);
    for (const p of list) {
      expect(p.seed).toBe(corpusSeed(p.id));
      expect(p.seed).toBeGreaterThanOrEqual(0);
      expect(p.seed).toBeLessThan(2 ** 31);
    }
    expect(new Set(list.map(p => p.seed)).size).toBe(list.length);
  });
});

describe('buildCorpusContentPrompt', () => {
  it('appends only the neutral clarity line', () => {
    expect(buildCorpusContentPrompt('A lamp on a table')).toBe('A lamp on a table. Sharp, well-lit, clear subject.');
    expect(buildCorpusContentPrompt('A lamp.')).toBe('A lamp. Sharp, well-lit, clear subject.');
  });
});
