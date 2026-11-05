import { laneReadiness } from '../app/src/daya/l1-endpoint';
(async () => { const r = await laneReadiness(); console.log(JSON.stringify({ status: r.status, phase: r.phase, endpoint: r.endpoint })); process.exit(0); })();
