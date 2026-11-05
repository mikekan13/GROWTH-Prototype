import { parseTableProse } from '../app/src/services/table-prose';
const table = [{ id: 'kris', name: 'Kristopher', sex: 'm' }, { id: 'violet', name: 'Violet', sex: 'f' }] as any;
const p = parseTableProse(`He stops at the door way to the landing and looks back at Violet's closed door. "Please... can you just slip money under the door at least?"`, table, { recentActors: [table[0], table[1]] });
console.log(JSON.stringify({ quotes: p.quotes.map(q => [q.speakerLabel, q.text]), actions: p.actions?.map(a => [a.actorLabel, a.text]), narration: p.narration }));
