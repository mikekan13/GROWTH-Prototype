import { parseTableProse, characterCards } from '../app/src/services/table-prose';
const kris = { id: 'kris', name: 'Kristopher', sex: 'Male' }; const violet = { id: 'violet', name: 'Violet', sex: 'Female' };
const line = 'Kristopher stands on the fourth floor landing which only has one apartment. He thinks it is odd and his brain begins to race for meaning where perhaps none is. He wipes his eyes from the tears he was crying in the car. And he says the prayer in his head. "Lord Jesus Christ, Son of God, have mercy on me a sinner." He knocks on the door and a genuine smile flutters across his face.';
const p = parseTableProse(line, [kris, violet], { recentActors: [kris, violet] });
console.log('NARRATION:', p.narration);
for (const c of characterCards(line, { narration: p.narration, speech: p.quotes, actions: p.actions, thoughts: p.thoughts })) {
  console.log(`CARD ${c.label}:`);
  for (const s of c.segments) console.log(`   ${s.kind === 'action' ? '::' : s.kind === 'thought' ? '((' : '"'}${s.text}${s.kind === 'action' ? '::' : s.kind === 'thought' ? '))' : '"'}`);
}
console.log('SPEECH:', JSON.stringify(p.quotes));
