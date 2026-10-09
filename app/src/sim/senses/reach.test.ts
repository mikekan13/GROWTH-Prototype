import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { senseProfileFromSheet, type SenseProfile } from './field';
import {
  stubVerdict, stubReach, judgeReach, buildReachPrompt, parseReachOutput, lawfulVerdict, cuesFromText, perceptionReachOn,
  type ReachBeing, type ReachEvent,
} from './reach';

const anatomy = (ears: [number, number] | null, eyes: [number, number] | null = null) => ({
  bodyAnatomy: {
    partName: 'Body',
    contains: [{
      partName: 'Head',
      contains: [
        ...(eyes ? [{ partName: 'Left Eye', condition: eyes[0] }, { partName: 'Right Eye', condition: eyes[1] }] : []),
        ...(ears ? [{ partName: 'Left Ear', condition: ears[0] }, { partName: 'Right Ear', condition: ears[1] }] : []),
      ],
    }],
  },
});

const being = (id: string, over: Partial<ReachBeing> = {}, senses: SenseProfile = senseProfileFromSheet(null)): ReachBeing =>
  ({ id, name: id.toUpperCase(), locationId: 'room', senses, ...over });

const speech = (over: Partial<ReachEvent> = {}): ReachEvent => ({ kind: 'speech', text: 'Ruth: Sit down.', sourceId: 'ruth', locationId: 'room', ...over });

describe('reach stub (deterministic world-sim stand-in)', () => {
  it('same room, working ears → reaches by hearing, noticed', () => {
    const v = stubVerdict(speech(), being('violet'));
    expect(v).toMatchObject({ reaches: true, via: ['hearing'], noticed: true });
    expect(v.salience).toBe(0.5);
  });

  it('another room → does not reach (no memory row)', () => {
    expect(stubVerdict(speech(), being('violet', { locationId: 'hall' }))).toMatchObject({ reaches: false, via: [], noticed: false });
  });

  it('unplaced event or being = the whole scene (the behaviour before units 6+7)', () => {
    expect(stubVerdict(speech({ locationId: null }), being('violet', { locationId: 'hall' })).reaches).toBe(true);
    expect(stubVerdict(speech(), being('violet', { locationId: null })).reaches).toBe(true);
  });

  it('a deaf being (both ears Destroyed) does not hear speech, but sees an action', () => {
    const deaf = being('violet', {}, senseProfileFromSheet(anatomy([0, 0])));
    expect(stubVerdict(speech(), deaf).reaches).toBe(false);
    expect(stubVerdict({ kind: 'action', text: 'Ruth slams the door.', sourceId: 'ruth', locationId: 'room' }, deaf)).toMatchObject({ reaches: true, via: ['sight'] });
  });

  it('Broken ears halve it: reaches by hearing, half as salient', () => {
    const v = stubVerdict(speech(), being('violet', {}, senseProfileFromSheet(anatomy([1, 1]))));
    expect(v).toMatchObject({ reaches: true, via: ['hearing'], noticed: true, salience: 0.25 });
  });

  it('D3: the verdict carries each carried sense\'s clarity at this moment (stored on the memory row)', () => {
    expect(stubVerdict(speech(), being('violet', {}, senseProfileFromSheet(anatomy([1, 1])))).clarity).toEqual({ hearing: 0.5 });
    expect(stubVerdict({ kind: 'action', text: 'Ruth slams the door.', sourceId: 'ruth', locationId: 'room' }, being('violet')).clarity).toEqual({ sight: 1, hearing: 1 });
    expect(stubVerdict(speech({ sourceId: 'violet' }), being('violet')).clarity).toBeUndefined();
    expect(lawfulVerdict(speech(), being('violet', {}, senseProfileFromSheet(anatomy([1, 1]))), { id: 'violet', reach: true, via: ['hearing'], noticed: true, salience: 0.4 } as never).clarity).toEqual({ hearing: 0.5 });
  });

  it('a whisper reaches but goes unnoticed — except by the one it is aimed at', () => {
    const e = speech({ text: 'Ruth whispers: the key is under the mat.', targetId: 'danny' });
    expect(stubVerdict(e, being('violet'))).toMatchObject({ reaches: true, noticed: false });
    expect(stubVerdict(e, being('danny'))).toMatchObject({ reaches: true, noticed: true, salience: 0.8 });
    expect(stubVerdict(speech({ volume: 'whisper' }), being('violet')).noticed).toBe(false);
    expect(stubVerdict({ kind: 'action', text: 'Ruth slips something into her pocket.', locationId: 'room', hidden: true }, being('violet')).noticed).toBe(false);
  });

  it('a thought reaches nobody without a mind sense; a mind-reader in the room hears it', () => {
    const thought: ReachEvent = { kind: 'thought', text: '((She is lying to me.))', sourceId: 'ruth', locationId: 'room' };
    expect(stubVerdict(thought, being('violet')).reaches).toBe(false);
    const reader = being('seer', {}, { ...senseProfileFromSheet(null), nonPhysical: [{ name: 'mind reading', reaches: 'thought', effectiveness: 1, source: 'spell' }] });
    expect(stubVerdict(thought, reader)).toMatchObject({ reaches: true, via: ['mind reading'], noticed: true });
    // ((…)) text alone marks a thought even when the writer said 'narration'.
    expect(stubVerdict({ ...thought, kind: 'narration' }, being('violet')).reaches).toBe(false);
    // The thinker perceives its own thought.
    expect(stubVerdict(thought, being('ruth'))).toMatchObject({ reaches: true, via: ['self'] });
  });

  it('reads cues off text', () => {
    expect(cuesFromText('He shouts for help')).toMatchObject({ volume: 'loud' });
    expect(cuesFromText('((no one must know))')).toMatchObject({ kind: 'thought' });
    expect(cuesFromText('She sneaks past')).toMatchObject({ hidden: true });
  });
});

