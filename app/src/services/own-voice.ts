/**
 * Own voice — the Watcher's third-person line about a being, rewritten in the
 * first person before it reaches that being's senses (HW6 2026-10-25).
 *
 * "He gets close to the door and speaks loudly" told Kristopher his act was his
 * own doing, and he still heard a second man in the hallway and wanted to ask
 * if "he" was okay. The note was advisory; the text said "He". What his senses
 * get now is "I get close to the door and speak loudly" — the sentence itself
 * in his person, the way an act feels from inside.
 *
 * Deterministic: the subject (his name, he/she) becomes "I"; the verbs that
 * follow it, and those after "and"/"then", drop the third-person -s; his
 * pronouns become mine. A `Name: words` speech line becomes `I say: "words"`.
 * Nothing is added. Pure, unit-tested.
 */

export interface OwnVoiceActor {
  name: string;
  sex?: string | null;
}

const IRREGULAR: Record<string, string> = {
  is: 'am', was: 'was', has: 'have', does: 'do', goes: 'go', says: 'say',
  "isn't": "am not", "doesn't": "don't", "hasn't": "haven't", "wasn't": "wasn't",
};

// Words that end in -s and are not a third-person verb (nouns, adjectives, adverbs that commonly follow the subject).
const NOT_A_VERB = new Set(['this', 'his', 'always', 'perhaps', 'yes', 'less', 'across', 'towards', 'unless', 'as', 'its', 'us', 'thus', 'besides', 'sometimes', 'once', 'nervous', 'anxious', 'serious', 'curious', 'obvious', 'previous', 'various', 'famous', 'jealous', 'cautious', 'conscious']);

/** "knocks" → "knock", "pushes" → "push", "tries" → "try", "is" → "am". Pure. */
export function firstPersonVerb(word: string): string {
  const lower = word.toLowerCase();
  if (IRREGULAR[lower]) return matchCase(word, IRREGULAR[lower]);
  if (NOT_A_VERB.has(lower) || !/s$/.test(lower) || /ss$/.test(lower) || lower.length < 3) return word;
  let out: string;
  if (/[^aeiou]ies$/.test(lower)) out = lower.slice(0, -3) + 'y';
  else if (/(?:sh|ch|ss|x|z|o)es$/.test(lower)) out = lower.slice(0, -2);
  else out = lower.slice(0, -1);
  return matchCase(word, out);
}

function matchCase(from: string, to: string): string {
  return /^[A-Z]/.test(from) ? to.charAt(0).toUpperCase() + to.slice(1) : to;
}

function esc(name: string): string {
  return name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function sexOf(actor: OwnVoiceActor): 'm' | 'f' | null {
  const s = (actor.sex ?? '').trim().toLowerCase();
  if (/^(f|female|woman|girl)\b/.test(s)) return 'f';
  if (/^(m|male|man|boy)\b/.test(s)) return 'm';
  return null;
}

/** One sentence of prose about the actor → the same sentence in the first person. Pure. */
export function firstPersonSentence(sentence: string, actor: OwnVoiceActor): string {
  const name = esc(actor.name);
  const sex = sexOf(actor);
  const he = sex !== 'f';
  const she = sex !== 'm';
  let s = sentence;
  // The subject, and the verb right after it: "Kristopher knocks" / "He gets close" → "I knock" / "I get close".
  const subject = new RegExp(`^(\\s*)(?:${name}|${he ? 'he' : ''}${he && she ? '|' : ''}${she ? 'she' : ''})\\b(,?\\s+)(\\w+(?:'t)?)`, 'i');
  s = s.replace(subject, (_m, lead: string, gap: string, verb: string) => `${lead}I${gap}${firstPersonVerb(verb)}`);
  // A second verb after a conjunction shares the subject: "and then knocks again" → "and then knock again".
  s = s.replace(/\b(and then|and|then|but|before|while)(\s+)(\w+s)\b(?=\s|$|[,.!?])/gi, (m, conj: string, gap: string, verb: string) => {
    const next = firstPersonVerb(verb);
    return next === verb ? m : `${conj}${gap}${next}`;
  });
  // His name elsewhere in the sentence is me; his things are mine.
  s = s.replace(new RegExp(`\\b${name}['’]s\\b`, 'gi'), 'my');
  s = s.replace(new RegExp(`\\b${name}\\b`, 'g'), 'me');
  if (he) {
    s = s.replace(/\bhimself\b/g, 'myself').replace(/\bHimself\b/g, 'Myself');
    s = s.replace(/\bhis\b/g, 'my').replace(/\bHis\b/g, 'My');
    s = s.replace(/\bhim\b/g, 'me').replace(/\bHim\b/g, 'Me');
    s = s.replace(/\bhe\b/g, 'I').replace(/\bHe\b/g, 'I');
  }
  if (she) {
    s = s.replace(/\bherself\b/g, 'myself').replace(/\bHerself\b/g, 'Myself');
    s = s.replace(/\bhers\b/g, 'mine').replace(/\bHers\b/g, 'Mine');
    // "her hand" → "my hand"; "at her" → "at me".
    s = s.replace(/\b(her|Her)\b(?=\s+[a-z])/g, (m) => (m === 'Her' ? 'My' : 'my'));
    s = s.replace(/\bher\b/g, 'me').replace(/\bHer\b/g, 'Me');
    s = s.replace(/\bshe\b/g, 'I').replace(/\bShe\b/g, 'I');
  }
  // A verb after a swapped pronoun: "but he remembers" → "but I remembers" → "but I remember".
  s = s.replace(/\bI\s+(\w+s)\b/g, (m, verb: string) => { const v = firstPersonVerb(verb); return v === verb ? m : `I ${v}`; });
  // "I am" after a pronoun swap mid-sentence: "he is" → "I is" → "I am".
  s = s.replace(/\bI is\b/g, 'I am').replace(/\bI was\b/g, 'I was').replace(/\bI has\b/g, 'I have').replace(/\bI does\b/g, 'I do');
  return s;
}

/**
 * A listening stimulus (narration lines and `Name: words` speech lines, newline-separated)
 * in the actor's own person. Pure.
 */
export function ownVoice(content: string, actor: OwnVoiceActor): string {
  const name = esc(actor.name);
  const spoken = new RegExp(`^\\s*${name}:\\s*(.+)$`, 'i');
  return content
    .split(/\r?\n/)
    .map((line) => {
      const said = line.match(spoken);
      if (said) return `I say: "${said[1].trim().replace(/^["“]|["”]$/g, '')}"`;
      return line
        .split(/(?<=[.!?…]["”')\]]*)\s+/)
        .map((sentence) => (sentence.trim() ? firstPersonSentence(sentence, actor) : sentence))
        .join(' ');
    })
    .join('\n');
}
