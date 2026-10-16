/** DRESS (Mike 2026-10-16): choosing from HER OWN things only — nothing invented, nothing granted. prisma + JEWL mocked. */
import { describe, it, expect, vi, beforeEach } from 'vitest';

type Item = { id: string; name: string; type: string; data: Record<string, unknown>; holderId: string | null; locationId: string | null; sourceForgeItemId: string | null; status: string; campaignId: string };

const h = vi.hoisted(() => ({
  items: [] as Item[],
  deeds: [] as string[],
  placed: [] as string[],
  answer: '',
  calls: 0,
  fail: false,
}));

const CH = { id: 'ch1', name: 'Violet Okafor', userId: 'u_violet', campaignId: 'c1', campaign: { gmUserId: 'u_gm' }, data: JSON.stringify({ identity: { sex: 'female', designer: { layers: [{ imagePath: '/portraits/ch1/faces/b.png', text: 'Locked', kind: 'base' }] } }, wealth: { holdings: [{ amount: 300, code: 'USD', where: 'checking' }] } }) };

vi.mock('@/lib/db', () => ({
  prisma: {
    character: { findUnique: vi.fn(async () => CH) },
    entityRelationship: {
      findMany: vi.fn(async ({ where }: { where: { relationshipType?: string | { in: string[] }; targetType?: string } }) => {
        if (where.relationshipType === 'owns') return h.deeds.map(id => ({ targetId: id }));
        if (where.targetType === 'LOCATION') return [{ targetId: 'loc_home', relationshipType: 'home' }];
        return [];
      }),
      findFirst: vi.fn(async ({ where }: { where: { targetId: string } }) => (h.deeds.includes(where.targetId) ? { id: 'deed' } : null)),
      deleteMany: vi.fn(async ({ where }: { where: { sourceId: string } }) => { h.placed = h.placed.filter(p => p !== where.sourceId); return { count: 1 }; }),
      create: vi.fn(async ({ data }: { data: { targetId: string } }) => { h.deeds.push(data.targetId); return { id: 'deed_new' }; }),
    },
    campaignItem: {
      findMany: vi.fn(async ({ where }: { where: { id?: { in: string[] } } }) => {
        const rows = where.id?.in ? h.items.filter(i => where.id!.in.includes(i.id)) : h.items.filter(i => i.holderId === 'ch1' || h.deeds.includes(i.id));
        return [...rows].sort((a, b) => a.name.localeCompare(b.name)).map(i => ({ ...i, data: JSON.stringify(i.data) }));
      }),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => { const i = h.items.find(x => x.id === where.id); return i ? { ...i, data: JSON.stringify(i.data) } : null; }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: { data: string; holderId: string | null; locationId: string | null } }) => {
        const i = h.items.find(x => x.id === where.id)!;
        i.data = JSON.parse(data.data); i.holderId = data.holderId; i.locationId = data.locationId;
        return i;
      }),
    },
    forgeItem: { findMany: vi.fn(async () => [{ id: 'f_coat', name: 'Winter Coat' }, { id: 'f_outfit', name: 'Everyday Outfit' }]) },
    location: {
      findMany: vi.fn(async () => [{ id: 'loc_home', name: "Violet's Apartment" }]),
      findUnique: vi.fn(async () => ({ name: "Violet's Apartment", data: JSON.stringify({ description: 'A walkup studio.' }) })),
    },
    worldFact: { findMany: vi.fn(async () => [{ subjectKey: 'violet.apartment.light_now', fact: 'Cold grey morning.' }]) },
  },
}));
vi.mock('@/ai/network', () => ({
  routedChatText: vi.fn(async () => { h.calls++; if (h.fail) throw new Error('cold'); return { text: h.answer, model: 'm', usage: {}, lane: {} }; }),
}));

const { applyOutfit, draftOutfit, guessRegion, isGarment, listWardrobe, parseOutfitAnswer, proposeOutfit, setDressState, WARDROBE_EMPTY_LINE } = await import('./dress');

const player = { id: 'u_violet', role: 'TRAILBLAZER' };
const stranger = { id: 'u_x', role: 'TRAILBLAZER' };
const item = (id: string, name: string, data: Record<string, unknown>, extra: Partial<Item> = {}): Item =>
  ({ id, name, type: 'armor', data, holderId: 'ch1', locationId: null, sourceForgeItemId: null, status: 'ACTIVE', campaignId: 'c1', ...extra });

