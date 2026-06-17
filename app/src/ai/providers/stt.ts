/**
 * Speech-to-text provider — pluggable.
 *
 * Per [[jewl-full-vision-2026-06-14]] audio capture is Day-1 in design but
 * the provider choice is deferred (Whisper local vs Deepgram vs Anthropic
 * when they ship STT). This module is the pipe: callers pass a base64
 * audio data URL, get back text or a clear "not configured" marker.
 *
 * To wire a real provider:
 *   1. Set STT_PROVIDER=whisper|deepgram|... in env.
 *   2. Add a case below that calls the provider's API.
 *   3. Return the transcribed text.
 *
 * The runtime treats the unwired path as an explicit text marker so JEWL
 * sees the audio came through but no transcription is available, instead
 * of a silent failure.
 */

import 'server-only';

export interface SttResult {
  transcript: string;
  provider: string;
  confidence?: number;
}

/** Parse a `data:audio/...;base64,...` URL into media type + base64 payload. */
function parseAudioDataUrl(url: string): { mediaType: string; base64: string } | null {
  const m = /^data:(audio\/[^;,]+);base64,(.+)$/.exec(url);
  if (!m) return null;
  return { mediaType: m[1], base64: m[2] };
}

/**
 * Transcribe a single audio data URL. Returns a result with `provider` set
 * to 'none' when no provider is configured — callers should treat that as
 * a soft failure (route as text marker, don't throw).
 */
export async function transcribeAudio(dataUrl: string): Promise<SttResult> {
  const parsed = parseAudioDataUrl(dataUrl);
  if (!parsed) {
    return {
      transcript: '[invalid audio data URL]',
      provider: 'none',
    };
  }

  const provider = (process.env.STT_PROVIDER || '').toLowerCase().trim();
  if (!provider || provider === 'none') {
    return {
      transcript: `[audio attachment present — STT_PROVIDER not configured (${parsed.mediaType}, ${Math.round((parsed.base64.length * 3) / 4)} bytes)]`,
      provider: 'none',
    };
  }

  // Real providers plug in here. The dispatch returns a clear "configured
  // but unknown" marker so misconfigurations are loud rather than silent.
  switch (provider) {
    // case 'whisper':
    //   return whisperTranscribe(parsed);
    // case 'deepgram':
    //   return deepgramTranscribe(parsed);
    default:
      return {
        transcript: `[STT_PROVIDER="${provider}" not implemented yet — pipe is wired, plug the API in]`,
        provider,
      };
  }
}
