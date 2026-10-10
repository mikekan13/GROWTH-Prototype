import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── In-memory SkillDomainRelevance table ──────────────────────────────────
type Row = { scope: string; campaignId?: string | null; skillName: string; domain: string; relevance: number; source: string };
const table: Row[] = [];
const keyOf = (w: { scope: string; skillName: string; domain: string }) => table.findIndex((r) => r.scope === w.scope && r.skillName === w.skillName && r.domain === w.domain);

vi.mock('@/lib/db', () => ({
  prisma: {
    skillDomainRelevance: {
      findMany: async ({ where }: { where: { skillName: string; scope: { in: string[] } } }) =>
        table.filter((r) => r.skillName === where.skillName && where.scope.in.includes(r.scope)).map((r) => ({ ...r })),
      upsert: async ({ where, create, update }: { where: { scope_skillName_domain: { scope: string; skillName: string; domain: string } }; create: Row; update: Partial<Row> }) => {
        const i = keyOf(where.scope_skillName_domain);
        if (i < 0) table.push({ ...create }); else Object.assign(table[i], update);
      },
      deleteMany: async ({ where }: { where: Partial<Row> }) => {
        for (let i = table.length - 1; i >= 0; i--) {
          const r = table[i];
          if (Object.entries(where).every(([k, v]) => (r as Record<string, unknown>)[k] === v)) table.splice(i, 1);
        }
      },
    },
    $transaction: async (ops: Promise<unknown>[]) => Promise.all(ops),
  },
}));
vi.mock('@/ai/network', () => ({
  route: vi.fn(), anthropicChatText: vi.fn(), openAiCompatChat: vi.fn(), recordAiCall: vi.fn(),
}));
vi.mock('@/services/campaign-access', () => ({ requireCampaignGM: vi.fn() }));

import {
  normalizeSkillName, parseScorerOutput, buildScorerPrompt, resolveRelevance, pickBestSkill, stubScorer,
  getRelevance, setOverride, bestSkillForAspect, skillsFromCharacterData, GLOBAL_SCOPE, type SkillRelevance,
} from './skill-relevance';
import { HEAD_DOMAIN_KEYS } from '@/sim/perception/aspects';

beforeEach(() => { table.length = 0; });

const rel = (scores: Partial<Record<string, number>>): SkillRelevance =>
  Object.fromEntries(HEAD_DOMAIN_KEYS.map((k) => [k, { relevance: scores[k] ?? 0, source: 'model' }])) as SkillRelevance;

describe('pure parts', () => {
  it('normalizes skill names', () => {
    expect(normalizeSkillName('  Sword   Smithing ')).toBe('sword smithing');
  });

  it('parses ten "domain: number" lines leniently, clamping and skipping junk', () => {
    expect(parseScorerOutput('force: 1\n- abjuration: 0.5\nDivination = .2\nbogus: 0.9\nfortune: 7\nforce: 0')).toEqual({
      force: 1, abjuration: 0.5, divination: 0.2, fortune: 1,
    });
    expect(parseScorerOutput('I think this is a combat skill.')).toEqual({});
  });

  it('builds a small-model prompt naming all ten domains and the exact output format', () => {
    const { system, user } = buildScorerPrompt('map making');
    for (const k of HEAD_DOMAIN_KEYS) expect(system).toContain(`${k}:`);
    expect(system).toContain('exactly ten lines');
    expect(system).toMatch(/^divination:.*knowing about a thing:.*history/m); // history → divination (Mike 10-09)
    expect(user).toBe('Skill: "map making"');
  });

  it('resolves campaign GM over global GM over model; unscored → 0/none', () => {
    const rows = [
      { scope: GLOBAL_SCOPE, skillName: 's', domain: 'force', relevance: 0.2, source: 'model' },
      { scope: GLOBAL_SCOPE, skillName: 's', domain: 'force', relevance: 0.6, source: 'gm' },
      { scope: 'c1', skillName: 's', domain: 'force', relevance: 0.9, source: 'gm' },
      { scope: GLOBAL_SCOPE, skillName: 's', domain: 'fortune', relevance: 0.4, source: 'model' },
    ];
    expect(resolveRelevance(rows, 'c1').force).toEqual({ relevance: 0.9, source: 'gm' });
    expect(resolveRelevance(rows, 'c2').force).toEqual({ relevance: 0.6, source: 'gm' });
    expect(resolveRelevance(rows).fortune).toEqual({ relevance: 0.4, source: 'model' });
    expect(resolveRelevance(rows).illusion).toEqual({ relevance: 0, source: 'none' });
  });

  it('picks the best skill by max relevance across the aspect tag set, then level; none below threshold', () => {
    const table2: Record<string, SkillRelevance> = {
      swordsmanship: rel({ force: 1, abjuration: 0.5 }),
      appraisal: rel({ fortune: 0.9 }),
      cooking: rel({ alteration: 0.1 }),
      fencing: rel({ force: 1 }),
    };
    const skills = [{ name: 'Swordsmanship', level: 12 }, { name: 'Appraisal', level: 3 }, { name: 'Cooking', level: 20 }, { name: 'Fencing', level: 4 }];
    const of = (n: string) => table2[normalizeSkillName(n)];
    expect(pickBestSkill(skills, ['force'], of)).toEqual({ skill: 'Swordsmanship', level: 12, relevance: 1, domain: 'force' });
    // a Force enchantment = Fortune + Force: max across the set
    expect(pickBestSkill(skills, ['fortune', 'force'], of)?.skill).toBe('Swordsmanship');
    expect(pickBestSkill(skills, ['fortune'], of)?.skill).toBe('Appraisal');
    expect(pickBestSkill(skills, ['alteration'], of)).toBeNull(); // 0.1 → raw Wisdom
    expect(pickBestSkill([], ['force'], of)).toBeNull();
  });

  it('reads freeform skills out of Character.data', () => {
    expect(skillsFromCharacterData(JSON.stringify({ skills: [{ name: 'Map Making', level: 6 }, { level: 2 }, { name: 'X' }] })))
      .toEqual([{ name: 'Map Making', level: 6 }, { name: 'X', level: 0 }]);
    expect(skillsFromCharacterData('nope')).toEqual([]);
  });

  it('the stub scorer is deterministic', async () => {
    expect(await stubScorer('blade fighting', {})).toEqual(await stubScorer('blade fighting', {}));
    expect((await stubScorer('blade fighting', {})).force).toBe(0.8);
  });
});

