import { parseTableProse } from '../app/src/services/table-prose';
const table = [{ id: 'kris', name: 'Kristopher', sex: 'Male' }, { id: 'violet', name: 'Violet', sex: 'Female' }];
console.log(JSON.stringify(parseTableProse('And he says the prayer in his head. "Lord Jesus Christ, Son of God, have mercy on me a sinner."', table, { recentActors: [table[0]] }), null, 1));
console.log(JSON.stringify(parseTableProse('Kristopher mutters to himself. "Not today."', table), null, 1));
