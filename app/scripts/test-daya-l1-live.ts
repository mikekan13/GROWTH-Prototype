import './_server-only-shim';
import { config } from 'dotenv';
config({ path: '.env.local' });
config({ path: '.env' });
import { chat } from '../src/daya/model-client';

(async () => {
  console.log('L1 configured:', !!process.env.DAYA_L1_URL, process.env.DAYA_L1_MODEL);
  const r = await chat({
    tier: 'L1',
    subsystem: 'l1_live_smoke',
    messages: [
      { role: 'system', content: 'You are Sam, a weary night-shift nurse. Speak only in character, briefly, in your own voice. No lists, no meta.' },
      { role: 'user', content: 'A coworker asks how your shift is going. Answer in one or two sentences.' },
    ],
    maxTokens: 90,
    temperature: 0.8,
  });
  console.log('L1 REPLY:', JSON.stringify(r.text));
  console.log('tokens in/out:', r.tokensIn, r.tokensOut);
  const leaked = /thinking process|analyze user|deconstruct the request|step 1/i.test(r.text);
  console.log(leaked ? 'FAIL: reasoning leaked' : 'OK: clean in-character output');
  process.exit(leaked ? 1 : 0);
})().catch(e => { console.error('ERR', e?.message || e); process.exit(1); });
