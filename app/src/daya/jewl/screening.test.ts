import { describe, it, expect } from 'vitest';
import { screen } from './screening';

describe('screen (T15 in-flight screening stub)', () => {
  it('always passes through in Phase 1', () => {
    const verdict = screen('anything at all', { subsystem: 'test' });
    expect(verdict.action).toBe('pass');
  });

  it('passes regardless of content, entityId, or subsystem', () => {
    expect(screen('sensitive-looking content about grief and death').action).toBe('pass');
    expect(screen('', {}).action).toBe('pass');
    expect(screen('x', { entityId: 'e1', subsystem: 'router' }).action).toBe('pass');
  });

  it('is a pure function — same input always yields the same verdict shape', () => {
    const a = screen('hello', { subsystem: 'sanitize' });
    const b = screen('hello', { subsystem: 'sanitize' });
    expect(a).toEqual(b);
  });
});
