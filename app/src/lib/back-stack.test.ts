import { describe, it, expect } from 'vitest';
import { createBackStack, type BackWin } from './back-stack';

// Fake browser: history array + async-free traversal driven by the test.
function fake() {
  const hist: unknown[] = ['page'];
  let idx = 0; let pending = 0; let fn: () => void = () => {};
  const win: BackWin = {
    history: {
      pushState(s) { hist.splice(idx + 1); hist.push(s); idx++; },
      back() { pending++; },
    },
    addEventListener(_t, f) { fn = f; },
  };
  const land = () => { while (pending > 0) { pending--; if (idx > 0) idx--; fn(); } };
  const userBack = () => { if (idx > 0) idx--; fn(); };
  return { win, hist: () => idx, land, userBack };
}

describe('back-stack', () => {
  it('Back closes the overlay and stays on the page', () => {
    const f = fake(); const s = createBackStack(f.win); let closed = 0;
    s.open('a', () => closed++);
    expect(f.hist()).toBe(1);
    f.userBack();
    expect(closed).toBe(1); expect(f.hist()).toBe(0);
  });
  it('UI close pops its own entry without calling onClose twice', () => {
    const f = fake(); const s = createBackStack(f.win); let closed = 0;
    const id = s.open('a', () => closed++);
    s.close(id); f.land();
    expect(closed).toBe(0); expect(f.hist()).toBe(0);
  });
  it('two overlays need two Backs, topmost first', () => {
    const f = fake(); const s = createBackStack(f.win); const order: string[] = [];
    s.open('a', () => order.push('a')); s.open('b', () => order.push('b'));
    f.userBack(); expect(order).toEqual(['b']);
    f.userBack(); expect(order).toEqual(['b', 'a']); expect(f.hist()).toBe(0);
  });
  it('closing a buried overlay by UI leaves no dead entry', () => {
    const f = fake(); const s = createBackStack(f.win); const order: string[] = [];
    const a = s.open('a', () => order.push('a')); s.open('b', () => order.push('b'));
    s.close(a);
    f.userBack(); f.land();
    expect(order).toEqual(['b']); expect(f.hist()).toBe(0);
  });
  it('fast close then reopen does not get popped by the stale back', () => {
    const f = fake(); const s = createBackStack(f.win); let closed = 0;
    const a = s.open('a', () => closed++);
    s.close(a); s.open('a', () => closed++); // before back lands
    f.land();
    expect(closed).toBe(0); expect(f.hist()).toBe(1); expect(s.depth()).toBe(1);
  });
  it('open then close before any push settles is a no-op', () => {
    const f = fake(); const s = createBackStack(f.win);
    const a = s.open('a', () => {}); s.close(a); f.land();
    expect(f.hist()).toBe(0);
  });
});
