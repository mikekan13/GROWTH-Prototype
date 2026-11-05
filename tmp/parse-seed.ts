import { parseTableProse } from '@/services/table-prose';
const roster = [
  { id: 'cmvcbw49u0001h448qanzbhs3', name: 'Kristopher', aliases: [] as string[] },
  { id: 'cms60ndtn0000kw48ioq10i68', name: 'Violet', aliases: [] as string[] },
] as any;
const p = parseTableProse("Kristopher checks the receipt to see if the order was paid. Then he knocks on Violet's door.", roster);
console.log(JSON.stringify({ narration: p.narration, actions: p.actions, thoughts: p.thoughts, quotes: p.quotes }, null, 1));
