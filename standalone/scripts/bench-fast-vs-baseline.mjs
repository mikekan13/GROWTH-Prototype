// Benchmark baseline vs fast workflows via ComfyUI REST API.
// SFW prompt only.
import fs from 'node:fs';
import path from 'node:path';

const WF_DIR = 'C:/Projects/GRO.WTH/standalone/src/ai/portraits/workflows';
const BASE = 'http://127.0.0.1:8188';
const PROMPT = process.env.GEN_PROMPT || 'a young woman with long auburn hair, fair skin, green eyes, wearing a simple linen shirt and leather vest, neutral expression, soft natural lighting, painterly fantasy portrait, head and shoulders, detailed face';
const NEG = 'nude, naked, nsfw, blurry, lowres, deformed';
const SEED = Number(process.env.GEN_SEED || 42);

function patch(wfText, prompt, neg, seed) {
  const wf = JSON.parse(wfText);
  wf['4'].inputs.clip_l = prompt;
  wf['4'].inputs.t5xxl = prompt;
  wf['5'].inputs.text = neg;
  wf['7'].inputs.seed = seed;
  return wf;
}

async function submit(wf, label) {
  const t0 = Date.now();
  const r = await fetch(`${BASE}/prompt`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ prompt: wf }),
  });
  if (!r.ok) {
    const err = await r.text();
    console.log(`[${label}] submit_err status=${r.status} body=${err.slice(0, 300)}`);
    return { label, elapsed: 0, status: 'submit_err', image: null };
  }
  const { prompt_id } = await r.json();
  console.log(`[${label}] prompt_id=${prompt_id}`);

  for (let i = 0; i < 240; i++) {
    await new Promise(r => setTimeout(r, 2000));
    const h = await fetch(`${BASE}/history/${prompt_id}`).then(r => r.json()).catch(() => null);
    if (h && h[prompt_id]) {
      const elapsed = (Date.now() - t0) / 1000;
      const outputs = h[prompt_id].outputs || {};
      let img = null;
      for (const v of Object.values(outputs)) {
        if (v.images && v.images[0]) { img = v.images[0].filename; break; }
      }
      const status = h[prompt_id].status?.status_str ?? 'unknown';
      console.log(`[${label}] elapsed=${elapsed.toFixed(1)}s status=${status} image=${img}`);
      return { label, elapsed, status, image: img };
    }
  }
  const elapsed = (Date.now() - t0) / 1000;
  console.log(`[${label}] TIMEOUT elapsed=${elapsed.toFixed(1)}s`);
  return { label, elapsed, status: 'timeout', image: null };
}

const baselineText = fs.readFileSync(path.join(WF_DIR, 'character-portrait.json'), 'utf-8');
const fastText = fs.readFileSync(path.join(WF_DIR, 'character-body-fast.json'), 'utf-8');

const results = [];
results.push(await submit(patch(baselineText, PROMPT, NEG, SEED), 'baseline_20step'));
results.push(await submit(patch(fastText, PROMPT, NEG, SEED), 'fast_8step_fbcache'));
results.push(await submit(patch(fastText, PROMPT, NEG, SEED + 1), 'fast_8step_fbcache_run2'));

console.log('\n=== BENCHMARK RESULTS ===');
for (const r of results) {
  console.log(`${r.label.padEnd(28)} ${r.elapsed.toFixed(1).padStart(7)}s  ${r.status}  ${r.image || ''}`);
}
if (results[0].elapsed && results[1].elapsed) {
  const sp = (results[0].elapsed / results[1].elapsed).toFixed(2);
  console.log(`speedup_baseline_vs_fast=${sp}x`);
}

fs.writeFileSync('C:/Projects/GRO.WTH/standalone/tmp/bench-results.json', JSON.stringify(results, null, 2));
