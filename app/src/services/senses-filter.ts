/**
 * Senses filter — what a stretch of table content carries to a listener whose
 * only sense of it is hearing (HW6 2026-10-25).
 *
 * Violet, behind a locked door, was judged to reach "Kristopher looks over the
 * receipt for the price of the pizza as a genuine smile masks the memory of the
 * tears… He knocks again." by hearing — and was handed every word of it. Her
 * thought knew the receipt and heard "his voice" when he had not spoken. The
 * hearing-only note told her what her senses were; this strips the content down
 * to what hearing can carry before she lives it:
 *
 *   - speech lines (`Name: words`) stay whole — words are sound;
 *   - a sentence whose verb makes a sound (knocks, speaks, sighs, slams…) stays,
 *     cut at the clause where it stops being sound ("…as a genuine smile…");
 *   - every other sentence goes.
 *
 * When nothing is left, the stretch is handed over as it was: the judge ruled it
 * reached, and a wrong strip would be a second, silent verdict. Pure.
 */

const SOUND_VERB_RE = /\b(?:knock(?:s|ed|ing)?|rap(?:s|ped|ping)?|tap(?:s|ped|ping)?|bang(?:s|ed|ing)?|pound(?:s|ed|ing)?|hammer(?:s|ed|ing)?|speak(?:s|ing)?|spoke|say(?:s|ing)?|said|ask(?:s|ed|ing)?|call(?:s|ed|ing)?|shout(?:s|ed|ing)?|yell(?:s|ed|ing)?|scream(?:s|ed|ing)?|whisper(?:s|ed|ing)?|mutter(?:s|ed|ing)?|murmur(?:s|ed|ing)?|laugh(?:s|ed|ing)?|cr(?:y|ies|ied|ying)|sob(?:s|bed|bing)?|sigh(?:s|ed|ing)?|cough(?:s|ed|ing)?|sneez(?:es|ed|ing)|clear(?:s|ed|ing)? (?:his|her|their) throat|groan(?:s|ed|ing)?|growl(?:s|ed|ing)?|snap(?:s|ped|ping)?|slam(?:s|med|ming)?|kick(?:s|ed|ing)?|ring(?:s|ing)?|rang|buzz(?:es|ed|ing)?|footsteps?|approach(?:es|ed|ing)?|walk(?:s|ed|ing)?|step(?:s|ped|ping)?|cross(?:es|ed|ing)?|climb(?:s|ed|ing)?|pace(?:s|d)?|stomp(?:s|ed|ing)?|shuffl(?:es|ed|ing)|rustl(?:es|ed|ing)|clatter(?:s|ed|ing)?|crash(?:es|ed|ing)?|thud(?:s|ded|ding)?|creak(?:s|ed|ing)?|rattl(?:es|ed|ing)|click(?:s|ed|ing)?|hum(?:s|med|ming)?|sing(?:s|ing)?|sang|whistl(?:es|ed|ing)|breath(?:es|ed|ing)? (?:hard|heavily|loud|loudly|out)|pant(?:s|ed|ing)?|scrap(?:es|ed|ing)|drag(?:s|ged|ging)?|drop(?:s|ped|ping)? (?:the|a|his|her|it)|jingl(?:es|ed|ing)|clink(?:s|ed|ing)?|hiss(?:es|ed|ing)?|rumbl(?:es|ed|ing)|answer(?:s|ed|ing)?|repl(?:y|ies|ied|ying)|voice|sound(?:s|ed)?|noise|silence|quiet)\b/i;

// Where a sentence stops being sound: a clause that opens with these and has no sound verb of its own.
const CLAUSE_SPLIT_RE = /\s+(?=(?:as|while|and|but|with|before|after)\s+(?:a|an|the|his|her|their|its|my|he|she|they|it|someone)\b)|,\s+(?=[a-z])/;

