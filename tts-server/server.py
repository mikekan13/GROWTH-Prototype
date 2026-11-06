"""
Local Kokoro TTS server for GRO.WTH.

Exposes an OpenAI-compatible POST /v1/audio/speech endpoint backed by
Kokoro-82M running on the local GPU (falls back to CPU). Returns 24 kHz
16-bit PCM mono WAV.

Configuration via env vars (sensible defaults baked in):

  TTS_PORT   port to listen on  (default: 9001)
  TTS_HOST   host to bind       (default: 127.0.0.1, loopback only)

Kokoro-82M weights are Apache-2.0; the kokoro package is Apache-2.0;
FastAPI is MIT. Commercially safe to ship.
"""

import io
import os
import threading
import time
from contextlib import asynccontextmanager
from typing import Optional

import numpy as np
import soundfile as sf
import torch
from fastapi import FastAPI, HTTPException
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import Response
from pydantic import BaseModel, Field

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


@asynccontextmanager
async def lifespan(app: FastAPI):
    print(f"[tts-server] loading Kokoro-82M device={DEVICE}", flush=True)
    t0 = time.time()
    await run_in_threadpool(_synthesize, "Warm up complete.", "af_heart", 1.0)
    print(f"[tts-server] warm-up took {time.time() - t0:.1f}s", flush=True)
    print(f"[tts-server] ready on http://{HOST}:{PORT}/v1/audio/speech", flush=True)
    yield


app = FastAPI(lifespan=lifespan)


class SpeechRequest(BaseModel):
    input: str = Field(..., max_length=4000)
    voice: str = "af_heart"
    speed: float = Field(1.0, ge=0.5, le=2.0)
    response_format: Optional[str] = "wav"
    model: Optional[str] = None  # accepted for OpenAI compatibility, ignored


@app.get("/health")
def health():
    return {
        "ok": "a" in _pipelines,
        "model": "Kokoro-82M",
        "device": DEVICE,
        "voices": [v[0] for v in VOICES],
    }


@app.get("/v1/voices")
def voices():
    return [
        {"id": vid, "label": label, "lang": "en-US" if lc == "a" else "en-GB", "sex": sex}
        for vid, label, lc, sex in VOICES
    ]


@app.post("/v1/audio/speech")
async def speech(req: SpeechRequest):
    text = (req.input or "").strip()
    if not text:
        raise HTTPException(status_code=400, detail="input is empty")
    if req.voice not in VOICE_IDS:
        raise HTTPException(status_code=400, detail=f"unknown voice: {req.voice}")
    if (req.response_format or "wav") != "wav":
        raise HTTPException(status_code=400, detail="only response_format=wav is supported")

    audio = await run_in_threadpool(_synthesize, text, req.voice, req.speed)
    if audio.size == 0:
        raise HTTPException(status_code=422, detail="no speech produced for this input")
    buf = io.BytesIO()
    sf.write(buf, audio, SAMPLE_RATE, format="WAV", subtype="PCM_16")
    seconds = audio.size / SAMPLE_RATE
    return Response(
        content=buf.getvalue(),
        media_type="audio/wav",
        headers={"X-Audio-Seconds": f"{seconds:.3f}"},
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host=HOST, port=PORT, log_level="info")
