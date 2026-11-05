import { lineDuration } from '../app/src/lib/stated-duration';
for (const t of ['The next afternoon, at 2:22 pm, the first rain drops fall on his windshield.', 'At 2:22 pm the next day Kristopher watches the rain.', 'It is 2:22 pm the following afternoon.', 'The following day at 2:22 pm he waits.', 'Tomorrow at 2:22 pm.'])
  console.log(JSON.stringify(lineDuration('gm-line' as any, t, { localHour: 22, localMinute: 27 })), '←', t);
