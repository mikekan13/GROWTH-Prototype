import { config } from '../app/node_modules/dotenv'; config({ path: '.env.local' }); config();
import { spentTodayUsd, gpuStatus } from '../app/src/services/gpu-budget';
(async () => { console.log('spent today (UTC) $', await spentTodayUsd()); console.log('verdict', await gpuStatus()); process.exit(0); })();
