/** BORN ≠ DONE (Mike 2026-10-12): completion = genesis born AND an official portrait. */
import { describe, it, expect, vi } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NotFoundError } from '@/lib/errors';

const db = vi.hoisted(() => ({
  chars: [] as Array<Record<string, unknown>>,
  sessions: [] as Array<{ goal: string; status: string }>,
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    character: {
      findMany: vi.fn(async () => db.chars),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => db.chars.find(c => c.id === where.id) ?? null),
    },
    dayaWorkSession: {
      findMany: vi.fn(async ({ where, take }: {
        where: { goal: { contains?: string; startsWith?: string }; OR?: Array<{ goal: { contains: string } }> };
        take?: number;
      }) => {
        let rows = db.sessions;
        if (where.goal.startsWith) rows = rows.filter(s => s.goal.startsWith(where.goal.startsWith!));
        if (where.goal.contains) rows = rows.filter(s => s.goal.includes(where.goal.contains!));
        if (where.OR) rows = rows.filter(s => where.OR!.some(o => s.goal.includes(o.goal.contains)));
        return take ? rows.slice(0, take) : rows;
      }),
    },
  },
}));

const {
  deriveCharacterCompletion, deriveImageCompletion, isAwaitingImage, bornCharacterIds,
  officialBustPath, getCampaignCompletions, getCharacterCompletion,
} = await import('./character-completion');
const { AwaitingImageBadge } = await import('@/components/character/AwaitingImageBadge');

const goal = (name: string, id: string) => `Character genesis: ${name} [${id}] — gestate the person from their genome, then translate.`;
const bustData = JSON.stringify({ identity: { generatedBust: 'portraits/v/bust.png' } });

describe('deriveCharacterCompletion', () => {
  it('not born → genesis pending, never done (even with a portrait)', () => {
    const c = deriveCharacterCompletion({ genesisBorn: false, portrait: '/p.png', data: null, personaLocked: false });
    expect(c).toEqual({ genesis: 'pending', image: 'done', done: false });
    expect(isAwaitingImage(c)).toBe(false);
  });

  it('born + no image → awaiting image', () => {
    const c = deriveCharacterCompletion({ genesisBorn: true, portrait: null, data: '{}', personaLocked: false });
    expect(c).toEqual({ genesis: 'born', image: 'pending', done: false });
    expect(isAwaitingImage(c)).toBe(true);
  });

  it('born + persona locked but no official portrait → locked, still awaiting', () => {
    const c = deriveCharacterCompletion({ genesisBorn: true, portrait: null, data: null, personaLocked: true });
    expect(c.image).toBe('locked');
    expect(isAwaitingImage(c)).toBe(true);
  });

  it('born + official bust (sheet identity.generatedBust) → done', () => {
    const c = deriveCharacterCompletion({ genesisBorn: true, portrait: null, data: bustData, personaLocked: true });
    expect(c).toEqual({ genesis: 'born', image: 'done', done: true });
    expect(isAwaitingImage(c)).toBe(false);
  });

  it('born + accepted portrait (Character.portrait) → done', () => {
    expect(deriveImageCompletion({ portrait: 'portraits/v/g1.png', data: null, personaLocked: false })).toBe('done');
  });

  it('official bust read from string or parsed data; junk is no bust', () => {
    expect(officialBustPath(bustData)).toBe('portraits/v/bust.png');
    expect(officialBustPath({ identity: { generatedBust: 'x.png' } })).toBe('x.png');
    expect(officialBustPath('not json')).toBeNull();
    expect(officialBustPath({ identity: { generatedBust: '  ' } })).toBeNull();
  });
});

describe('bornCharacterIds', () => {
  it('latest genesis session per character decides (newest first)', () => {
    const born = bornCharacterIds([
      { goal: goal('Violet', 'v1'), status: 'active' },  // rerun in flight
      { goal: goal('Violet', 'v1'), status: 'done' },    // older run
      { goal: goal('Kai', 'k1'), status: 'done' },
      { goal: 'Tidy the tavern', status: 'done' },
    ]);
    expect([...born]).toEqual(['k1']);
  });
});

