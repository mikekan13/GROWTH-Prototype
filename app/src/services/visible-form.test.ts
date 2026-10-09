import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ prisma: {} }));
vi.mock('@/ai/network', () => ({ route: vi.fn(), anthropicChatText: vi.fn(), openAiCompatChat: vi.fn(), recordAiCall: vi.fn() }));
vi.mock('@/services/history', () => ({ currentCycleOf: async () => 0 }));

import {
  GAP_TOKEN, renderVisibleForm, truthForm, truthLineFromCanon, truthRowsFromCanon, clarityOf, labelFor, shortDescription,
  fallbackVague, lawfulRewrite, seededRng,
  type TruthLine, type TruthEntity, type ViewerPerception, type VisibleRow,
} from './visible-form';

const ruth: TruthEntity = { id: 'ruth', kind: 'NPC', name: 'Ruth', description: 'Tall, grey-eyed woman in a warden\'s coat. Keys at her belt.' };
const violet: TruthEntity = { id: 'violet', kind: 'CHARACTER', name: 'Violet', description: 'Small and quick.' };
const warden: TruthEntity = { id: 'warden', kind: 'NPC', name: 'Warden', description: 'Tall guard in mail' };
const door: TruthEntity = { id: 'door', kind: 'ITEM', name: 'iron door', description: null };
const entities = [ruth, violet, warden, door];

const see = (over: Partial<ViewerPerception> = {}): ViewerPerception => ({ viewerId: 'violet', noticed: true, via: ['sight', 'hearing'], clarity: { sight: 1, hearing: 1 }, ...over });
const knowsAll = { ruth: { identity: 5, appearance: 5 }, warden: { identity: 4 }, door: { identity: 3 } };

const line: TruthLine = {
  refs: ['ev1'],
  entities,
  rows: [
    { type: 'narration', text: 'Ruth opens the iron door. The Warden watches.' },
    { type: 'character', speakerId: 'ruth', name: 'Ruth', segments: [{ kind: 'action', text: 'waves Violet over' }, { kind: 'speech', text: 'Sit down, Violet. We have a long night ahead of us and not much light left to see by.' }] },
  ],
};

const flat = (rows: VisibleRow[]) => rows.map((r) => (r.type === 'narration' ? r.text : `${r.name}: ${r.segments.map((s) => `[${s.kind}] ${s.text}`).join(' ')}`));

describe('visible form — full clarity is the truth', () => {
  it('full fidelity on every sense + known names → identical to the truth line', async () => {
    const seen = await renderVisibleForm(line, see(), knowsAll, { seed: 'm1' });
    expect(seen.rows).toEqual(await truthForm(line));
    expect(flat(seen.rows)).toEqual([
      'Ruth opens the iron door. The Warden watches.',
      'Ruth: [action] waves Violet over [speech] Sit down, Violet. We have a long night ahead of us and not much light left to see by.',
    ]);
    // Entity spans keep the words as written and point at the thing.
    const n = seen.rows[0];
    expect(n.type === 'narration' && n.pieces.filter((p) => p.kind === 'entity').map((p) => p.kind === 'entity' && p.entityId)).toEqual(['ruth', 'door', 'warden']);
  });

  it('the truth form of a canon row is its words, in the feed\'s rows', async () => {
    const rows = truthRowsFromCanon({ id: 'e', kind: 'dialogue', narration: 'Ruth says: "Sit."', detail: JSON.stringify({ message: '::leans in:: "Sit." ((she is lying))' }), actorId: 'ruth' }, entities);
    expect(rows).toEqual([{ type: 'character', speakerId: 'ruth', name: 'Ruth', segments: [{ kind: 'action', text: 'leans in' }, { kind: 'speech', text: 'Sit.' }, { kind: 'thought', text: 'she is lying' }] }]);
    const decl = truthRowsFromCanon({ id: 'd', kind: 'declaration', narration: 'The fire pops. Ruth says, "Sit down."', detail: '{}', actorId: null, sourceType: 'gm' }, entities);
    expect(decl[0]).toEqual({ type: 'narration', text: expect.stringContaining('The fire pops.') });
    expect(decl.some((r) => r.type === 'character' && r.speakerId === 'ruth')).toBe(true);
    const act = truthRowsFromCanon({ id: 'a', kind: 'encounter_round', narration: 'Ruth swings at Violet.', detail: '{}', actorId: 'ruth' }, entities);
    expect(act).toEqual([{ type: 'narration', text: 'Ruth swings at Violet.', act: true, actorId: 'ruth' }]);
  });

  it('a chain does not repeat a dialogue row already inside an earlier row', () => {
    const t = truthLineFromCanon([
      { id: 'd', kind: 'declaration', narration: 'Ruth says, "Sit down."', detail: '{}', actorId: null, sourceType: 'gm' },
      { id: 'q', kind: 'dialogue', narration: 'Ruth says: "Sit down."', detail: JSON.stringify({ message: 'Sit down.' }), actorId: 'ruth' },
    ], entities);
    expect(t.refs).toEqual(['d', 'q']);
    expect(t.rows.filter((r) => r.type === 'character')).toHaveLength(1);
  });
});

