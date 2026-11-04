import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('server-only', () => ({}));
const findUnique = vi.fn();
vi.mock('@/lib/db', () => ({ prisma: { character: { findUnique: (...a: unknown[]) => findUnique(...a) } } }));
import { firstSentence, traitLinesFrom, traitLinesOf } from './traits-lane';

describe('firstSentence', () => {
  it('takes the first sentence and collapses whitespace', () => {
    expect(firstSentence('Looks   fifteen\n years younger.  Never ages.')).toBe('Looks fifteen years younger.');
  });
  it('truncates with an ellipsis at max', () => {
    const s = firstSentence('a'.repeat(50), 10);
    expect(s).toBe('a'.repeat(9) + '…');
    expect(s.length).toBe(10);
  });
});

describe('traitLinesFrom', () => {
  it('formats nectar, thorn, blossom in order and skips unknown types', () => {
    const lines = traitLinesFrom([
      { type: 'nectar', name: 'Ageless Face', pillar: 'body', description: 'Looks younger. More text.' },
      { type: 'thorn', name: 'Fear of Doors', description: 'Cannot open them' },
      { type: 'Blossom', name: 'Glow', pillar: 'soul' },
      { type: 'curse', name: 'Nope' },
    ]);
    expect(lines.map((l) => l.line)).toEqual([
      'NECTAR Ageless Face (body): Looks younger.',
      'THORN Fear of Doors: Cannot open them',
      'BLOSSOM Glow (soul)',
    ]);
    expect(lines.map((l) => l.kind)).toEqual(['nectar', 'thorn', 'blossom']);
  });
  it('returns [] for non-arrays and skips nameless entries', () => {
    expect(traitLinesFrom(null)).toEqual([]);
    expect(traitLinesFrom({})).toEqual([]);
    expect(traitLinesFrom([{ type: 'nectar' }, { type: 'nectar', name: '  ' }])).toEqual([]);
  });
});

describe('traitLinesOf', () => {
  beforeEach(() => findUnique.mockReset());
  it('returns the lines from the character data', async () => {
    findUnique.mockResolvedValue({ data: JSON.stringify({ traits: [{ type: 'nectar', name: 'X', pillar: 'body', description: 'Does it.' }] }) });
    expect(await traitLinesOf('c1')).toEqual(['NECTAR X (body): Does it.']);
  });
  it('returns [] for a missing character', async () => {
    findUnique.mockResolvedValue(null);
    expect(await traitLinesOf('c1')).toEqual([]);
  });
  it('returns [] for unparseable data', async () => {
    findUnique.mockResolvedValue({ data: '{nope' });
    expect(await traitLinesOf('c1')).toEqual([]);
  });
});
