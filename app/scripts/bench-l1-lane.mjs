/**
 * Bench the self-hosted L1 text lane: cold-start wait, then streamed
 * generation timings (time-to-first-token, total, tokens/s) for a
 * spirit-sized prompt and a short answer-sized one.
 *
 *   node scripts/bench-l1-lane.mjs [runs=3]
 *
 * Reads DAYA_L1_URL / DAYA_L1_MODEL / AI_LOCAL_API_KEY from .env.local.
 * Spins up a serverless worker if none is hot (billable) — run it on purpose.
 */
import { readFileSync } from 'node:fs';

const envText = readFileSync('.env.local', 'utf8');
const envVal = (k) => (envText.split(/\r?\n/).find((l) => l.startsWith(k + '=')) ?? '').slice(k.length + 1).replace(/"/g, '').trim();
const URL_ = envVal('DAYA_L1_URL').replace(/\/+$/, '');
const MODEL = envVal('DAYA_L1_MODEL');
const KEY = envVal('DAYA_L1_API_KEY') || envVal('AI_LOCAL_API_KEY') || envVal('RUNPOD_API_KEY');
const H = { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' };
const RUNS = Number(process.argv[2] ?? 3);

const t0 = Date.now();
const since = () => ((Date.now() - t0) / 1000).toFixed(1) + 's';
const GIVE_UP_MIN = Number(process.env.BENCH_GIVE_UP_MIN ?? 15);
const RUNPOD_KEY = envVal('RUNPOD_API_KEY');
const ENDPOINT_ID = (URL_.match(/\/v2\/([^/]+)\//) ?? [])[1];

// Endpoint-side view, so a worker swap or a wedge is visible from the client.
async function endpointStatus() {
  if (!RUNPOD_KEY || !ENDPOINT_ID) return '';
  try {
    const RH = { Authorization: `Bearer ${RUNPOD_KEY}`, 'Content-Type': 'application/json' };
    const h = await (await fetch(`https://api.runpod.ai/v2/${ENDPOINT_ID}/health`, { headers: RH })).json();
    const ep = await (await fetch(`https://rest.runpod.io/v1/endpoints/${ENDPOINT_ID}?includeWorkers=true`, { headers: RH })).json();
    const live = (ep.workers ?? []).filter((w) => !/Exited/.test(w.lastStatusChange ?? ''));
    const parts = [];
    for (const w of live) {
      const q = `{ pod(input:{podId:"${w.id}"}) { machine { gpuDisplayName } runtime { uptimeInSeconds container { cpuPercent memoryPercent } } } }`;
      const g = await (await fetch(`https://api.runpod.io/graphql?api_key=${RUNPOD_KEY}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q }) })).json();
      const p = g?.data?.pod;
      parts.push(p ? `${w.id}:${p.machine?.gpuDisplayName} up=${p.runtime?.uptimeInSeconds ?? '?'}s cpu=${p.runtime?.container?.cpuPercent ?? '?'}% mem=${p.runtime?.container?.memoryPercent ?? '?'}%` : `${w.id}:gone`);
    }
    const w = h.workers ?? {};
    return `workers ready=${w.ready} init=${w.initializing} running=${w.running} throttled=${w.throttled} unhealthy=${w.unhealthy} queue=${h.jobs?.inQueue} | ${parts.join(' ; ')}`;
  } catch (e) { return `status failed: ${e.message}`; }
}

// 1. Warm: poll until a max_tokens:1 request answers 200.
console.log(`[bench] lane ${URL_} model=${MODEL} (give up after ${GIVE_UP_MIN} min)`);
for (let i = 0; ; i++) {
  const c = new AbortController();
  const timer = setTimeout(() => c.abort(), 20_000);
  try {
    const r = await fetch(`${URL_}/chat/completions`, { method: 'POST', headers: H, signal: c.signal,
      body: JSON.stringify({ model: MODEL, messages: [{ role: 'user', content: 'ping' }], max_tokens: 1 }) });
    clearTimeout(timer);
    if (r.ok) { console.log(`[bench] warm after ${since()} (${i + 1} probes)`); break; }
    console.log(`[bench] ${since()} probe ${i + 1}: HTTP ${r.status} | ${await endpointStatus()}`);
  } catch (e) {
    clearTimeout(timer);
    console.log(`[bench] ${since()} probe ${i + 1}: ${e.name} | ${await endpointStatus()}`);
  }
  if (Date.now() - t0 > GIVE_UP_MIN * 60_000) { console.error(`[bench] gave up after ${GIVE_UP_MIN} min`); process.exit(1); }
  await new Promise((res) => setTimeout(res, 10_000));
}

// 2. Served config.
try {
  const m = await (await fetch(`${URL_}/models`, { headers: H })).json();
  const d = (m.data ?? [])[0] ?? {};
  console.log(`[bench] served: id=${d.id} max_model_len=${d.max_model_len}`);
} catch (e) { console.log('[bench] /models failed:', e.message); }

// 3. Streamed timing.
const filler = 'Violet Marchetti is thirty-one, a night-shift nurse who left the hospital after the fire. She keeps her keys on a red carabiner, reads the obituaries first, and does not trust men who smile with their whole face. Her apartment smells of coffee and bleach. She owes Danny four hundred dollars and has not forgotten it. ';
const persona = filler.repeat(14); // ~1.4k tokens, spirit-sized prefix
async function timed(label, messages, maxTokens) {
  const start = Date.now();
  let first = 0, chunks = 0, text = '', usage = null;
  const r = await fetch(`${URL_}/chat/completions`, { method: 'POST', headers: H,
    body: JSON.stringify({ model: MODEL, messages, max_tokens: maxTokens, temperature: 0.7, stream: true,
      stream_options: { include_usage: true }, chat_template_kwargs: { enable_thinking: false } }) });
  if (!r.ok) { console.log(`[bench] ${label}: HTTP ${r.status} ${(await r.text()).slice(0, 200)}`); return null; }
  const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = '';
  for (;;) {
    const { value, done } = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl; while ((nl = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1);
      if (!line.startsWith('data:')) continue; const payload = line.slice(5).trim(); if (payload === '[DONE]') continue;
      let j; try { j = JSON.parse(payload); } catch { continue; }
      if (j.usage) usage = j.usage;
      const delta = j.choices?.[0]?.delta?.content; if (delta) { if (!first) first = Date.now(); chunks++; text += delta; }
    }
  }
  const total = (Date.now() - start) / 1000, ttft = first ? (first - start) / 1000 : NaN;
  const out = usage?.completion_tokens ?? chunks, inn = usage?.prompt_tokens ?? '?';
  const tps = out / Math.max(total - ttft, 0.001);
  console.log(`[bench] ${label.padEnd(8)} in=${inn} out=${out} ttft=${ttft.toFixed(2)}s total=${total.toFixed(2)}s decode=${tps.toFixed(1)} tok/s`);
  return { ttft, total, out, tps };
}
const spiritMsgs = [{ role: 'system', content: persona + '\nYou are Violet. Monologue freely for several paragraphs about what you feel in this moment, then end with one line starting with Say:' }, { role: 'user', content: 'A bright-eyed lass behind the bar says: "You look like you have seen a ghost, love. What will it be?"' }];
const shortMsgs = [{ role: 'system', content: persona + '\nYou are Violet. Answer in one spoken line, under 25 words, starting with Say:' }, { role: 'user', content: 'Ruth asks: "Violet, what did you see out there?"' }];
const rows = [];
for (let i = 0; i < RUNS; i++) {
  rows.push(await timed(`spirit#${i + 1}`, spiritMsgs, 450));
  rows.push(await timed(`short#${i + 1}`, shortMsgs, 60));
}
const ok = rows.filter(Boolean);
if (ok.length) console.log(`[bench] mean decode ${(ok.reduce((a, r) => a + r.tps, 0) / ok.length).toFixed(1)} tok/s; mean ttft ${(ok.reduce((a, r) => a + r.ttft, 0) / ok.length).toFixed(2)}s`);
