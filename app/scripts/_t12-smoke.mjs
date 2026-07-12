// T12 smoke: one Stage-1 face-lock generation through the real app path.
const BASE = 'http://localhost:3000';
const REFS = [
  '/uploads/references/cmmr6dhzp0000v848uwvy5slh/49b520d7-1f76-4cc2-a1ad-51a1b0cb5939.jpg',
  '/uploads/references/cmmr6dhzp0000v848uwvy5slh/550dc21f-33c8-46ec-82ac-e2ea4f01b31c.jpg',
  '/uploads/references/cmmr6dhzp0000v848uwvy5slh/584e3c3b-90a8-47dd-aa21-ba3e1f0f9084.jpg',
];

const login = await fetch(`${BASE}/api/auth/login`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ login: 'admin@growth.local', password: 'admin' }),
});
if (!login.ok) { console.error('login failed', login.status); process.exit(1); }
const cookie = login.headers.get('set-cookie') || '';

const chars = await fetch(`${BASE}/api/characters`, { headers: { cookie } }).then(r => r.json());
const pilgrim = (chars.characters ?? chars).find?.(c => c.name === 'Test Pilgrim')
  ?? (chars.characters ?? chars)[0];
console.log('subject character:', pilgrim.name, pilgrim.id);

console.log('generating (Stage-1 face, creationMode, 3 identity refs)…');
const t0 = Date.now();
const res = await fetch(`${BASE}/api/portraits/generate`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', cookie },
  body: JSON.stringify({
    characterId: pilgrim.id,
    creationMode: true,
    referenceImagePaths: REFS,
  }),
  signal: AbortSignal.timeout(8 * 60_000),
});
const json = await res.json().catch(() => ({}));
const secs = Math.round((Date.now() - t0) / 1000);
if (!res.ok || !json.success) {
  console.error(`FAILED (${res.status}, ${secs}s):`, JSON.stringify(json).slice(0, 400));
  process.exit(1);
}
console.log(`SUCCESS in ${secs}s`);
console.log('image:', json.imagePath);
console.log('seed:', json.metadata?.seed, '| workflow:', json.metadata?.workflowUsed, '| model:', json.metadata?.model);
console.log('genTimeMs:', json.metadata?.generationTimeMs, '| failedWorkflows:', JSON.stringify(json.metadata?.failedWorkflows ?? []));
