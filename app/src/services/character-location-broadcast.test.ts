import { describe, it, expect, vi } from 'vitest';

const h = vi.hoisted(() => ({ broadcast: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/campaign-stream', () => ({ broadcastEvent: h.broadcast }));
vi.mock('@/lib/permissions', () => ({ canEditCharacter: () => true }));
vi.mock('@/services/canvas-placement', () => ({ snapCharacterToLocation: vi.fn() }));
vi.mock('@/lib/db', () => {
  const tx = {
    entityRelationship: {
      findMany: async () => [{ id: 'r1', targetId: 'main' }],
      deleteMany: async () => ({}),
      create: async () => ({}),
    },
  };
  return {
    prisma: {
      character: { findUnique: async () => ({ id: 'vi', campaignId: 'c1', campaign: { gmUserId: 'gm', id: 'c1' } }) },
      location: { findUnique: async () => ({ id: 'bath', campaignId: 'c1' }) },
      $transaction: async (fn: (t: typeof tx) => unknown) => fn(tx),
    },
  };
});

import { moveCharacterToLocation } from './character-location';

describe('a room move redraws every canvas', () => {
  it('broadcasts map_changed with both rooms and the character', async () => {
    await moveCharacterToLocation('gm', 'WATCHER', { characterId: 'vi', locationId: 'bath' });
    expect(h.broadcast).toHaveBeenCalledWith('c1', { kind: 'map_changed', locationIds: ['main', 'bath'], characterIds: ['vi'] });
  });
});
