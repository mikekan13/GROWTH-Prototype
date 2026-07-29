import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { decideRoute, ROUTER_TUNING, type RouteRequest } from './router';

function baseReq(overrides: Partial<RouteRequest> = {}): RouteRequest {
  return {
    entityId: 'entity-1',
    subsystem: 'test',
    taskKind: 'reasoning',
    skillCeiling: 10,
    effort: 3,
    poolState: { governing: 'frequency', current: 10, max: 10 },
    sensitivity: 'safe',
    messages: [{ role: 'user', content: 'What is the weather like today?' }],
    ...overrides,
  };
}

const ORIGINAL_L2_URL = process.env.DAYA_L2_URL;
const ORIGINAL_C_MODEL_TOP = process.env.DAYA_C_MODEL_TOP;

afterEach(() => {
  if (ORIGINAL_L2_URL === undefined) delete process.env.DAYA_L2_URL;
  else process.env.DAYA_L2_URL = ORIGINAL_L2_URL;
  if (ORIGINAL_C_MODEL_TOP === undefined) delete process.env.DAYA_C_MODEL_TOP;
  else process.env.DAYA_C_MODEL_TOP = ORIGINAL_C_MODEL_TOP;
});

describe('routing matrix (§1 tier matrix)', () => {
  beforeEach(() => {
    delete process.env.DAYA_L2_URL;
  });

  it('trivial: always L1, no consult, regardless of skill', () => {
    for (const skillCeiling of [0, 10, 20]) {
      const d = decideRoute(baseReq({ difficulty: 5, skillCeiling, taskKind: 'speech' }));
      expect(d.tier).toBe('L1');
      expect(d.consult).toBe(false);
    }
  });

  it('standard: always L1, no consult', () => {
    for (const skillCeiling of [0, 10, 20]) {
      const d = decideRoute(baseReq({ difficulty: 10, skillCeiling }));
      expect(d.tier).toBe('L1');
      expect(d.consult).toBe(false);
    }
  });

  it('hard + skill <8: L1, strains, no consult', () => {
    const d = decideRoute(baseReq({ difficulty: 15, skillCeiling: 5 }));
    expect(d.tier).toBe('L1');
    expect(d.consult).toBe(false);
  });

  it('hard + skill 8-15 + non-knowledge taskKind: stays L1', () => {
    const d = decideRoute(baseReq({ difficulty: 15, skillCeiling: 10, taskKind: 'reasoning' }));
    expect(d.tier).toBe('L1');
    expect(d.consult).toBe(false);
  });

  it('hard + skill 8-15 + knowledge taskKind: consults (safe -> C)', () => {
    const d = decideRoute(baseReq({ difficulty: 15, skillCeiling: 10, taskKind: 'knowledge', sensitivity: 'safe' }));
    expect(d.tier).toBe('C');
    expect(d.consult).toBe(true);
    expect(d.sanitize).toBe(true);
  });

  it('hard + skill 16-20: always consults', () => {
    const d = decideRoute(baseReq({ difficulty: 15, skillCeiling: 18, taskKind: 'reasoning', sensitivity: 'safe' }));
    expect(d.tier).toBe('C');
    expect(d.consult).toBe(true);
  });

  it('extreme + skill <8: L1, fails plausibly, no consult', () => {
    const d = decideRoute(baseReq({ difficulty: 22, skillCeiling: 3 }));
    expect(d.tier).toBe('L1');
    expect(d.consult).toBe(false);
  });

  it('extreme + skill 8-15: consults, capped below the top ladder rung', () => {
    const d = decideRoute(baseReq({ difficulty: 22, skillCeiling: 12, sensitivity: 'safe' }));
    expect(d.tier).toBe('C');
    expect(d.consult).toBe(true);
    expect(d.model).not.toBe(undefined);
  });

  it('extreme + skill 20: consults, top-of-ladder model', () => {
    process.env.DAYA_C_MODEL_TOP = 'claude-opus-4-6';
    const d = decideRoute(baseReq({ difficulty: 22, skillCeiling: 20, sensitivity: 'safe' }));
    expect(d.tier).toBe('C');
    expect(d.model).toBe('claude-opus-4-6');
  });

  it('never mutates req.effort', () => {
    const req = baseReq({ effort: 4 });
    decideRoute(req);
    expect(req.effort).toBe(4);
  });

  it('rationale is populated and content-free (no message text/identifiers leak into it)', () => {
    const req = baseReq({
      difficulty: 15,
      skillCeiling: 12,
      taskKind: 'knowledge',
      sensitivity: 'safe',
      messages: [{ role: 'user', content: 'Violet Ashworth asks about cycle 42 in session 7' }],
      identifiers: ['Violet Ashworth'],
    });
    const d = decideRoute(req);
    expect(d.rationale.length).toBeGreaterThan(0);
    expect(d.rationale).not.toMatch(/Violet/i);
    expect(d.rationale).not.toMatch(/cycle 42/i);
    expect(d.rationale).not.toMatch(/session 7/i);
  });
});

