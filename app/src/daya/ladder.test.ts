import { describe, it, expect } from 'vitest';
import { climb, cueCoverage, ladderCompare, survivalStrength, wordsStrength, type LadderMemory, type LadderContext } from './ladder';
import { EMPTY_CHAIN } from './chain';

const mem = (over: Partial<LadderMemory>): LadderMemory => ({ id: 'm', content: '', valence: 0, arousal: 0, domain: null, domains: [], chain: { ...EMPTY_CHAIN }, ...over });
const ctx = (over: Partial<LadderContext> = {}): LadderContext => ({ cue: 'what happened with the rent', cueRefs: [], goals: [], situation: { threatened: false, frequencyLow: false }, ...over });

describe('ladder recall', () => {
  it('survival outranks everything when survival is in question: danger now, or a cue about harm', () => {
    const threat = mem({ content: 'he came at me with the pipe', valence: -0.8, arousal: 0.9 });
    const danger = { threatened: true, frequencyLow: false };
    const calm = { threatened: false, frequencyLow: false };
    expect(climb(threat, ctx({ situation: danger })).rung).toBe('survival');
    expect(climb(threat, ctx({ cue: 'did he die' })).rung).toBe('survival');
    expect(survivalStrength(threat, danger)).toBe(1);
    expect(survivalStrength(threat, calm, ['dissolution'])).toBeCloseTo(0.6);
    expect(survivalStrength(mem({ domains: ['dissolution'] }), calm, ['dissolution'])).toBeCloseTo(0.42);
    // HW7 2026-10-25: a calm knock at the door is not about survival — her grandmother's death does not lead.
    expect(survivalStrength(threat, calm)).toBe(0);
    expect(survivalStrength(mem({ domains: ['dissolution'] }), calm, ['abjuration'])).toBe(0);
    expect(climb(threat, ctx()).rung).not.toBe('survival');
  });
  it('goals: chain link = full strength; description overlap = partial; no goals = no rung', () => {
    const goals = [{ id: 'g1', description: 'Collect the rent Danny owes before the month ends' }];
    expect(climb(mem({ chain: { ...EMPTY_CHAIN, goalIds: ['g1'] } }), ctx({ goals }))).toMatchObject({ rung: 'goals', strength: 1 });
    expect(climb(mem({ content: 'Danny still owes rent for the month' }), ctx({ goals }))).toMatchObject({ rung: 'goals', strength: 0.6 });
    expect(climb(mem({ content: 'Danny still owes rent for the month' }), ctx()).rung).not.toBe('goals');
  });
  it('domain: primary match beats overlap; chain: refs on the chain; words last', () => {
    const c = ctx({ cue: 'how much rent do I owe', cueRefs: ['carr'] });
    expect(climb(mem({ domain: 'fortune', domains: ['fortune'] }), c)).toMatchObject({ rung: 'domain', strength: 1 });
    expect(climb(mem({ domains: ['force', 'fortune'], domain: 'force' }), c)).toMatchObject({ rung: 'domain', strength: 0.6 });
    // A death memory on a cue about death climbs to SURVIVAL first — by design.
    expect(climb(mem({ domain: 'dissolution', domains: ['dissolution'] }), ctx({ cue: 'did he die', cueRefs: ['carr'] })).rung).toBe('survival');
    expect(climb(mem({ chain: { ...EMPTY_CHAIN, entities: ['carr'] } }), c).rung).toBe('chain');
    expect(climb(mem({ content: 'he did not die that day' }), ctx({ cue: 'did he die' })).rung).toBe('words');
    expect(climb(mem({ content: 'a quiet afternoon' }), ctx({ cue: 'did he die' })).rung).toBe('none');
  });
  // HW7 2026-10-25: Violet heard the knock; her memories that say "when he knocks" must carry it.
  describe('the cue\'s own words, sentence by sentence', () => {
    const pizza = 'I order from the same pizza place every day. Hawaiian plus black olives. But they always knock. Forty-five seconds, sometimes a minute if there\'s change involved. Another person standing in my doorway, on my terms, holding something warm. I figured out a while ago that I\'m not ordering the pizza. I\'m ordering the knock.';
    const lingers = 'Kristopher always lingers. Every other driver hands over the box and leaves. I wrote my phone number on a five-dollar bill. It\'s folded on the shelf by the door. Tonight, when he knocks, I\'m going to give it to him as the tip.';
    const rosemary = mem({ content: 'Rosemary died on a Thursday in March. The doctor said it was her heart.', valence: -0.9, arousal: 0.8, domain: 'dissolution', domains: ['dissolution'] });
    const heard = 'He wipes his eyes from the tears he was crying in the car. He knocks on the door.';
    it('the knock sentence is carried whole by a long memory that says it', () => {
      expect(cueCoverage(heard, lingers)).toBe(1);
      expect(cueCoverage(heard, pizza)).toBeCloseTo(0.5);
      expect(wordsStrength(heard, lingers)).toBe(1);
      expect(climb(mem({ content: lingers }), ctx({ cue: heard })).rung).toBe('words');
      expect(climb(mem({ content: pizza }), ctx({ cue: heard })).rung).toBe('words');
    });
    it('a calm knock does not raise her grandmother\'s death above the knock', () => {
      expect(climb(rosemary, ctx({ cue: heard })).rung).not.toBe('survival');
    });
    it('one short word alone carries nothing', () => {
      expect(cueCoverage('He is.', 'is he')).toBe(0);
      expect(cueCoverage('Rent.', 'the rent is due')).toBe(1);
    });
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
