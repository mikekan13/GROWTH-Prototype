/** GPU spend guard (Mike 2026-10-17: "We can't have this happen again"). */
import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ prisma: {} }));
const { gpuVerdict } = await import('./gpu-budget');

describe('gpu budget', () => {
  it('outside a session: blocked at the cap', () => {
    expect(gpuVerdict(2.99, 3, false).allowed).toBe(true);
    expect(gpuVerdict(3, 3, false).allowed).toBe(false);
  });
  it('in a live session: allowed to twice the cap, then blocked', () => {
    expect(gpuVerdict(5.5, 3, true).allowed).toBe(true);
    expect(gpuVerdict(6, 3, true).allowed).toBe(false);
  });
  it('unreadable billing never blocks', () => {
    expect(gpuVerdict(null, 3, false).allowed).toBe(true);
  });
});