describe('getCampaignCompletions / getCharacterCompletion', () => {
  it('maps every character; sketches count as born', async () => {
    db.chars = [
      { id: 'v1', name: 'Violet', portrait: null, data: '{}', genesisTier: null, personaLock: null, campaignId: 'c1' },
      { id: 'k1', name: 'Kai', portrait: null, data: bustData, genesisTier: null, personaLock: { id: 'pl' }, campaignId: 'c1' },
      { id: 's1', name: 'Barkeep', portrait: null, data: '{}', genesisTier: 'SKETCH', personaLock: null, campaignId: 'c1' },
      { id: 'h1', name: 'Hand-built', portrait: null, data: '{}', genesisTier: null, personaLock: null, campaignId: 'c1' },
    ];
    db.sessions = [{ goal: goal('Violet', 'v1'), status: 'done' }, { goal: goal('Kai', 'k1'), status: 'done' }];
    const m = await getCampaignCompletions('c1');
    expect(isAwaitingImage(m.get('v1'))).toBe(true);
    expect(m.get('k1')?.done).toBe(true);
    expect(isAwaitingImage(m.get('s1'))).toBe(true);
    expect(m.get('h1')?.genesis).toBe('pending');
    expect(isAwaitingImage(m.get('h1'))).toBe(false);

    expect(await getCharacterCompletion('v1')).toEqual({ genesis: 'born', image: 'pending', done: false });
    await expect(getCharacterCompletion('nope')).rejects.toBeInstanceOf(NotFoundError);
  });

  it('pre-loaded rows: no Character query; sessions scoped to those characters only', async () => {
    const { prisma } = await import('@/lib/db');
    const findMany = prisma.character.findMany as unknown as ReturnType<typeof vi.fn>;
    const sessionsFindMany = prisma.dayaWorkSession.findMany as unknown as ReturnType<typeof vi.fn>;
    findMany.mockClear(); sessionsFindMany.mockClear();

    const rows = [
      { id: 'v1', name: 'Violet', portrait: null, data: '{}', genesisTier: null, personaLock: null },
      { id: 'h1', name: 'Hand-built', portrait: null, data: '{}', genesisTier: null, personaLock: null },
    ];
    db.sessions = [
      { goal: goal('Ghost', 'deleted1'), status: 'done' },   // character no longer exists
      { goal: goal('Violet', 'v1'), status: 'done' },
    ];
    const m = await getCampaignCompletions('c1', { characters: rows });

    expect(findMany).not.toHaveBeenCalled();
    expect(sessionsFindMany).toHaveBeenCalledTimes(1);
    const arg = sessionsFindMany.mock.calls[0][0] as { where: { OR: unknown[] }; take: number; select: unknown };
    expect(arg.where.OR).toEqual([{ goal: { contains: '[v1]' } }, { goal: { contains: '[h1]' } }]);
    expect(arg.take).toBeGreaterThanOrEqual(rows.length);
    expect(arg.select).toEqual({ goal: true, status: true });

    expect([...m.keys()]).toEqual(['v1', 'h1']);
    expect(m.get('v1')?.genesis).toBe('born');
    expect(m.get('h1')?.genesis).toBe('pending');
    expect(m.has('deleted1')).toBe(false);
  });

  it('empty campaign: no sessions query at all', async () => {
    const { prisma } = await import('@/lib/db');
    const sessionsFindMany = prisma.dayaWorkSession.findMany as unknown as ReturnType<typeof vi.fn>;
    sessionsFindMany.mockClear();
    db.chars = [];
    expect((await getCampaignCompletions('c1')).size).toBe(0);
    expect(sessionsFindMany).not.toHaveBeenCalled();
  });
});

describe('AwaitingImageBadge', () => {
  it('renders the black-bar mark only while awaiting', () => {
    expect(renderToStaticMarkup(createElement(AwaitingImageBadge, { awaiting: true }))).toContain('AWAITING IMAGE');
    expect(renderToStaticMarkup(createElement(AwaitingImageBadge, { awaiting: true }))).toContain('data-awaiting-image');
    expect(renderToStaticMarkup(createElement(AwaitingImageBadge, { awaiting: false }))).toBe('');
  });
});
