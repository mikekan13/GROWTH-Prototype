import { endSession } from '../app/src/services/campaign-event';
(async () => { console.log(JSON.stringify(await endSession('cms5z4j6z0000zg48z5vzl2jn'))); process.exit(0); })().catch(e => { console.error('FAIL', e.message); process.exit(1); });
