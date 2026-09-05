import { describe, it, expect } from 'vitest';
import { buildSlots, actionsRemainingAt } from './slots';

const ids = (prefix: string, n: number) => Array.from({ length: n }, (_, i) => `${prefix}${i + 1}`);

function shape(slots: ReturnType<typeof buildSlots>) {
  return slots.map(s => s.entries.map(e => `${e.participantId}${e.actionIndex + 1}`));
}

describe('slot builder (layer 1)', () => {
  it("Mike's 5 vs 4: B1 · (B2,A1) · (B3,A2) · (B4,A3) · (B5,A4)", () => {
    const slots = buildSlots([
      { participantId: 'B', totalActions: 5, intentionIds: ids('b', 5) },
      { participantId: 'A', totalActions: 4, intentionIds: ids('a', 4) },
    ]);
    expect(shape(slots)).toEqual([['B1'], ['B2', 'A1'], ['B3', 'A2'], ['B4', 'A3'], ['B5', 'A4']]);
  });
  it('3 vs 6 packs the slower entity to the end (confirmed intended)', () => {
    const slots = buildSlots([
      { participantId: 'B', totalActions: 6, intentionIds: ids('b', 6) },
      { participantId: 'A', totalActions: 3, intentionIds: ids('a', 3) },
    ]);
    expect(shape(slots)).toEqual([['B1'], ['B2'], ['B3'], ['B4', 'A1'], ['B5', 'A2'], ['B6', 'A3']]);
  });
  it('unassigned actions become null-intention (reserve) entries', () => {
    const slots = buildSlots([{ participantId: 'A', totalActions: 3, intentionIds: ['a1'] }]);
    expect(slots.map(s => s.entries[0].intentionId)).toEqual(['a1', null, null]);
  });
  it('actionsRemainingAt counts actions in later slots (redirect needs ≥1 in hand)', () => {
    const slots = buildSlots([
      { participantId: 'B', totalActions: 5, intentionIds: ids('b', 5) },
      { participantId: 'A', totalActions: 4, intentionIds: ids('a', 4) },
    ]);
    expect(actionsRemainingAt(slots, 'A', 0)).toBe(4);
    expect(actionsRemainingAt(slots, 'A', 4)).toBe(1);
    expect(actionsRemainingAt(slots, 'A', 5)).toBe(0);
  });
});
