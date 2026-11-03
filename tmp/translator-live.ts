import { campaignNames, newTranslationMap, translateOut, translateBack } from '../app/src/ai/network/translator';
(async () => {
  const names = await campaignNames('cms5z4j6z0000zg48z5vzl2jn');
  const sample = "Kristopher sits in his car in the lot behind the hotel. Violet's phone rings in Violet's apartment. He looks at the five-dollar bill.";
  const map = newTranslationMap();
  const out = translateOut(sample, names, map).text;
  console.log('names', names.length);
  console.log('OUT ', out);
  console.log('BACK', translateBack(out, map) === sample ? 'round trip ok' : translateBack(out, map));
  process.exit(0);
})().catch((e) => { console.error('FAIL', e.message); process.exit(1); });
