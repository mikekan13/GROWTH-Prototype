import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('server-only', () => ({}));
const findUnique = vi.fn();
vi.mock('@/lib/db', () => ({ prisma: { character: { findUnique: (a: unknown) => findUnique(a) } } }));

import { synthesizeSpeech, voiceSpecForCharacterId, voiceForCharacterId } from './speech';
import { NotFoundError } from '@/lib/errors';
import { NARRATOR_VOICE } from '@/lib/speech-voices';

const realFetch = global.fetch;
beforeEach(() => { findUnique.mockReset(); });
afterEach(() => { global.fetch = realFetch; });

const af = { engine: 'kokoro' as const, voice: 'af_heart' };

describe('synthesizeSpeech', () => {
  it('returns bytes, seconds, engine and fx on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), {
      status: 200, headers: { 'X-Audio-Seconds': '1.5', 'X-Engine': 'kokoro', 'X-Fx': 'human' },
    }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const r = await synthesizeSpeech({ text: 'hi', spec: af, speed: 1.1 });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.body.byteLength).toBe(3);
      expect(r.seconds).toBe(1.5);
      expect(r.engine).toBe('kokoro');
      expect(r.fx).toBe('human');
    }
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sent).toEqual({ input: 'hi', voice: 'af_heart', speed: 1.1, response_format: 'wav' });
  });
  it('sends voice_ref and preset, no kokoro voice, for a designed voice', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(new Uint8Array([1]), { status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;
    await synthesizeSpeech({ text: 'hi', spec: { engine: 'qwen', ref: 'r1', voice: 'af_heart', preset: 'ghostly' } });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ input: 'hi', voice_ref: 'r1', fx: 'ghostly', speed: 1, response_format: 'wav' });
  });
  it('prefers explicit fx params over the preset', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(new Uint8Array([1]), { status: 200 }));
    global.fetch = fetchMock as unknown as typeof fetch;
    await synthesizeSpeech({ text: 'hi', spec: { ...af, preset: 'giant', fx: { pitch: -4 } } });
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).fx).toEqual({ pitch: -4 });
  });
  it('reports a non-2xx reply', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response('boom', { status: 500 })) as unknown as typeof fetch;
    const r = await synthesizeSpeech({ text: 'hi', spec: af });
    expect(r).toEqual({ ok: false, status: 500, detail: 'boom' });
  });
  it('reports a network failure', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch;
    const r = await synthesizeSpeech({ text: 'hi', spec: af });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.detail).toContain('ECONNREFUSED');
  });
});

describe('voiceSpecForCharacterId', () => {
  it('narrator when no id', async () => {
    expect(await voiceSpecForCharacterId(null)).toEqual({ engine: 'kokoro', voice: NARRATOR_VOICE });
  });
  it('keeps the old name as an alias', () => {
    expect(voiceForCharacterId).toBe(voiceSpecForCharacterId);
  });
  it('throws NotFoundError for an unknown character', async () => {
    findUnique.mockResolvedValue(null);
    await expect(voiceSpecForCharacterId('x')).rejects.toBeInstanceOf(NotFoundError);
  });
  it('uses gender from the sheet and tolerates bad JSON', async () => {
    findUnique.mockResolvedValue({ id: 'c1', data: JSON.stringify({ identity: { physicalDescription: { gender: 'Male' } } }) });
    expect(['am_adam', 'am_michael', 'am_liam', 'bm_george', 'bm_lewis']).toContain((await voiceSpecForCharacterId('c1')).voice);
    findUnique.mockResolvedValue({ id: 'c2', data: '{nope' });
    expect(typeof (await voiceSpecForCharacterId('c2')).voice).toBe('string');
  });
  it('reads a designed voice from data.voice', async () => {
    findUnique.mockResolvedValue({ id: 'c3', data: JSON.stringify({ voice: { engine: 'qwen', ref: 'r1', preset: 'ghostly' } }) });
    expect(await voiceSpecForCharacterId('c3')).toEqual({ engine: 'qwen', ref: 'r1', preset: 'ghostly' });
  });
});
