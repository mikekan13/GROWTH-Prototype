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

/**
 * The ALWAYS-ON MIC (JEWL's recorder feeding the table) is OPT-IN per campaign, default OFF (Michael 2026-11-06,
 * after two sessions where a mic nobody had asked for posted Whisper hallucinations as the Watcher's declarations:
 * "Stopped. Fix it."). The Mic button in JEWL's drawer turns it on; it stays on for that campaign on that device.
 */
const micKey = (campaignId: string) => `growth:always-on-mic:${campaignId}`;
export const ALWAYS_ON_MIC_EVENT = 'growth:always-on-mic';

export function readAlwaysOnMic(campaignId: string): boolean {
  try { return window.localStorage.getItem(micKey(campaignId)) === '1'; } catch { return false; }
}

export function writeAlwaysOnMic(campaignId: string, on: boolean): void {
  try { window.localStorage.setItem(micKey(campaignId), on ? '1' : '0'); } catch { /* storage blocked */ }
  try { window.dispatchEvent(new CustomEvent(ALWAYS_ON_MIC_EVENT, { detail: { campaignId, on } })); } catch { /* no window */ }
}

export function subscribeAlwaysOnMic(campaignId: string, cb: (on: boolean) => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const onLocal = (e: Event) => {
    const d = (e as CustomEvent<{ campaignId: string; on: boolean }>).detail;
    if (d?.campaignId === campaignId) cb(!!d.on);
  };
  const onStorage = (e: StorageEvent) => { if (e.key === micKey(campaignId)) cb(e.newValue === '1'); };
  window.addEventListener(ALWAYS_ON_MIC_EVENT, onLocal);
  window.addEventListener('storage', onStorage);
  cb(readAlwaysOnMic(campaignId));
  return () => {
    window.removeEventListener(ALWAYS_ON_MIC_EVENT, onLocal);
    window.removeEventListener('storage', onStorage);
  };
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
