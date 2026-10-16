/** PORTRAIT BRIEF (plan §4 C): the pure composition + buildPortraitBrief with prisma and JEWL mocked. */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  sheet: {} as Record<string, unknown>,
  name: 'Violet Okafor',
  edges: [] as Array<{ targetId: string; relationshipType: string }>,
  location: null as null | { name: string; type: string; data: string },
  facts: [] as Array<{ subjectKey: string; fact: string }>,
  entity: null as null | { personaProfile: string; affect: { morale: number; stress: number; grief: number } | null },
  items: [] as Array<{ id: string; name: string; data: string; sourceForgeItemId: string | null }>,
  updates: [] as string[],
  answer: '' as string,
  calls: 0,
  fail: false,
}));

vi.mock('@/lib/db', () => ({
  prisma: {
    character: {
      findUnique: vi.fn(async () => ({ id: 'ch1', name: h.name, campaignId: 'c1', data: JSON.stringify(h.sheet) })),
      update: vi.fn(async ({ data }: { data: { data: string } }) => { h.updates.push(data.data); h.sheet = JSON.parse(data.data); return {}; }),
    },
    entityRelationship: { findMany: vi.fn(async () => h.edges) },
    location: { findUnique: vi.fn(async () => h.location) },
    worldFact: { findMany: vi.fn(async () => h.facts) },
    dayaEntity: { findUnique: vi.fn(async () => h.entity) },
    campaignItem: { findMany: vi.fn(async () => h.items) },
    forgeItem: { findMany: vi.fn(async () => [{ id: 'f_coat', name: 'Winter Coat' }]) },
  },
}));
vi.mock('@/ai/network', () => ({
  routedChatText: vi.fn(async () => {
    h.calls++;
    if (h.fail) throw new Error('cold');
    return { text: h.answer, model: 'm', usage: {}, lane: {} };
  }),
}));

const mod = await import('./portrait-brief');
const {
  buildPortraitBrief, clothesLine, composePrompt, draftBrief, lightLine, markSentence, markSentences, outermostPerRegion, parseBriefAnswer,
  readPortraitRefs, briefInputHash, gatherPortraitInputs,
} = mod;

const piece = (name: string, region: string, category: string | null = 'Clothing', material: string | null = null) =>
  ({ itemId: name, name, archetype: null, region, description: null, material, category });

describe('pure composition', () => {
  it('outermostPerRegion keeps one piece per region, Heavy over Light over Clothing', () => {
    const out = outermostPerRegion([piece('Shirt', 'Body/Torso'), piece('Cuirass', 'Body/Torso', 'Heavy'), piece('Boots', 'Body/Feet', null)]);
    expect(out.map(p => p.name)).toEqual(['Cuirass', 'Boots']);
  });
  it('clothesLine: nothing equipped → the at-home line, never an invented wardrobe', () => {
    expect(clothesLine([], 'she')).toBe('in the clothes she would wear at home');
    expect(clothesLine([piece('Winter Coat', 'Body/Torso', 'Clothing', 'Nylon'), piece('Dress Shoes', 'Body/Feet')], 'she'))
      .toBe('wearing a winter coat of nylon over the torso and dress shoes over the feet');
    expect(clothesLine([piece('Everyday Outfit', 'Body')], 'he')).toBe('wearing an everyday outfit');
  });
  it('markSentence turns the designer sentence into a clause; markSentences reads both stacks', () => {
    expect(markSentence('Add a scar to her face: a thin pale line through the left eyebrow.')).toBe('a scar on her face: a thin pale line through the left eyebrow');
    expect(markSentence('a tattoo down the left forearm')).toBe('a tattoo down the left forearm');
    const marks = markSentences({
      layers: [{ imagePath: 'b', text: 'Locked', kind: 'base', seed: 1, at: '' }, { imagePath: 'p', text: 'Add a piercing to her face: a small ring in the left nostril.', kind: 'piercing', seed: 1, at: '' }],
      bodyLayers: [{ imagePath: 'h', text: 'Change her build to lean.', kind: 'build', seed: 1, at: '' }, { imagePath: 't', text: 'Add a tattoo to her arms: a vine down the left forearm.', kind: 'tattoo', seed: 1, at: '' }],
    });
    expect(marks).toEqual(['a piercing on her face: a small ring in the left nostril', 'a tattoo on her arms: a vine down the left forearm']);
  });
  it('lightLine prefers light/time facts, then the environment, then a plain default', () => {
    expect(lightLine([{ key: 'violet.apartment.light_now', fact: 'Late afternoon sun through the one window.' }, { key: 'violet.desk', fact: 'A laptop.' }], null))
      .toBe('Late afternoon sun through the one window');
    expect(lightLine([], { name: 'X', type: 'building', description: '', environment: 'Dim and cold.', imageUrl: null, relation: 'home' })).toBe('lit as the place is — Dim and cold');
    expect(lightLine([], null)).toBe('soft daylight from one window');
  });
  it('composePrompt follows the fixed template', () => {
    const p = composePrompt({ setting: 'a room', pose: 'standing', expression: 'calm', clothes: 'wearing a coat', marks: 'keeping the scar', light: 'dusk' });
    expect(p).toBe('A painted character illustration of the person in <image1> with the body in <image2>, wearing a coat, standing, calm, in a room, dusk, keeping the scar.');
  });
  it('parseBriefAnswer: fills gaps from the draft, recomposes a prompt that lost the references, never lets JEWL dress an undressed character', () => {
    const inputs = baseInputs();
    const draft = draftBrief(inputs);
    expect(parseBriefAnswer('no json here', draft, 0)).toBeNull();
    const a = parseBriefAnswer('```json\n{"pose":"leaning on the sill","prompt":"forgot the refs"}\n```', draft, 0)!;
    expect(a.pose).toBe('leaning on the sill');
    expect(a.clothes).toBe(draft.clothes);
    expect(a.prompt).toContain('<image1>');
    expect(a.prompt).toContain('leaning on the sill');
    const b = parseBriefAnswer(JSON.stringify({ clothes: 'wearing a ballgown', prompt: 'x <image1> y <image2> wearing a ballgown' }), draft, 0)!;
    expect(b.clothes).toBe(draft.clothes);
    expect(b.prompt).not.toContain('ballgown');
  });
});