describe('cache + override (store)', () => {
  it('scores missing domains once and caches them globally', async () => {
    const scorer = vi.fn(async () => ({ force: 0.9 }));
    const a = await getRelevance('Swordsmanship', { scorer });
    expect(a.force).toEqual({ relevance: 0.9, source: 'model' });
    expect(a.illusion).toEqual({ relevance: 0, source: 'model' });
    expect(table).toHaveLength(10);
    expect(table.every((r) => r.scope === GLOBAL_SCOPE)).toBe(true);
    await getRelevance('  swordsmanship ', { scorer, campaignId: 'c1' });
    expect(scorer).toHaveBeenCalledTimes(1);
  });

  it('a failed scoring caches nothing and retries next time', async () => {
    const bad = vi.fn(async () => { throw new Error('lane down'); });
    expect((await getRelevance('archery', { scorer: bad })).force.source).toBe('none');
    expect(table).toHaveLength(0);
    const good = vi.fn(async () => ({ force: 0.7 }));
    expect((await getRelevance('archery', { scorer: good })).force.relevance).toBe(0.7);
  });

  it('GM override wins and is never overwritten by the model', async () => {
    // GM rules before the model ever saw the skill (global, ADMIN)
    await setOverride(null, { skillName: 'Map Making', domain: 'divination', relevance: 1 });
    // campaign GM overrides another domain
    await setOverride('c1', { skillName: 'map making', domain: 'alteration', relevance: 0.6 });
    const scorer = vi.fn(async () => ({ divination: 0.1, alteration: 0.2, conjuration: 0.5 }));
    const r = await getRelevance('map making', { scorer, campaignId: 'c1' });
    expect(r.divination).toEqual({ relevance: 1, source: 'gm' });     // model's 0.1 never written over it
    expect(r.alteration).toEqual({ relevance: 0.6, source: 'gm' });   // campaign override beats global model 0.2
    expect(r.conjuration).toEqual({ relevance: 0.5, source: 'model' });
    expect(table.find((x) => x.scope === GLOBAL_SCOPE && x.domain === 'divination')).toMatchObject({ relevance: 1, source: 'gm' });
    // other campaigns see the model's score where only c1 overrode
    expect((await getRelevance('map making', { scorer, campaignId: 'c2' })).alteration).toEqual({ relevance: 0.2, source: 'model' });
    // clearing the campaign override shows the model's score again
    const cleared = await setOverride('c1', { skillName: 'map making', domain: 'alteration', relevance: null });
    expect(cleared.alteration).toEqual({ relevance: 0.2, source: 'model' });
    expect(scorer).toHaveBeenCalledTimes(1);
  });

  it('rejects overrides outside the ten domains or 0..1', async () => {
    await expect(setOverride('c1', { skillName: 'x', domain: 'weapons', relevance: 1 })).rejects.toThrow(/head domains/);
    await expect(setOverride('c1', { skillName: 'x', domain: 'force', relevance: 2 })).rejects.toThrow();
  });

  it('bestSkillForAspect uses the aspect tag set incl. an ability school', async () => {
    await setOverride(null, { skillName: 'Pyromancy', domain: 'force', relevance: 0.9 });
    await setOverride(null, { skillName: 'Swordsmanship', domain: 'force', relevance: 0.7 });
    const scorer = vi.fn(async () => ({}));
    const item = { description: '', itemAbilities: [{ name: 'Ember Bite', description: '', school: 'Force' }] };
    const skills = [{ name: 'Swordsmanship', level: 12 }, { name: 'Pyromancy', level: 2 }];
    expect(await bestSkillForAspect(skills, 'ability:ember-bite', { scorer, subject: item })).toMatchObject({ skill: 'Pyromancy', domain: 'force' });
    expect(await bestSkillForAspect(skills, 'history', { scorer })).toBeNull();
    expect(await bestSkillForAspect(skills, 'nope', { scorer })).toBeNull();
  });
});
