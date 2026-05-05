import 'server-only';
/**
 * Pod wake-on-use. Auto-hibernate is DISABLED — it kept killing the pod
 * mid-test. Pod is externally managed now: user starts/stops via
 * scripts/pod-ctl.mjs or the /api/portraits/pod route.
 *
 * markUsed() still wakes the pod if it's hibernated so the first gen of a
 * session works without manual cloud-up.mjs.
 *
 * Module-load hook clears any legacy interval on HMR so the old
 * 2-minute-auto-park watcher dies when this file reloads.
 */

import { isPodRunning, resumePod, stopPod, waitForComfyReady } from './pod-client';

interface KeepaliveState {
  lastUsedMs: number | null;
  watcherTimer: NodeJS.Timeout | null;
  wakeInFlight: Promise<boolean> | null;
  hibernatingInFlight: Promise<boolean> | null;
}

const g = globalThis as unknown as { __podKeepalive?: KeepaliveState };
if (!g.__podKeepalive) {
  g.__podKeepalive = {
    lastUsedMs: null,
    watcherTimer: null,
    wakeInFlight: null,
    hibernatingInFlight: null,
  };
}
const state = g.__podKeepalive!;

// Kill any legacy watcher left over from an earlier module version.
if (state.watcherTimer) {
  clearInterval(state.watcherTimer);
  state.watcherTimer = null;
  console.log('[pod-keepalive] cleared legacy auto-hibernate watcher');
}

export function startKeepaliveWatcher() {
  // Intentionally a no-op. Auto-hibernate disabled.
}

export async function markUsed(): Promise<void> {
  state.lastUsedMs = Date.now();

  if (state.wakeInFlight) {
    await state.wakeInFlight;
    return;
  }

  const running = await isPodRunning();
  if (running) return;

  state.wakeInFlight = (async () => {
    console.log('[pod-keepalive] pod not running — resuming');
    const resumed = await resumePod();
    if (!resumed) { console.warn('[pod-keepalive] resume call failed'); return false; }
    const ready = await waitForComfyReady();
    if (!ready) console.warn('[pod-keepalive] ComfyUI did not become ready within timeout');
    return ready;
  })();

  try {
    await state.wakeInFlight;
  } finally {
    state.wakeInFlight = null;
    state.lastUsedMs = Date.now();
  }
}

export async function forceHibernate(): Promise<boolean> {
  if (state.hibernatingInFlight) return state.hibernatingInFlight;
  state.hibernatingInFlight = stopPod().then(ok => {
    state.hibernatingInFlight = null;
    if (ok) state.lastUsedMs = null;
    return ok;
  });
  return state.hibernatingInFlight;
}

export function getKeepaliveStatus() {
  return {
    lastUsedMs: state.lastUsedMs,
    idleMs: state.lastUsedMs ? Date.now() - state.lastUsedMs : null,
    idleHibernateMs: null,
    watcherActive: false,
    wakeInFlight: state.wakeInFlight !== null,
    hibernatingInFlight: state.hibernatingInFlight !== null,
  };
}