describe('visible form — hearing', () => {
  it('deaf but saw it said → the speech is one gap; heard by nothing that carries it → the row is absent', async () => {
    const deaf = await renderVisibleForm(line, see({ via: ['sight'], clarity: { sight: 1 } }), knowsAll, { seed: 'm1' });
    const row = deaf.rows[1];
    expect(row.type).toBe('character');
    if (row.type !== 'character') return;
    expect(row.segments.map((s) => s.kind)).toEqual(['action', 'speech']);
    expect(row.segments[1]).toEqual({ kind: 'speech', text: GAP_TOKEN, pieces: [{ kind: 'gap' }] });

    const said: TruthLine = { refs: ['q'], entities, rows: [{ type: 'character', speakerId: 'ruth', name: 'Ruth', segments: [{ kind: 'speech', text: 'Sit down.' }] }] };
    const felt = await renderVisibleForm(said, see({ via: ['touch'], clarity: { touch: 1 } }), knowsAll, { seed: 'm2' });
    expect(felt.rows).toEqual([]);
  });

  it('half hearing → only caught fragments, in order, gaps between; same row renders the same', async () => {
    const half = see({ clarity: { sight: 1, hearing: 0.5 } });
    const a = await renderVisibleForm(line, half, knowsAll, { seed: 'mem-42' });
    const b = await renderVisibleForm(line, half, knowsAll, { seed: 'mem-42' });
    expect(a).toEqual(b);
    const row = a.rows[1];
    if (row.type !== 'character') throw new Error('expected a character row');
    const speech = row.segments.find((s) => s.kind === 'speech')!;
    expect(speech.text).toContain(GAP_TOKEN);
    expect(speech.text).not.toMatch(/distort|\d/i);
    const caught = speech.text.split(' ').filter((w) => w !== GAP_TOKEN);
    expect(caught.length).toBeGreaterThan(2);
    const truthWords = 'Sit down, Violet. We have a long night ahead of us and not much light left to see by.'.split(' ');
    expect(caught.length).toBeLessThan(truthWords.length);
    let at = -1;
    for (const w of caught) { const i = truthWords.indexOf(w, at + 1); expect(i).toBeGreaterThan(at); at = i; }
    expect(speech.text).not.toMatch(new RegExp(`${GAP_TOKEN.replace(/[{}]/g, '\\$&')} ${GAP_TOKEN.replace(/[{}]/g, '\\$&')}`)); // runs collapse
    expect(speech.pieces.some((p) => p.kind === 'gap')).toBe(true);
  });

  it('the RNG is seeded', () => {
    const r1 = seededRng('x'); const r2 = seededRng('x');
    expect([r1(), r1(), r1()]).toEqual([r2(), r2(), r2()]);
  });
});

describe('visible form — naming by familiarity', () => {
  const t: TruthLine = { refs: ['e'], entities, rows: [{ type: 'narration', text: 'The Warden steps toward Violet.' }, { type: 'character', speakerId: 'warden', name: 'Warden', segments: [{ kind: 'speech', text: 'Halt.' }] }] };
  const at = async (identity: number | null) => renderVisibleForm(t, see(), identity === null ? {} : { warden: { identity, ...(identity >= 1 ? { appearance: 2 } : {}) } }, { seed: 's' });

  it('F0 a figure, F1 a short description, F3 the name — the viewer is always itself', async () => {
    expect(flat((await at(null)).rows)).toEqual(['A figure steps toward Violet.', 'A figure: [speech] Halt.']);
    expect(flat((await at(1)).rows)).toEqual(['A tall guard in mail steps toward Violet.', 'A tall guard in mail: [speech] Halt.']);
    expect(flat((await at(3)).rows)).toEqual(['The Warden steps toward Violet.', 'Warden: [speech] Halt.']);
  });

  it('the span carries only the aspects the viewer knows; F5 is there for the raw stats', async () => {
    expect((await at(null)).entities.find((e) => e.id === 'warden')?.known).toEqual([]);
    expect((await at(1)).entities.find((e) => e.id === 'warden')?.known).toEqual([{ aspectKind: 'appearance', fidelity: 2 }, { aspectKind: 'identity', fidelity: 1 }]);
    const f5 = await renderVisibleForm(t, see(), { warden: { identity: 5, damage: 5, history: 0 } }, { seed: 's' });
    expect(f5.entities.find((e) => e.id === 'warden')?.known).toEqual([{ aspectKind: 'damage', fidelity: 5 }, { aspectKind: 'identity', fidelity: 5 }]);
  });

  it('labels never carry a number or a level word', () => {
    for (const lvl of [0, 1, 2, 3, 4, 5]) expect(labelFor(warden, lvl, 'violet')).not.toMatch(/\d|F\d|level|unknown/i);
    expect(labelFor(violet, 0, 'violet')).toBe('Violet');
    expect(shortDescription('Apple-cheeked lass behind the bar.')).toBe('an apple-cheeked lass behind the bar');
    expect(labelFor(door, 0, 'violet')).toBe('something');
  });
});