beforeEach(() => {
  h.items = [
    item('i_coat', 'Her grey coat', { armorCategory: 'Clothing', primaryMaterial: 'Wool' }, { sourceForgeItemId: 'f_coat' }),
    item('i_outfit', 'Everyday Outfit', { armorCategory: 'Clothing', equippedTo: 'Body' }, { sourceForgeItemId: 'f_outfit' }),
    item('i_boots', 'Work boots', { armorCategory: 'Clothing' }, { holderId: null, locationId: 'loc_home' }),
    item('i_phone', 'Phone', {}, { type: 'tool' }),
    item('i_laptop', 'Laptop', {}, { type: 'tool', holderId: null, locationId: 'loc_home' }),
  ];
  h.deeds = ['i_boots', 'i_laptop'];
  h.placed = ['i_boots', 'i_laptop'];
  h.answer = '';
  h.calls = 0;
  h.fail = false;
});

describe('pure', () => {
  it('isGarment: armorCategory Clothing, a clothing tag, or a garment word', () => {
    expect(isGarment('Thing', null, { armorCategory: 'Clothing' })).toBe(true);
    expect(isGarment('Thing', null, { tags: ['clothing'] })).toBe(true);
    expect(isGarment('Her grey coat', null, {})).toBe(true);
    expect(isGarment('Keepsake', 'Hoodie', {})).toBe(true);
    expect(isGarment('Laptop', null, { tags: ['tech'] })).toBe(false);
  });
  it('guessRegion: outfit → root, coat → torso, hat → head, else torso then root', () => {
    const regions = ['Body', 'Body/Head', 'Body/Torso'];
    expect(guessRegion('Everyday Outfit', regions)).toBe('Body');
    expect(guessRegion('Winter Coat', regions)).toBe('Body/Torso');
    expect(guessRegion('Wool hat', regions)).toBe('Body/Head');
    expect(guessRegion('Work boots', regions)).toBe('Body') // this fixture's regions have no feet → the root;
    expect(guessRegion('Coat', [])).toBeNull();
  });
});

describe('listWardrobe', () => {
  it('lists her garments and things with worn / carried / owned, archetypes and rooms', async () => {
    const w = await listWardrobe('ch1', player);
    expect(w.empty).toBe(false);
    expect(w.garments.map(g => [g.name, g.state, g.region, g.where])).toEqual([
      ['Everyday Outfit', 'worn', 'Body', null],
      ['Her grey coat', 'carried', null, null],
      ['Work boots', 'owned', null, "Violet's Apartment"],
    ]);
    expect(w.garments[1].archetype).toBe('Winter Coat');
    expect(w.things.map(t => [t.name, t.state])).toEqual([['Laptop', 'owned'], ['Phone', 'carried']]);
  });
  it('a stranger may not look', async () => {
    await expect(listWardrobe('ch1', stranger)).rejects.toThrow(/Not allowed/);
  });
  it('no garments at all → empty, and the line says the WORLD stage comes first', async () => {
    h.items = h.items.filter(i => !i.name.match(/coat|outfit|boots/i));
    h.deeds = ['i_laptop'];
    const w = await listWardrobe('ch1', player);
    expect(w.empty).toBe(true);
    expect(WARDROBE_EMPTY_LINE).toMatch(/WORLD stage/);
  });
});

describe('setDressState', () => {
  it('wears a deeded garment: picked up from the room, equippedTo guessed from its name', async () => {
    const r = await setDressState('ch1', { itemId: 'i_boots', state: 'worn' }, player);
    expect(r.state).toBe('worn');
    expect(r.region).toBe('Body/Left Upper Leg/Left Lower Leg/Left Foot'); // one boot, one foot (nothing comes in pairs)
    const row = h.items.find(i => i.id === 'i_boots')!;
    expect(row.holderId).toBe('ch1');
    expect(row.locationId).toBeNull();
    expect(h.placed).not.toContain('i_boots');
  });
  it('takes a garment off (carried) and puts a thing down at home (owned)', async () => {
    const off = await setDressState('ch1', { itemId: 'i_outfit', state: 'carried' }, player);
    expect(off.state).toBe('carried');
    expect(h.items.find(i => i.id === 'i_outfit')!.data.equippedTo).toBeUndefined();
    const down = await setDressState('ch1', { itemId: 'i_phone', state: 'owned' }, player);
    expect(down.state).toBe('owned');
    expect(h.items.find(i => i.id === 'i_phone')!.locationId).toBe('loc_home');
  });
  it('refuses a region that is not hers, a thing that is not hers, and an editor who is not', async () => {
    await expect(setDressState('ch1', { itemId: 'i_coat', state: 'worn', region: 'Body/Wings' }, player)).rejects.toThrow(/not one of her body regions/);
    h.items.push(item('i_other', 'Someone else’s hat', {}, { holderId: 'ch2' }));
    await expect(setDressState('ch1', { itemId: 'i_other', state: 'carried' }, player)).rejects.toThrow(/not hers/);
    await expect(setDressState('ch1', { itemId: 'i_coat', state: 'worn' }, stranger)).rejects.toThrow(/Not allowed/);
  });
});

