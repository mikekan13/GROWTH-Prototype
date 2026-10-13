import { describe, it, expect, vi, afterEach, beforeAll, beforeEach } from 'vitest';
import sharp from 'sharp';

vi.mock('@/ai/network/metering', () => ({ recordAiCall: vi.fn(), estimateUsd: vi.fn(() => 0) }));

import { checkBaseLock, gateUnavailable, isLocalVisionHost, lockGateEnabled, parseGateVerdict } from './lock-gate';

const POD_URL = 'https://api.runpod.ai/v2/testendpoint/openai/v1';
const ENV = ['QWEN21_LOCK_GATE', 'VISION_PROVIDER', 'AI_LOCAL_BASE_URL', 'DAYA_L1_URL', 'AI_LOCAL_MODEL', 'DAYA_L1_MODEL', 'AI_LOCAL_API_KEY', 'DAYA_L1_API_KEY', 'RUNPOD_API_KEY', 'OLLAMA_URL', 'OLLAMA_BASE_URL'];
let saved: Record<string, string | undefined> = {};

let png: Buffer;
beforeAll(async () => {
  png = await sharp({ create: { width: 32, height: 32, channels: 3, background: { r: 120, g: 110, b: 100 } } }).png().toBuffer();
});
beforeEach(() => {
  saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
  for (const k of ENV) delete process.env[k];
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
});

const openAiReply = (content: string) =>
  new Response(JSON.stringify({ model: 'growth-local', choices: [{ message: { content } }], usage: { prompt_tokens: 1, completion_tokens: 1 } }));

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

describe('checkBaseLock — default provider is the pod, never localhost', () => {
  it('with VISION_PROVIDER unset the image goes to the text lane as an OpenAI image_url part', async () => {
    process.env.AI_LOCAL_BASE_URL = POD_URL;
    process.env.AI_LOCAL_MODEL = 'growth-local';
    const fetchMock = vi.fn(async () => openAiReply('{"clothed": true, "tilted": false, "framing_ok": true, "eyes_ok": true}'));
    vi.stubGlobal('fetch', fetchMock);
    const v = await checkBaseLock(png);
    expect(v.pass).toBe(false);
    expect(v.reasons).toEqual(['clothed (garment, strap or jewellery visible)']);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`${POD_URL}/chat/completions`);
    expect(url).not.toMatch(/localhost|127\.0\.0\.1|11434/);
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe('growth-local');
    expect(body.messages).toHaveLength(1);
    const parts = body.messages[0].content as Array<{ type: string; image_url?: { url: string }; text?: string }>;
    expect(parts.map(p => p.type)).toEqual(['image_url', 'text']);
    expect(parts[0].image_url!.url).toMatch(/^data:image\/jpeg;base64,/);
    expect(parts[1].text).toContain('clothed');
  });

  it('pod not configured → fail-open without any request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const v = await checkBaseLock(png);
    expect(v).toMatchObject({ pass: true, unavailable: true });
    expect(v.reasons[0]).toMatch(/gate unavailable: .*local lane is not configured/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('timeout → fail-open', async () => {
    process.env.AI_LOCAL_BASE_URL = POD_URL;
    vi.stubGlobal('fetch', vi.fn(async () => { const e = new Error('timed out'); e.name = 'TimeoutError'; throw e; }));
    const v = await checkBaseLock(png);
    expect(v.pass).toBe(true);
    expect(v.reasons[0]).toMatch(/gate unavailable: timeout/);
  });

  it('HTTP error and junk reply → fail-open', async () => {
    process.env.AI_LOCAL_BASE_URL = POD_URL;
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"error":"boom"}', { status: 500 })));
    expect((await checkBaseLock(png)).pass).toBe(true);
    vi.stubGlobal('fetch', vi.fn(async () => openAiReply('no idea')));
    const v = await checkBaseLock(png);
    expect(v).toMatchObject({ pass: true, unavailable: true });
  });
});

describe('checkBaseLock — VISION_PROVIDER=ollama (explicit opt-in)', () => {
  it('posts the image to local Ollama and parses the verdict', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ response: '{"clothed": true, "tilted": false, "framing_ok": true, "eyes_ok": true}' })));
    vi.stubGlobal('fetch', fetchMock);
    const v = await checkBaseLock(png, { provider: 'ollama', ollamaUrl: 'http://127.0.0.1:11434', model: 'qwen2.5vl:7b' });
    expect(v.pass).toBe(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://127.0.0.1:11434/api/generate');
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe('qwen2.5vl:7b');
    expect(body.images).toHaveLength(1);
    expect(body.format).toBe('json');
  });

  it('a non-local Ollama host is refused without any request (privacy wall)', async () => {
    process.env.VISION_PROVIDER = 'ollama';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const v = await checkBaseLock(png, { ollamaUrl: 'https://vision.example.com' });
    expect(v.pass).toBe(true);
    expect(v.reasons[0]).toMatch(/not local/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('checkBaseLock — VISION_PROVIDER=claude (explicit opt-in, fiction only)', () => {
  it('a lock is a real-person image: Claude is refused (wall) and the gate fails open, no request', async () => {
    process.env.VISION_PROVIDER = 'claude';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const v = await checkBaseLock(png);
    expect(v).toMatchObject({ pass: true, unavailable: true });
    expect(v.reasons[0]).toMatch(/refused/);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fiction images do reach Claude as an image block, audited', async () => {
    process.env.VISION_PROVIDER = 'claude';
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const { describeImage } = await import('@/ai/network/vision');
    const create = vi.fn(async () => ({ model: 'claude-x', content: [{ type: 'text', text: '{"clothed": false, "tilted": true, "framing_ok": true, "eyes_ok": true}' }], usage: { input_tokens: 1, output_tokens: 1 } }));
    const res = await describeImage({ caller: 't', contentClass: 'fiction', prompt: 'p', image: png, anthropicClient: { messages: { create } } });
    expect(res.provider).toBe('claude');
    expect(parseGateVerdict(res.text).reasons[0]).toMatch(/^off-pose/);
    const sent = (create.mock.calls[0] as unknown[])[0] as { messages: Array<{ content: Array<{ type: string }> }> };
    expect(sent.messages[0].content.map(b => b.type)).toEqual(['image', 'text']);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(console.info).toHaveBeenCalledWith(expect.stringContaining('[wall→cloud] caller=t lane=vision class=fiction'));
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