function baseInputs(): Parameters<typeof draftBrief>[0] {
  return {
    characterId: 'ch1', campaignId: 'c1', name: 'Violet Okafor', possessive: 'her', pronoun: 'she', seed: 'Human', age: 25, backstory: '',
    location: null, facts: [], persona: { identityNarrative: null, voiceNotes: null }, disposition: null, equipped: [], marks: [], underclothing: null, means: [],
    refs: { face: '/portraits/ch1/faces/f.png', body: '/portraits/ch1/bodies/b.png' },
  };
}

describe('buildPortraitBrief (prisma + JEWL mocked)', () => {
  beforeEach(() => {
    h.sheet = {
      identity: {
        sex: 'female', age: 25,
        designer: {
          layers: [{ imagePath: '/portraits/ch1/faces/base.png', text: 'Locked', kind: 'base' }, { imagePath: '/portraits/ch1/faces/s.png', text: 'Add a scar to her neck: a short pale line at the clavicle.', kind: 'scar' }, { imagePath: '/portraits/ch1/faces/p.png', text: 'Clean render (approved)', kind: 'polish' }],
          approvedImagePath: '/portraits/ch1/faces/p.png',
          bodyLayers: [{ imagePath: '/portraits/ch1/bodies/b.png', text: 'Rendered from the approved base', kind: 'base' }],
        },
      },
      creation: { seed: { name: 'Human' } },
      backstory: { backstory: 'She writes novels in a fourth-floor walkup.' },
      wealth: { holdings: [{ amount: 300, code: 'USD', where: 'checking' }] },
    };
    h.edges = [{ targetId: 'loc1', relationshipType: 'home' }];
    h.location = { name: "Violet's Apartment", type: 'building', data: JSON.stringify({ description: 'A fourth-floor walkup studio in the historic district.', environment: 'Quiet, dusty light' }) };
    h.facts = [{ subjectKey: 'violet.apartment.desk', fact: 'A laptop and a stack of manuscript pages.' }, { subjectKey: 'violet.apartment.light_now', fact: 'Grey morning light through the alley window.' }];
    h.entity = { personaProfile: JSON.stringify({ identityNarrative: 'A solitary, guarded author.' }), affect: { morale: 0, stress: 0.4, grief: 0.3 } };
    h.items = [
      { id: 'i_coat', name: 'Her grey coat', data: JSON.stringify({ equippedTo: 'Body/Torso', armorCategory: 'Clothing', primaryMaterial: 'Wool' }), sourceForgeItemId: 'f_coat' },
      { id: 'i_phone', name: 'Phone', data: JSON.stringify({}), sourceForgeItemId: null },
    ];
    h.updates = [];
    h.calls = 0;
    h.fail = false;
    h.answer = JSON.stringify({ setting: 'The studio, pages everywhere.', pose: 'half-turned from the window, arms folded', expression: 'wary, mouth set', clothes: 'wearing her grey wool coat', marks: 'keeping the short pale scar at the clavicle', light: 'grey morning light from the alley window', prompt: 'A painted character illustration of the person in <image1> with the body in <image2>, wearing her grey wool coat, half-turned from the window, arms folded, wary, mouth set, in the studio, pages everywhere, grey morning light from the alley window, keeping the short pale scar at the clavicle.' });
  });

  it('gathers the home, the facts (light first), persona, affect, EQUIPPED only, marks and means', async () => {
    const i = await gatherPortraitInputs('ch1');
    expect(i.location?.name).toBe("Violet's Apartment");
    expect(i.facts[0].key).toBe('violet.apartment.light_now');
    expect(i.disposition).toBe('tense and wary; quietly mourning something');
    expect(i.equipped.map(e => e.name)).toEqual(['Her grey coat']);
    expect(i.equipped[0].archetype).toBe('Winter Coat');
    expect(i.marks).toEqual(['a scar on her neck: a short pale line at the clavicle']);
    expect(i.means).toEqual(['300 USD (checking)']);
    expect(i.refs).toEqual({ face: '/portraits/ch1/faces/p.png', body: '/portraits/ch1/bodies/b.png' });
  });

  it('asks JEWL once, stores the brief with its hash, then reuses it while the inputs match', async () => {
    const r1 = await buildPortraitBrief('ch1');
    expect(r1.modelCalled).toBe(true);
    expect(r1.brief.byJewl).toBe(true);
    expect(r1.brief.pose).toBe('half-turned from the window, arms folded');
    expect(h.updates).toHaveLength(1);
    expect((h.sheet.identity as { portraitBrief: { hash: string } }).portraitBrief.hash).toBe(r1.brief.hash);
    const r2 = await buildPortraitBrief('ch1');
    expect(r2.reused).toBe(true);
    expect(h.calls).toBe(1);
    // A changed outfit changes the hash → a new brief.
    h.items[0].data = JSON.stringify({ equippedTo: 'Body/Torso', armorCategory: 'Clothing', primaryMaterial: 'Linen' });
    const r3 = await buildPortraitBrief('ch1');
    expect(r3.reused).toBe(false);
    expect(h.calls).toBe(2);
    expect(r3.brief.hash).not.toBe(r1.brief.hash);
  });

  it('falls back to the deterministic draft when JEWL does not answer (and still stores it)', async () => {
    h.fail = true;
    const r = await buildPortraitBrief('ch1');
    expect(r.brief.byJewl).toBe(false);
    expect(r.brief.clothes).toBe('wearing her grey coat of wool over the torso');
    expect(r.brief.light).toBe('Grey morning light through the alley window');
    expect(r.brief.prompt).toMatch(/^A painted character illustration of the person in <image1> with the body in <image2>, wearing her grey coat of wool over the torso, /);
    expect(r.brief.prompt).toContain('a scar on her neck');
    expect(h.updates).toHaveLength(1);
  });

  it('jewl: false never calls the model (labs); force rewrites', async () => {
    const r = await buildPortraitBrief('ch1', { jewl: false });
    expect(h.calls).toBe(0);
    expect(r.modelCalled).toBe(false);
    const r2 = await buildPortraitBrief('ch1', { force: true });
    expect(r2.reused).toBe(false);
    expect(h.calls).toBe(1);
  });

  it('readPortraitRefs refuses until the face is approved and the body exists', async () => {
    await expect(readPortraitRefs('ch1')).resolves.toEqual({ face: '/portraits/ch1/faces/p.png', body: '/portraits/ch1/bodies/b.png' });
    (h.sheet.identity as { designer: { bodyLayers: unknown[] } }).designer.bodyLayers = [];
    await expect(readPortraitRefs('ch1')).rejects.toThrow(/Approve the face and render the body/);
  });

  it('the hash ignores the backstory text but follows the references', () => {
    const a = baseInputs();
    const b = { ...a, backstory: 'different' };
    const c = { ...a, refs: { ...a.refs, face: '/portraits/ch1/faces/other.png' } };
    expect(briefInputHash(a)).toBe(briefInputHash(b));
    expect(briefInputHash(a)).not.toBe(briefInputHash(c));
  });
});
