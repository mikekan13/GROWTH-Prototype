import { parseTableProse, isDescriptive, splitDurationClause } from '../app/src/services/table-prose';
const table = [{ id: 'kris', name: 'Kristopher', sex: 'Male' }, { id: 'violet', name: 'Violet', sex: 'Female' }];
console.log('desc1', isDescriptive('His face looks tired and his eyes are red', table[0]));
console.log('desc2', isDescriptive('Kristopher seems off', table[0]));
console.log('desc3', isDescriptive('He looks over the receipt', table[0]));
console.log('span', JSON.stringify(splitDurationClause('After a minute, he knocks again.', table[0])));
console.log('span2', JSON.stringify(splitDurationClause('After a minute he knocks again.', table[0])));
const p = parseTableProse('He thinks about just leaving but he remembers this woman... She is gorgeous but a bit weird. Kristopher speaks again. "Ma\'am you didn\'t pay yet so I can\'t just leave it..."', table, { recentActors: [table[0], table[1]] });
console.log(JSON.stringify(p, null, 1));
