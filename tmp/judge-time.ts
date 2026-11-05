import { judgeCanonReach } from '../app/src/services/perception-reach';
const CAMP = 'cms5z4j6z0000zg48z5vzl2jn';
(async () => {
  const t0 = Date.now();
  const j = await judgeCanonReach(CAMP, { id: null, kind: 'narration', text: 'He waits a bit and then knocks again.', sourceId: 'cmvcbw49u0001h448qanzbhs3' }, ['cms60ndtn0000kw48ioq10i68']);
  console.log('judge total', Date.now() - t0, 'ms | source', j.source, 'ms', j.ms, 'err', j.error ?? '', '| verdicts', JSON.stringify([...j.verdicts.values()]));
  process.exit(0);
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
