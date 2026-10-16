/** Stage briefs for WORLD / MEMORIES (2026-10-16): pure renderers. */
import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ prisma: {} }));
vi.mock('./life-budget', () => ({ lifeBudget: vi.fn() }));

import { lookLines, renderMemoriesBrief, renderWorldBrief } from './genesis-brief-context';

const designer = {
  layers: [
    { imagePath: 'a', text: 'base', kind: 'base', seed: 1, at: '' },
    { imagePath: 'b', text: 'Add a thin pale scar through the left eyebrow', kind: 'scar', seed: 1, at: '' },
    { imagePath: 'c', text: 'Clean render (approved)', kind: 'polish', seed: 1, at: '' },
  ],
  bodyLayers: [
    { imagePath: 'd', text: 'body', kind: 'base', seed: 1, at: '' },
    { imagePath: 'e', text: 'Make her build lean', kind: 'build', seed: 1, at: '' },
    { imagePath: 'f', text: 'Add a small navel ring', kind: 'piercing', seed: 1, at: '' },
  ],
} as const;

describe('lookLines', () => {
  it('keeps look layers only, marks first, with their stack index', () => {
    const l = lookLines(designer as never);
    expect(l.map(x => `${x.where}:${x.index}:${x.kind}`)).toEqual(['face:1:scar', 'body:2:piercing', 'body:1:build']);
    expect(lookLines(undefined)).toEqual([]);
  });
});

describe('renderWorldBrief', () => {
  it('shows the budget, look, places, things and people; never-grant-twice', () => {
    const t = renderWorldBrief({
      budgetLine: 'LIFE BUDGET: 25 − 0 − 0 = 25 KV left',
      wealth: ['800 USD (checking)', '28000 USD/yr — fiction author'],
      look: lookLines(designer as never),
      items: [{ name: 'Henry', archetype: 'Handmade Stuffed Animal', where: null, kv: 0 }, { name: 'Smartphone', archetype: 'Smartphone', where: 'Her flat', kv: 10 }],
      places: [{ name: 'Her flat', relation: 'home' }],
      people: [],
    });
    expect(t).toMatch(/never grant twice/);
    expect(t).toMatch(/25 KV left/);
    expect(t).toContain('CASH + INCOME ON THE SHEET: 800 USD (checking) · 28000 USD/yr — fiction author');
    expect(t).toMatch(/scar: Add a thin pale scar/);
    expect(t).toMatch(/Henry \[Handmade Stuffed Animal\] 0 KV; Smartphone @ Her flat 10 KV/);
    expect(t).toMatch(/PEOPLE: none seeded yet/);
  });
});

describe('renderMemoriesBrief', () => {
  it('lists every built thing with its source key and ticks the remembered ones', () => {
    const t = renderMemoriesBrief({
      items: [{ id: 'i1', name: 'Henry', archetype: 'Handmade Stuffed Animal', story: 'Sewn by Rosemary when she was four.', where: null, done: true }],
      marks: [{ kind: 'scar', where: 'face', index: 1, text: 'a thin pale scar', done: false }],
      places: [{ id: 'l1', name: 'Her flat', relation: 'home', done: false }],
      people: [],
    });
    expect(t).toMatch(/✓ \[genesis:item:i1\] Henry \(Handmade Stuffed Animal\) — Sewn by Rosemary/);
    expect(t).toMatch(/○ \[genesis:mark:face:1\] scar: a thin pale scar/);
    expect(t).toMatch(/○ \[genesis:place:l1\] Her flat \(home\)/);
    expect(t).toMatch(/2 still to remember/);
    expect(renderMemoriesBrief({ items: [], marks: [], places: [], people: [] })).toMatch(/finish the stage/);
  });
});

describe('normalizeSourceKey', () => {
  it('strips the brackets JEWL copies from the brief', async () => {
    const { normalizeSourceKey } = await import('./genesis-brief-context');
    expect(normalizeSourceKey('[genesis:item:x]')).toBe('genesis:item:x');
    expect(normalizeSourceKey(' genesis:mark:body:3 ')).toBe('genesis:mark:body:3');
  });
});

describe('wardrobe line (2026-10-16)', () => {
  it('an empty wardrobe is called out; a full one is listed', async () => {
    const { renderWorldBrief } = await import('./genesis-brief-context');
    const base = { budgetLine: 'b', look: [], items: [], places: [], people: [] };
    expect(renderWorldBrief({ ...base, garments: [] })).toMatch(/WARDROBE: EMPTY/);
    expect(renderWorldBrief({ ...base, garments: ['Winter Coat', 'Hoodie'] })).toContain('WARDROBE (2 garments): Winter Coat, Hoodie');
  });
});
