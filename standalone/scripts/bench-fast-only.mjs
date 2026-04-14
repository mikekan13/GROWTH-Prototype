import fs from 'node:fs';

const BASE = 'http://127.0.0.1:8188';
const PROMPT = 'a young woman with long auburn hair, fair skin, green eyes, wearing a simple linen shirt and leather vest, neutral expression, soft natural lighting, painterly fantasy portrait, head and shoulders, detailed face';
const NEG = 'nude, naked, nsfw, blurry, lowres, deformed';
const WF = 'C:/Projects/GRO.WTH/standalone/src/ai/portraits/workflows/character-body-fast.json';

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
    console.log(`[${label}] submit_err`, await r.text());
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
      for (const v of Object.values(outputs)) if (v.images && v.images[0]) { img = v.images[0].filename; break; }
      const status = h[prompt_id].status?.status_str ?? 'unknown';
      console.log(`[${label}] elapsed=${elapsed.toFixed(1)}s status=${status} image=${img}`);
      if (status === 'error') {
        const msgs = h[prompt_id].status?.messages || [];
        for (const m of msgs) if (m[0] === 'execution_error') console.log('  EXC:', m[1].exception_type, m[1].exception_message?.slice(0, 300));
      }
      return { label, elapsed, status, image: img };
    }
  }
  return { label, elapsed: 0, status: 'timeout', image: null };
}

const wfText = fs.readFileSync(WF, 'utf-8');
const results = [];
results.push(await submit(patch(wfText, PROMPT, NEG, 42), 'fast_run1_seed42'));
results.push(await submit(patch(wfText, PROMPT, NEG, 43), 'fast_run2_seed43'));

console.log('\n=== FAST RESULTS (baseline was 181.5s) ===');
for (const r of results) console.log(`${r.label.padEnd(28)} ${r.elapsed.toFixed(1).padStart(7)}s  ${r.status}  ${r.image || ''}`);
if (results[1].elapsed) console.log(`speedup=${(181.5 / results[1].elapsed).toFixed(2)}x (vs 181.5s baseline)`);
fs.writeFileSync('C:/Projects/GRO.WTH/standalone/tmp/bench-fast-results.json', JSON.stringify(results, null, 2));
