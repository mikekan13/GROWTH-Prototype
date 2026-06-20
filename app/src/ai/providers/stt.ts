/**
 * Speech-to-text provider — pluggable.
 *
 * Two production providers share one OpenAI-compatible HTTP/multipart
 * code path:
 *
 *   STT_PROVIDER=openai
 *     → cloud Whisper at api.openai.com, needs OPENAI_API_KEY.
 *
 *   STT_PROVIDER=whisper-local
 *     → any locally hosted server that speaks the OpenAI Audio API spec.
 *       Tested with faster-whisper-server (recommended) and
 *       whisper.cpp's bundled server. Set WHISPER_LOCAL_URL to override
 *       the default `http://localhost:9000/v1/audio/transcriptions`.
 *
 * Whisper is MIT-licensed (model + weights + popular implementations),
 * so both paths are commercially safe.
 *
 * Adding another provider is a single `case` below — keep the
 * interface a single base64 dataUrl in, an SttResult out.
 */

import 'server-only';

export interface SttResult {
  transcript: string;
  provider: string;
  confidence?: number;
}

/**
 * Parse a `data:audio/...;base64,...` URL into media type + base64 payload.
 *
 * Browsers emit URLs like `data:audio/webm;codecs=opus;base64,<...>` from
 * MediaRecorder, so the parser has to tolerate optional codec/parameter
 * segments between the MIME type and `;base64,`. We split on `;base64,`
 * (the only stable anchor) and treat anything before it as media-type
 * metadata. The leading `data:` prefix is required.
 */
function parseAudioDataUrl(url: string): { mediaType: string; base64: string } | null {
  if (!url.startsWith('data:')) return null;
  const marker = ';base64,';
  const splitAt = url.indexOf(marker);
  if (splitAt < 0) return null;
  const header = url.slice('data:'.length, splitAt); // e.g. "audio/webm;codecs=opus"
  const base64 = url.slice(splitAt + marker.length);
  if (!base64) return null;
  // The first segment is the MIME type; everything after is parameters
  // (codecs, charset, etc.) — we only care about the type for routing.
  const mediaType = header.split(';')[0] || '';
  if (!mediaType.startsWith('audio/')) return null;
  return { mediaType, base64 };
}

/**
 * Transcribe a single audio data URL. Returns a result with `provider` set
 * to 'none' when no provider is configured — callers should treat that as
 * a soft failure (route as text marker, don't throw).
 *
 * `initialPrompt` is forwarded to providers that support it (OpenAI's
 * Whisper API does; faster-whisper does). Use it for proper-noun
 * biasing — pass a short string of names the speaker is likely to
 * use (PCs, NPCs, locations, cosmology terms) and Whisper will
 * stop substituting phonetic neighbors.
 */
export async function transcribeAudio(
  dataUrl: string,
  options: { initialPrompt?: string } = {},
): Promise<SttResult> {
  const parsed = parseAudioDataUrl(dataUrl);
  if (!parsed) {
    return {
      transcript: '[invalid audio data URL]',
      provider: 'none',
    };
  }

  const provider = (process.env.STT_PROVIDER || '').toLowerCase().trim();
  if (!provider || provider === 'none') {
    // Constant marker (no chunk-varying fields) so the audio-chunk endpoint
    // can dedup it. Otherwise the chat log fills with one warning per chunk.
    return {
      transcript: '[audio attachment present — STT_PROVIDER not configured]',
      provider: 'none',
    };
  }

  switch (provider) {
    case 'openai':
      return openAiCompatibleTranscribe(parsed, {
        provider: 'openai',
        url: 'https://api.openai.com/v1/audio/transcriptions',
        apiKey: process.env.OPENAI_API_KEY,
        model: process.env.OPENAI_STT_MODEL || 'whisper-1',
        missingKeyMessage: '[STT_PROVIDER=openai but OPENAI_API_KEY not set]',
        initialPrompt: options.initialPrompt,
      });
    case 'whisper-local':
      return openAiCompatibleTranscribe(parsed, {
        provider: 'whisper-local',
        url:
          process.env.WHISPER_LOCAL_URL ||
          'http://localhost:9000/v1/audio/transcriptions',
        // Local servers usually don't auth; if WHISPER_LOCAL_API_KEY is set we
        // pass it through (some self-hosted setups do require a key).
        apiKey: process.env.WHISPER_LOCAL_API_KEY,
        model: process.env.WHISPER_LOCAL_MODEL || 'Systran/faster-whisper-base.en',
        // No "missing key" marker — local servers are valid without one.
        missingKeyMessage: null,
        initialPrompt: options.initialPrompt,
      });
    default:
      return {
        transcript: `[STT_PROVIDER="${provider}" not implemented yet — pipe is wired, plug the API in]`,
        provider,
      };
  }
}

interface OpenAiCompatibleConfig {
  provider: string;
  url: string;
  apiKey: string | undefined;
  model: string;
  /** If set and apiKey is missing, return this marker instead of calling. */
  missingKeyMessage: string | null;
  /** Whisper initial-prompt for proper-noun biasing. */
  initialPrompt?: string;
}

/**
 * Single transcription codepath that targets any server speaking the
 * OpenAI Audio API spec — cloud Whisper, self-hosted faster-whisper-server,
 * whisper.cpp's server, LiteLLM proxies, etc. All differences (URL, auth,
 * model name, error messages) are config knobs on top of one HTTP call.
 *
 * Why this shape: keeping a single multipart pathway means future provider
 * swaps are 3 lines of config, not a parallel client.
 */
async function openAiCompatibleTranscribe(
  parsed: { mediaType: string; base64: string },
  cfg: OpenAiCompatibleConfig,
): Promise<SttResult> {
  if (!cfg.apiKey && cfg.missingKeyMessage) {
    return { transcript: cfg.missingKeyMessage, provider: cfg.provider };
  }

  // Decode base64 → bytes → Blob, then upload as multipart. Required by both
  // OpenAI's spec and the popular local server implementations.
  const bytes = Uint8Array.from(Buffer.from(parsed.base64, 'base64'));
  const blob = new Blob([bytes], { type: parsed.mediaType });
  const ext = mediaTypeToExt(parsed.mediaType);

  const form = new FormData();
  form.append('file', blob, `audio.${ext}`);
  form.append('model', cfg.model);
  form.append('response_format', 'json');
  if (cfg.initialPrompt && cfg.initialPrompt.trim()) {
    form.append('prompt', cfg.initialPrompt.trim());
  }

  const headers: Record<string, string> = {};
  if (cfg.apiKey) headers.Authorization = `Bearer ${cfg.apiKey}`;

  let res: Response;
  try {
    res = await fetch(cfg.url, { method: 'POST', headers, body: form });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return {
      transcript: `[STT_PROVIDER=${cfg.provider} unreachable at ${cfg.url}: ${msg.slice(0, 150)}]`,
      provider: cfg.provider,
    };
  }
  if (!res.ok) {
    const errText = await res.text().catch(() => '<no body>');
    return {
      transcript: `[STT_PROVIDER=${cfg.provider} HTTP ${res.status}: ${errText.slice(0, 200)}]`,
      provider: cfg.provider,
    };
  }
  const data = (await res.json()) as { text?: string };
  return {
    transcript: (data.text ?? '').trim() || '[empty transcript]',
    provider: cfg.provider,
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
