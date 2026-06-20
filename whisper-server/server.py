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
import sys
import tempfile
from contextlib import asynccontextmanager
from typing import Optional


def _register_cuda_dll_dirs() -> None:
    """On Windows, ctranslate2 doesn't always find the cuBLAS / cuDNN DLLs
    shipped by the `nvidia-cublas-cu12` / `nvidia-cudnn-cu12` pip packages.
    Walk every site-packages-style location we can find and register any
    `nvidia/.../bin` directory with the DLL search path."""
    if sys.platform != "win32":
        return
    add = getattr(os, "add_dll_directory", None)
    if add is None:
        return

    bases: list[str] = []
    try:
        import sysconfig

        for key in ("purelib", "platlib"):
            p = sysconfig.get_paths().get(key)
            if p and p not in bases:
                bases.append(p)
    except Exception:
        pass
    try:
        import site

        for p in site.getsitepackages():
            if p not in bases:
                bases.append(p)
        usp = site.getusersitepackages()
        if usp and usp not in bases:
            bases.append(usp)
    except Exception:
        pass

    registered: list[str] = []
    for base in bases:
        nvidia_root = os.path.join(base, "nvidia")
        if not os.path.isdir(nvidia_root):
            continue
        # nvidia/* package layout puts DLLs in nvidia/<pkg>/bin
        for pkg in os.listdir(nvidia_root):
            bin_dir = os.path.join(nvidia_root, pkg, "bin")
            if os.path.isdir(bin_dir):
                try:
                    add(bin_dir)
                except OSError:
                    pass
                registered.append(bin_dir)
    # Also prepend to PATH — ctranslate2 calls LoadLibrary from C++ and
    # add_dll_directory isn't always honored on that codepath. PATH is.
    if registered:
        existing = os.environ.get("PATH", "")
        os.environ["PATH"] = os.pathsep.join(registered) + os.pathsep + existing
    # And preload the critical DLLs explicitly via ctypes — once loaded
    # into the process, ctranslate2 will find them by handle. Belt and
    # suspenders; nothing breaks if a particular file isn't present.
    try:
        import ctypes

        for bin_dir in registered:
            for fname in os.listdir(bin_dir):
                if not fname.lower().endswith(".dll"):
                    continue
                full = os.path.join(bin_dir, fname)
                try:
                    ctypes.WinDLL(full)
                except OSError:
                    pass
    except Exception:
        pass
    print(
        f"[whisper-server] registered {len(registered)} CUDA DLL director{'y' if len(registered) == 1 else 'ies'}: {registered}",
        flush=True,
    )


_register_cuda_dll_dirs()

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse


MODEL_NAME = os.environ.get("WHISPER_MODEL", "small.en")
DEVICE = os.environ.get("WHISPER_DEVICE", "cuda")
COMPUTE_TYPE = os.environ.get("WHISPER_COMPUTE", "float16")
PORT = int(os.environ.get("WHISPER_PORT", "9000"))
HOST = os.environ.get("WHISPER_HOST", "127.0.0.1")
# VAD trims silence before transcription. Helps on long files; HURTS on
# short 10s ambient chunks (often eats the whole window). Default OFF.
# Set WHISPER_VAD=1 to re-enable if hallucination on silence becomes
# a problem.
USE_VAD = os.environ.get("WHISPER_VAD", "0") == "1"
# Confidence threshold for filtering out hallucinated transcripts on
# silence. Whisper sometimes emits common phrases ("Thank you.", "Bye.")
# when fed silence. We drop segments with no_speech_prob above this.
NO_SPEECH_THRESHOLD = float(os.environ.get("WHISPER_NO_SPEECH_THRESHOLD", "0.6"))


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

        # VAD off by default — on 10s ambient chunks it tends to trim
        # everything as silence (see USE_VAD env var to re-enable).
        # no_speech_threshold filters Whisper's silence-hallucinations
        # ("Thank you.", "Bye.") which it loves to emit on quiet input.
        segments_iter, info = _model.transcribe(
            tmp_path,
            vad_filter=USE_VAD,
            beam_size=5,
            language=language,
            no_speech_threshold=NO_SPEECH_THRESHOLD,
            condition_on_previous_text=False,
        )
        kept = []
        for seg in segments_iter:
            # Skip segments the model is confident are silence.
            no_speech = getattr(seg, "no_speech_prob", 0.0)
            if no_speech is not None and no_speech >= NO_SPEECH_THRESHOLD:
                continue
            kept.append(seg.text)
        text = "".join(kept).strip()
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
