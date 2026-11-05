import { firstPersonSentence, firstPersonVerb } from '../app/src/services/own-voice';
console.log(firstPersonSentence('He thinks about just leaving but he remembers this woman.', { name: 'Kristopher', sex: 'Male' }));
console.log(firstPersonVerb('remembers'));
console.log('but I remembers this'.replace(/I\s+(\w+s)/g, (m, v) => `[${m}|${v}]`));