describe('judgeReach — flag, model, fallback', () => {
  const prev = process.env.PERCEPTION_REACH;
  beforeEach(() => { delete process.env.PERCEPTION_REACH; });
  afterEach(() => { if (prev === undefined) delete process.env.PERCEPTION_REACH; else process.env.PERCEPTION_REACH = prev; });

  it('PERCEPTION_REACH defaults OFF ("on" only), and off never calls the model', async () => {
    expect(perceptionReachOn()).toBe(false);
    for (const v of ['1', 'true', 'ON', '']) { process.env.PERCEPTION_REACH = v; expect(perceptionReachOn()).toBe(false); }
    delete process.env.PERCEPTION_REACH;
    const model = vi.fn(async () => '[]');
    const j = await judgeReach(speech(), [being('violet')], { model });
    expect(model).not.toHaveBeenCalled();
    expect(j.source).toBe('stub');
    expect(j.verdicts.get('violet')).toEqual(stubReach(speech(), [being('violet')]).get('violet'));
  });

  it('flag on: one call for every being, short ids mapped back, hard laws applied', async () => {
    process.env.PERCEPTION_REACH = 'on';
    const deaf = being('deaf', {}, senseProfileFromSheet(anatomy([0, 0])));
    const model = vi.fn(async () => '```json\n[{"id":"b1","reach":true,"via":["hearing"],"noticed":false,"salience":0.2},{"id":"b2","reach":true,"via":["hearing"],"noticed":true,"salience":0.9}]\n```');
    const j = await judgeReach(speech(), [being('violet'), deaf], { model });
    expect(model).toHaveBeenCalledTimes(1);
    expect(j.source).toBe('model');
    expect(j.verdicts.get('violet')).toMatchObject({ reaches: true, noticed: false, salience: 0.2, via: ['hearing'] });
    // The model claimed a deaf being heard it: no working sense carried it → not reached.
    expect(j.verdicts.get('deaf')).toMatchObject({ reaches: false, noticed: false, via: [] });
  });

  it('the source is not sent to the model and perceives its own act', async () => {
    process.env.PERCEPTION_REACH = 'on';
    const model = vi.fn(async () => '[{"id":"b1","reach":true,"via":["hearing"],"noticed":true,"salience":0.5}]');
    const j = await judgeReach(speech(), [being('ruth'), being('violet')], { model });
    expect(j.verdicts.get('ruth')).toMatchObject({ via: ['self'], noticed: true });
    expect((model.mock.calls[0] as unknown as [{ user: string }])[0].user).not.toContain('RUTH');
  });

  it('Zod-invalid output → the stub stands in (fallback)', async () => {
    process.env.PERCEPTION_REACH = 'on';
    const j = await judgeReach(speech(), [being('violet')], { model: async () => '[{"id":"b1","reach":"yes"}]' });
    expect(j.source).toBe('fallback');
    expect(j.error).toMatch(/validation/);
    expect(j.verdicts.get('violet')).toEqual(stubVerdict(speech(), being('violet')));
  });

  it('no JSON / a thrown transport / a timeout → the stub', async () => {
    process.env.PERCEPTION_REACH = 'on';
    expect((await judgeReach(speech(), [being('violet')], { model: async () => 'I think they hear it.' })).source).toBe('fallback');
    expect((await judgeReach(speech(), [being('violet')], { model: async () => { throw new Error('lane down'); } })).source).toBe('fallback');
    const slow = await judgeReach(speech(), [being('violet')], { model: () => new Promise((r) => setTimeout(() => r('[]'), 200)), timeoutMs: 20 });
    expect(slow.source).toBe('fallback');
    expect(slow.error).toMatch(/timed out/);
  });

  it('a being the model left out gets the stub verdict', async () => {
    process.env.PERCEPTION_REACH = 'on';
    const j = await judgeReach(speech(), [being('violet'), being('danny')], { model: async () => '[{"id":"b1","reach":false,"via":[],"noticed":false,"salience":0}]' });
    expect(j.verdicts.get('violet')?.reaches).toBe(false);
    expect(j.verdicts.get('danny')).toEqual(stubVerdict(speech(), being('danny')));
  });

  it('a thought can only reach through a mind sense, whatever the model says', () => {
    const thought: ReachEvent = { kind: 'thought', text: '((run))', sourceId: 'ruth', locationId: 'room' };
    expect(lawfulVerdict(thought, being('violet'), { id: 'b1', reach: true, via: ['hearing'], noticed: true, salience: 0.9 }).reaches).toBe(false);
    const reader = being('seer', {}, { ...senseProfileFromSheet(null), nonPhysical: [{ name: 'Mind Reading', reaches: 'thought', effectiveness: 0.5, source: null }] });
    expect(lawfulVerdict(thought, reader, { id: 'b1', reach: true, via: ['mind reading'], noticed: true, salience: 0.9 })).toMatchObject({ reaches: true, via: ['Mind Reading'] });
  });
});

describe('prompt + parse', () => {
  it('prompt names organs with their condition, focus, Wisdom, the mind sense, and the output contract', () => {
    const p = buildReachPrompt(speech({ locationName: 'Main Room' }), [being('violet', { focus: 'find the red book', wisdom: 3 }, senseProfileFromSheet(anatomy([1, 3])))]);
    expect(p.user).toContain('b1 VIOLET');
    expect(p.user).toContain('hearing 1 (Left Ear Broken)');
    expect(p.user).toContain('Focus: find the red book');
    expect(p.user).toContain('Wisdom 3');
    expect(p.user).toContain('Mind sense: none');
    expect(p.system).toContain('ONLY a JSON array');
    expect(p.ids.get('b1')).toBe('violet');
  });

  it('parse tolerates chatter around the array and rejects bad shapes', () => {
    expect(parseReachOutput('Here you go: [{"id":"b1","reach":true,"via":["sight"],"noticed":true,"salience":1}] done')).toHaveLength(1);
    expect(() => parseReachOutput('[]')).toThrow();
    expect(() => parseReachOutput('[{"id":"b1","reach":true,"noticed":true,"salience":2}]')).toThrow(/validation/);
  });
});
