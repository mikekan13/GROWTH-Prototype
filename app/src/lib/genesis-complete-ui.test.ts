import { describe, it, expect } from 'vitest';
import { shouldShowComplete, formatCompleteResult, requestComplete } from './genesis-complete-ui';

const base = { isGM: true, genesisRunning: false };

describe('shouldShowComplete', () => {
  it('needs GM, born, not running', () => {
    expect(shouldShowComplete({ ...base, genesisState: 'done' })).toBe(true);
    expect(shouldShowComplete({ ...base, characterStatus: 'ACTIVE' })).toBe(true);
    expect(shouldShowComplete({ ...base, genesisTier: 'SKETCH' })).toBe(true);
    expect(shouldShowComplete({ ...base, isGM: false, genesisState: 'done' })).toBe(false);
    expect(shouldShowComplete({ ...base, genesisRunning: true, genesisState: 'done' })).toBe(false);
    expect(shouldShowComplete({ ...base, genesisState: 'none', characterStatus: 'DRAFT' })).toBe(false);
    expect(shouldShowComplete({ ...base, genesisState: 'done', hasCharacter: false })).toBe(false);
  });
});

describe('formatCompleteResult', () => {
  it('opened', () => {
    expect(formatCompleteResult({ opened: true, sessionId: 's', stages: ['AGE', 'VINES'], removedDuplicateLinks: 0, seedCorrections: [] }))
      .toBe('JEWL is completing: AGE → VINES');
    expect(formatCompleteResult({ opened: true, sessionId: 's', stages: ['AGE'], removedDuplicateLinks: 1, seedCorrections: ['Fate Die d6'] }))
      .toBe('JEWL is completing: AGE. Seed corrections: Fate Die d6');
  });
  it('not opened', () => {
    expect(formatCompleteResult({ opened: false, sessionId: null, stages: [], removedDuplicateLinks: 2, seedCorrections: [] }))
      .toBe('Nothing missing — 2 duplicate links removed, corrections: none');
    expect(formatCompleteResult({ opened: false, sessionId: null, stages: [], removedDuplicateLinks: 0, seedCorrections: [] }))
      .toBe('Already complete');
  });
});

describe('requestComplete', () => {
  const mk = (status: number, body: unknown) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
  it('409 shows server message', async () => {
    expect(await requestComplete('c', mk(409, { error: 'Genesis is already running' }))).toEqual({ ok: false, line: 'Genesis is already running' });
  });
  it('500 never bare', async () => {
    const r = await requestComplete('c', mk(500, { error: 'Internal server error' }));
    expect(r.ok).toBe(false);
    expect(r.line).toContain('HTTP 500');
  });
  it('success opened', async () => {
    const r = await requestComplete('c', mk(200, { opened: true, sessionId: 's', stages: ['AGE'], removedDuplicateLinks: 0, seedCorrections: [] }));
    expect(r).toEqual({ ok: true, opened: true, line: 'JEWL is completing: AGE' });
  });
});
