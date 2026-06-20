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


# Common Whisper silence-hallucinations. When the audio is mostly quiet,
# Whisper emits one of these with high confidence. Trim trailing
# punctuation / whitespace / case for matching.
_HALLUCINATION_PHRASES = {
    "thank you",
    "thanks",
    "thank you for watching",
    "thanks for watching",
    "thank you for watching this video",
    "bye",
    "goodbye",
    "see you",
    "see you next time",
    "see you later",
    "you",
    "i",
    "okay",
    "ok",
    "hmm",
    "uh",
    "um",
    "subscribe",
    "like and subscribe",
    "please subscribe",
    "music",
    "applause",
    "laughter",
    "silence",
    "yeah",
    "right",
    # YouTube-style content hallucinations (observed 2026-06-20):
    "do you guys have questions",
    "support the channel",
    "in our comments",
    "if you re interested in the channel",
    "starting this video now",
    "comments",
}


def _is_repetition_hallucination(text: str) -> bool:
    """Drop transcripts that are just the same word repeated."""
    tokens = [t for t in text.lower().split() if t.isalpha()]
    if len(tokens) < 3:
        return False
    # If the most common token is ≥60% of all tokens, it's a loop.
    counts: dict = {}
    for t in tokens:
        counts[t] = counts.get(t, 0) + 1
    top = max(counts.values())
    return top / len(tokens) >= 0.6


def _is_letter_noise(text: str) -> bool:
    """Drop transcripts that are mostly single-letter tokens — Whisper's
    classic 'garbled noise' output looks like 'A-B-C-D-E-Z-X-T-Q-...'."""
    cleaned = text.replace("-", " ").replace(",", " ")
    tokens = [t for t in cleaned.split() if t]
    if len(tokens) < 5:
        return False
    short = sum(1 for t in tokens if len(t) <= 2)
    return short / len(tokens) >= 0.6


def _looks_like_hallucination(
    text: str,
    avg_logprob: float = 0.0,
    compression_ratio: float = 0.0,
) -> bool:
    """Heuristic: is this segment a Whisper silence-hallucination?

    - Strip punctuation/whitespace; lowercase. If the normalized form is
      in the known-phrase blocklist, drop it.
    - High compression_ratio (>2.4) = repeated tokens = hallucination loop.
    - Very low avg_logprob (<-1.0) = model is guessing; on a short segment
      that's almost certainly noise.
    - Segments shorter than 3 chars on a 10s chunk are noise."""
    norm = "".join(c for c in text.lower() if c.isalpha() or c.isspace()).strip()
    if not norm:
        return True
    if len(norm) < 3:
        return True
    if norm in _HALLUCINATION_PHRASES:
        return True
    # Substring match against the phrase list — catches longer hallucinations
    # that wrap a known phrase ("do you guys have questions if so we'd...").
    for phrase in _HALLUCINATION_PHRASES:
        if len(phrase) >= 12 and phrase in norm:
            return True
    if _is_repetition_hallucination(text):
        return True
    if _is_letter_noise(text):
        return True
    if compression_ratio and compression_ratio > 2.4:
        return True
    if avg_logprob and avg_logprob < -1.0 and len(norm) < 12:
        return True
    return False


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
# silence. Tuned UP from 0.6 → 0.7 since we now also bias with an
# initial_prompt which made hallucinations more frequent.
NO_SPEECH_THRESHOLD = float(os.environ.get("WHISPER_NO_SPEECH_THRESHOLD", "0.7"))
# RMS amplitude floor — chunks quieter than this are skipped entirely
# (Whisper isn't even called). Stops the YouTube-style content
# hallucinations on pure room-tone + keyboard clicks. Tune via env.
# Typical speech RMS is 0.01-0.1; ambient room noise is 0.001-0.005.
SILENCE_RMS_THRESHOLD = float(os.environ.get("WHISPER_SILENCE_RMS", "0.008"))


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
    prompt: Optional[str] = Form(None),
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

        # AMPLITUDE PRE-CHECK — decode the audio once and bail out
        # cheaply if the chunk is below the silence floor. Whisper's
        # YouTube-derived training causes it to hallucinate "Thank you"
        # / "Subscribe" / random text on pure silence; the only reliable
        # fix is not calling it on silent audio in the first place.
        try:
            from faster_whisper.audio import decode_audio
            import numpy as np

            audio_array = decode_audio(tmp_path, sampling_rate=16000)
            if audio_array is not None and len(audio_array) > 0:
                rms = float(np.sqrt(np.mean(np.square(audio_array))))
                if rms < SILENCE_RMS_THRESHOLD:
                    return JSONResponse({
                        "text": "",
                        "language": "en",
                        "skipped": "below_silence_floor",
                        "rms": rms,
                    })
            else:
                # Couldn't decode — fall through and let whisper try.
                audio_array = None
        except Exception as _e:
            # Decoder hiccup — fall through to whisper rather than fail
            # closed. Whisper will redo its own decode internally.
            audio_array = None

        # VAD off by default — on short ambient chunks it tends to trim
        # everything as silence (see USE_VAD env var to re-enable).
        # `initial_prompt` is the lever for proper-noun recognition:
        # the caller passes a short string of names that exist in the
        # campaign (PCs, NPCs, locations) and Whisper biases toward
        # them instead of substituting phonetic neighbors.
        # Pass the pre-decoded array when we have it to avoid re-decoding.
        whisper_input = audio_array if audio_array is not None else tmp_path
        segments_iter, info = _model.transcribe(
            whisper_input,
            vad_filter=USE_VAD,
            beam_size=5,
            language=language,
            no_speech_threshold=NO_SPEECH_THRESHOLD,
            condition_on_previous_text=False,
            initial_prompt=prompt or None,
        )
        kept = []
        for seg in segments_iter:
            no_speech = getattr(seg, "no_speech_prob", 0.0)
            if no_speech is not None and no_speech >= NO_SPEECH_THRESHOLD:
                continue
            # Whisper's classic silence-hallucinations ("Thank you.", "Bye.",
            # "you", "Thanks for watching") have LOW no_speech_prob because
            # the model genuinely thinks it heard them. Filter by phrase.
            avg_logprob = getattr(seg, "avg_logprob", 0.0)
            compression_ratio = getattr(seg, "compression_ratio", 0.0)
            if _looks_like_hallucination(
                seg.text, avg_logprob=avg_logprob, compression_ratio=compression_ratio,
            ):
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
