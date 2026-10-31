import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ prisma: {} }));
vi.mock('@/daya/timeskip', () => ({ runTimeSkip: vi.fn() }));
vi.mock('@/services/stretch-live', () => ({ liveStretch: vi.fn(), STRETCH_MIN_SECONDS: 3600 }));
vi.mock('@/services/time', () => ({ ensureDefaultTimescale: vi.fn() }));
vi.mock('@/daya/events', () => ({ isDayaEnabled: () => false }));
vi.mock('@/services/campaign-event', () => ({ createCampaignEvent: vi.fn() }));
vi.mock('@/lib/campaign-stream', () => ({ broadcastEvent: vi.fn() }));

import { statedStretchOf, TIMESKIP_MIN_SECONDS } from './table-timeskip';

describe('a stated span long enough is lived, not skipped (Mike 2026-10-24)', () => {
  it('three stated days → a stretch in words', () => {
    expect(statedStretchOf({ seconds: 3 * 86400, source: 'stated' })).toEqual({ seconds: 259200, span: 'about 3 days' });
  });
  it('two stated hours → lived', () => {
    expect(statedStretchOf({ seconds: 2 * 3600, source: 'stated' })?.seconds).toBe(7200);
  });
  it('a stated ten minutes is a pause, not a stretch', () => {
    expect(statedStretchOf({ seconds: 600, source: 'stated' })).toBeNull();
    expect(TIMESKIP_MIN_SECONDS).toBe(3600);
  });
  it("the sim's own estimate never triggers it, nor a skipped advance", () => {
    expect(statedStretchOf({ seconds: 5 * 3600, source: 'plausible' })).toBeNull();
    expect(statedStretchOf({ seconds: 5 * 3600, source: 'stated', skipped: 'encounter' })).toBeNull();
  });
});