describe('proposeOutfit / applyOutfit', () => {
  it('JEWL proposes from her things only; unknown ids are dropped; the outfit is NOT written until approved', async () => {
    h.answer = JSON.stringify({ pieces: [
      { itemId: 'i_coat', state: 'worn', region: 'Body/Torso', why: 'cold morning' },
      { itemId: 'i_boots', state: 'worn', region: 'Body/Feet', why: 'the walk' },
      { itemId: 'i_phone', state: 'carried', why: 'always' },
      { itemId: 'i_invented_ballgown', state: 'worn', why: 'no' },
    ] });
    const p = await proposeOutfit('ch1', player);
    expect(p.byJewl).toBe(true);
    expect(p.pieces.map(x => [x.itemId, x.state, x.region])).toEqual([
      ['i_coat', 'worn', 'Body/Torso'],
      ['i_boots', 'worn', 'Body/Left Upper Leg/Left Lower Leg/Left Foot'], // a region she has not → guessed
      ['i_phone', 'carried', null],
    ]);
    expect(h.calls).toBe(1);
    expect(h.items.find(i => i.id === 'i_coat')!.data.equippedTo).toBeUndefined();
  });
  it('an empty wardrobe makes no call and no outfit', async () => {
    h.items = h.items.filter(i => !i.name.match(/coat|outfit|boots/i));
    h.deeds = ['i_laptop'];
    const p = await proposeOutfit('ch1', player);
    expect(p).toEqual({ pieces: [], byJewl: false, empty: true });
    expect(h.calls).toBe(0);
  });
  it('JEWL cold → the deterministic draft from her things (what she wears stays, the kit is carried)', async () => {
    h.fail = true;
    const p = await proposeOutfit('ch1', player);
    expect(p.byJewl).toBe(false);
    // one boot on one foot no longer collides with the outfit on the body (nothing comes in pairs)
    expect(p.pieces.map(x => [x.itemId, x.state])).toEqual([['i_outfit', 'worn'], ['i_coat', 'worn'], ['i_boots', 'worn'], ['i_phone', 'carried']]);
    expect(draftOutfit(await listWardrobe('ch1', player)).length).toBe(4);
  });
  it('parseOutfitAnswer returns null on no JSON', async () => {
    expect(parseOutfitAnswer('nothing', await listWardrobe('ch1', player))).toBeNull();
  });
  it('applyOutfit writes the approved pieces and takes off worn garments left out; nothing invented', async () => {
    const w = await applyOutfit('ch1', { pieces: [{ itemId: 'i_coat', state: 'worn', region: 'Body/Torso' }, { itemId: 'i_boots', state: 'worn' }, { itemId: 'i_laptop', state: 'carried' }] }, player);
    const coat = h.items.find(i => i.id === 'i_coat')!;
    expect(coat.data.equippedTo).toBe('Body/Torso');
    expect(h.items.find(i => i.id === 'i_outfit')!.data.equippedTo).toBeUndefined(); // left out → off
    expect(h.items.find(i => i.id === 'i_laptop')!.holderId).toBe('ch1');
    expect(w.garments.find(g => g.id === 'i_outfit')!.state).toBe('carried');
    await expect(applyOutfit('ch1', { pieces: [{ itemId: 'i_nope', state: 'worn' }] }, player)).rejects.toThrow(/not one of her things/);
  });
});

describe('nothing comes in pairs (Mike 2026-10-16)', () => {
  it('a boot or a glove goes on ONE side — the named side, else the left; trousers span the legs', async () => {
    const { guessRegion, regionKeys } = { ...(await import('./dress')), ...(await import('./genesis-possessions')) };
    const regions = regionKeys({} as never);
    expect(guessRegion('Hiking Boot', regions)).toBe('Body/Left Upper Leg/Left Lower Leg/Left Foot');
    expect(guessRegion('Right winter glove', regions)).toBe('Body/Right Upper Arm/Right Lower Arm/Right Hand');
    expect(guessRegion('Her jeans', regions)).toBe('Body');
  });
});
