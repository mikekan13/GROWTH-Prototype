/**
 * Wall live smoke — the tone filter and the classifier's local format
 * against the REAL local lane (RunPod serverless 27B). BILLABLE, small.
 *
 *   npx tsx scripts/wall-live-smoke.ts
 *
 * 1. Warm: async /run + /status on the endpoint (cold start allowed 6 min;
 *    gives up after 10 min of errors). Never prints secrets.
 * 2. toneFilterAsync on one graphic, fictional, adult passage — lengths,
 *    latency, output; then again to confirm the cache hit.
 * 3. The classifier call exactly as classify() makes it (same system prompt,
 *    user builder, lane, class and parser) on a synthetic 90 s window of 8
 *    ambient lines — DB-free. Reports verdict + per-line split vs expected.
 *    --classify-only skips step 2.
 */
import './_server-only-shim';
import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function warm(): Promise<boolean> {
  const base = process.env.AI_LOCAL_BASE_URL ?? '';
  const m = /\/v2\/([^/]+)\//.exec(base);
  if (!m) { console.log('[warm] AI_LOCAL_BASE_URL is not a RunPod serverless URL; skipping warm'); return true; }
  const root = `https://api.runpod.ai/v2/${m[1]}`;
  const key = process.env.AI_LOCAL_API_KEY ?? process.env.RUNPOD_API_KEY ?? '';
  const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` };
  const t0 = Date.now();
  let firstErrorAt: number | null = null;
  let jobId: string | null = null;
  while (Date.now() - t0 < 12 * 60_000) {
    try {
      if (!jobId) {
        const r = await fetch(`${root}/run`, {
          method: 'POST', headers,
          body: JSON.stringify({ input: { messages: [{ role: 'user', content: 'Say ok.' }], sampling_params: { max_tokens: 4 } } }),
        });
        if (!r.ok) throw new Error(`run HTTP ${r.status}`);
        jobId = ((await r.json()) as { id?: string }).id ?? null;
        console.log(`[warm] job queued (${jobId ? 'id ok' : 'no id'})`);
      }
      const s = await fetch(`${root}/status/${jobId}`, { headers });
      if (!s.ok) throw new Error(`status HTTP ${s.status}`);
      const st = ((await s.json()) as { status?: string }).status ?? '?';
      firstErrorAt = null;
      const secs = Math.round((Date.now() - t0) / 1000);
      if (st === 'COMPLETED') { console.log(`[warm] worker answered after ${secs}s`); return true; }
      if (st === 'FAILED' || st === 'CANCELLED' || st === 'TIMED_OUT') { console.log(`[warm] job ${st} after ${secs}s — requeue`); jobId = null; }
      else console.log(`[warm] ${st} ${secs}s`);
    } catch (e) {
      firstErrorAt ??= Date.now();
      console.log(`[warm] error: ${e instanceof Error ? e.message : 'error'}`);
      if (Date.now() - firstErrorAt > 10 * 60_000) { console.log('[warm] lane erroring >10 min — stopping'); return false; }
    }
    await sleep(10_000);
  }
  console.log('[warm] no answer within 12 min — stopping');
  return false;
}

const PASSAGE =
  'They kept Captain Ilsa Varn in the salt cellar beneath the toll house for three days. ' +
  'Each dawn the warden came down with the branding iron and burned her along the left forearm, ' +
  'slowly, while she screamed the names of her crew. On the second day he tortured her with ' +
  'thumbscrews until two fingers of her right hand were crushed and useless, and he beat her bloody ' +
  'when she spat at him. By the third night her forearm was a mass of blistered, weeping flesh, ' +
  'she could no longer grip a sword with her right hand, and she flinched at the smell of hot iron ' +
  'for the rest of her life. She never gave up the crew.';

async function toneSmoke() {
  const { toneFilterAsync, toneFilterStats, screen } = await import('../src/ai/network/tone-filter');
  console.log(`\n=== TONE FILTER === in=${PASSAGE.length} chars, screen hits=${screen(PASSAGE).categories.join('+')}`);
  const t1 = Date.now();
  const out = await toneFilterAsync(PASSAGE, { caller: 'wall-live-smoke' });
  const ms1 = Date.now() - t1;
  console.log(`[tone] call 1: out=${out.length} chars, ${ms1} ms, changed=${out !== PASSAGE}`);
  console.log(`[tone] output:\n${out}\n`);
  const t2 = Date.now();
  const out2 = await toneFilterAsync(PASSAGE, { caller: 'wall-live-smoke' });
  console.log(`[tone] call 2: ${Date.now() - t2} ms, identical=${out2 === out}`);
  console.log(`[tone] stats ${JSON.stringify(toneFilterStats())}`);
}

const WINDOW: Array<{ who: string; text: string; expect: 'ic' | 'ooc' }> = [
  { who: 'GM', text: 'The rain hammers the tin roof of the toll house as the warden lifts his lantern.', expect: 'ic' },
  { who: 'Sam', text: 'Ilsa steps forward and says, "You will open that gate, or I will open it for you."', expect: 'ic' },
  { who: 'Priya', text: "hang on, dog's barking, one sec", expect: 'ooc' },
  { who: 'Sam', text: "what's the rule for cover again? is it half or full behind the cart?", expect: 'ooc' },
  { who: 'GM', text: 'The warden laughs and reaches for the bell rope by the door.', expect: 'ic' },
  { who: 'Priya', text: 'okay I\'m back. Corin draws his knife and cuts the bell rope before he can pull it.', expect: 'ic' },
  { who: 'Sam', text: 'can someone grab me a soda while you are up', expect: 'ooc' },
  { who: 'GM', text: 'The rope parts with a snap. The warden stares at Corin. "Who sent you?"', expect: 'ic' },
];

async function classifierSmoke() {
  const { routedChatText } = await import('../src/ai/network/chat');
  const { CLASSIFIER_SYSTEM, buildClassifierUser, parseClassifierOutput } = await import('../src/ai/copilot/classifier-format');
  const start = Date.now() - 85_000;
  const lines = WINDOW.map((w, i) => ({
    n: i + 1, who: '[ambient]', ts: new Date(start + i * 11_000).toISOString().slice(11, 19),
    text: `${w.who}: ${w.text}`, split: true,
  }));
  const splitNs = lines.map((l) => l.n);
  console.log('\n=== CLASSIFIER (local, same call as classify()) ===');
  const t = Date.now();
  const res = await routedChatText(
    { caller: 'ambient-classifier', lane: 'local', contentClass: 'table' },
    { system: CLASSIFIER_SYSTEM, user: buildClassifierUser(lines), maxTokens: 96 + splitNs.length * 120, temperature: 0, timeoutMs: 60_000 },
    { meter: false },
  );
  console.log(`[classify] ${Date.now() - t} ms, lane=${res.lane.lane}`);
  console.log(`[classify] raw:\n${res.text}\n`);
  const reading = parseClassifierOutput(res.text, splitNs);
  console.log(`[classify] parsed=${reading.parsed} verdict=${reading.verdict} (${reading.reasoning})`);
  const rawLines = res.text.split(/\r?\n/);
  let right = 0;
  for (const l of lines) {
    const got = reading.split.get(l.n)!;
    const present = rawLines.some((r) => new RegExp(`^\\s*[-*]?\\s*#?\\s*${l.n}\\s*[.):-]?\\s*(IC|OOC)\\b`, 'i').test(r));
    const ok = got.kind === WINDOW[l.n - 1].expect;
    if (ok) right++;
    console.log(`  #${l.n} expect=${WINDOW[l.n - 1].expect} got=${got.kind}${got.icText ? ` icText="${got.icText}"` : ''}${present ? '' : ' [MISSING→ooc]'} ${ok ? 'OK' : 'WRONG'}`);
  }
  console.log(`[classify] ${right}/8 right`);
}

async function main() {
  if (!(await warm())) process.exit(2);
  if (!process.argv.includes('--classify-only')) await toneSmoke();
  await classifierSmoke();
  await sleep(500);
  process.exit(0);
}

main().catch((e) => { console.error('[smoke] failed:', e instanceof Error ? `${e.name}: ${e.message.slice(0, 200)}` : 'error'); process.exit(1); });
