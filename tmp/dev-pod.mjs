/** The dedicated dev text pod (Mike 2026-10-29: "$1 an hour for dev time is fine").
 *  Usage (from app/):  node ../tmp/dev-pod.mjs status | start | stop | switch pod | switch serverless
 *  status  — pod state, cost, and whether vLLM answers on /v1/models
 *  start/stop — resume or stop the pod (stopped = no GPU charge; the 30 GB container disk is kept)
 *  NOTE 2026-10-30: the SESSION owns the pod now (src/daya/text-pod.ts): session start resumes it, session end / 20 min idle /
 *  budget stops it. Use start here only when Michael asks for it outside a session.
 *  switch  — point .env.local's text lane at the pod or back at the serverless endpoint (the dev server may need a restart) */
import fs from 'node:fs';
const ENV = '.env.local';
const env = Object.fromEntries(fs.readFileSync(ENV, 'utf8').split(/\r?\n/).filter(l => /^[A-Z0-9_]+=/.test(l)).map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')]; }));
const pod = JSON.parse(fs.readFileSync('../tmp/dev-pod.json', 'utf8'));
const H = { Authorization: `Bearer ${env.RUNPOD_API_KEY}`, 'Content-Type': 'application/json' };
const gql = async (query, variables) => (await (await fetch('https://api.runpod.io/graphql', { method: 'POST', headers: H, body: JSON.stringify({ query, variables }) })).json());
const base = `https://${pod.podId}-8000.proxy.runpod.net/v1`;
const [cmd, arg] = process.argv.slice(2);

async function status() {
  const j = await gql(`query { pod(input:{podId:"${pod.podId}"}) { desiredStatus costPerHr runtime { uptimeInSeconds } machine { gpuDisplayName } } }`);
  const p = j.data?.pod;
  console.log('pod', pod.podId, p?.desiredStatus, p?.machine?.gpuDisplayName, '$' + p?.costPerHr + '/h', 'up', p?.runtime?.uptimeInSeconds ?? 0, 's');
  try {
    const c = new AbortController(); setTimeout(() => c.abort(), 8000);
    const r = await fetch(`${base}/models`, { headers: { Authorization: `Bearer ${pod.token}` }, signal: c.signal });
    const t = await r.text();
    console.log('vllm', r.status, r.ok ? JSON.parse(t).data?.map(m => m.id).join(',') : t.slice(0, 120));
  } catch (e) { console.log('vllm not answering yet:', e.name === 'AbortError' ? 'timeout' : e.message); }
  const lane = env.DAYA_L1_URL?.includes(pod.podId) ? 'pod' : env.DAYA_L1_URL?.includes('/v2/') ? 'serverless' : env.DAYA_L1_URL;
  console.log('app lane →', lane);
}
async function setStatus(action) {
  const j = await gql(`mutation { pod${action}(input:{podId:"${pod.podId}"${action === 'Resume' ? ', gpuCount:1' : ''}}) { id desiredStatus } }`);
  console.log(action, JSON.stringify(j.data ?? j.errors));
}
function switchLane(to) {
  let s = fs.readFileSync(ENV, 'utf8');
  const set = (k, v) => { const re = new RegExp(`^${k}=.*$`, 'm'); s = re.test(s) ? s.replace(re, `${k}=${v}`) : s + `\n${k}=${v}`; };
  if (to === 'pod') {
    if (!env.DAYA_L1_URL.includes(pod.podId)) { pod.serverless = { DAYA_L1_URL: env.DAYA_L1_URL, AI_LOCAL_BASE_URL: env.AI_LOCAL_BASE_URL, AI_LOCAL_API_KEY: env.AI_LOCAL_API_KEY ?? '' }; fs.writeFileSync('../tmp/dev-pod.json', JSON.stringify(pod, null, 1)); }
    set('DAYA_L1_URL', base); set('AI_LOCAL_BASE_URL', base); set('AI_LOCAL_API_KEY', pod.token);
  } else {
    const sv = pod.serverless; if (!sv) throw new Error('no saved serverless values');
    set('DAYA_L1_URL', sv.DAYA_L1_URL); set('AI_LOCAL_BASE_URL', sv.AI_LOCAL_BASE_URL); set('AI_LOCAL_API_KEY', sv.AI_LOCAL_API_KEY);
  }
  fs.writeFileSync(ENV, s);
  console.log('lane →', to, '(restart the dev server if the lane still reads the old one)');
}
if (cmd === 'status') await status();
else if (cmd === 'start') await setStatus('Resume');
else if (cmd === 'stop') await setStatus('Stop');
else if (cmd === 'switch' && (arg === 'pod' || arg === 'serverless')) switchLane(arg);
else console.log('usage: status | start | stop | switch pod|serverless');
