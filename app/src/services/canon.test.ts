import { describe, it, expect } from 'vitest';
import { roundLogToCanon } from './canon';
import type { RoundLogEntry } from '@/sim/round/types';

const log: RoundLogEntry[] = [
  { slot: 0, kind: 'order', actorId: null, targetId: null, text: 'Slot 1: A (10) → B (5)' },
  { slot: 0, kind: 'check', actorId: 'A', targetId: 'B', text: 'A swings (Sword): 14 vs DR 10 → HIT', narration: 'A swings at B — it connects', detail: { check: { total: 14 } } },
  { slot: 0, kind: 'damage', actorId: 'A', targetId: 'B', text: '6 slashing → B: Torso 3→2', narration: 'B is hurt — Torso', detail: { events: [{ partName: 'Torso' }], pool: ['celerity -6'] } },
  { slot: 1, kind: 'action', actorId: 'B', targetId: null, text: 'B moves: back toward the door', narration: 'B moves: back toward the door' },
  { slot: 1, kind: 'action', actorId: 'A', targetId: null, text: 'A keeps an action unassigned' }, // no narration → not canon
  { slot: 1, kind: 'downed', actorId: 'A', targetId: 'B', text: 'B goes down — Frequency is gone', narration: 'B goes down' },
];

describe('roundLogToCanon', () => {
  it('emits one canon event per narrated consequential entry, in order, with structured consequences', () => {
    const events = roundLogToCanon({ campaignId: 'c', cycle: 1.5, encounterId: 'e', round: 2, log, parentId: 'p' });
    expect(events.map(e => e.kind)).toEqual(['check', 'damage', 'move', 'downed']);
    expect(events.map(e => e.seq)).toEqual([0, 1, 2, 3]);
    expect(events.every(e => e.parentId === 'p' && e.sourceId === 'e' && e.cycle === 1.5)).toBe(true);
    expect(events[1].consequences).toEqual({ events: [{ partName: 'Torso' }], pool: ['celerity -6'] });
    expect(events[3].consequences).toEqual({ downed: 'B' });
    expect(events[0].narration).not.toMatch(/\d/); // canon narration is diegetic
    expect((events[0].detail as { text: string }).text).toMatch(/14 vs DR 10/); // the numbers live in detail
  });
  it('order lines and unnarrated bookkeeping are not events', () => {
    const events = roundLogToCanon({ campaignId: 'c', cycle: 0, encounterId: 'e', round: 1, log: log.filter(l => l.kind === 'order' || (l.kind === 'action' && !l.narration)), parentId: 'p' });
    expect(events).toHaveLength(0);
  });
});
