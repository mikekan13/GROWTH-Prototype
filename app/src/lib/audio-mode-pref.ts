/** The Watcher's audio-mode preference, per campaign (localStorage; every access guarded). */
const key = (campaignId: string) => `growth:audio-mode:${campaignId}`;

export function readAudioMode(campaignId: string): boolean {
  try { return window.localStorage.getItem(key(campaignId)) === '1'; } catch { return false; }
}

export function writeAudioMode(campaignId: string, on: boolean): void {
  try { window.localStorage.setItem(key(campaignId), on ? '1' : '0'); } catch { /* storage blocked */ }
}
