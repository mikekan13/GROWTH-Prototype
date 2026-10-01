import { describe, it, expect } from 'vitest';
import { vectorize, cosine, distance, computeProbeMetrics, PROBE_SET_V1 } from './probes';

describe('probe vectors', () => {
  it('identical text = 0 distance; disjoint = 1; stopwords ignored', () => {
    expect(distance('I keep the door locked at night', 'I keep the door locked at night')).toBe(0);
    expect(distance('quiet library afternoons', 'shouting bar brawl')).toBe(1);
    expect(vectorize('the a an and of').size).toBe(0);
    expect(cosine(vectorize('cat cat dog'), vectorize('cat'))).toBeGreaterThan(0.8);
  });
  it('probe set covers the five Smallville categories', () => {
    expect(new Set(PROBE_SET_V1.map(p => p.category)).size).toBe(5);
    expect(new Set(PROBE_SET_V1.map(p => p.key)).size).toBe(PROBE_SET_V1.length);
  });
});

describe('computeProbeMetrics', () => {
  const t0 = new Date('2026-09-01'), t1 = new Date('2026-10-01');
  const rows = [
    // A stays itself; B changes; A and B are different people
    { entityId: 'A', runId: 'r1', questionKey: 'q1', response: 'I lock the door and read in the library', createdAt: t0 },
    { entityId: 'B', runId: 'r1', questionKey: 'q1', response: 'I fix the boiler and shout at the tenants', createdAt: t0 },
    { entityId: 'A', runId: 'r2', questionKey: 'q1', response: 'I lock the door and read in the library', createdAt: t1 },
    { entityId: 'B', runId: 'r2', questionKey: 'q1', response: 'I write poems about quiet mornings', createdAt: t1 },
  ];
  it('baseline = first run; drift-from-self bounded for the stable entity, high for the changed one; divergence on the shared latest run', () => {
    const m = computeProbeMetrics(rows, { A: 'Alice', B: 'Bob' });
    expect(m.runs).toEqual(['r1', 'r2']);
    const a = m.entities.find(e => e.entityId === 'A')!, b = m.entities.find(e => e.entityId === 'B')!;
    expect(a.baselineRun).toBe('r1'); expect(a.latestRun).toBe('r2');
    expect(a.driftFromSelf).toBe(0);
    expect(b.driftFromSelf).toBeGreaterThan(0.9);
    expect(m.divergence).toHaveLength(1);
    expect(m.divergence[0].runId).toBe('r2');
    expect(m.divergence[0].distance).toBeGreaterThan(0.5);
  });
  it('a single run yields null drift and still yields divergence', () => {
    const m = computeProbeMetrics(rows.filter(r => r.runId === 'r1'), {});
    expect(m.entities.every(e => e.driftFromSelf === null)).toBe(true);
    expect(m.divergence[0].runId).toBe('r1');
  });
});
