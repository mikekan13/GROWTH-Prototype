// One-shot probe: what does the pod proxy actually say right now?
const BASE = 'https://iucnxl51ddxzpq-8188.proxy.runpod.net';
for (const path of ['/system_stats', '/']) {
  try {
    const r = await fetch(`${BASE}${path}`, { signal: AbortSignal.timeout(10000) });
    const text = (await r.text()).slice(0, 120).replace(/\s+/g, ' ');
    console.log(JSON.stringify({ path, status: r.status, body: text }));
  } catch (e) {
    console.log(JSON.stringify({ path, error: String(e?.cause?.code ?? e.message ?? e) }));
  }
}
