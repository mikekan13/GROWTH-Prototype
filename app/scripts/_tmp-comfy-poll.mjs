// Poll pod ComfyUI until ready (max ~10 min), then print GPU stats.
const URL = 'https://iucnxl51ddxzpq-8188.proxy.runpod.net/system_stats';
const started = Date.now();
for (let i = 0; i < 60; i++) {
  try {
    const r = await fetch(URL, { signal: AbortSignal.timeout(8000) });
    if (r.status === 200) {
      const stats = await r.json();
      const dev = stats.devices?.[0] ?? {};
      console.log(JSON.stringify({
        ready: true,
        afterSec: Math.round((Date.now() - started) / 1000),
        gpu: dev.name,
        vramFreeGB: dev.vram_free ? +(dev.vram_free / 1e9).toFixed(1) : null,
        vramTotalGB: dev.vram_total ? +(dev.vram_total / 1e9).toFixed(1) : null,
        comfyVersion: stats.system?.comfyui_version,
      }));
      process.exit(0);
    }
  } catch { /* not up yet */ }
  await new Promise(r => setTimeout(r, 10_000));
}
console.log(JSON.stringify({ ready: false, afterSec: Math.round((Date.now() - started) / 1000) }));
process.exit(1);
