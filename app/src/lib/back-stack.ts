// Pure state machine behind useBackCloses: every overlay owns one history entry,
// Back pops the topmost overlay only, UI-closes pop their own entry so the stack
// never accumulates dead entries. No React, no DOM globals: `win` is injected.

export interface BackWin {
  history: { pushState(state: unknown, title: string): void; back(): void; readonly state?: unknown };
  addEventListener(type: 'popstate', fn: () => void): void;
}

interface Entry { id: number; key: string; onClose: () => void; pushed: boolean; dead: boolean }

export function createBackStack(win: BackWin) {
  const stack: Entry[] = [];
  let nextId = 1;
  let baseRecenter: (() => void) | null = null; // page-level sentinel: Back with no overlay recenters
  let basePushed = false;
  let expected = 0; // popstates we caused ourselves (history.back()) and must ignore

  const back = () => { expected++; win.history.back(); };

  const pushBase = () => { win.history.pushState({ growthBase: true }, ''); basePushed = true; };

  const flushPushes = () => {
    if (baseRecenter && !basePushed) pushBase();
    for (const e of stack) {
      if (!e.pushed && !e.dead) { win.history.pushState({ growthOverlay: e.key }, ''); e.pushed = true; }
    }
  };

  // Pop dead (UI-closed, not-on-top) entries sitting at the top of the stack.
  const sweep = () => {
    while (stack.length && stack[stack.length - 1].dead) {
      const e = stack.pop()!;
      if (e.pushed) { back(); return; } // continue after this pop lands
    }
  };

  win.addEventListener('popstate', () => {
    if (expected > 0) {
      expected--;
      if (expected === 0) { sweep(); if (expected === 0) flushPushes(); }
      return;
    }
    // A real Back: closes the topmost live overlay only; with none open, recenter and keep the page.
    if (!stack.some(e => !e.dead) && baseRecenter) {
      stack.length = 0;
      baseRecenter();
      pushBase(); // the sentinel was just popped; put it back so the page stays on the stack
      return;
    }
    while (stack.length) {
      const e = stack.pop()!;
      if (e.dead) continue;
      if (!e.pushed) { stack.push(e); return; } // not in history yet; nothing to pop
      e.dead = true;
      e.onClose();
      sweep();
      return;
    }
  });

  return {
    open(key: string, onClose: () => void): number {
      const e: Entry = { id: nextId++, key, onClose, pushed: false, dead: false };
      stack.push(e);
      if (expected === 0) flushPushes(); // else deferred until the pending back lands
      return e.id;
    },
    /** Overlay closed by the UI (or unmounted). Safe to call after a Back-close. */
    close(id: number): void {
      const i = stack.findIndex(e => e.id === id);
      if (i < 0) return; // already closed via Back
      const e = stack[i];
      if (!e.pushed) { stack.splice(i, 1); return; }
      if (i === stack.length - 1) { stack.pop(); back(); sweep(); }
      else e.dead = true; // buried: swept when it reaches the top
    },
    /** Register the page-level sentinel (below all overlay entries). Returns an unregister fn. */
    setBase(onRecenter: () => void): () => void {
      baseRecenter = onRecenter;
      const st = win.history.state as { growthBase?: boolean } | null | undefined;
      if (st && st.growthBase) basePushed = true; // already standing on a sentinel (remount)
      else if (expected === 0) pushBase();
      return () => { if (baseRecenter === onRecenter) baseRecenter = null; };
    },
    depth: () => stack.filter(e => !e.dead).length,
  };
}
