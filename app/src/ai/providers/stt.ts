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
    case 'openai':
      return openAiWhisperTranscribe(parsed);
    // case 'deepgram': return deepgramTranscribe(parsed);
    // case 'whisper-local': return whisperLocalTranscribe(parsed);
    default:
      return {
        transcript: `[STT_PROVIDER="${provider}" not implemented yet — pipe is wired, plug the API in]`,
        provider,
      };
  }
}

/**
 * OpenAI Whisper API path. Uses the platform-native FormData + Blob (Node
 * 18+) to upload the audio multipart — no additional SDK dependency. Set
 *
 *   STT_PROVIDER=openai
 *   OPENAI_API_KEY=sk-...
 *   OPENAI_STT_MODEL=whisper-1   (optional; whisper-1 is the default)
 */
async function openAiWhisperTranscribe(
  parsed: { mediaType: string; base64: string },
): Promise<SttResult> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    return {
      transcript: '[STT_PROVIDER=openai but OPENAI_API_KEY not set]',
      provider: 'openai',
    };
  }
  const model = process.env.OPENAI_STT_MODEL || 'whisper-1';

  // Decode base64 → bytes → Blob. The filename is required by Whisper;
  // the extension matters less than the content-type header inside the
  // multipart, but we pick a sensible default from the media type.
  const bytes = Uint8Array.from(Buffer.from(parsed.base64, 'base64'));
  const blob = new Blob([bytes], { type: parsed.mediaType });
  const ext = mediaTypeToExt(parsed.mediaType);

  const form = new FormData();
  form.append('file', blob, `audio.${ext}`);
  form.append('model', model);
  form.append('response_format', 'json');

  const res = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '<no body>');
    return {
      transcript: `[OpenAI Whisper HTTP ${res.status}: ${errText.slice(0, 200)}]`,
      provider: 'openai',
    };
  }
  const data = (await res.json()) as { text?: string };
  return {
    transcript: (data.text ?? '').trim() || '[empty transcript]',
    provider: 'openai',
  };
}

function mediaTypeToExt(mediaType: string): string {
  const m = mediaType.toLowerCase();
  if (m.includes('mp3') || m.includes('mpeg')) return 'mp3';
  if (m.includes('wav')) return 'wav';
  if (m.includes('m4a') || m.includes('mp4')) return 'm4a';
  if (m.includes('webm')) return 'webm';
  if (m.includes('ogg')) return 'ogg';
  if (m.includes('flac')) return 'flac';
  return 'audio';
}
