"""Post-processing FX chain for TTS output (pure numpy/scipy/librosa)."""
import math

import numpy as np

try:
    import librosa
except Exception:  # pragma: no cover
    librosa = None

PRESETS = {
    "human": {},
    # Tuned 2026-11-06 against a designed Violet clip: each preset must still transcribe
    # (whisper word match >= 0.93 on the test line). formant also moves pitch, so keep it near 1.
    "demonic": {"pitch": -5, "formant": 0.9, "grit": 0.35, "sub": 0.4, "reverb": 0.25},
    "angelic": {"pitch": 2, "layers": 1, "air": 0.3, "reverb": 0.4},
    "monstrous": {"pitch": -6, "formant": 0.85, "grit": 0.5, "sub": 0.3, "reverb": 0.15},
    "robotic": {"crush": 0.5, "ring": 90, "formant": 1.0},
    "ghostly": {"pitch": 1, "layers": 1, "air": 0.45, "reverb": 0.6},
    "giant": {"pitch": -4, "formant": 0.8, "reverb": 0.35},
    "tiny": {"pitch": 4, "formant": 1.1},
}

_RANGES = {
    "pitch": (-24.0, 24.0), "formant": (0.5, 2.0), "layers": (0, 4), "grit": (0.0, 1.0),
    "sub": (0.0, 1.0), "air": (0.0, 1.0), "reverb": (0.0, 1.0), "crush": (0.0, 1.0),
    "ring": (0.0, 2000.0),
}


def resolve_fx(fx):
    """Preset name | params dict | {"preset": name, ...overrides} -> (label, params)."""
    if fx is None or fx == "" or fx == "none":
        return "none", {}
    if isinstance(fx, str):
        if fx not in PRESETS:
            raise ValueError(f"unknown fx preset: {fx}")
        return fx, dict(PRESETS[fx])
    if isinstance(fx, dict):
        params = {}
        label = "custom"
        if "preset" in fx:
            name = fx["preset"]
            if name not in PRESETS:
                raise ValueError(f"unknown fx preset: {name}")
            params.update(PRESETS[name])
        params.update({k: v for k, v in fx.items() if k != "preset"})
        bad = [k for k in params if k not in _RANGES]
        if bad:
            raise ValueError(f"unknown fx params: {bad}")
        return label, params
    raise ValueError("fx must be a preset name, dict, or null")


def _clamp(params, key, default):
    v = params.get(key, default)
    try:
        v = float(v)
    except (TypeError, ValueError):
        return default
    if not math.isfinite(v):
        return default
    lo, hi = _RANGES[key]
    return min(max(v, lo), hi)


def _fit(x, n):
    if len(x) >= n:
        return x[:n]
    return np.pad(x, (0, n - len(x)))


def _pitch(x, sr, semis):
    if abs(semis) < 1e-3:
        return x
    return _fit(librosa.effects.pitch_shift(x, sr=sr, n_steps=semis), len(x))


def _formant(x, sr, ratio):
    # Tape-style size change: resample by ratio, then phase-vocoder stretch back to
    # the original duration. Moves formants (voice "size") and pitch together.
    if abs(ratio - 1.0) < 1e-3:
        return x
    y = librosa.resample(x, orig_sr=sr, target_sr=int(round(sr / ratio)))
    y = librosa.effects.time_stretch(y, rate=len(y) / len(x))
    return _fit(y, len(x))


def _envelope(x, sr, ms=20):
    n = max(1, int(sr * ms / 1000))
    k = np.ones(n) / n
    return np.convolve(np.abs(x), k, mode="same")


def fx_pad_seconds(params):
    """Trailing silence to append before apply_fx so a reverb tail is not cut off."""
    r = _clamp(params or {}, "reverb", 0.0)
    return (0.3 + 1.7 * r) * 0.8 if r > 0 else 0.0


def apply_fx(audio, sr, params):
    params = params or {}
    x = np.nan_to_num(np.asarray(audio, dtype=np.float32), nan=0.0, posinf=0.0, neginf=0.0)
    if x.size == 0:
        return x
    n = len(x)
    pitch = _clamp(params, "pitch", 0.0)
    formant = _clamp(params, "formant", 1.0)
    layers = int(round(_clamp(params, "layers", 0)))
    grit = _clamp(params, "grit", 0.0)
    sub = _clamp(params, "sub", 0.0)
    air = _clamp(params, "air", 0.0)
    reverb = _clamp(params, "reverb", 0.0)
    crush = _clamp(params, "crush", 0.0)
    ring = _clamp(params, "ring", 0.0)

    x = _pitch(x, sr, pitch)
    x = _formant(x, sr, formant)
    dry = x

    if layers > 0:
        cents = 8.0 * layers
        mix = np.zeros_like(x)
        for sign in (-1, 1):
            mix += _pitch(dry, sr, sign * cents / 100.0)
        if layers >= 2:
            for sign in (-1, 1):
                mix += _pitch(dry, sr, sign * cents / 50.0)
        mix /= (4 if layers >= 2 else 2)
        x = x + mix * (0.25 + 0.1 * layers)

    if sub > 0:
        x = x + sub * 0.7 * _pitch(dry, sr, -12.0)

    if grit > 0:
        drive = 1.0 + 9.0 * grit
        peak = max(float(np.max(np.abs(x))), 1e-6)
        sat = np.tanh(drive * x / peak) / np.tanh(drive)
        x = (1 - grit * 0.8) * x / peak + grit * 0.8 * sat
        x = x * peak

    if air > 0:
        rng = np.random.default_rng(1234)
        noise = rng.standard_normal(n).astype(np.float32)
        spec = np.fft.rfft(noise)
        freqs = np.fft.rfftfreq(n, 1.0 / sr)
        spec[(freqs < 3000) | (freqs > 10000)] = 0
        noise = np.fft.irfft(spec, n).astype(np.float32)
        noise /= max(float(np.std(noise)), 1e-6)
        env = _envelope(dry, sr)
        x = x + air * 0.6 * noise * env

    if crush > 0:
        bits = max(3, int(round(12 - 9 * crush)))
        levels = 2.0 ** (bits - 1)
        x = np.round(x * levels) / levels
        factor = 1 + int(round(crush * 5))
        if factor > 1:
            held = np.repeat(x[::factor], factor)[:n]
            x = _fit(held, n)

    if ring > 0:
        t = np.arange(n) / sr
        carrier = np.sin(2 * np.pi * ring * t).astype(np.float32)
        x = 0.35 * x + 0.65 * x * carrier

    if reverb > 0:
        tail = 0.3 + 1.7 * reverb
        m = int(sr * tail)
        rng = np.random.default_rng(99)
        ir = rng.standard_normal(m).astype(np.float32) * np.exp(-6.9 * np.arange(m) / m).astype(np.float32)
        ir[0] = 0
        ir /= max(float(np.sqrt(np.sum(ir ** 2))), 1e-6)
        from scipy.signal import fftconvolve
        wet = fftconvolve(x, ir)[:n].astype(np.float32)
        wet_amt = 0.15 + 0.5 * reverb
        x = x * (1 - wet_amt * 0.5) + wet * wet_amt
        # output length always equals input length; callers pad with fx_pad_seconds()

    x = np.nan_to_num(x, nan=0.0, posinf=0.0, neginf=0.0).astype(np.float32)
    peak = float(np.max(np.abs(x))) if x.size else 0.0
    if peak > 0.95:
        x = x * (0.95 / peak)
    return x
