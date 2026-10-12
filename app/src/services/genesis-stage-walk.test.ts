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
    db.dayaWorkSession.findUnique.mockResolvedValue({ id: 's1', campaignId: 'c1', goal: GOAL, status: 'active', stage: 'POSSESSIONS', progress: '[]' });
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
    for (const stage of ['AGE', 'POSSESSIONS', 'SEEDS', 'WORLD_FACTS', 'VINES'] as const) {
      const r = planWorkCycle({ ...base, stage }, [], '', []);
      expect(r.allowedTools).toEqual(expect.arrayContaining([...COMPLETION_STAGE_TOOLS[stage], 'update_work_session', 'raise_prod']));
      expect(r.allowedTools).not.toContain('edit_character_sheet');
      expect(r.text).toContain(`GENESIS STAGE: ${stage}`);
    }
    expect(planWorkCycle({ ...base, stage: 'AGE' }, [], '', []).allowedTools).not.toContain('grant_possession');
  });

  it('the laws: additive age, catalog-first paint, never fill open threads, goal-only vines', () => {
    expect(planWorkCycle({ ...base, stage: 'AGE' }, [], '', []).text).toMatch(/ADDITIVE/);
    expect(planWorkCycle({ ...base, stage: 'POSSESSIONS' }, [], '', []).text).toMatch(/CATALOG FIRST/);
    expect(planWorkCycle({ ...base, stage: 'SEEDS' }, [], '', []).text).toMatch(/NEVER FILLED/);
    const vines = planWorkCycle({ ...base, stage: 'VINES' }, [], '', []).text;
    expect(vines).toMatch(/GOAL only/);
    expect(vines).toMatch(/never resistance, never opportunity/);
  });

  it('SEEDS carries the GM\'s typed world messages with their ids', () => {
    const r = planWorkCycle({ ...base, stage: 'SEEDS' }, [], '', [], null, null, {
      worldMessages: [{ id: 'm_apt', at: '2026-08-02', text: 'A fourth-floor walkup studio…' }],
    });
    expect(r.text).toContain('[m_apt] (2026-08-02) A fourth-floor walkup studio');
  });

  it('POSSESSIONS withholds search_catalog when the catalog holds no items', () => {
    const r = planWorkCycle({ ...base, stage: 'POSSESSIONS' }, [], '', [], { counts: { item: 0, seed: 1 }, total: 1 });
    expect(r.allowedTools).not.toContain('search_catalog');
    expect(r.text).toMatch(/holds no items/);
  });
});
