/**
 * JEWL does many things at once (Mike 2026-10-16: a nano swarm): the
 * scheduler's concurrency default, its env override, and the fairness laws —
 * never two cycles on one character; a parent genesis never starved by the
 * child geneses it spawned.
 */
import { describe, it, expect } from 'vitest';
import { DEFAULT_WORK_CONCURRENCY, MAX_WORK_CONCURRENCY, pickSessionsToStart, sessionSubjectKey, workConcurrency } from './work-loop-schedule';

const s = (id: string, characterId: string, extra: Record<string, unknown> = {}) => ({
  id, campaignId: 'c1', goal: `Character genesis: ${characterId} [${characterId}] — x`, continueUnattended: false, ...extra,
});
const attended = () => false;

describe('workConcurrency', () => {
  it('defaults to 3 and reads JEWL_WORK_CONCURRENCY within 1..8', () => {
    expect(DEFAULT_WORK_CONCURRENCY).toBe(3);
    expect(workConcurrency({})).toBe(3);
    expect(workConcurrency({ JEWL_WORK_CONCURRENCY: '5' })).toBe(5);
    expect(workConcurrency({ JEWL_WORK_CONCURRENCY: '0' })).toBe(3);
    expect(workConcurrency({ JEWL_WORK_CONCURRENCY: 'many' })).toBe(3);
    expect(workConcurrency({ JEWL_WORK_CONCURRENCY: '99' })).toBe(MAX_WORK_CONCURRENCY);
  });
});

describe('pickSessionsToStart', () => {
  it('starts up to the concurrency, in the order given (oldest lastCycleAt first is the caller\'s sort)', () => {
    const plan = pickSessionsToStart({
      sessions: [s('parent', 'violet'), s('child1', 'rosemary'), s('child2', 'miller'), s('child3', 'editor')],
      inFlight: new Map(), cooldownUntil: new Map(), now: 0, concurrency: 3, attended,
    });
    expect(plan.start.map(x => x.id)).toEqual(['parent', 'child1', 'child2']);
    expect(plan.waiting).toBe(1);
  });

  it('never two cycles on one character, even across sessions', () => {
    const plan = pickSessionsToStart({
      sessions: [s('a', 'violet'), s('b', 'violet'), s('c', 'rosemary')],
      inFlight: new Map(), cooldownUntil: new Map(), now: 0, concurrency: 3, attended,
    });
    expect(plan.start.map(x => x.id)).toEqual(['a', 'c']);
    expect(sessionSubjectKey(s('a', 'violet'))).toBe('character:violet');
    const busy = pickSessionsToStart({
      sessions: [s('a', 'violet'), s('b', 'violet')],
      inFlight: new Map([['a', Promise.resolve()]]), cooldownUntil: new Map(), now: 0, concurrency: 3, attended,
    });
    expect(busy.start).toEqual([]);
  });

  it('children in flight leave the parent its slot when it comes up; a cooling child yields to the parent', () => {
    // Two children running; the parent (waited longest, sorted first) takes the third slot.
    const plan = pickSessionsToStart({
      sessions: [s('parent', 'violet'), s('child1', 'rosemary'), s('child2', 'miller'), s('child3', 'editor')],
      inFlight: new Map([['child1', Promise.resolve()], ['child2', Promise.resolve()]]),
      cooldownUntil: new Map(), now: 0, concurrency: 3, attended,
    });
    expect(plan.start.map(x => x.id)).toEqual(['parent']);
    // A child cooling down (its breather) does not hold the parent back.
    const cooling = pickSessionsToStart({
      sessions: [s('child1', 'rosemary'), s('parent', 'violet')],
      inFlight: new Map(), cooldownUntil: new Map([['child1', 10_000]]), now: 0, concurrency: 1, attended,
    });
    expect(cooling.start.map(x => x.id)).toEqual(['parent']);
    expect(cooling.nextWakeAt).toBe(10_000);
  });
});
