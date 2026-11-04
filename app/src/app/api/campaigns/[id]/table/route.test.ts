import { describe, it, expect, vi, beforeEach } from 'vitest';

const order: string[] = [];
let scheduled: Array<() => unknown> = [];
const speakProse = vi.fn();

vi.mock('next/server', async () => {
  const actual = await vi.importActual<typeof import('next/server')>('next/server');
  return { ...actual, after: (fn: () => unknown) => { scheduled.push(fn); } };
});
vi.mock('@/lib/auth', () => ({ requireAuth: vi.fn().mockResolvedValue({ user: { id: 'u1', username: 'gm', role: 'WATCHER' } }) }));
vi.mock('@/services/inspection', () => ({ commitPlanningBoardOnGmMove: vi.fn() }));
vi.mock('@/services/table-speak', () => ({
  speakProse: (...a: unknown[]) => speakProse(...a),
  speakThroughNpc: vi.fn(), narrateAtTable: vi.fn(), getTableRoster: vi.fn(),
}));

import { POST } from './route';

function req(body: unknown) {
  return new Request('http://x/api/campaigns/c1/table', { method: 'POST', body: JSON.stringify(body) }) as unknown as import('next/server').NextRequest;
}

describe('POST /table: the line is answered once recorded', () => {
  beforeEach(() => { order.length = 0; scheduled = []; speakProse.mockReset(); });

  it('responds before the beats continuation runs, and the continuation runs after', async () => {
    const beats = vi.fn(async () => { order.push('beats'); });
    speakProse.mockImplementation(async (_c, _a, input: { beatsLater: (r: () => Promise<void>) => void }) => {
      order.push('recorded');
      input.beatsLater(beats);
      return { canonEventId: 'e1', dialogue: [], narration: 'n', responses: [], accepted: true };
    });
    const res = await POST(req({ message: 'Violet opens the door.' }), { params: Promise.resolve({ id: 'c1' }) });
    order.push('responded');
    const json = await res.json();
    expect(json.accepted).toBe(true);
    expect(beats).not.toHaveBeenCalled();
    expect(scheduled).toHaveLength(1);
    await scheduled[0]();
    expect(order).toEqual(['recorded', 'responded', 'beats']);
  });

  it('a beat error after the ack is logged, never unhandled', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    speakProse.mockImplementation(async (_c, _a, input: { beatsLater: (r: () => Promise<void>) => void }) => {
      input.beatsLater(async () => { throw new Error('boom'); });
      return { canonEventId: null, dialogue: [], narration: null, responses: [], accepted: true };
    });
    await POST(req({ message: 'x' }), { params: Promise.resolve({ id: 'c1' }) });
    await expect(Promise.resolve(scheduled[0]())).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('a pre-beat error is still returned as the error', async () => {
    speakProse.mockRejectedValue(Object.assign(new Error('withheld'), { statusCode: 422 }));
    const res = await POST(req({ message: 'x' }), { params: Promise.resolve({ id: 'c1' }) });
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect(scheduled).toHaveLength(0);
  });
});
