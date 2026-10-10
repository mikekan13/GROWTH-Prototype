/**
 * Mic capture status per campaign+user (in-memory; resets with the server).
 * Empty / bracketed-marker transcripts (e.g. "[empty transcript]") are NOT chat
 * lines — they only count toward 'no-audio'. Any real transcript clears it.
 */

export type CaptureStatus = 'ok' | 'no-audio';

/** Consecutive empty chunks before the mic is flagged as capturing nothing. */
export const NO_AUDIO_AFTER_EMPTIES = 3;

const empties = new Map<string, number>();

/** A bracketed STT marker, not speech. */
export function isMarkerTranscript(t: string): boolean {
  const s = t.trim();
  return s.startsWith('[') && s.endsWith(']');
}

export function recordCapture(campaignId: string, userId: string, gotSpeech: boolean): CaptureStatus {
  const key = `${campaignId}:${userId}`;
  if (gotSpeech) {
    empties.delete(key);
    return 'ok';
  }
  const n = (empties.get(key) ?? 0) + 1;
  empties.set(key, n);
  return n >= NO_AUDIO_AFTER_EMPTIES ? 'no-audio' : 'ok';
}

export function _resetCaptureStatus(): void {
  empties.clear();
}
