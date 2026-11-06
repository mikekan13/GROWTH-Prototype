import numpy as np
from fx import PRESETS, apply_fx, resolve_fx

sr = 24000
t = np.arange(2 * sr) / sr
f0 = 140 + 20 * np.sin(2 * np.pi * 3 * t)
ph = 2 * np.pi * np.cumsum(f0) / sr
sig = sum(np.sin(k * ph) / k for k in range(1, 12)).astype(np.float32)
sig *= (0.5 * (1 + np.sin(2 * np.pi * 2 * t))).astype(np.float32) * 0.3
for name in PRESETS:
    label, p = resolve_fx(name)
    out = apply_fx(sig, sr, p)
    assert np.all(np.isfinite(out)), name
    assert np.max(np.abs(out)) <= 0.951, name
    ratio = len(out) / len(sig)
    print(f"{name:10s} len x{ratio:.3f} peak {np.max(np.abs(out)):.2f}")
    assert 0.95 <= ratio <= 1.05 + (0.0), f"{name} length {ratio}"
print(resolve_fx({"preset": "demonic", "grit": 0.1}))
print("OK")
