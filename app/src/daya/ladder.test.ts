import { describe, it, expect } from 'vitest';
import { climb, ladderCompare, survivalStrength, type LadderMemory, type LadderContext } from './ladder';
import { EMPTY_CHAIN } from './chain';

const mem = (over: Partial<LadderMemory>): LadderMemory => ({ id: 'm', content: '', valence: 0, arousal: 0, domain: null, domains: [], chain: { ...EMPTY_CHAIN }, ...over });
const ctx = (over: Partial<LadderContext> = {}): LadderContext => ({ cue: 'what happened with the rent', cueRefs: [], goals: [], situation: { threatened: false, frequencyLow: false }, ...over });

describe('ladder recall', () => {
  it('survival outranks everything, and danger sharpens it', () => {
    const threat = mem({ content: 'he came at me with the pipe', valence: -0.8, arousal: 0.9 });
    expect(climb(threat, ctx()).rung).toBe('survival');
    expect(survivalStrength(threat, { threatened: true, frequencyLow: false })).toBe(1);
    expect(survivalStrength(threat, { threatened: false, frequencyLow: false })).toBeCloseTo(0.6);
    expect(survivalStrength(mem({ domains: ['dissolution'] }), { threatened: false, frequencyLow: false })).toBeCloseTo(0.42);
  });
  it('goals: chain link = full strength; description overlap = partial; no goals = no rung', () => {
    const goals = [{ id: 'g1', description: 'Collect the rent Danny owes before the month ends' }];
    expect(climb(mem({ chain: { ...EMPTY_CHAIN, goalIds: ['g1'] } }), ctx({ goals }))).toMatchObject({ rung: 'goals', strength: 1 });
    expect(climb(mem({ content: 'Danny still owes rent for the month' }), ctx({ goals }))).toMatchObject({ rung: 'goals', strength: 0.6 });
    expect(climb(mem({ content: 'Danny still owes rent for the month' }), ctx()).rung).not.toBe('goals');
  });
  it('domain: primary match beats overlap; chain: refs on the chain; words last', () => {
    // (death/harm domains climb to SURVIVAL first — by design — so test the domain rung with fortune)
    const c = ctx({ cue: 'how much rent do I owe', cueRefs: ['carr'] });
    expect(climb(mem({ domain: 'fortune', domains: ['fortune'] }), c)).toMatchObject({ rung: 'domain', strength: 1 });
    expect(climb(mem({ domains: ['force', 'fortune'], domain: 'force' }), c)).toMatchObject({ rung: 'domain', strength: 0.6 });
    expect(climb(mem({ domain: 'dissolution', domains: ['dissolution'] }), c).rung).toBe('survival');
    expect(climb(mem({ chain: { ...EMPTY_CHAIN, entities: ['carr'] } }), c).rung).toBe('chain');
    expect(climb(mem({ content: 'he did not die that day' }), ctx({ cue: 'did he die' })).rung).toBe('words');
    expect(climb(mem({ content: 'a quiet afternoon' }), ctx({ cue: 'did he die' })).rung).toBe('none');
  });
  it('ordering is rung first, then strength, then score', () => {
    const rows = [
      { rung: 'words' as const, strength: 0.9, score: 0.9 },
      { rung: 'goals' as const, strength: 0.6, score: 0.2 },
      { rung: 'goals' as const, strength: 1, score: 0.1 },
      { rung: 'survival' as const, strength: 0.6, score: 0.3 },
    ];
    expect(rows.slice().sort(ladderCompare).map(r => `${r.rung}:${r.strength}`)).toEqual(['survival:0.6', 'goals:1', 'goals:0.6', 'words:0.9']);
  });
});
