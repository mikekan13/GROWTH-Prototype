"""
Local TTS server for GRO.WTH: Kokoro-82M (fast, fixed voices) plus Qwen3-TTS
(VoiceDesign: invent a voice from a description; Base: clone a saved ref clip),
with an FX chain (fx.py) applied after synthesis.

Exposes an OpenAI-compatible POST /v1/audio/speech endpoint backed by
Kokoro-82M running on the local GPU (falls back to CPU). Returns 24 kHz
16-bit PCM mono WAV.

Configuration via env vars (sensible defaults baked in):

  TTS_PORT   port to listen on  (default: 9001)
  TTS_HOST   host to bind       (default: 127.0.0.1, loopback only)

Kokoro-82M weights are Apache-2.0; the kokoro package is Apache-2.0;
FastAPI is MIT. Commercially safe to ship.
"""

import base64
import io
import json
import os
import re
import threading
import time
import uuid
from datetime import datetime, timezone
from pathlib import Path
from contextlib import asynccontextmanager
from typing import Optional, Union

import numpy as np
import soundfile as sf
import torch
from fastapi import FastAPI, HTTPException
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field

import fx as fxmod

PORT = int(os.environ.get("TTS_PORT", "9001"))
HOST = os.environ.get("TTS_HOST", "127.0.0.1")
SAMPLE_RATE = 24000
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

VOICES = [
    ("af_heart", "Heart", "a", "female"),
    ("af_bella", "Bella", "a", "female"),
    ("af_nicole", "Nicole", "a", "female"),
    ("af_sarah", "Sarah", "a", "female"),
    ("af_sky", "Sky", "a", "female"),
    ("am_adam", "Adam", "a", "male"),
    ("am_michael", "Michael", "a", "male"),
    ("am_liam", "Liam", "a", "male"),
    ("bf_emma", "Emma", "b", "female"),
    ("bf_isabella", "Isabella", "b", "female"),
    ("bf_alice", "Alice", "b", "female"),
    ("bf_lily", "Lily", "b", "female"),
    ("bm_george", "George", "b", "male"),
    ("bm_lewis", "Lewis", "b", "male"),
    ("bm_daniel", "Daniel", "b", "male"),
]
VOICE_IDS = {v[0] for v in VOICES}

HERE = Path(__file__).resolve().parent
REFS = HERE / "refs"
REFS.mkdir(exist_ok=True)
MODELS_DIR = Path(os.environ.get("QWEN_TTS_MODELS_DIR", r"C:\Projects\GRO.WTH\models"))
QWEN_BASE_ID = "Qwen3-TTS-12Hz-1.7B-Base"
QWEN_DESIGN_ID = "Qwen3-TTS-12Hz-1.7B-VoiceDesign"
REF_ID_RE = re.compile(r"^[0-9a-f]{16}$")

_pipelines: dict = {}
_lock = threading.Lock()


def _pipeline(lang_code: str):
    p = _pipelines.get(lang_code)
    if p is None:
        from kokoro import KPipeline

        p = KPipeline(lang_code=lang_code)
        _pipelines[lang_code] = p
    return p


def _synthesize(text: str, voice: str, speed: float) -> np.ndarray:
    with _lock:
        pipe = _pipeline(voice[0])
        chunks = []
        for _gs, _ps, audio in pipe(text, voice=voice, speed=speed):
            if audio is None:
                continue
            if hasattr(audio, "detach"):
                audio = audio.detach().cpu().numpy()
            chunks.append(np.asarray(audio, dtype=np.float32))
    if not chunks:
        return np.zeros(0, dtype=np.float32)
    return np.concatenate(chunks)


# ---------------------------------------------------------------- Qwen3-TTS
_base = None
_design = None
_base_state = "absent"      # absent | loading | ready | error
_design_state = "absent"    # absent | ready | error
_qwen_error: dict = {}
_prompts: dict = {}


def _model_path(model_id: str):
    """Local model directory if fully downloaded (model.safetensors, no *.part), else None."""
    d = MODELS_DIR / model_id
    try:
        if (d / "model.safetensors").exists() and not list(d.rglob("*.part")):
            return str(d)
    except Exception:
        pass
    return None


def _qwen_load(model_id: str):
    from qwen_tts import Qwen3TTSModel

    try:
        return Qwen3TTSModel.from_pretrained(model_id, device_map=DEVICE, dtype=torch.bfloat16)
    except TypeError:
        return Qwen3TTSModel.from_pretrained(model_id, device_map=DEVICE, torch_dtype=torch.bfloat16)


