import { describe, it, expect } from 'vitest';
import { laneTarget, barSpan, halfSpan, patternStability, stepProgress, bandStates } from './lane-progress';

describe('laneTarget', () => {
  it('ready and disabled are complete; offline holds', () => {
    expect(laneTarget({ phase: 'ready' }, 0)).toBe(1);
    expect(laneTarget({ phase: 'disabled' }, 0)).toBe(1);
    expect(laneTarget({ phase: 'offline' }, 0)).toBeNull();
  });

  it('host eases inside 0..0.30 and keeps moving', () => {
    const a = laneTarget({ phase: 'host' }, 0)!;
    const b = laneTarget({ phase: 'host' }, 45_000)!;
    const c = laneTarget({ phase: 'host' }, 600_000)!;
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(c);
    expect(c).toBeLessThanOrEqual(0.3);
  });

  it('loading maps the worker uptime into 0.30..0.95', () => {
    const lane = (uptime: number) => ({ phase: 'loading' as const, expectedColdStartSeconds: 300, endpoint: { worker: { uptimeSeconds: uptime } } });
    expect(laneTarget(lane(0), 0)).toBeCloseTo(0.3);
    expect(laneTarget(lane(150), 0)).toBeCloseTo(0.3 + 0.65 * 0.5);
    expect(laneTarget(lane(900), 0)).toBeCloseTo(0.95);
  });

  it('loading without an uptime eases over time; a ready worker jumps to the top of the range', () => {
    const lane = { phase: 'loading' as const, expectedColdStartSeconds: 300 };
    expect(laneTarget(lane, 0)).toBeCloseTo(0.3);
    expect(laneTarget(lane, 60_000)!).toBeGreaterThan(0.3);
    expect(laneTarget(lane, 600_000)!).toBeLessThan(0.95);
    expect(laneTarget({ ...lane, endpoint: { ready: 1 } }, 0)).toBeCloseTo(0.95);
  });
});

describe('patternStability', () => {
  it('runs −100/+100 to 0/0', () => {
    expect(patternStability(0)).toMatchObject({ left: -100, right: 100, remaining: 1 });
    expect(patternStability(0.25)).toMatchObject({ left: -75, right: 75 });
    const done = patternStability(1);
    expect(done.left).toBe(0);
    expect(Object.is(done.left, -0)).toBe(false);
    expect(done.right).toBe(0);
  });
  it('clamps', () => {
    expect(patternStability(2).right).toBe(0);
    expect(patternStability(-1).left).toBe(-100);
  });
});

describe('barSpan', () => {
  it('starts full width and shrinks symmetrically to nothing at the centre', () => {
    expect(barSpan(0)).toEqual({ left: 0, width: 100 });
    expect(barSpan(0.5)).toEqual({ left: 25, width: 50 });
    expect(barSpan(1)).toEqual({ left: 50, width: 0 });
  });
  it('left + width/2 is always the centre (no swing) and width never grows', () => {
    let prev = 101;
    for (let p = 0; p <= 1.0001; p += 0.05) {
      const b = barSpan(p);
      expect(b.left + b.width / 2).toBeCloseTo(50);
      expect(b.width).toBeLessThan(prev);
      prev = b.width;
    }
  });
});

describe('halfSpan', () => {
  it('each half starts full, shrinks toward the label, and is gone at full load', () => {
    expect(halfSpan(0)).toBe(100);
    expect(halfSpan(0.25)).toBe(75);
    expect(halfSpan(1)).toBe(0);
    expect(halfSpan(2)).toBe(0);
  });
  it('never grows as progress rises', () => {
    let prev = 101;
    for (let p = 0; p <= 1.0001; p += 0.05) { const w = halfSpan(p); expect(w).toBeLessThan(prev); prev = w; }
  });
});

describe('stepProgress', () => {
  it('moves toward the target, never backwards, never past it', () => {
    expect(stepProgress(0.5, 0.2, 100)).toBe(0.5);
    expect(stepProgress(0.5, null, 100)).toBe(0.5);
    const n = stepProgress(0.1, 0.9, 100);
    expect(n).toBeGreaterThan(0.1);
    expect(n).toBeLessThanOrEqual(0.9);
    expect(stepProgress(0.8999, 0.9, 5000)).toBe(0.9);
  });
});

describe('bandStates', () => {
  const calm = () => 0.5;
  it('all standing at zero, none at one', () => {
    expect(bandStates(24, 0, calm).every(Boolean)).toBe(true);
    expect(bandStates(24, 1, calm).some(Boolean)).toBe(false);
  });
  it('fewer bands stand as progress rises', () => {
    const n = (p: number) => bandStates(24, p, calm).filter(Boolean).length;
    expect(n(0.2)).toBeGreaterThanOrEqual(n(0.5));
    expect(n(0.5)).toBeGreaterThanOrEqual(n(0.9));
    expect(n(0.5)).toBeLessThan(24);
  });
});
