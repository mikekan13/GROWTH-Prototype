# Local Whisper STT Server (for JEWL)

Tiny FastAPI server that exposes an OpenAI-compatible
`POST /v1/audio/transcriptions` endpoint backed by GPU-accelerated
faster-whisper. JEWL points at this; he can't tell it apart from cloud
OpenAI Whisper.

**License:** Whisper (MIT) + faster-whisper (MIT) + ctranslate2 (MIT) +
FastAPI (MIT) + Uvicorn (BSD). All commercially safe.

## One-time setup

1. Make sure NVIDIA drivers and CUDA toolkit are installed (you almost
   certainly already have these — `nvidia-smi` from PowerShell confirms).
2. Double-click `start.bat`. The first run:
   - Creates a Python venv in `.venv/`
   - Downloads dependencies (~1.5 GB — includes CUDA libs)
   - Downloads the Whisper model on first transcription (~470 MB for
     `small.en`)

Subsequent runs of `start.bat` are instant — just launches the server.

The server listens on `http://127.0.0.1:9000` and answers
`POST /v1/audio/transcriptions` exactly like OpenAI's spec. Health check
at `GET /health`.

## Tuning

Set env vars before running (or edit `start.bat`):

| Var | Default | Notes |
|---|---|---|
| `WHISPER_MODEL` | `small.en` | `tiny.en`, `base.en`, `small.en`, `medium.en`, `large-v3`. `.en` variants are English-only and 2-3× faster. |
| `WHISPER_DEVICE` | `cuda` | Falls back to CPU automatically if CUDA fails. |
| `WHISPER_COMPUTE` | `float16` | `float16` for GPU, `int8` for CPU, `int8_float16` for tight-VRAM GPU. |
| `WHISPER_PORT` | `9000` | Match `WHISPER_LOCAL_URL` in the app's `.env.local` if you change it. |
| `WHISPER_HOST` | `127.0.0.1` | Loopback-only. Don't bind to 0.0.0.0 unless you intend to expose it. |

## Model size vs RTX 4060 8GB

| Model | VRAM (float16) | Speed | Quality |
|---|---|---|---|
| `tiny.en` | ~0.5 GB | 10× realtime | OK |
| `base.en` | ~1 GB | 7× realtime | Good |
| `small.en` | ~2 GB | 5× realtime | Better (recommended) |
| `medium.en` | ~5 GB | 2× realtime | Great |
| `large-v3` | ~10 GB (won't fit) | — | Best (use int8_float16: ~5GB) |

For ambient transcription of a TTRPG session, `small.en` is the sweet
spot. If you want better accuracy and you're not running other GPU work,
bump to `medium.en`.

## Telling the GROWTH app to use this

Already wired in `app/.env.local`:

```
STT_PROVIDER=whisper-local
```

The app defaults to `http://localhost:9000/v1/audio/transcriptions` for
this provider. Override with `WHISPER_LOCAL_URL` if you change ports.

## Stopping

Ctrl+C in the server window. The model unloads from VRAM on exit.

## Running on a different machine on your LAN

If you want the GROWTH app to talk to a Whisper server running on a
different box:

1. On the Whisper box, set `WHISPER_HOST=0.0.0.0` before `start.bat`.
2. In `app/.env.local`, set:
   ```
   WHISPER_LOCAL_URL=http://<that-machine-ip>:9000/v1/audio/transcriptions
   ```

Audio leaves your local machine in that case — still no third-party
service involved.
