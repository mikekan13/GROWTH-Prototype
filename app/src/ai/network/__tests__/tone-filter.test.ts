import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const chatMock = vi.fn();
vi.mock('../transports/openai-compat', () => ({ openAiCompatChat: (...a: unknown[]) => chatMock(...a) }));
vi.mock('../metering', () => ({ recordAiCall: vi.fn() }));

import {
  toneFilter, toneFilterAsync, toneFilterStats, resetToneFilter, screen, chunk, placeholderFor,
} from '../tone-filter';

const LOCAL_VARS = ['AI_LOCAL_BASE_URL', 'DAYA_L1_URL'];
let saved: Record<string, string | undefined> = {};

const usage = { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheWriteTokens: 0 };
const reply = (text: string) => ({ text, model: 'local', usage });

const CLEAN = 'Tara walked the mill road at dusk, counting the lanterns. [scene-3] She did not look back.';
const GRAPHIC =
  'In the cellar they tortured him for three days, peeling the skin from his fingers until he begged. [mem-7] {gap} __DAYA_TAG Kai never spoke of it again.';
const SOFT =
  'In the cellar he was subjected to prolonged violence over three days that left his hands permanently scarred. [mem-7] {gap} __DAYA_TAG Kai never spoke of it again.';

beforeEach(() => {
  saved = Object.fromEntries(LOCAL_VARS.map((k) => [k, process.env[k]]));
  for (const k of LOCAL_VARS) delete process.env[k];
  process.env.AI_LOCAL_BASE_URL = 'http://local.test/v1';
  chatMock.mockReset();
  resetToneFilter();
  vi.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => {
  for (const k of LOCAL_VARS) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.restoreAllMocks();
});

describe('screen()', () => {
  it('passes ordinary fiction, including plain violence words used in rulings', () => {
    expect(screen(CLEAN).hitCount).toBe(0);
    expect(screen('He was subjected to prolonged violence over three days.').hitCount).toBe(0);
  });
  it('flags each category', () => {
    expect(screen(GRAPHIC).categories).toContain('torture');
    expect(screen('Her entrails spilled across the floor.').categories).toContain('gore');
    expect(screen('They undressed and made love.').categories).toContain('sexual');
    expect(screen('He raped her.').categories).toContain('sexual-violence');
  });
});

describe('toneFilterAsync()', () => {
  it('clean text short-circuits with no model call', async () => {
    expect(await toneFilterAsync(CLEAN, { caller: 't' })).toBe(CLEAN);
    expect(chatMock).not.toHaveBeenCalled();
    expect(toneFilterStats().cleanTexts).toBe(1);
  });

  it('flagged text calls local once, then the result is cached', async () => {
    chatMock.mockResolvedValue(reply(SOFT));
    expect(await toneFilterAsync(GRAPHIC, { caller: 't' })).toBe(SOFT);
    expect(await toneFilterAsync(GRAPHIC, { caller: 't' })).toBe(SOFT);
    expect(chatMock).toHaveBeenCalledTimes(1);
    expect(toneFilterStats().cacheHits).toBe(1);
    // enable_thinking:false is set by the transport; the call carries a ~20 s cap.
    expect(chatMock.mock.calls[0][0].timeoutMs).toBe(20_000);
  });

  it('softened output passes the sync door untouched (no double filter)', async () => {
    chatMock.mockResolvedValue(reply(SOFT));
    const out = await toneFilterAsync(GRAPHIC, { caller: 't' });
    expect(toneFilter(out)).toBe(out);
    expect(toneFilter(GRAPHIC)).toBe(SOFT); // sync door hits the cache
  });

  it.each([
    ['error', () => chatMock.mockRejectedValue(new Error('boom'))],
    ['empty', () => chatMock.mockResolvedValue(reply('   '))],
    ['too short', () => chatMock.mockResolvedValue(reply('He was hurt.'))],
    ['markers lost', () => chatMock.mockResolvedValue(reply(SOFT.replace('[mem-7] ', '')))],
  ])('filter failure (%s) returns the placeholder, never the original', async (_n, arrange) => {
    arrange();
    const out = await toneFilterAsync(GRAPHIC, { caller: 't' });
    expect(out).not.toContain('peeling the skin');
    expect(out).toMatch(/^\[passage withheld: graphic content \(torture\); severity high; duration three days\]/);
    expect(toneFilterStats().withheld).toBe(1);
  });

  it('no local lane fails closed without a call', async () => {
    delete process.env.AI_LOCAL_BASE_URL;
    const out = await toneFilterAsync(GRAPHIC, { caller: 't' });
    expect(out).toBe(placeholderFor(GRAPHIC));
    expect(chatMock).not.toHaveBeenCalled();
  });

  it('markers survive both the softened and the withheld path', async () => {
    chatMock.mockResolvedValue(reply(SOFT));
    const ok = await toneFilterAsync(GRAPHIC, { caller: 't' });
    resetToneFilter();
    delete process.env.AI_LOCAL_BASE_URL;
    const withheld = await toneFilterAsync(GRAPHIC, { caller: 't' });
    for (const m of ['[mem-7]', '{gap}', '__DAYA_TAG']) {
      expect(ok).toContain(m);
      expect(withheld).toContain(m);
    }
  });

  it('chunks long text, filters only flagged chunks, and preserves order', async () => {
    const filler = (n: number) => `Paragraph ${n}. ` + 'The river ran slow past the mill. '.repeat(40);
    const paras = [filler(1), filler(2), GRAPHIC, filler(4), filler(5)];
    const text = paras.join('\n\n');
    const chunks = chunk(text);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join('')).toBe(text);
    expect(chunks.every((c) => c.length <= 2500)).toBe(true);

    chatMock.mockImplementation(async (opts: { messages: Array<{ content: string }> }) => {
      const passage = opts.messages[1].content.replace(/^Passage:\n\n/, '');
      return reply(passage.replace(GRAPHIC, SOFT));
    });
    const out = await toneFilterAsync(text, { caller: 't' });
    expect(chatMock).toHaveBeenCalledTimes(1);
    expect(out).toBe(paras.join('\n\n').replace(GRAPHIC, SOFT));
    expect(out.indexOf('Paragraph 1')).toBeLessThan(out.indexOf('Paragraph 2'));
    expect(out.indexOf('Paragraph 2')).toBeLessThan(out.indexOf('prolonged violence'));
    expect(out.indexOf('prolonged violence')).toBeLessThan(out.indexOf('Paragraph 4'));
  });
});

describe('toneFilter() — the sync door', () => {
  it('withholds an unsoftened flagged chunk now and softens it in the background', async () => {
    chatMock.mockResolvedValue(reply(SOFT));
    const first = toneFilter(GRAPHIC, { caller: 't' });
    expect(first).toBe(placeholderFor(GRAPHIC));
    await vi.waitFor(() => expect(toneFilterStats().softened).toBe(1));
    expect(toneFilter(GRAPHIC, { caller: 't' })).toBe(SOFT);
    expect(chatMock).toHaveBeenCalledTimes(1);
  });

  it('clean text passes unchanged with no call', () => {
    expect(toneFilter(CLEAN)).toBe(CLEAN);
    expect(chatMock).not.toHaveBeenCalled();
  });
});
