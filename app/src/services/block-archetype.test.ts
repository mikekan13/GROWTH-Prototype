/** Blocks are campaign-agnostic archetypes (Mike 2026-10-12). Pure checks. */
import { describe, it, expect } from 'vitest';
import {
  buildBannedTerms,
  checkArchetype,
  archetypeRejection,
  extractSeedProperNouns,
  isArchetypeType,
  rejectedShapes,
  ARCHETYPE_REJECTED_PREFIX,
  DRAFTS_WITHDRAWN_PREFIX,
  ARCHETYPE_LAW,
} from './block-archetype';

const SEED = [
  'Violet grew up in a narrow house on Halloran Street. Her Grandmother raised her after the accident.',
  'Grief came early. Rosemary Marsh taught her to write, and Rosemary kept the Key on a string around her neck.',
  'After the Key went missing, the house fell quiet. Growing up, she wrote every night.',
].join('\n');

describe('extractSeedProperNouns', () => {
  const nouns = extractSeedProperNouns(SEED);
  it('finds people, places and named objects', () => {
    expect(nouns).toEqual(expect.arrayContaining(['Rosemary', 'Rosemary Marsh', 'Halloran', 'Halloran Street', 'Key']));
  });
  it('the generic head word of a multi-word name is not banned alone ("Street Urchin" stays legal)', () => {
    expect(nouns).not.toContain('Street');
    const banned = buildBannedTerms({ seedText: SEED });
    expect(checkArchetype('Street Urchin', { description: 'A childhood on the streets.' }, banned)).toEqual([]);
  });
  it('ignores sentence-initial common words and kinship/role nouns', () => {
    for (const w of ['Grief', 'Growing', 'After', 'Her', 'Grandmother']) expect(nouns).not.toContain(w);
  });
  it('a sentence-initial one-off counts when it matches a DB name', () => {
    expect(extractSeedProperNouns('Thornbury burned that winter.')).not.toContain('Thornbury');
    expect(extractSeedProperNouns('Thornbury burned that winter.', ['Thornbury Village'])).toContain('Thornbury');
  });
});

describe('checkArchetype', () => {
  const banned = buildBannedTerms({ seedText: SEED, bearerName: 'Violet Almswood', dbNames: ['The Gilded Cup'] });

  it('"Raised by Rosemary" is rejected with the token named', () => {
    const hits = checkArchetype('Raised by Rosemary', { description: 'A childhood in a loving home.' }, banned);
    expect(hits.map(h => h.token)).toContain('Rosemary');
    const msg = archetypeRejection('Raised by Rosemary', hits);
    expect(msg).toContain('"Rosemary" (in name)');
    expect(msg).toContain('attachmentStory');
  });

  it('"Raised by Grandmother" / "Raised by an Elder" pass', () => {
    expect(checkArchetype('Raised by Grandmother', { description: 'Raised by a grandparent who taught patience and letters.' }, banned)).toEqual([]);
    expect(checkArchetype('Raised by an Elder', { description: 'An elder raised this character.' }, banned)).toEqual([]);
  });

  it('rule text naming the bearer is rejected', () => {
    const hits = checkArchetype('Sealed Memory', {
      description: 'A memory the bearer cannot reach.',
      effects: [{ kind: 'triggered', name: 'Flinch', trigger: 'When Violet hears a lock turn' }],
    }, banned);
    expect(hits).toEqual([{ token: 'Violet', fields: ['effects[0].trigger'] }]);
  });

  it('a named object ("the Key") is rejected; the common noun "a key" is not', () => {
    expect(checkArchetype('After the Key', { description: 'x' }, banned).map(h => h.token)).toEqual(['Key']);
    expect(checkArchetype('Keeper of Doors', { description: 'Carries a key to every room.' }, banned)).toEqual([]);
  });

  it('DB phrases match case-insensitively; notes are never scanned', () => {
    expect(checkArchetype('Barmaid', { description: 'Years serving at the gilded cup.' }, banned).map(h => h.token)).toEqual(['Gilded Cup']);
    expect(checkArchetype('Barmaid', { description: 'Years serving drinks.', _proposalNote: 'Violet at the Gilded Cup' }, banned)).toEqual([]);
  });

  it('first/second person about the bearer is rejected', () => {
    expect(checkArchetype('Night Writer', { description: 'You write every night.' }, banned)[0].token).toMatch(/first\/second person/);
  });

  it('covers items (NARRATIVE PAINT) and every Forge type', () => {
    for (const t of ['seed', 'root', 'branch', 'skill', 'item', 'nectar', 'blossom', 'thorn']) expect(isArchetypeType(t)).toBe(true);
    expect(isArchetypeType('location')).toBe(false);
  });
});

describe('rejectedShapes + the law text', () => {
  it('collects validator rejections and GM-withdrawn names from progress notes', () => {
    const notes = [
      'cycle 3: drafted root',
      `${ARCHETYPE_REJECTED_PREFIX} root "Raised by Rosemary" — generalise Rosemary`,
      `${DRAFTS_WITHDRAWN_PREFIX} — branch "After the Key", branch "The Holding Years"`,
      `${DRAFTS_WITHDRAWN_PREFIX} — (no pending drafts)`,
    ];
    expect(rejectedShapes(notes)).toEqual([
      'root "Raised by Rosemary" — generalise Rosemary',
      'withdrawn by the GM: branch "After the Key", branch "The Holding Years"',
    ]);
  });
  it('the law carries good/bad pairs and the August rejections', () => {
    expect(ARCHETYPE_LAW).toContain('BAD "Raised by Rosemary" → GOOD "Raised by Grandmother"');
    expect(ARCHETYPE_LAW).toContain('The Holding Pattern');
    expect(ARCHETYPE_LAW).toContain('Silver Butter Knife');
  });
});
