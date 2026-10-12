/** Genesis submit (2026-10-11): one run per character — a second submit is a 409, never a duplicate. */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ConflictError } from '@/lib/errors';

const st = vi.hoisted(() => ({ existing: null as null | { id: string; status: string }, opened: 0, kicks: 0, stage: undefined as unknown, order: [] as string[] }));

vi.mock('@/lib/db', () => ({
  prisma: {
    character: { findUnique: vi.fn(async () => ({ id: 'ch1', name: 'Violet', campaignId: 'c1' })) },
    dayaWorkSession: { findFirst: vi.fn(async () => st.existing) },
  },
}));
vi.mock('@/ai/copilot/work-loop', () => ({ kickWorkLoop: vi.fn(() => { st.kicks++; }) }));
vi.mock('./daya-work-session', () => ({
  openWorkSession: vi.fn(async (o: { stage?: string }) => { st.opened++; st.stage = o.stage; st.order.push('session'); return { id: 's-new', status: 'active' }; }),
}));
vi.mock('./seed-pick', () => ({
  pickSeedForCharacter: vi.fn(async () => {
    st.order.push('seed');
    return { seed: { name: 'Human', id: 'g-human', pickedBy: 'default', pickedAt: 'now' }, changed: true, modelCalled: false, ms: 3 };
  }),
}));

const { submitCharacterGenesis } = await import('./character-genesis');
const input = { backstory: 'A long enough backstory to gestate — she grew up by the river and left at seventeen.' };
const submit = () => submitCharacterGenesis({ characterId: 'ch1', input, actorId: 'gm', actorRole: 'WATCHER' });

describe('submitCharacterGenesis', () => {
  beforeEach(() => { st.existing = null; st.opened = 0; st.kicks = 0; st.order = []; });

  it('picks the seed FIRST — before the session opens — and returns it', async () => {
    await expect(submit()).resolves.toMatchObject({ seed: { name: 'Human', pickedBy: 'default' } });
    expect(st.order).toEqual(['seed', 'session']);
  });

  it('opens one session when none is running', async () => {
    await expect(submit()).resolves.toMatchObject({ sessionId: 's-new', alreadyRunning: false });
    expect(st.opened).toBe(1);
    // Genesis is a dialogue (2026-10-12): it opens asking, not building.
    expect(st.stage).toBe('PRODDING');
  });

  it('refuses a second concurrent run with a 409 and opens nothing', async () => {
    st.existing = { id: 's1', status: 'active' };
    await expect(submit()).rejects.toBeInstanceOf(ConflictError);
    st.existing = { id: 's1', status: 'blocked' };
    await expect(submit()).rejects.toThrow(/waiting on you/);
    expect(st.opened).toBe(0);
    expect(st.kicks).toBe(2);
  });
});