const SPEECH_LINE_RE = /^\s*[A-Z][\w.'’ -]{0,40}:\s+\S/;

/** The sentences of one line of prose. */
function sentencesOf(line: string): string[] {
  return line.replace(/\s+/g, ' ').trim().split(/(?<=[.!?…]["”')\]]*)\s+/).filter(Boolean);
}

// The subject of a sentence of prose, so the verbs after it can be read: "He", "Kristopher", "The man", "Someone".
const SUBJECT_RE = /^((?:[Hh]e|[Ss]he|[Tt]hey|[Ss]omeone|[Ss]omebody|[Ii]t|(?:[Tt]he|[Aa]n?|[Ss]ome|[Aa]nother|[Hh]is|[Hh]er|[Tt]heir)\s+[\w-]+|[A-Z][\w'’-]*(?:\s+[A-Z][\w'’-]*)?))\s+(.+)$/;
// "waits for a moment and then knocks again": predicates that share the subject.
const PREDICATE_SPLIT_RE = /\s*,?\s*\b(?:and then|then|and|but)\s+(?=(?:(?:then|also|just|again|slowly|quietly|loudly|softly|suddenly|gently|finally)\s+)?[a-z]+s\b)/i;
const ADVERB_RE = /^(?:then|also|just|again|slowly|quietly|loudly|softly|suddenly|gently|finally)\s+/i;

// A sound verb that is done silently is not sound (HW8 run 5 2026-10-26: "He says the Jesus prayer in his mind" reached
// Violet through the door on "says"). Tested per predicate, so "…in his mind and knocks" keeps the knock.
const SILENT_RE = /\b(?:in (?:his|her|their|my) (?:mind|head)|to (?:himself|herself|themselves|myself)|silently|inwardly|under (?:his|her) breath|without a sound)\b/i;

/** One sentence trimmed to the part hearing carries; null when none of it is sound. */
export function audibleSentence(sentence: string): string | null {
  const s = sentence.trim();
  if (!SOUND_VERB_RE.test(s)) return null;
  // The sound has to be what the sentence SAYS HAPPENS — a main verb — not a word inside it (HW7 2026-10-25:
  // "He wipes his eyes from the tears he was crying in the car" reached Violet through the door on "crying").
  // A sentence with several predicates keeps the sounding ones: "He waits for a moment and then knocks again
  // a little louder" → "He knocks again a little louder."
  const subj = s.replace(/[.!?…]+$/, '').match(SUBJECT_RE);
  if (subj) {
    const end = s.match(/[.!?…]+$/)?.[0] ?? '.';
    const predicates = subj[2].split(PREDICATE_SPLIT_RE).map((p) => p.trim()).filter(Boolean);
    const sounding = predicates.filter((p) => SOUND_VERB_RE.test(p.replace(ADVERB_RE, '').split(/\s+/)[0] ?? '') && !SILENT_RE.test(p));
    if (!sounding.length) return null;
    return audibleClauses(sounding.length === predicates.length ? s : `${subj[1]} ${sounding.join(' and ')}${end}`);
  }
  if (SILENT_RE.test(s)) return null;
  return audibleClauses(s);
}

/** The sounding sentence cut at the clause where it stops being sound ("…as a genuine smile…"). */
function audibleClauses(s: string): string | null {
  const end = s.match(/[.!?…]+$/)?.[0] ?? '.';
  const body = s.replace(/[.!?…]+$/, '');
  const clauses = body.split(CLAUSE_SPLIT_RE);
  // The sentence has to OPEN with sound; a sight sentence with a sounding aside is still sight.
  if (!SOUND_VERB_RE.test(clauses[0])) return null;
  let kept = '';
  for (const clause of clauses) {
    if (!kept) { kept = clause; continue; }
    if (SOUND_VERB_RE.test(clause)) kept = `${kept}${/^(?:as|while|and|but|with|before|after)\b/.test(clause) ? ' ' : ', '}${clause}`;
    else break;
  }
  if (!SOUND_VERB_RE.test(kept)) return null;
  return `${kept.trim()}${end}`;
}

/**
 * The content a hearing-only listener is handed. `via` is the reach verdict's senses; anything
 * carried by sight (or by the being's own self) leaves the content whole. Pure.
 */
export function audibleOnly(content: string, via: string[] | undefined): string {
  if (!via || !via.length || via.includes('self') || via.includes('sight')) return content;
  if (!via.includes('hearing')) return content;
  const out: string[] = [];
  for (const line of content.split(/\r?\n/)) {
    if (!line.trim()) continue;
    if (SPEECH_LINE_RE.test(line)) { out.push(line.trim()); continue; }
    const kept = sentencesOf(line).map(audibleSentence).filter((x): x is string => !!x);
    if (kept.length) out.push(kept.join(' '));
  }
  if (out.length) return out.join('\n');
  // Nothing of it sounded as a sentence. The old fallback handed the stretch over WHOLE — and a woman behind a
  // locked door described his tears and his smile (HW8 run 3, Mike: "a hard fail"). Hearing never carries sight:
  // the sounding fragments are handed over, or, failing even those, a true line about a sound that cannot be placed.
  const fragments = sentencesOf(content.replace(/\r?\n/g, ' ')).flatMap(soundingFragments);
  return fragments.length ? fragments.join(' ') : UNPLACEABLE_SOUND;
}

const UNPLACEABLE_SOUND = 'A sound from beyond the room, too faint to make out.';
const FRAGMENT_RE = new RegExp(`(?<=(?:^|\\b(?:he|she|they|it|someone|somebody|and|then|but|who)|[A-Z][\\w'’-]*)\\s+(?:(?:then|also|just|again|slowly|quietly|loudly|softly|suddenly|gently|finally)\\s+)?)${SOUND_VERB_RE.source}[^,.;!?]*`, 'g');
/** The sounding predicates of a sentence, each as a sentence of its own with an unknown subject ("Someone knocks three times on the door."). Pure. */
export function soundingFragments(sentence: string): string[] {
  const out: string[] = [];
  for (const m of sentence.matchAll(FRAGMENT_RE)) {
    const frag = m[0].trim().replace(/\s+(?:as|while|and|but|with|before|after)\s+(?:he|she|they|it|a|an|the|his|her|their|its|my)\b.*$/i, '');
    if (!frag) continue;
    out.push(/^(?:voice|sound|noise|silence|quiet|footsteps?)$/i.test(frag) ? `A ${frag.toLowerCase()}.` : `Someone ${frag}.`);
  }
  return out;
}
