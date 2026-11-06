"""Make a voice reference from a recorded clip (Michael's own voice as JEWL, 2026-11-06, with his consent).

    python make_ref.py <clip.(m4a|mp3|wav|ogg|webm)> [--transcript "..."] [--id <hex16>] [--description "..."]

Converts to 24 kHz mono wav, trims leading/trailing silence, caps at 20 s, transcribes through the local whisper
server when no transcript is given (the clone prompt needs the words), and writes refs/<id>.wav + refs/<id>.json in
the same shape /v1/voices/design writes. Prints the ref id. Point a character's data.voice at it:
    { "engine": "qwen", "ref": "<id>", "description": "...", "transcript": "..." }
"""
import argparse, json, secrets, sys, time
from pathlib import Path
import numpy as np, librosa, soundfile as sf, requests

HERE = Path(__file__).resolve().parent
REFS = HERE / "refs"
SR = 24000
WHISPER = "http://127.0.0.1:9000/v1/audio/transcriptions"

ap = argparse.ArgumentParser()
ap.add_argument("clip")
ap.add_argument("--transcript", default=None)
ap.add_argument("--id", default=None)
ap.add_argument("--description", default="A recorded reference clip.")
ap.add_argument("--max-seconds", type=float, default=20.0)
a = ap.parse_args()

def load_any(path: str) -> np.ndarray:
    """librosa/soundfile for wav/flac/ogg; PyAV (installed with faster-whisper) for m4a/mp3/webm — no ffmpeg binary here."""
    try:
        y, _ = librosa.load(path, sr=SR, mono=True)
        return y
    except Exception:
        import av
        with av.open(path) as c:
            stream = next(s for s in c.streams if s.type == "audio")
            resampler = av.AudioResampler(format="fltp", layout="mono", rate=SR)
            chunks = []
            for frame in c.decode(stream):
                for out in resampler.resample(frame):
                    chunks.append(out.to_ndarray().reshape(-1))
            for out in resampler.resample(None):
                chunks.append(out.to_ndarray().reshape(-1))
        return np.concatenate(chunks).astype(np.float32) if chunks else np.zeros(0, np.float32)

y = load_any(a.clip)
y, _ = librosa.effects.trim(y, top_db=35)
if len(y) > a.max_seconds * SR:
    y = y[: int(a.max_seconds * SR)]
peak = float(np.max(np.abs(y))) or 1.0
y = (y / peak * 0.9).astype(np.float32)
secs = len(y) / SR
if secs < 3:
    sys.exit(f"clip too short after trimming ({secs:.1f} s); record at least 8 s")

REFS.mkdir(exist_ok=True)
ref_id = a.id or secrets.token_hex(8)
wav_path = REFS / f"{ref_id}.wav"
sf.write(wav_path, y, SR)

transcript = a.transcript
if not transcript:
    with open(wav_path, "rb") as f:
        r = requests.post(WHISPER, files={"file": (wav_path.name, f, "audio/wav")}, timeout=180)
    r.raise_for_status()
    transcript = (r.json().get("text") or "").strip()
if not transcript:
    sys.exit("no transcript (whisper heard nothing) - pass --transcript")

meta = {
    "id": ref_id, "description": a.description, "transcript": transcript, "language": "English",
    "source": "recorded", "seconds": round(secs, 2), "sr": SR, "created": time.strftime("%Y-%m-%dT%H:%M:%S"),
}
(REFS / f"{ref_id}.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
print(json.dumps({"ref": ref_id, "seconds": round(secs, 2), "transcript": transcript}))
