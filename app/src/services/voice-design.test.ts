import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('server-only', () => ({}));
const findUnique = vi.fn();
const update = vi.fn();
vi.mock('@/lib/db', () => ({ prisma: { character: { findUnique: (a: unknown) => findUnique(a), update: (a: unknown) => update(a) } } }));

import {
  describeVoiceFromSheet, designVoiceForCharacter, setVoiceForCharacter, clearVoiceForCharacter,
} from './voice-design';
import { NotFoundError, ServiceUnavailableError } from '@/lib/errors';
import { fnv1a } from '@/lib/speech-voices';

const realFetch = global.fetch;
beforeEach(() => { findUnique.mockReset(); update.mockReset(); });
afterEach(() => { global.fetch = realFetch; });

// Trimmed from the real rows (dev.db, 2026-11-05).
const violet = {
  id: 'cms60ndtn0000kw48ioq10i68', name: 'Violet',
  data: {
    identity: { name: 'Violet', age: 25, physicalDescription: { gender: 'Female', build: 'Petite', skinTone: 'Fair' } },
    creation: { seed: { name: 'Human' } },
    traits: [
      { name: 'Sealed Threshold', type: 'thorn' }, { name: 'Fractured Continuity', type: 'thorn' }, { name: 'Written Self', type: 'thorn' },
    ],
  },
};
const kristopher = {
  id: 'cmvcbw49u0001h448qanzbhs3', name: 'Kristopher',
  data: {
    identity: {
      name: 'Kristopher', age: 40, sex: 'Male', physicalDescription: { gender: 'Male' },
      description: 'Pizza delivery driver, forty but looks mid-twenties. Always stays a few seconds longer than the delivery needs.',
    },
    creation: { seed: { name: 'Human' } },
    traits: [
      { name: 'Hypervigilance Architecture', type: 'thorn' }, { name: 'Ageless Face', type: 'nectar' },
      { name: 'Fractured Witness', type: 'thorn' }, { name: 'Moral Injury', type: 'thorn' },
    ],
  },
};

describe('describeVoiceFromSheet', () => {
  it('Violet', () => {
    expect(describeVoiceFromSheet(violet)).toBe(
      'A woman in her mid-twenties, petite build, human. Shaped by Sealed Threshold, Fractured Continuity and Written Self.',
    );
  });
  it('Kristopher', () => {
    expect(describeVoiceFromSheet(kristopher)).toBe(
      'A man in his early-forties, human. Pizza delivery driver, forty but looks mid-twenties. Always stays a few seconds longer than the delivery needs. Shaped by Hypervigilance Architecture, Ageless Face and Fractured Witness.',
    );
  });
  it('falls back on an empty sheet and is deterministic', () => {
    const c = { id: 'x', name: 'X', data: {} };
    expect(describeVoiceFromSheet(c)).toBe('An adult voice, natural and clear.');
    expect(describeVoiceFromSheet(violet)).toBe(describeVoiceFromSheet(violet));
  });
});

const row = (data: unknown) => ({ id: 'c1', name: 'Ada', data: JSON.stringify(data) });

describe('designVoiceForCharacter', () => {
  it('posts to the design endpoint and saves a qwen spec, keeping other data', async () => {
    findUnique.mockResolvedValue(row({ identity: { age: 30 }, notes: 'keep' }));
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'ref-9', seconds: 3, sample_rate: 24000, preview_wav_base64: 'AAAA' }), { status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const r = await designVoiceForCharacter('c1', { preset: 'ghostly' });
    expect(fetchMock.mock.calls[0][0]).toBe('http://127.0.0.1:9001/v1/voices/design');
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sent.seed).toBe(fnv1a('c1'));
    expect(sent.text).toBe('Ada here. Say what you came to say.');
    expect(sent.fx).toBe('ghostly');
    expect(r.previewWavBase64).toBe('AAAA');
    expect(r.spec).toMatchObject({ engine: 'qwen', ref: 'ref-9', preset: 'ghostly', seed: fnv1a('c1') });
    const saved = JSON.parse(update.mock.calls[0][0].data.data);
    expect(saved.notes).toBe('keep');
    expect(saved.voice.ref).toBe('ref-9');
  });
  it('maps 503 and network errors to ServiceUnavailableError', async () => {
    findUnique.mockResolvedValue(row({}));
    global.fetch = vi.fn().mockResolvedValue(new Response('', { status: 503 })) as unknown as typeof fetch;
    await expect(designVoiceForCharacter('c1')).rejects.toBeInstanceOf(ServiceUnavailableError);
    global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch;
    await expect(designVoiceForCharacter('c1')).rejects.toBeInstanceOf(ServiceUnavailableError);
    expect(update).not.toHaveBeenCalled();
  });
  it('NotFoundError for an unknown character', async () => {
    findUnique.mockResolvedValue(null);
    await expect(designVoiceForCharacter('nope')).rejects.toBeInstanceOf(NotFoundError);
  });
});

describe('setVoiceForCharacter / clearVoiceForCharacter', () => {
  it('merges into an existing spec', async () => {
    findUnique.mockResolvedValue(row({ voice: { engine: 'qwen', ref: 'r1' } }));
    const spec = await setVoiceForCharacter('c1', { preset: 'giant', lockedAt: 'now' });
    expect(spec).toEqual({ engine: 'qwen', ref: 'r1', preset: 'giant', lockedAt: 'now' });
    expect(JSON.parse(update.mock.calls[0][0].data.data).voice).toEqual(spec);
  });
  it('creates a kokoro spec when none exists', async () => {
    findUnique.mockResolvedValue(row({ a: 1 }));
    const spec = await setVoiceForCharacter('c1', { voice: 'bm_george', fx: { pitch: -2 } });
    expect(spec).toEqual({ engine: 'kokoro', voice: 'bm_george', fx: { pitch: -2 } });
    expect(JSON.parse(update.mock.calls[0][0].data.data).a).toBe(1);
  });
  it('clear deletes data.voice only', async () => {
    findUnique.mockResolvedValue(row({ a: 1, voice: { engine: 'qwen', ref: 'r1' } }));
    await clearVoiceForCharacter('c1');
    expect(JSON.parse(update.mock.calls[0][0].data.data)).toEqual({ a: 1 });
  });
});
