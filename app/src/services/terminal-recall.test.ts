import { describe, it, expect } from 'vitest';
import { scoreFact, enforceCitations } from './terminal-recall';

describe('terminal recall scoring', () => {
  const q = { text: 'how was Mr. Carrasco hurt by Danny', domains: ['restoration', 'force'], partyIds: ['danny', 'carr'], goalIds: ['g1'] };
  it('parties, goals, domains and words all count; unrelated events score zero', () => {
    const hit = scoreFact({ narration: 'Mr. Carrasco is hurt — Torso', actorId: 'danny', targetId: 'carr', domains: ['restoration'], goalIds: ['g1'] }, q);
    expect(hit.score).toBeGreaterThan(1);
    expect(hit.why).toEqual(expect.arrayContaining(['party×2', 'goal', 'domain']));
    const miss = scoreFact({ narration: 'A quiet afternoon in the library', actorId: 'x', targetId: null, domains: ['divination'], goalIds: [] }, q);
    expect(miss.score).toBe(0);
  });
});

describe('citation enforcement (no hallucination)', () => {
  it('keeps only sentences whose every citation resolves to the record', () => {
    const known = new Set(['a1', 'b2']);
    const r = enforceCitations('Danny struck first [c:a1]. Then a dragon appeared. Carrasco went down [c:b2]. Later he fled to Paris [c:zzz].', known);
    expect(r.kept).toBe('Danny struck first [c:a1]. Carrasco went down [c:b2].');
    expect(r.dropped).toBe(2);
    expect(r.citations.sort()).toEqual(['a1', 'b2']);
  });
  it('a citation placed after the full stop still belongs to its sentence', () => {
    const r = enforceCitations('Carrasco demanded the door be opened. [c:a1] He mentioned the rent. [c:b2] Then he flew away.', new Set(['a1', 'b2']));
    expect(r.kept).toBe('Carrasco demanded the door be opened [c:a1]. He mentioned the rent [c:b2].');
    expect(r.dropped).toBe(1);
  });
  it('a sentence with a bad citation among good ones is dropped whole', () => {
    expect(enforceCitations('Both happened [c:a1][c:nope].', new Set(['a1'])).kept).toBe('');
  });
});