describe('sensitivity routing (Addendum A2/A3)', () => {
  it('sensitive + L2 configured: routes to L2, never C', () => {
    process.env.DAYA_L2_URL = 'http://localhost:9999';
    const d = decideRoute(baseReq({ difficulty: 15, skillCeiling: 10, taskKind: 'knowledge', sensitivity: 'sensitive' }));
    expect(d.tier).toBe('L2');
    expect(d.consult).toBe(true);
  });

  it('sensitive + L2 unset: stays L1 degraded, never C, rationale records fail-local', () => {
    delete process.env.DAYA_L2_URL;
    const d = decideRoute(baseReq({ difficulty: 15, skillCeiling: 10, taskKind: 'knowledge', sensitivity: 'sensitive' }));
    expect(d.tier).toBe('L1');
    expect(d.consult).toBe(false);
    expect(d.rationale).toMatch(/fail-local/);
  });

  it('uncertain classification (inconclusive heuristic) routes L2-or-L1, never C', () => {
    delete process.env.DAYA_L2_URL;
    const d = decideRoute(
      baseReq({
        difficulty: 15,
        skillCeiling: 10,
        taskKind: 'knowledge',
        sensitivity: undefined,
        messages: [{ role: 'user', content: 'the door creaked' }], // inconclusive -> fails local to sensitive
      }),
    );
    expect(d.tier).not.toBe('C');
  });
});

describe('pool-state degradation (Ruling 20)', () => {
  const heavyConsultReq = (current: number) =>
    baseReq({
      difficulty: 22,
      skillCeiling: 20,
      sensitivity: 'safe',
      poolState: { governing: 'frequency', current, max: 10 },
    });

  it('f >= 0.5: full context depth, top ladder consult', () => {
    delete process.env.DAYA_L2_URL;
    const d = decideRoute(heavyConsultReq(10));
    expect(d.contextDepth).toBe(ROUTER_TUNING.contextDepth.full);
    expect(d.tier).toBe('C');
    expect(d.consult).toBe(true);
  });

  it('0.25 <= f < 0.5: one consult step down, contextDepth 0.6', () => {
    const d = decideRoute(heavyConsultReq(4));
    expect(d.contextDepth).toBe(ROUTER_TUNING.contextDepth.degraded);
    // stepped down from top -> sonnet, still a C consult (not collapsed to L1)
    expect(d.tier).toBe('C');
  });

  it('0 < f < 0.25: no consults, contextDepth 0.35, maxTokens halved vs full', () => {
    const full = decideRoute(heavyConsultReq(10));
    const drained = decideRoute(heavyConsultReq(2));
    expect(drained.tier).toBe('L1');
    expect(drained.consult).toBe(false);
    expect(drained.contextDepth).toBe(ROUTER_TUNING.contextDepth.low);
    expect(drained.maxTokens).toBe(Math.round(full.maxTokens * 0.5));
  });

  it('f <= 0: L1 minimal, contextDepth 0.2, shortest outputs', () => {
    const d = decideRoute(heavyConsultReq(0));
    expect(d.tier).toBe('L1');
    expect(d.contextDepth).toBe(ROUTER_TUNING.contextDepth.minimal);
  });

  it('recovers to full behavior once the pool refills', () => {
    const drained = decideRoute(heavyConsultReq(0));
    const recovered = decideRoute(heavyConsultReq(10));
    expect(drained.contextDepth).not.toBe(recovered.contextDepth);
    expect(recovered.contextDepth).toBe(ROUTER_TUNING.contextDepth.full);
    expect(recovered.tier).toBe('C');
  });
});

describe('effort independence (Ruling 10 — router never sets effort, only scales depth)', () => {
  it('same request at low/med/high effort: tier/consult/clamp identical, only maxTokens scales', () => {
    const low = decideRoute(baseReq({ effort: 1, poolState: { governing: 'frequency', current: 10, max: 10 } }));
    const med = decideRoute(baseReq({ effort: 5, poolState: { governing: 'frequency', current: 10, max: 10 } }));
    const high = decideRoute(baseReq({ effort: 9, poolState: { governing: 'frequency', current: 10, max: 10 } }));

    expect(low.tier).toBe(med.tier);
    expect(med.tier).toBe(high.tier);
    expect(low.consult).toBe(med.consult);
    expect(low.clamp).toEqual(med.clamp);
    expect(low.maxTokens).toBeLessThan(med.maxTokens);
    expect(med.maxTokens).toBeLessThan(high.maxTokens);
  });
});

describe('clamp attachment', () => {
  it('every decision carries clamp constraints for the request skillCeiling', () => {
    const d = decideRoute(baseReq({ skillCeiling: 3, domain: 'medicine' }));
    expect(d.clamp).not.toBeNull();
    expect(d.clamp?.skillBand).toBe('novice');
  });
});
