/**
 * The Watcher's audio-mode preference, per campaign (localStorage; every access guarded).
 * Audio mode ON = the table reads aloud (useTableReader). While it is on, JEWL's always-on mic and JEWL's
 * browser voice stand down (one mouth, one ear at a time until half-duplex exists — stress test 2026-11-06:
 * the phone mic heard JEWL talking and posted it as the Watcher's lines). Changes are broadcast on `window`
 * so other components (JewlChip) follow the toggle live.
 */
const key = (campaignId: string) => `growth:audio-mode:${campaignId}`;
export const AUDIO_MODE_EVENT = 'growth:audio-mode';

export function readAudioMode(campaignId: string): boolean {
  try { return window.localStorage.getItem(key(campaignId)) === '1'; } catch { return false; }
}

export function writeAudioMode(campaignId: string, on: boolean): void {
  try { window.localStorage.setItem(key(campaignId), on ? '1' : '0'); } catch { /* storage blocked */ }
  try { window.dispatchEvent(new CustomEvent(AUDIO_MODE_EVENT, { detail: { campaignId, on } })); } catch { /* no window */ }
}

/** Calls `cb` with the current value now and on every change (same tab or another tab). Returns unsubscribe. */
export function subscribeAudioMode(campaignId: string, cb: (on: boolean) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const onLocal = (e: Event) => {
    const d = (e as CustomEvent<{ campaignId: string; on: boolean }>).detail;
    if (d?.campaignId === campaignId) cb(!!d.on);
  };
  const onStorage = (e: StorageEvent) => { if (e.key === key(campaignId)) cb(e.newValue === '1'); };
  window.addEventListener(AUDIO_MODE_EVENT, onLocal);
  window.addEventListener('storage', onStorage);
  cb(readAudioMode(campaignId));
  return () => {
    window.removeEventListener(AUDIO_MODE_EVENT, onLocal);
    window.removeEventListener('storage', onStorage);
  };
}
