import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('server-only', () => ({}));
const findUnique = vi.fn();
vi.mock('@/lib/db', () => ({ prisma: { character: { findUnique: (a: unknown) => findUnique(a) } } }));

import { synthesizeSpeech, voiceForCharacterId } from './speech';
import { NotFoundError } from '@/lib/errors';
import { NARRATOR_VOICE } from '@/lib/speech-voices';

const realFetch = global.fetch;
beforeEach(() => { findUnique.mockReset(); });
afterEach(() => { global.fetch = realFetch; });

describe('synthesizeSpeech', () => {
  it('returns bytes and seconds on success', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { 'X-Audio-Seconds': '1.5' } }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const r = await synthesizeSpeech({ text: 'hi', voice: 'af_heart', speed: 1.1 });
    expect(r.ok).toBe(true);
    if (r.ok) { expect(r.body.byteLength).toBe(3); expect(r.seconds).toBe(1.5); }
    const sent = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(sent).toEqual({ input: 'hi', voice: 'af_heart', speed: 1.1, response_format: 'wav' });
  });
  it('reports a non-2xx reply', async () => {
    global.fetch = vi.fn().mockResolvedValue(new Response('boom', { status: 500 })) as unknown as typeof fetch;
    const r = await synthesizeSpeech({ text: 'hi', voice: 'af_heart' });
    expect(r).toEqual({ ok: false, status: 500, detail: 'boom' });
  });
  it('reports a network failure', async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error('ECONNREFUSED')) as unknown as typeof fetch;
    const r = await synthesizeSpeech({ text: 'hi', voice: 'af_heart' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.detail).toContain('ECONNREFUSED');
  });
});

describe('voiceForCharacterId', () => {
  it('narrator when no id', async () => {
    expect(await voiceForCharacterId(null)).toBe(NARRATOR_VOICE);
  });
  it('throws NotFoundError for an unknown character', async () => {
    findUnique.mockResolvedValue(null);
    await expect(voiceForCharacterId('x')).rejects.toBeInstanceOf(NotFoundError);
  });
  it('uses gender from data and tolerates bad JSON', async () => {
    findUnique.mockResolvedValue({ id: 'c1', data: JSON.stringify({ gender: 'Male' }) });
    expect(['am_adam', 'am_michael', 'am_liam', 'bm_george', 'bm_lewis']).toContain(await voiceForCharacterId('c1'));
    findUnique.mockResolvedValue({ id: 'c2', data: '{nope' });
    expect(typeof (await voiceForCharacterId('c2'))).toBe('string');
  });
});
