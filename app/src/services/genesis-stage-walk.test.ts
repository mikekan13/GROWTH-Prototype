/**
 * The stage walk (2026-10-12): "done" in a genesis build-phase stage moves to
 * the next stage the character lacks; only after VINES is she Born. And each
 * completion stage's cycle carries its law and only its tools.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { db, advance, awaken } = vi.hoisted(() => ({
  db: {
    dayaWorkSession: { findUnique: vi.fn(), update: vi.fn() },
    genesisProd: { count: vi.fn(async () => 0) },
  },
  advance: vi.fn(),
  awaken: vi.fn(async () => 'v'),
}));

vi.mock('@/lib/db', () => ({ prisma: db }));
vi.mock('@/lib/campaign-stream', () => ({ broadcastEvent: vi.fn() }));
vi.mock('./genesis-stages', async () => {
  const pure = await import('@/lib/genesis-stages');
  return { ...pure, advanceGenesisStage: (...a: unknown[]) => advance(...a) };
});
vi.mock('./character-genesis-born', () => ({ awakenGenesisCharacter: awaken }));
vi.mock('./character-genesis-progress', () => ({
  parseGenesisGoal: (g: string) => {
    const m = /^Character genesis: (.+?) \[([^\]\s]+)\]/.exec(g);
    return m ? { name: m[1], characterId: m[2] } : null;
  },
  announceGenesisStatus: vi.fn(async () => null),
}));

import { updateWorkSession } from './daya-work-session';
import { planWorkCycle, COMPLETION_STAGE_TOOLS } from '@/ai/copilot/work-cycle-text';

const GOAL = 'Character genesis: Violet [v] — gestate the person';
// A stage builds only after its question round (2026-10-16): one prod of the stage opens it.
const asked = (stage: string) => [{ id: 'p0', round: 1, order: 1, anchorQuote: 'a', question: 'q?', why: 'w', kind: 'CREATIVE', status: 'ANSWERED', answer: 'a', jewlFill: null, stage }];

beforeEach(() => {
  vi.clearAllMocks();
  db.dayaWorkSession.update.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ id: 's1', campaignId: 'c1', goal: GOAL, status: 'active', ...data }));
});

describe('updateWorkSession done → next stage', () => {
  it('the sheet stage (BUILDING) finishing moves to AGE — not Born', async () => {
    db.dayaWorkSession.findUnique.mockResolvedValue({ id: 's1', campaignId: 'c1', goal: GOAL, status: 'active', stage: 'BUILDING', progress: '[]' });
    advance.mockResolvedValue('AGE');
    await updateWorkSession({ sessionId: 's1', status: 'done', progressNote: 'sheet written' });
    expect(advance).toHaveBeenCalledWith('v', 'BUILDING');
    const data = db.dayaWorkSession.update.mock.calls[0][0].data;
    expect(data.stage).toBe('AGE');
    expect(data.status).toBeUndefined();
    expect(JSON.parse(data.progress)).toEqual(['sheet written', '[system] stage BUILDING complete → AGE']);
    expect(awaken).not.toHaveBeenCalled();
  });

  it('a middle stage walks on to the next missing one', async () => {
    db.dayaWorkSession.findUnique.mockResolvedValue({ id: 's1', campaignId: 'c1', goal: GOAL, status: 'active', stage: 'WORLD', progress: '[]' });
    advance.mockResolvedValue('VINES');
    await updateWorkSession({ sessionId: 's1', status: 'done' });
    expect(db.dayaWorkSession.update.mock.calls[0][0].data.stage).toBe('VINES');
  });

  it('after the last stage she is Born', async () => {
    db.dayaWorkSession.findUnique.mockResolvedValue({ id: 's1', campaignId: 'c1', goal: GOAL, status: 'active', stage: 'VINES', progress: '[]' });
    advance.mockResolvedValue(null);
    await updateWorkSession({ sessionId: 's1', status: 'done' });
    expect(db.dayaWorkSession.update.mock.calls[0][0].data.status).toBe('done');
    expect(awaken).toHaveBeenCalled();
  });

  it('a non-genesis job closes as before', async () => {
    db.dayaWorkSession.findUnique.mockResolvedValue({ id: 's1', campaignId: 'c1', goal: 'Build the tavern', status: 'active', stage: null, progress: '[]' });
    await updateWorkSession({ sessionId: 's1', status: 'done' });
    expect(advance).not.toHaveBeenCalled();
    expect(db.dayaWorkSession.update.mock.calls[0][0].data.status).toBe('done');
  });
});

describe('completion stage cycles', () => {
  const base = { id: 's1', goal: GOAL, plan: 'GENESIS BRIEF\nAGE: 25', cycleCount: 4 };

  it('each stage offers only its own tools (+ the session / prod levers)', () => {
    for (const stage of ['AGE', 'WORLD', 'MEMORIES', 'VINES'] as const) {
      const r = planWorkCycle({ ...base, stage }, asked(stage), '', []);
      expect(r.allowedTools).toEqual(expect.arrayContaining([...COMPLETION_STAGE_TOOLS[stage], 'update_work_session', 'raise_prod']));
      expect(r.allowedTools).not.toContain('edit_character_sheet');
      expect(r.text).toContain(`GENESIS STAGE: ${stage}`);
    }
    expect(planWorkCycle({ ...base, stage: 'AGE' }, [], '', []).allowedTools).not.toContain('grant_possession');
  });

  it('the laws: additive age, catalog-first paint, never fill open threads, goal-only vines', () => {
    expect(planWorkCycle({ ...base, stage: 'AGE' }, [], '', []).text).toMatch(/ADDITIVE/);
    expect(planWorkCycle({ ...base, stage: 'WORLD' }, asked('WORLD'), '', []).text).toMatch(/CATALOG FIRST/);
    expect(planWorkCycle({ ...base, stage: 'WORLD' }, asked('WORLD'), '', []).text).toMatch(/NEVER FILLED/);
    const vines = planWorkCycle({ ...base, stage: 'VINES' }, asked('VINES'), '', []).text;
    expect(vines).toMatch(/GOAL only/);
    expect(vines).toMatch(/never resistance, never opportunity/);
  });

  it('WORLD carries the GM\'s typed world messages with their ids', () => {
    const r = planWorkCycle({ ...base, stage: 'WORLD' }, asked('WORLD'), '', [], null, null, {
      worldMessages: [{ id: 'm_apt', at: '2026-08-02', text: 'A fourth-floor walkup studio…' }],
    });
    expect(r.text).toContain('[m_apt] (2026-08-02) A fourth-floor walkup studio');
  });

  it('WORLD withholds search_catalog when the catalog holds no items', () => {
    const r = planWorkCycle({ ...base, stage: 'WORLD' }, asked('WORLD'), '', [], { counts: { item: 0, seed: 1 }, total: 1 });
    expect(r.allowedTools).not.toContain('search_catalog');
    expect(r.text).toMatch(/holds no items/);
  });
});

describe('every stage opens with questions (Mike 2026-10-16: "He hasn\'t asked for my input one time")', () => {
  const base = { id: 's1', goal: GOAL, plan: 'GENESIS BRIEF\nAGE: 25', cycleCount: 0 };
  const prod = (stage: string | null) => ({ id: 'p1', round: 1, order: 1, anchorQuote: 'q', question: 'Where does she live?', why: 'w', kind: 'CREATIVE', status: 'ANSWERED', answer: 'A walkup.', jewlFill: null, stage });

  it('WORLD with no prod raised in it is a question round: raise_prod + reads only, no grant', () => {
    const r = planWorkCycle({ ...base, stage: 'WORLD' }, [], '', []);
    expect(r.text).toMatch(/QUESTION ROUND/);
    expect(r.text).toMatch(/WHERE SHE LIVES/);
    expect(r.allowedTools).toContain('raise_prod');
    expect(r.allowedTools).not.toContain('grant_possession');
    expect(r.allowedTools).not.toContain('seed_location');
  });

  it('a prod raised in the stage (answered or not) opens the build cycle', () => {
    const r = planWorkCycle({ ...base, stage: 'WORLD' }, [prod('WORLD')], '', []);
    expect(r.text).not.toMatch(/QUESTION ROUND/);
    expect(r.allowedTools).toContain('grant_possession');
    expect(r.text).toContain('Where does she live?');
  });

  it('a PRODDING-era prod does not count for a later stage', () => {
    const r = planWorkCycle({ ...base, stage: 'MEMORIES' }, [prod(null)], '', []);
    expect(r.text).toMatch(/QUESTION ROUND/);
    expect(r.allowedTools).not.toContain('daya_seed_memory');
  });

  it('VINES proposes goals as questions first', () => {
    const r = planWorkCycle({ ...base, stage: 'VINES' }, [], '', []);
    expect(r.text).toMatch(/propose her goals as questions/);
    expect(r.allowedTools).not.toContain('author_vine_goal');
  });
});

describe('coax vs sail (Mike 2026-10-16: "he has to know when to coax and when to sail the ship")', () => {
  const base = { id: 's1', goal: GOAL, plan: 'GENESIS BRIEF\nAGE: 25', cycleCount: 0 };
  it('a SAIL session skips the question round and carries the sail law', () => {
    const r = planWorkCycle({ ...base, stage: 'WORLD', mode: 'sail' }, [], '', []);
    expect(r.text).not.toMatch(/QUESTION ROUND/);
    expect(r.text).toMatch(/SAIL MODE/);
    expect(r.allowedTools).toContain('grant_possession');
  });
  it('a COAX session (the default) asks first', () => {
    const r = planWorkCycle({ ...base, stage: 'WORLD', mode: 'coax' }, [], '', []);
    expect(r.text).toMatch(/QUESTION ROUND/);
  });
});
