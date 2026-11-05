import { audibleSentence } from '../app/src/services/senses-filter';
const s = 'Kristopher looks over the recipt for the price of the pizza as a genuine smile masks the memory of the tears he was just crying on the drive over.';
console.log(JSON.stringify(audibleSentence(s)));
console.log(JSON.stringify(audibleSentence('He knocks on the door as a genuine smile masks the tears.')));
console.log(JSON.stringify(audibleSentence('He gets close to the door and speaks loudly.')));
