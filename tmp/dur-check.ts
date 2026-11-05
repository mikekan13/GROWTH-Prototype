import { lineDuration } from '../app/src/lib/stated-duration';
const text = 'At 2:32 pm the sky was dark and heavy and rain began to fall. Kristopher was waiting in his car for the first drops to hit his windshield. He sends a text to Violet. "Meet me at the coffee shop in 15 minutes or so?"';
console.log(JSON.stringify(lineDuration('say' as any, text, { localHour: 22 })));
console.log(JSON.stringify(lineDuration('say' as any, 'The next afternoon, at 2:32 pm, rain began to fall.', { localHour: 22 })));
