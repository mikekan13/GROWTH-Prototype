/** Seat labels: no username reaches a model (anonymity ruling 2026-10-16). */
import { describe, it, expect, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/db', () => ({ prisma: {} }));
const { labelSeats, seatLabel } = await import('./seat-labels');

describe('seat labels', () => {
  it('the GM is the Watcher; members are numbered in join order; the GM is never a Player', () => {
    const s = labelSeats('gm', ['a', 'gm', 'b']);
    expect(seatLabel(s, 'gm')).toBe('the Watcher');
    expect(seatLabel(s, 'a')).toBe('Player 1');
    expect(seatLabel(s, 'b')).toBe('Player 2');
    expect(seatLabel(s, 'stranger')).toBe('an outside account');
    expect(seatLabel(s, null)).toBe('—');
  });
});
