import { config } from '../app/node_modules/dotenv'; config({ path: '.env.local' }); config();
(async () => {
  const { laneReadiness } = await import('../app/src/daya/l1-endpoint');
  const r = await laneReadiness();
  console.log(JSON.stringify({ phase: r.phase, status: r.status, cold: r.expectedColdStartSeconds, worker: r.endpoint?.worker }));
  process.exit(0);
})();
