import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';
import sharp from 'sharp';
import { checkBaseLock, gateUnavailable, isLocalVisionHost, lockGateEnabled, parseGateVerdict } from './lock-gate';

let png: Buffer;
beforeAll(async () => {
  png = await sharp({ create: { width: 32, height: 32, channels: 3, background: { r: 120, g: 110, b: 100 } } }).png().toBuffer();
});
afterEach(() => { vi.unstubAllGlobals(); delete process.env.QWEN21_LOCK_GATE; });

describe('parseGateVerdict', () => {
  it('bare + square + framed + eyes → pass, score 1', () => {
    const v = parseGateVerdict('{"clothed": false, "tilted": false, "framing_ok": true, "eyes_ok": true}');
    expect(v).toEqual({ pass: true, reasons: [], score: 1 });
  });

  it('clothed + tilted → fail with both reasons, score 0.5', () => {
    const v = parseGateVerdict('{"clothed": true, "tilted": true, "framing_ok": true, "eyes_ok": true}');
    expect(v.pass).toBe(false);
    expect(v.reasons).toHaveLength(2);
    expect(v.reasons[0]).toMatch(/^clothed/);
    expect(v.reasons[1]).toMatch(/^off-pose/);
    expect(v.score).toBe(0.5);
  });

  it('tolerates code fences, prose and string booleans', () => {
    const v = parseGateVerdict('Sure!\n```json\n{"clothed": "yes", "tilted": "no", "framing_ok": "true", "eyes_ok": 1}\n```');
    expect(v.pass).toBe(false);
    expect(v.reasons).toEqual(['clothed (garment, strap or jewellery visible)']);
    expect(v.score).toBe(0.75);
  });

  it('junk → fail-open (pass, gate unavailable)', () => {
    for (const junk of ['', 'I cannot help with that', '{not json', '[1,2]', '{"foo": 1}']) {
      const v = parseGateVerdict(junk);
      expect(v.pass).toBe(true);
      expect(v.unavailable).toBe(true);
      expect(v.reasons[0]).toMatch(/^gate unavailable/);
    }
  });

  it('one unreadable key is not counted against the image', () => {
    const v = parseGateVerdict('{"clothed": false, "tilted": "maybe", "framing_ok": true, "eyes_ok": true}');
    expect(v.pass).toBe(true);
    expect(v.score).toBe(1);
  });
});

describe('isLocalVisionHost (privacy wall)', () => {
  it('loopback / private / tailnet are local; public hosts are not', () => {
    for (const u of ['http://127.0.0.1:11434', 'http://localhost:11434', 'http://[::1]:11434', 'http://192.168.1.5:11434', 'http://10.0.0.2', 'http://172.20.1.1', 'http://100.101.2.3', 'https://box.taila59e25.ts.net']) {
      expect(isLocalVisionHost(u)).toBe(true);
    }
    for (const u of ['https://api.anthropic.com', 'https://api.runpod.ai/v2/x', 'http://8.8.8.8', 'not a url']) {
      expect(isLocalVisionHost(u)).toBe(false);
    }
  });
});

describe('checkBaseLock (fetch stubbed)', () => {
  it('posts the image to local Ollama and parses the verdict', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ response: '{"clothed": true, "tilted": false, "framing_ok": true, "eyes_ok": true}' })));
    vi.stubGlobal('fetch', fetchMock);
    const v = await checkBaseLock(png, { ollamaUrl: 'http://127.0.0.1:11434', model: 'qwen2.5vl:7b' });
    expect(v.pass).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://127.0.0.1:11434/api/generate');
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe('qwen2.5vl:7b');
    expect(body.images).toHaveLength(1);
    expect(body.format).toBe('json');
  });

  it('timeout → fail-open', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => { const e = new Error('timed out'); e.name = 'TimeoutError'; throw e; }));
    const v = await checkBaseLock(png, { ollamaUrl: 'http://127.0.0.1:11434' });
    expect(v.pass).toBe(true);
    expect(v.reasons[0]).toMatch(/gate unavailable: timeout/);
  });

  it('HTTP error and junk reply → fail-open', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('boom', { status: 500 })));
    expect((await checkBaseLock(png, { ollamaUrl: 'http://127.0.0.1:11434' })).pass).toBe(true);
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ response: 'no idea' }))));
    const v = await checkBaseLock(png, { ollamaUrl: 'http://127.0.0.1:11434' });
    expect(v).toMatchObject({ pass: true, unavailable: true });
  });

  it('a non-local vision host is refused without any request (privacy wall)', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const v = await checkBaseLock(png, { ollamaUrl: 'https://vision.example.com' });
    expect(v.pass).toBe(true);
    expect(v.reasons[0]).toMatch(/not local/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('lockGateEnabled', () => {
  it('on by default; QWEN21_LOCK_GATE=off bypasses', () => {
    expect(lockGateEnabled()).toBe(true);
    process.env.QWEN21_LOCK_GATE = 'off';
    expect(lockGateEnabled()).toBe(false);
  });
  it('gateUnavailable is a pass', () => {
    expect(gateUnavailable('x')).toMatchObject({ pass: true, score: 1 });
  });
});