def _unload(name: str):
    global _base, _design
    if name == "base":
        _base = None
    else:
        _design = None
    import gc

    gc.collect()
    if torch.cuda.is_available():
        torch.cuda.empty_cache()


def _ensure_base():
    """Caller holds _lock. Returns the Base model or raises RuntimeError."""
    global _base, _base_state
    if _base is not None:
        return _base
    path = _model_path(QWEN_BASE_ID)
    if path is None:
        _base_state = "absent"
        raise RuntimeError("model files not downloaded yet")
    _base_state = "loading"
    try:
        t0 = time.time()
        _base = _qwen_load(path)
        _base_state = "ready"
        print(f"[tts-server] qwen base loaded in {time.time() - t0:.1f}s", flush=True)
        return _base
    except Exception as e:
        _base_state = "error"
        _qwen_error["base"] = repr(e)
        raise RuntimeError(repr(e))


def _bg_load_base():
    try:
        with _lock:
            _ensure_base()
    except Exception as e:
        print(f"[tts-server] qwen base not loaded at startup: {e}", flush=True)


def _ref_files(ref_id: str):
    if not REF_ID_RE.match(ref_id or ""):
        return None
    wav, meta = REFS / f"{ref_id}.wav", REFS / f"{ref_id}.json"
    return (wav, meta) if wav.exists() and meta.exists() else None


def _clone(text: str, ref_id: str, language: str = "English"):
    files = _ref_files(ref_id)
    if files is None:
        raise HTTPException(status_code=404, detail=f"unknown voice_ref: {ref_id}")
    meta = json.loads(files[1].read_text(encoding="utf-8-sig"))
    with _lock:
        base = _ensure_base()
        prompt = _prompts.get(ref_id)
        if prompt is None:
            prompt = base.create_voice_clone_prompt(ref_audio=str(files[0]), ref_text=meta["transcript"])
            _prompts[ref_id] = prompt
        wavs, sr = base.generate_voice_clone(
            text=text, language=meta.get("language") or language, voice_clone_prompt=prompt
        )
    return np.asarray(wavs[0], dtype=np.float32), int(sr)


def _design_voice(description: str, text: str, language: str, seed: int):
    global _design, _design_state
    with _lock:
        path = _model_path(QWEN_DESIGN_ID)
        if path is None:
            _design_state = "absent"
            raise RuntimeError("model files not downloaded yet")
        had_base = _base is not None
        if had_base:
            _unload("base")
        try:
            try:
                _design = _qwen_load(path)
                _design_state = "ready"
            except Exception as e:
                _design_state = "error"
                _qwen_error["design"] = repr(e)
                raise RuntimeError(repr(e))
            torch.manual_seed(seed)
            if torch.cuda.is_available():
                torch.cuda.manual_seed_all(seed)
            wavs, sr = _design.generate_voice_design(text=text, instruct=description, language=language)
            return np.asarray(wavs[0], dtype=np.float32), int(sr)
        finally:
            _unload("design")
            if had_base or _model_path(QWEN_BASE_ID):
                try:
                    _ensure_base()
                except Exception as e:
                    print(f"[tts-server] base reload failed: {e}", flush=True)


def _wav_bytes(audio: np.ndarray, sr: int) -> bytes:
    buf = io.BytesIO()
    sf.write(buf, audio, sr, format="WAV", subtype="PCM_16")
    return buf.getvalue()


def _do_fx(audio: np.ndarray, sr: int, fx):
    label, params = fxmod.resolve_fx(fx)
    if not params:
        return audio, label
    pad = fxmod.fx_pad_seconds(params)
    if pad:
        audio = np.concatenate([audio, np.zeros(int(pad * sr), dtype=np.float32)])
    return fxmod.apply_fx(audio, sr, params), label


@asynccontextmanager
async def lifespan(app: FastAPI):
    print(f"[tts-server] loading Kokoro-82M device={DEVICE}", flush=True)
    t0 = time.time()
    await run_in_threadpool(_synthesize, "Warm up complete.", "af_heart", 1.0)
    print(f"[tts-server] warm-up took {time.time() - t0:.1f}s", flush=True)
    if _model_path(QWEN_BASE_ID):
        threading.Thread(target=_bg_load_base, daemon=True).start()
    print(f"[tts-server] ready on http://{HOST}:{PORT}/v1/audio/speech", flush=True)
    yield


app = FastAPI(lifespan=lifespan)


class SpeechRequest(BaseModel):
    input: str = Field(..., max_length=4000)
    voice: str = "af_heart"
    voice_ref: Optional[str] = None
    fx: Optional[Union[str, dict]] = None
    speed: float = Field(1.0, ge=0.5, le=2.0)
    response_format: Optional[str] = "wav"
    model: Optional[str] = None  # accepted for OpenAI compatibility, ignored


