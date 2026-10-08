import { describe, it, expect, vi } from 'vitest';
vi.mock('@/lib/db', () => ({ prisma: {} }));
vi.mock('@/lib/campaign-stream', () => ({ broadcastEvent: vi.fn() }));
import { encounterEventPayload } from './encounter';

describe('encounterEventPayload — the feed can fold an encounter begin → end (2026-10-08)', () => {
  it('carries which encounter the line belongs to', () => {
    expect(encounterEventPayload('encounter_begin', 'Encounter begins: Ambush. Six seconds at a time.', { id: 'enc-1', name: 'Ambush' }))
      .toEqual({ kind: 'game_event', eventType: 'encounter_begin', description: 'Encounter begins: Ambush. Six seconds at a time.', encounterId: 'enc-1', encounterName: 'Ambush' });
  });
  it('without an encounter it is the row it always was', () => {
    expect(encounterEventPayload('encounter_round', 'x')).toEqual({ kind: 'game_event', eventType: 'encounter_round', description: 'x' });
  });
});
