import { campaignNames, newTranslationMap, translateOut, translateBack } from '../app/src/ai/network/translator';
(async () => {
  const names = await campaignNames('cms5z4j6z0000zg48z5vzl2jn');
  const people = names.filter((n) => n.kind === 'person').map((n) => `${n.name}${n.aliases ? ' [' + n.aliases.join(',') + ']' : ''}`);
  console.log('people:', people.join(' | '));
  const map = newTranslationMap();
  const out = translateOut('Kristopher calls Violet. She gave him the five.', names, map).text;
  console.log('OUT', out, [...map.toReal.entries()]);
  for (const t of ['Person-A is not picking up.', 'I expect Person-B to come.', "Person-B's phone.", 'Person A and Person-B.']) console.log(JSON.stringify(t), '->', JSON.stringify(translateBack(t, map)));
  process.exit(0);
})();
