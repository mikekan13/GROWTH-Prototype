import fs from 'node:fs';
const BASE = 'http://127.0.0.1:8188';
const WF = 'C:/Projects/GRO.WTH/standalone/src/ai/portraits/workflows/character-face-ipadapter.json';

const PROMPT = 'a young woman with auburn hair, fair skin, green eyes, wearing a simple linen shirt and leather vest, painterly fantasy portrait, head and shoulders';
const NEG = 'nude, nsfw, blurry, lowres, deformed';

const wf = JSON.parse(fs.readFileSync(WF, 'utf-8'));
wf['4'].inputs.clip_l = PROMPT;
wf['4'].inputs.t5xxl = PROMPT;
wf['5'].inputs.text = NEG;
wf['7'].inputs.seed = 777;

const t0 = Date.now();
const r = await fetch(`${BASE}/prompt`, {
  method: 'POST', headers: {'content-type':'application/json'}, body: JSON.stringify({prompt: wf}),
});
if (!r.ok) { console.log('submit_err', await r.text()); process.exit(1); }
const { prompt_id } = await r.json();
console.log('prompt_id=', prompt_id);
for (let i = 0; i < 300; i++) {
  await new Promise(r => setTimeout(r, 3000));
  const h = await fetch(`${BASE}/history/${prompt_id}`).then(r => r.json()).catch(() => null);
  if (h && h[prompt_id]) {
    const e = (Date.now() - t0)/1000;
    const outputs = h[prompt_id].outputs || {};
    let img = null;
    for (const v of Object.values(outputs)) if (v.images && v.images[0]) { img = v.images[0].filename; break; }
    const status = h[prompt_id].status?.status_str;
    console.log(`elapsed=${e.toFixed(1)}s status=${status} image=${img}`);
    if (status === 'error') {
      const msgs = h[prompt_id].status?.messages || [];
      for (const m of msgs) if (m[0] === 'execution_error') console.log('EXC:', m[1].exception_type, m[1].exception_message?.slice(0, 600));
    }
    break;
  }
}
