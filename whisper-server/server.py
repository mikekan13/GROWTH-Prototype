"""
Local Whisper STT server for JEWL.

Exposes an OpenAI-compatible POST /v1/audio/transcriptions endpoint backed
by faster-whisper running on the local GPU. JEWL's audio-chunk endpoint
hits this; he never knows the difference between this and cloud OpenAI.

Configuration via env vars (sensible defaults baked in):

  WHISPER_MODEL     model name or local path (default: small.en)
  WHISPER_DEVICE    cuda | cpu                (default: cuda)
  WHISPER_COMPUTE   float16 | int8 | int8_float16 (default: float16)
  WHISPER_PORT      port to listen on        (default: 9000)
  WHISPER_HOST      host to bind             (default: 127.0.0.1)

For a 4060 (8GB VRAM), small.en + float16 is the sweet spot. Bump to
medium.en for higher quality (uses ~5GB). large-v3 needs more than 8GB
unless quantized; use int8_float16 if you want to try it.

Whisper is MIT-licensed; faster-whisper is MIT; ctranslate2 is MIT.
Commercially safe to ship.
"""

import os
import tempfile
from contextlib import asynccontextmanager
from typing import Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse


MODEL_NAME = os.environ.get("WHISPER_MODEL", "small.en")
DEVICE = os.environ.get("WHISPER_DEVICE", "cuda")
COMPUTE_TYPE = os.environ.get("WHISPER_COMPUTE", "float16")
PORT = int(os.environ.get("WHISPER_PORT", "9000"))
HOST = os.environ.get("WHISPER_HOST", "127.0.0.1")


# Loaded once at startup; the WhisperModel object is thread-safe for
# transcribe() so we hold a single global instance.
_model = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _model
    print(
        f"[whisper-server] loading model={MODEL_NAME} device={DEVICE} compute={COMPUTE_TYPE}",
        flush=True,
    )
    from faster_whisper import WhisperModel

    try:
        _model = WhisperModel(MODEL_NAME, device=DEVICE, compute_type=COMPUTE_TYPE)
        print(
            f"[whisper-server] ready on http://{HOST}:{PORT}/v1/audio/transcriptions",
            flush=True,
        )
    except Exception as e:
        print(
            f"[whisper-server] FAILED to load model on {DEVICE}: {e}",
            flush=True,
        )
        # Fall back to CPU+int8 so the server still answers, even slowly.
        # Better than failing closed — the JEWL classifier will still get
        # SOMETHING, just slower.
        print("[whisper-server] falling back to device=cpu compute=int8", flush=True)
        _model = WhisperModel(MODEL_NAME, device="cpu", compute_type="int8")
    yield
    _model = None


app = FastAPI(lifespan=lifespan)


@app.get("/health")
def health():
    return {"ok": _model is not None, "model": MODEL_NAME, "device": DEVICE}


@app.post("/v1/audio/transcriptions")
async def transcribe(
    file: UploadFile = File(...),
    model: Optional[str] = Form(None),
    language: Optional[str] = Form(None),
    response_format: Optional[str] = Form("json"),
):
    """OpenAI Audio API-compatible endpoint. We ignore the `model` form
    field — the server runs whatever model was loaded at startup. JEWL
    sets it to satisfy the OpenAI spec; we keep the contract by accepting it."""
    if _model is None:
        raise HTTPException(status_code=503, detail="model not loaded")

    # Persist the uploaded audio to a temp file because faster-whisper
    # works best with file paths (it sniffs format from the file).
    suffix = os.path.splitext(file.filename or "")[1] or ".webm"
    tmp_path = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp_path = tmp.name
            data = await file.read()
            tmp.write(data)

        # vad_filter trims silence — saves a lot of compute on 10s ambient
        # chunks that are 80% silence. beam_size=5 is the upstream default.
        segments, info = _model.transcribe(
            tmp_path,
            vad_filter=True,
            beam_size=5,
            language=language,
        )
        text = "".join(seg.text for seg in segments).strip()
        return JSONResponse({"text": text, "language": info.language})
    finally:
        if tmp_path and os.path.exists(tmp_path):
            try:
                os.unlink(tmp_path)
            except OSError:
                pass


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=HOST, port=PORT, log_level="info")
