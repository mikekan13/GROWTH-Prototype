/**
 * A MONOLOGUE MAY NOT INVENT AGAINST WHAT IT RECALLED (HW8 run 7 #6). Her recall surfaced "I order from the same pizza place every day.
 * Hawaiian plus black olives" and the voice wrote "He remembered the extra pepperoni". The never-guess checks ran on spoken answers only.
 *
 * A cheap, narrow check: a sentence that names a SPECIFIC (a topping or dish, a number, a colour) while a recalled / fact sentence
 * about the same thing (they share an ordinary anchor word) carries a DIFFERENT specific of the same kind is a competing specific.
 * The kinds are closed categories (what sort of word a specific is), not story content. Pure.
 */
const KINDS: Array<{ kind: string; re: RegExp }> = [
  { kind: 'food', re: /\b(?:pepperoni|hawaiian|olives?|mushrooms?|sausage|cheese|pineapple|ham|onions?|bacon|peppers?|anchov\w+|margherita|veggie|meatball|chicken|beef|tomato(?:es)?|spinach|garlic|jalape\w+)\b/gi },
  { kind: 'colour', re: /\b(?:red|blue|green|yellow|purple|orange|black|white|grey|gray|brown|pink|silver|gold)\b/gi },
  { kind: 'number', re: /\b(?:\d+(?:[.,]\d+)?|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|twenty|thirty|forty|fifty)\b/gi },
];
const STOP = new Set(['that', 'this', 'with', 'from', 'have', 'been', 'were', 'what', 'when', 'then', 'they', 'there', 'their', 'would', 'could', 'about', 'into', 'just', 'only', 'even', 'still', 'some', 'does', 'plus', 'extra', 'every', 'same', 'your', 'you', 'remembered', 'remember']);

const specificsOf = (sentence: string, re: RegExp): string[] => [...new Set((sentence.match(re) ?? []).map((x) => x.toLowerCase()))];
const anchorsOf = (sentence: string, kindRes: RegExp[]): Set<string> => {
  const out = new Set<string>();
  for (const w of sentence.toLowerCase().match(/[a-z]{4,}/g) ?? []) {
    if (STOP.has(w) || kindRes.some((r) => new RegExp(`^(?:${r.source})$`, 'i').test(w))) continue;
    out.add(w.slice(0, 5));
  }
  return out;
};

export interface CompetingSpecific { kind: string; claimed: string[]; known: string[]; memory: string }

/** The first knowledge sentence that carries a different specific of the same kind about the same thing, or null. */
export function competingSpecific(sentence: string, knowledge: string[]): CompetingSpecific | null {
  const kindRes = KINDS.map((k) => k.re);
  const mine = anchorsOf(sentence, kindRes);
  for (const { kind, re } of KINDS) {
    const claimed = specificsOf(sentence, new RegExp(re.source, 'gi'));
    if (!claimed.length) continue;
    for (const k of knowledge) {
      const parts = k.split(/(?<=[.!?…])\s+/);
      for (let i = 0; i < parts.length; i++) {
        const ks = `${parts[i]} ${parts[i + 1] ?? ''}`.trim();
        const known = specificsOf(ks, new RegExp(re.source, 'gi'));
        if (!known.length || claimed.some((c) => known.includes(c))) continue;
        const shared = [...anchorsOf(ks, kindRes)].filter((a) => mine.has(a));
        if (shared.length >= 1) return { kind, claimed, known, memory: ks.trim() };
      }
    }
  }
  return null;
}

/** The hint for the one re-voice: the memory quoted, the competing specific named. */
export function specificsHint(c: CompetingSpecific): string {
  return `Your memory says: "${c.memory}" You wrote ${c.claimed.join(', ')}; your memory has ${c.known.join(', ')}. Think it again with what you remember, or leave that sentence out.`;
}
