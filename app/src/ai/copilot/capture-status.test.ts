import { describe, it, expect, beforeEach } from 'vitest';
import { recordCapture, isMarkerTranscript, _resetCaptureStatus, NO_AUDIO_AFTER_EMPTIES } from './capture-status';

describe('capture status', () => {
  beforeEach(() => _resetCaptureStatus());

  it('flags no-audio after N consecutive empties and clears on speech', () => {
    for (let i = 1; i < NO_AUDIO_AFTER_EMPTIES; i++) expect(recordCapture('c', 'u', false)).toBe('ok');
    expect(recordCapture('c', 'u', false)).toBe('no-audio');
    expect(recordCapture('c', 'u', false)).toBe('no-audio');
    expect(recordCapture('c', 'u', true)).toBe('ok');
    expect(recordCapture('c', 'u', false)).toBe('ok');
  });

  it('tracks users separately', () => {
    for (let i = 0; i < NO_AUDIO_AFTER_EMPTIES; i++) recordCapture('c', 'a', false);
    expect(recordCapture('c', 'b', false)).toBe('ok');
  });

  it('recognises markers', () => {
    expect(isMarkerTranscript('[empty transcript]')).toBe(true);
    expect(isMarkerTranscript('hello [there]')).toBe(false);
  });
});