describe('visible form — thoughts', () => {
  const t: TruthLine = { refs: ['e'], entities, rows: [{ type: 'character', speakerId: 'ruth', name: 'Ruth', segments: [{ kind: 'action', text: 'frowns' }, { kind: 'thought', text: 'she is lying to me' }] }] };

  it('removed for an ordinary viewer; kept through a mind sense; kept for the thinker', async () => {
    const plain = await renderVisibleForm(t, see(), knowsAll, { seed: 's' });
    expect(plain.rows[0].type === 'character' && plain.rows[0].segments.map((s) => s.kind)).toEqual(['action']);
    const reader = await renderVisibleForm(t, see({ via: ['sight', 'hearing', 'mind reading'], clarity: { sight: 1, hearing: 1, 'mind reading': 1 } }), knowsAll, { seed: 's' });
    expect(reader.rows[0].type === 'character' && reader.rows[0].segments.map((s) => s.text)).toEqual(['frowns', 'she is lying to me']);
    const own = await renderVisibleForm(t, { viewerId: 'ruth', noticed: true, via: ['self'], clarity: {} }, {}, { seed: 's' });
    expect(own.rows[0].type === 'character' && own.rows[0].segments.map((s) => s.kind)).toEqual(['action', 'thought']);
    expect(clarityOf({ viewerId: 'v', noticed: true, via: ['hearing', 'mind reading'], clarity: { hearing: 0.5, 'mind reading': 0.7 } })).toEqual({ self: false, hearing: 0.5, sight: 0, scene: 0.5, mind: 0.7 });
  });
});

describe('visible form — actions seen poorly', () => {
  const act: TruthLine = { refs: ['a'], entities, rows: [{ type: 'narration', text: 'Ruth swings her blade at Violet.', act: true, actorId: 'ruth' }, { type: 'character', speakerId: 'ruth', name: 'Ruth', segments: [{ kind: 'action', text: 'jumps up and down' }] }] };

  it('deterministic fallback: generic subject + verb', async () => {
    const dim = await renderVisibleForm(act, see({ clarity: { sight: 0.5, hearing: 1 } }), knowsAll, { seed: 's' });
    expect(flat(dim.rows)).toEqual(['Someone swings.', 'Ruth: [action] someone jumps']);
    const heard = await renderVisibleForm(act, see({ via: ['hearing'], clarity: { hearing: 1 } }), knowsAll, { seed: 's' });
    expect(flat(heard.rows)[0]).toBe('Someone swings.');
    const nothing = await renderVisibleForm(act, see({ via: ['smell'], clarity: { smell: 1 } }), knowsAll, { seed: 's' });
    expect(nothing.rows).toEqual([]);
    expect(fallbackVague('', entities, null, false)).toBe('someone moves');
  });

  it('the small model rewrites, held to the laws (no unknown names, no numbers, short)', async () => {
    const good = vi.fn(async () => 'someone lunges near the door');
    const r = await renderVisibleForm(act, see({ clarity: { sight: 0.5, hearing: 1 } }), {}, { seed: 's', rewrite: good });
    expect(flat(r.rows)[0]).toBe('Someone lunges near the door');
    expect(good).toHaveBeenCalledWith({ text: 'Ruth swings her blade at Violet.', seen: 'poorly' });
    const leaky = vi.fn(async () => 'Ruth lunges');
    expect(flat((await renderVisibleForm(act, see({ clarity: { sight: 0.5, hearing: 1 } }), {}, { seed: 's', rewrite: leaky })).rows)[0]).toBe('Someone swings.');
    expect(lawfulRewrite('a distorted shape moves', [])).toBeNull();
    expect(lawfulRewrite('someone takes 3 steps', [])).toBeNull();
    expect(lawfulRewrite('Ruth moves', ['Ruth'])).toBeNull();
    expect(lawfulRewrite('Ruth moves', [])).toBe('Ruth moves');
  });

  it('unnoticed: no feed line at all', async () => {
    expect((await renderVisibleForm(line, see({ noticed: false }), knowsAll, { seed: 's' })).rows).toEqual([]);
  });
});
