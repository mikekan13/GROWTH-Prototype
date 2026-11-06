# Local Kokoro TTS server

OpenAI-compatible text-to-speech for GRO.WTH, backed by Kokoro-82M on the local GPU (CPU fallback). Loopback-only.

## Start

    tts-server\start.bat

Uses the global Python 3.13 (needs `kokoro`, `torch`, `soundfile`, `numpy`, `fastapi`, `uvicorn`). Also started by `boot.ps1` (skip with `-NoTts`). The server warms up at startup and prints `[tts-server] ready on ...` when done.

## Endpoints

- `GET /health` -> `{ok, model, device, voices}`
- `GET /v1/voices` -> `[{id, label, lang, sex}]` (15 voices: af_heart, af_bella, af_nicole, af_sarah, af_sky, am_adam, am_michael, am_liam, bf_emma, bf_isabella, bf_alice, bf_lily, bm_george, bm_lewis, bm_daniel)
- `POST /v1/audio/speech` body `{"input": "...", "voice": "af_heart", "speed": 1.0, "response_format": "wav"}` -> `audio/wav` (24 kHz, 16-bit mono) with header `X-Audio-Seconds`. 400 on empty input, unknown voice, or non-wav format.

Example (PowerShell):

    Invoke-WebRequest -Method Post -Uri http://127.0.0.1:9001/v1/audio/speech `
      -ContentType application/json `
      -Body '{"input":"Her phone rings again.","voice":"bf_emma"}' -OutFile out.wav

## Env vars

- `TTS_PORT` (default 9001)
- `TTS_HOST` (default 127.0.0.1; loopback only, do not expose)

## Licence

Kokoro-82M weights Apache-2.0; `kokoro` package Apache-2.0; FastAPI MIT.
