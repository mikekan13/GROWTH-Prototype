/** Sheet sync + link dedupe (2026-10-12): Violet's duplicate root, empty creation view. */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ prisma: {} }));

import { applyLinksToSheet, applySeedToSheet, archetypeKey, pickDuplicateLinks, type LinkWithBlock } from './genesis-sheet-sync';
import { createDefaultCharacter } from '@/lib/defaults';

let n = 0;
function link(type: string, name: string, opts: { status?: string; at?: string; data?: Record<string, unknown>; id?: string } = {}): LinkWithBlock {
  n += 1;
  return {
    id: opts.id ?? `l${n}`,
    forgeItemId: `f${n}`,
    localName: null,
    story: 's',
    ageAdded: null,
    createdAt: new Date(opts.at ?? `2026-10-12T12:3${n % 10}:00Z`),
    block: { id: `f${n}`, type, name, status: opts.status ?? 'published', data: JSON.stringify(opts.data ?? {}) },
  };
}

describe('dedupeBlockLinks — one live link per archetype', () => {
  it('drops the withdrawn "[w:y0d7]" twin of Violet\'s root and keeps the live one', () => {
    const dup = link('root', 'Grandparent Household [w:y0d7]', { status: 'superseded', at: '2026-10-12T12:34:53Z', id: 'dup' });
    const live = link('root', 'Grandparent Household', { at: '2026-10-12T12:35:11Z', id: 'live' });
    const other = link('branch', 'Violated Trust', { id: 'branch' });
    expect(archetypeKey('root', 'Grandparent Household [w:y0d7]')).toBe(archetypeKey('root', 'Grandparent Household'));
    expect(pickDuplicateLinks([dup, live, other])).toEqual(['dup']);
  });

  it('between two live twins keeps the newest', () => {
    const older = link('branch', 'Years of Solitary Craft', { at: '2026-10-01T00:00:00Z', id: 'old' });
    const newer = link('branch', 'Years of Solitary Craft', { at: '2026-10-12T00:00:00Z', id: 'new' });
    expect(pickDuplicateLinks([older, newer])).toEqual(['old']);
  });

  it('same name across types is not a duplicate', () => {
    expect(pickDuplicateLinks([link('nectar', 'Ambitious'), link('thorn', 'Ambitious')])).toEqual([]);
  });
});

describe('applyLinksToSheet — legacy readers stop showing "Unknown"', () => {
  it('writes seed / root / branches / traits from the links', () => {
    const sheet = createDefaultCharacter('Violet');
    const next = applyLinksToSheet(sheet, [
      link('seed', 'Human', { data: { description: 'Humans', baseFateDie: 'd8', fatedAge: 80 } }),
      link('root', 'Grandparent Household', { data: { description: 'Raised by a grandparent', ageAdded: 18 } }),
      link('branch', 'Violated Trust', { data: { description: 'A trust broken' } }),
      link('branch', 'Years of Solitary Craft', { data: { description: 'Alone with the work' } }),
      link('thorn', 'Sealed Threshold', { data: { description: 'Shut doors', pillar: 'soul' } }),
    ]);
    expect(next.creation.seed.name).toBe('Human');
    expect(next.creation.root?.name).toBe('Grandparent Household');
    expect(next.creation.branches?.map(b => b.name)).toEqual(['Violated Trust', 'Years of Solitary Craft']);
    expect(next.traits).toEqual([expect.objectContaining({ name: 'Sealed Threshold', type: 'thorn', pillar: 'soul', source: 'Genesis' })]);
    expect(next.fatedAge).toBe(80);
  });

  it('never duplicates a trait the sheet already carries', () => {
    const sheet = createDefaultCharacter('Violet');
    sheet.traits = [{ name: 'Sealed Threshold', type: 'thorn', category: 'utility', description: 'x' }];
    const next = applyLinksToSheet(sheet, [link('thorn', 'Sealed Threshold')]);
    expect(next.traits).toHaveLength(1);
  });
});

describe('applySeedToSheet — the seed Fate Die and Frequency win (Violet: d6 vs d8, Frequency 1/1 vs 40)', () => {
  it('corrects both and says so', () => {
    const sheet = createDefaultCharacter('Violet'); // d6, frequency 1/1
    const { sheet: next, corrections } = applySeedToSheet(sheet, { baseFateDie: 'd8', frequency: 40 });
    expect(next.creation.seed.baseFateDie).toBe('d8');
    expect(next.attributes.frequency).toMatchObject({ level: 40, current: 40 });
    expect(corrections).toEqual(['fate die d6 → d8 (seed)', 'frequency 1/1 → 40/40 (seed)']);
  });
  it('a pool already spent keeps what is left; agreement changes nothing', () => {
    const sheet = createDefaultCharacter('X');
    sheet.attributes.frequency = { level: 50, current: 30 };
    expect(applySeedToSheet(sheet, { frequency: 40 }).sheet.attributes.frequency).toMatchObject({ level: 40, current: 30 });
    sheet.creation.seed.baseFateDie = 'd8';
    sheet.attributes.frequency = { level: 40, current: 12 };
    expect(applySeedToSheet(sheet, { baseFateDie: 'd8', frequency: 40 }).corrections).toEqual([]);
  });
});

describe('a born character gets a real body from her seed (2026-10-16)', () => {
  it('the Human seed gives the full baseline — fingers and toes included; an existing body is kept', async () => {
    const { applySeedToSheet } = await import('./genesis-sheet-sync');
    const bare = { attributes: {}, creation: { seed: { baseFateDie: 'd8' } } } as never;
    const r = applySeedToSheet(bare, { baseFateDie: 'd8', bodyStructure: { parts: ['HEAD', 'TORSO'], vitals: [] } }, 'Human');
    const names: string[] = [];
    const walk = (n: { partName?: string; contains?: unknown[] }) => { if (n.partName) names.push(n.partName); (n.contains ?? []).forEach(c => walk(c as typeof n)); };
    walk(r.sheet.bodyAnatomy as never);
    expect(names).toContain('Left Little Finger');
    expect(names).toContain('Right Big Toe');
    expect(r.corrections).toContain('body spawned from seed "Human"');
    const kept = applySeedToSheet({ ...r.sheet } as never, {}, 'Human');
    expect(kept.corrections).not.toContain('body spawned from seed "Human"');
  });
});
