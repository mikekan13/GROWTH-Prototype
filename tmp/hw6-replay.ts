import { parseTableProse } from '../app/src/services/table-prose';
import { ownVoice } from '../app/src/services/own-voice';
import { audibleOnly } from '../app/src/services/senses-filter';
const kris = { id: 'kris', name: 'Kristopher', sex: 'Male' }; const violet = { id: 'violet', name: 'Violet', sex: 'Female' };
const lines = [
  'Kristopher knocks on the apartment door. His face looks tired and his eyes are slightly red from crying in the car.',
  'He knocks on the door.',
  'Kristopher looks over the recipt for the price of the pizza as a genuine smile masks the memory of the tears he was just crying on the drive over. He knocks again.',
  'Kristopher shifts in the hallway as he waits.',
  'He waits a minute and then knocks again.',
  'He gets close to the door and speaks loudly "hello? Anyone home?"',
  'He knocks again softly but a little desperate.',
  'He thinks about just leaving but he remembers this woman... She is gorgeous but a bit weird. Kristopher speaks again. "Ma\'am you didn\'t pay yet so I can\'t just leave it..."',
];
for (const l of lines) {
  const p = parseTableProse(l, [kris, violet], { recentActors: [kris, violet], lastVoiced: kris });
  const pub = [p.narration, ...(p.actions ?? []).map((a) => `${a.actorLabel} ${a.text.charAt(0).toLowerCase()}${a.text.slice(1)}.`), ...p.quotes.map((q) => `${q.speakerLabel}: ${q.text}`)].filter(Boolean).join('\n');
  console.log('\n──', l.slice(0, 70));
  console.log('  narration :', p.narration);
  console.log('  actions   :', (p.actions ?? []).map((a) => `${a.actorLabel}::${a.text}`).join(' | ') || '-');
  console.log('  thoughts  :', (p.thoughts ?? []).map((t) => `${t.actorLabel}((${t.text}))`).join(' | ') || '-');
  console.log('  speech    :', p.quotes.map((q) => `${q.speakerLabel}: "${q.text}"`).join(' | ') || '-');
  console.log('  Violet hears:', JSON.stringify(audibleOnly(pub, ['hearing'])));
  console.log('  Kris own   :', JSON.stringify(ownVoice(pub, kris)));
}
