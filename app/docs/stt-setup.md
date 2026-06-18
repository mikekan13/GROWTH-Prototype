# Speech-to-Text Setup for JEWL

JEWL listens continuously while the GM is on a campaign page. He needs a
speech-to-text (STT) provider to turn audio into text. Two paths:

| Provider | License | Cost | Setup difficulty |
|---|---|---|---|
| Local Whisper (recommended for GROWTH dev) | MIT | $0 ongoing | One-time GPU server install |
| OpenAI Whisper API | MIT model, paid hosting | ~$0.006/min | Just an API key |

Whisper itself (the model, weights, and the popular open-source
implementations) is MIT-licensed. **Commercial use is unrestricted.**

The two providers share one HTTP path in `src/ai/providers/stt.ts`, so
swapping between cloud and local is a one-env-var change.

---

## Option A — Local Whisper (recommended)

You run a small server on your machine that exposes the OpenAI Audio API
on a local port. JEWL points at it. No external service, no per-minute
cost, no data leaves your network.

### Recommended: `faster-whisper-server` (Docker, GPU)

The fastest path on a Windows + NVIDIA GPU rig. Uses CTranslate2 for
GPU-accelerated inference, exposes an OpenAI-compatible API, and ships as
a single Docker image.

1. Install Docker Desktop with WSL2 + NVIDIA Container Toolkit (one-time).
2. Pull and run the GPU image:
   ```
   docker run --gpus all -d -p 9000:8000 ^
     -e WHISPER__MODEL=Systran/faster-whisper-base.en ^
     fedirz/faster-whisper-server:latest-cuda
   ```
   - Bigger model = better quality, more VRAM: swap `base.en` for
     `small.en`, `medium.en`, or `large-v3`. The `.en` variants are
     English-only and noticeably faster.
   - First boot downloads the model from Hugging Face; subsequent boots
     are instant.
3. In `app/.env.local`:
   ```
   STT_PROVIDER=whisper-local
   WHISPER_LOCAL_MODEL=Systran/faster-whisper-base.en
   ```
   (You don't need `WHISPER_LOCAL_URL` if the server is at the default
   `http://localhost:9000`. You don't need `WHISPER_LOCAL_API_KEY` —
   local servers don't require one.)
4. Restart the Next dev server.

That's it. JEWL's audio chunks now transcribe through your local GPU.

### Alternative: `whisper.cpp` server (no Docker)

If you'd rather skip Docker, `whisper.cpp` ships a server binary with CUDA
support. Slightly more setup but no container runtime needed.

1. Grab the latest release from
   https://github.com/ggerganov/whisper.cpp/releases (look for a
   `whisper-bin-x64-cuda` build for Windows).
2. Download a `.bin` model from the same repo or Hugging Face (e.g.
   `ggml-base.en.bin`).
3. Run:
   ```
   whisper-server -m ggml-base.en.bin --host 0.0.0.0 --port 9000
   ```
4. Set `STT_PROVIDER=whisper-local` and `WHISPER_LOCAL_URL=http://localhost:9000/inference`
   (whisper.cpp's server uses `/inference`, not the OpenAI path).

---

## Option B — OpenAI Whisper API

Easiest setup, costs money. ~$0.006 per minute of audio = ~$1.44 for a
4-hour live session.

1. Create an API key at https://platform.openai.com/api-keys
2. In `app/.env.local`:
   ```
   STT_PROVIDER=openai
   OPENAI_API_KEY=sk-...
   ```
3. Restart the dev server.

---

## Switching between providers

Both paths use the same code (`openAiCompatibleTranscribe` in
`src/ai/providers/stt.ts`). To switch:

- Local → cloud: change `STT_PROVIDER=whisper-local` to
  `STT_PROVIDER=openai` and provide `OPENAI_API_KEY`. Done.
- Cloud → local: reverse, set `WHISPER_LOCAL_URL` if not on the default
  port. Done.

The runtime never bakes in a choice. You can run cloud for portable
dev (laptop) and local for the home rig.

---

## What JEWL does with the audio

Per [[jewl-classifier-architecture]]:

1. Each 10-second audio chunk hits `POST /api/campaigns/[id]/audio-chunk`.
2. STT runs via whichever provider is configured.
3. The transcript is logged as a `[ambient]` user message.
4. A cheap Haiku call (the classifier) decides if JEWL should react.
5. Only `react`/`act`/`proact` verdicts wake the expensive Sonnet
   tool-use loop. Default is `silent`.

So the STT provider only affects what JEWL HEARS, not whether he reacts.
Wrong-provider markers (e.g. "not configured", "HTTP 500") are logged once
per hour to avoid spamming the chat.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `[invalid audio data URL]` in chat | Browser sent a non-`data:audio/...` URL (should not happen post-2026-06-17 fix) | Verify the chip's audio status dot is green and check DevTools → Network for `/audio-chunk` |
| `[audio attachment present — STT_PROVIDER not configured]` | Env var not set or dev server wasn't restarted | Set `STT_PROVIDER` in `.env.local`, restart |
| `[STT_PROVIDER=openai but OPENAI_API_KEY not set]` | API key missing | Add `OPENAI_API_KEY=sk-...` |
| `[STT_PROVIDER=whisper-local unreachable at http://localhost:9000/...]` | Local server not running | Start the Docker container / whisper.cpp server |
| `[STT_PROVIDER=whisper-local HTTP 500: ...]` | Local server crashed or wrong model | Check the container logs / try a smaller model |
| Dot is green and pulses, but JEWL never responds | Classifier returning `silent` (often correct — he's pride-coded to default silent). Verify by typing a direct question. | Soften the classifier prompt in `src/ai/copilot/classifier.ts` if too quiet for your taste |
