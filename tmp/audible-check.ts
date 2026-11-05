import { audibleOnly, audibleSentence } from '@/services/senses-filter';
const seed = 'Kristopher approaches the door as he wipes the tears from the car ride away. He remembers this customer. He smiles a genuine smile and gently knocks three times on the door.';
console.log('ONLY ->', JSON.stringify(audibleOnly(seed, ['hearing'])));
for (const s of seed.split(/(?<=\.)\s+/)) console.log('SENT ->', JSON.stringify(s), '=>', JSON.stringify(audibleSentence(s)));
console.log('L2 ->', JSON.stringify(audibleOnly('He adjusts his visor and opens the pizza bag looking for the receipt to see if it has been paid yet.', ['hearing'])));
