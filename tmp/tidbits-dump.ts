import { getTidbits } from '../app/src/services/tidbits';
const CAMP = 'cms5z4j6z0000zg48z5vzl2jn';
const KRIS = 'cmvcbw49u0001h448qanzbhs3';
const VIOLET = 'cms60ndtn0000kw48ioq10i68';
(async () => {
  const caller = { id: 'x', role: 'ADMIN' };
  for (const viewer of ['watcher', KRIS, VIOLET]) {
    const r = await getTidbits(caller, CAMP, { viewer } as any, Math.random);
    console.log(`\n## ${viewer} fallback=${r.fallback}`);
    for (const t of r.tidbits) console.log('-', t);
  }
  process.exit(0);
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
