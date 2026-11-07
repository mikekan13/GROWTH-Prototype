import fs from 'node:fs';
const env = Object.fromEntries(fs.readFileSync('.env.local', 'utf8').split(/\r?\n/).filter(l => /^[A-Z0-9_]+=/.test(l)).map(l => { const i = l.indexOf('='); return [l.slice(0, i), l.slice(i + 1).replace(/^"|"$/g, '')]; }));
const q = `query { gpuTypes { id displayName memoryInGb secureCloud communityCloud lowestPrice(input:{gpuCount:1}) { minimumBidPrice uninterruptablePrice stockStatus } } }`;
const j = await (await fetch('https://api.runpod.io/graphql', { method: 'POST', headers: { Authorization: `Bearer ${env.RUNPOD_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: q }) })).json();
for (const g of (j.data?.gpuTypes ?? []).filter(g => g.memoryInGb >= 80).sort((a, b) => (a.lowestPrice?.uninterruptablePrice ?? 99) - (b.lowestPrice?.uninterruptablePrice ?? 99)))
  console.log(g.id.padEnd(40), g.memoryInGb + 'GB', '$' + g.lowestPrice?.uninterruptablePrice, g.lowestPrice?.stockStatus ?? '');
const me = await (await fetch('https://api.runpod.io/graphql', { method: 'POST', headers: { Authorization: `Bearer ${env.RUNPOD_API_KEY}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query: 'query { myself { clientBalance currentSpendPerHr } }' }) })).json();
console.log('balance', JSON.stringify(me.data?.myself));
