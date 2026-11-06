# Local TTS server (Kokoro + Qwen3-TTS + FX)

OpenAI-compatible text-to-speech for GRO.WTH, backed by Kokoro-82M (fixed voices, fast) and Qwen3-TTS 1.7B (design a voice from a description, then clone it), with an FX chain for non-human voices. Loopback-only.

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

## Voice design, cloning and FX

Qwen models (`Qwen3-TTS-12Hz-1.7B-VoiceDesign`, `Qwen3-TTS-12Hz-1.7B-Base`) live as local directories under `QWEN_TTS_MODELS_DIR` (default `C:/Projects/GRO.WTH/models/<name>`; present = `model.safetensors` exists and no `*.part`). If a model is absent the server still starts (`engines.qwen_* = "absent"`); Base loads in a background thread at startup when present, otherwise on first demand.

- `POST /v1/voices/design` body `{description, text, language="English", seed=null, fx=null}` -> `{id, seconds, sample_rate, preview_wav_base64}`. Saves the RAW clip to `refs/<id>.wav` + `refs/<id>.json` (id = 16 hex). Same description + seed = same voice. 503 if the model is unavailable.

      Invoke-RestMethod -Method Post -Uri http://127.0.0.1:9001/v1/voices/design -ContentType application/json `
        -Body '{"description":"A weary woman in her thirties, low and warm, slightly hoarse, speaks slowly.","text":"I think I did, yes.","seed":7}'

- `POST /v1/audio/speech` also takes `voice_ref` (a ref id: uses the Qwen Base clone path, `voice` ignored; `speed` is ignored on this path) and `fx`. Headers `X-Engine: kokoro|qwen`, `X-Fx: <preset|custom|none>`. 503 `{"error":"qwen base model not available"}` if Base cannot load; 404 for unknown ref.

      Invoke-WebRequest -Method Post -Uri http://127.0.0.1:9001/v1/audio/speech -ContentType application/json `
        -Body '{"input":"He turns the car on.","voice_ref":"<id>","fx":"demonic"}' -OutFile out.wav

- `GET /v1/voices/refs/{id}` -> raw ref wav; `GET /v1/voices/refs/{id}/meta` -> json `{id, description, transcript, language, seed, sample_rate, seconds, created}`.
- `GET /v1/fx/presets` -> `{name: params}`. `GET /health` adds `engines: {kokoro, qwen_base: ready|loading|absent|error, qwen_design: ready|absent|error}` and `refs`.

### fx

`fx` is a preset name, a params object, or `{"preset": "demonic", "grit": 0.2}` (overrides). All params optional:
`pitch` semitones -24..24; `formant` 0.5..2.0 (voice "size": resample + stretch back, so it moves pitch and formants together; combine with `pitch` to taste); `layers` 0..4 (detuned copies, choir sheen); `grit` 0..1 (tanh saturation); `sub` 0..1 (octave-down copy); `air` 0..1 (breath noise); `reverb` 0..1 (longer and wetter; the server pads the clip with silence so the tail is not cut); `crush` 0..1 (bit/sample-rate reduction); `ring` Hz, 0 = off. Output peak is limited to 0.95.

Presets: human, demonic, angelic, monstrous, robotic, ghostly, giant, tiny. Test: `python fx_test.py`. Preset strengths were tuned 2026-11-06 so speech survives the effect (each preset applied to a designed clip still transcribes at ≥0.93 word match through whisper); `formant` also moves pitch, so heavier values smear consonants fast. Push past the presets with overrides per voice, not by raising the defaults.

### Model swap and VRAM

Kokoro is always resident (small). Base (~4 GB bf16) stays resident for speaking. A design request unloads Base, loads VoiceDesign (~4 GB), designs, unloads it and reloads Base, so only one 1.7B model is ever on the GPU (whisper holds ~1.8 GB). All GPU work is behind one lock, so speech requests queue during a design (load swap costs several seconds each way). The clone prompt is cached per ref id in memory.

## Env vars

- `TTS_PORT` (default 9001)
- `TTS_HOST` (default 127.0.0.1; loopback only, do not expose)

## Licence

Kokoro-82M weights Apache-2.0; `kokoro` package Apache-2.0; FastAPI MIT.