class DesignRequest(BaseModel):
    description: str = Field(..., min_length=1, max_length=600)
    text: str = Field(..., min_length=1, max_length=400)
    language: str = "English"
    seed: Optional[int] = None
    fx: Optional[Union[str, dict]] = None


def _count_refs() -> int:
    return len(list(REFS.glob("*.wav")))


@app.get("/health")
def health():
    design = _design_state if _design_state == "error" else ("ready" if _model_path(QWEN_DESIGN_ID) else "absent")
    return {
        "ok": "a" in _pipelines,
        "model": "Kokoro-82M",
        "device": DEVICE,
        "voices": [v[0] for v in VOICES],
        "engines": {
            "kokoro": "ready" if "a" in _pipelines else "loading",
            "qwen_base": _base_state,
            "qwen_design": design,
        },
        "refs": _count_refs(),
    }


@app.get("/v1/voices")
def voices():
    return [
        {"id": vid, "label": label, "lang": "en-US" if lc == "a" else "en-GB", "sex": sex}
        for vid, label, lc, sex in VOICES
    ]


@app.get("/v1/fx/presets")
def fx_presets():
    return fxmod.PRESETS


@app.post("/v1/audio/speech")
async def speech(req: SpeechRequest):
    text = (req.input or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="input is empty")
    if (req.response_format or "wav") != "wav":
        raise HTTPException(status_code=400, detail="only response_format=wav is supported")
    try:
        fxmod.resolve_fx(req.fx)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    if req.voice_ref:
        if _ref_files(req.voice_ref) is None:
            raise HTTPException(status_code=404, detail=f"unknown voice_ref: {req.voice_ref}")
        try:
            audio, sr = await run_in_threadpool(_clone, text, req.voice_ref)
        except RuntimeError as e:
            return JSONResponse(status_code=503, content={"error": "qwen base model not available", "detail": str(e)})
        engine = "qwen"
    else:
        if req.voice not in VOICE_IDS:
            raise HTTPException(status_code=400, detail=f"unknown voice: {req.voice}")
        audio = await run_in_threadpool(_synthesize, text, req.voice, req.speed)
        sr, engine = SAMPLE_RATE, "kokoro"
    if audio.size == 0:
        raise HTTPException(status_code=422, detail="no speech produced for this input")
    audio, label = await run_in_threadpool(_do_fx, audio, sr, req.fx)
    return Response(
        content=_wav_bytes(audio, sr),
        media_type="audio/wav",
        headers={"X-Audio-Seconds": f"{audio.size / sr:.3f}", "X-Engine": engine, "X-Fx": label},
    )


@app.post("/v1/voices/design")
async def design(req: DesignRequest):
    try:
        fxmod.resolve_fx(req.fx)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    seed = req.seed if req.seed is not None else int.from_bytes(os.urandom(4), "big")
    try:
        audio, sr = await run_in_threadpool(_design_voice, req.description, req.text, req.language, seed)
    except RuntimeError as e:
        return JSONResponse(status_code=503, content={"error": "qwen design model not available", "detail": str(e)})
    if audio.size == 0:
        raise HTTPException(status_code=422, detail="no speech produced")
    ref_id = uuid.uuid4().hex[:16]
    sf.write(str(REFS / f"{ref_id}.wav"), audio, sr, format="WAV", subtype="PCM_16")
    meta = {
        "id": ref_id, "description": req.description, "transcript": req.text, "language": req.language,
        "seed": seed, "sample_rate": sr, "seconds": round(audio.size / sr, 3),
        "created": datetime.now(timezone.utc).isoformat(),
    }
    (REFS / f"{ref_id}.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    prev, _ = await run_in_threadpool(_do_fx, audio, sr, req.fx)
    return {
        "id": ref_id, "seconds": meta["seconds"], "sample_rate": sr,
        "preview_wav_base64": base64.b64encode(_wav_bytes(prev, sr)).decode("ascii"),
    }


@app.get("/v1/voices/refs/{ref_id}")
def get_ref(ref_id: str):
    files = _ref_files(ref_id)
    if files is None:
        raise HTTPException(status_code=404, detail="no such ref")
    return Response(content=files[0].read_bytes(), media_type="audio/wav")


@app.get("/v1/voices/refs/{ref_id}/meta")
def get_ref_meta(ref_id: str):
    files = _ref_files(ref_id)
    if files is None:
        raise HTTPException(status_code=404, detail="no such ref")
    return json.loads(files[1].read_text(encoding="utf-8-sig"))


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=HOST, port=PORT, log_level="info")
