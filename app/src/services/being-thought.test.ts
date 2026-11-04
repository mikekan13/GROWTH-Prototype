import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('server-only', () => ({}));
const findUnique = vi.fn();
const update = vi.fn();
vi.mock('@/lib/db', () => ({ prisma: { campaignEvent: { findUnique: (...a: unknown[]) => findUnique(...a), update: (...a: unknown[]) => update(...a) } } }));
vi.mock('@/services/campaign-event', () => ({ createCampaignEvent: vi.fn() }));
const broadcastEvent = vi.fn();
vi.mock('@/lib/campaign-stream', () => ({ broadcastEvent: (...a: unknown[]) => broadcastEvent(...a) }));

import { appendBeingCardSegments } from './being-thought';

const row = (payload: unknown) => ({ id: 'e1', createdAt: new Date('2026-11-04T00:00:00Z'), payload: JSON.stringify(payload), actorUserId: 'u', actorName: 'n', characterId: 'c', characterName: 'Violet' });

describe('appendBeingCardSegments', () => {
  beforeEach(() => { findUnique.mockReset(); update.mockReset(); broadcastEvent.mockReset(); });

  it('appends a new action segment, sets impulse, writes and pushes', async () => {
    findUnique.mockResolvedValue(row({ impulse: 'stay', segments: [{ kind: 'thought', text: 'hmm' }] }));
    await appendBeingCardSegments('camp', 'e1', [{ kind: 'action', text: 'answers the phone' }], 'act');
    expect(update).toHaveBeenCalledTimes(1);
    const written = JSON.parse(update.mock.calls[0][0].data.payload);
    expect(written.impulse).toBe('act');
    expect(written.segments.map((s: { kind: string; text: string }) => [s.kind, s.text])).toEqual([['thought', 'hmm'], ['action', 'answers the phone']]);
    expect(broadcastEvent).toHaveBeenCalledTimes(1);
  });

  it('does not append a duplicate (trimmed) and writes nothing', async () => {
    findUnique.mockResolvedValue(row({ segments: [{ kind: 'thought', text: 'hmm' }] }));
    await appendBeingCardSegments('camp', 'e1', [{ kind: 'action', text: '  hmm ' }], 'act');
    expect(update).not.toHaveBeenCalled();
    expect(broadcastEvent).not.toHaveBeenCalled();
  });

  it('is a no-op when the event is missing', async () => {
    findUnique.mockResolvedValue(null);
    await appendBeingCardSegments('camp', 'nope', [{ kind: 'action', text: 'x' }], 'act');
    expect(update).not.toHaveBeenCalled();
    expect(broadcastEvent).not.toHaveBeenCalled();
  });
});
