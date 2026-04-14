import fs from 'node:fs';
const BASE = 'http://127.0.0.1:8188';
const WF = 'C:/Projects/GRO.WTH/standalone/src/ai/portraits/workflows/face-region-inpaint.json';

const TESTS = [
  {
    label: 'eyes_bright_blue',
    source: 'tara_golden.png',
    mask: 'tara_mask_eyes.png',
    prompt: 'bright sky blue eyes, vivid blue irises, detailed iris texture, realistic eye color, in the style of ckpf painterly fantasy portrait',
    denoise: 0.65,
    seed: 100,
  },
  {
    label: 'eyes_amber_gold',
    source: 'tara_golden.png',
    mask: 'tara_mask_eyes.png',
    prompt: 'glowing amber golden eyes, warm honey-gold irises, detailed iris texture, realistic eye color, in the style of ckpf painterly fantasy portrait',
    denoise: 0.7,
    seed: 101,
  },
];

function patch(wfText, t) {
  const wf = JSON.parse(wfText);
  wf['10'].inputs.image = t.source;
  wf['12'].inputs.image = t.mask;
  wf['4'].inputs.clip_l = t.prompt;
  wf['4'].inputs.t5xxl = t.prompt;
  wf['5'].inputs.text = 'blurry, lowres, distorted, deformed';
  wf['7'].inputs.seed = t.seed;
  wf['7'].inputs.denoise = t.denoise;
  wf['9'].inputs.filename_prefix = `GROWTH_inpaint_${t.label}`;
  return wf;
}

async function submit(wf, label) {
  const t0 = Date.now();
  const r = await fetch(`${BASE}/prompt`, {
    method: 'POST', headers: {'content-type': 'application/json'},
    body: JSON.stringify({prompt: wf}),
  });
  if (!r.ok) { console.log(`[${label}] submit_err`, await r.text()); return null; }
  const { prompt_id } = await r.json();
  console.log(`[${label}] prompt_id=${prompt_id}`);
  for (let i = 0; i < 180; i++) {
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
        for (const m of msgs) if (m[0] === 'execution_error') console.log('  EXC:', m[1].exception_type, m[1].exception_message?.slice(0, 400));
      }
      return { label, elapsed, status, image: img };
    }
  }
  return null;
}

const wfText = fs.readFileSync(WF, 'utf-8');
const results = [];
for (const t of TESTS) {
  results.push(await submit(patch(wfText, t), t.label));
}
console.log('\n=== INPAINT RESULTS ===');
for (const r of results) if (r) console.log(`${r.label.padEnd(24)} ${r.elapsed.toFixed(1)}s ${r.status} ${r.image || ''}`);
fs.writeFileSync('C:/Projects/GRO.WTH/standalone/tmp/inpaint-results.json', JSON.stringify(results, null, 2));
