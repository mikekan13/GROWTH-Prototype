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

const SOUND_VERB_RE = /\b(?:knock(?:s|ed|ing)?|rap(?:s|ped|ping)?|tap(?:s|ped|ping)?|bang(?:s|ed|ing)?|pound(?:s|ed|ing)?|hammer(?:s|ed|ing)?|speak(?:s|ing)?|spoke|say(?:s|ing)?|said|ask(?:s|ed|ing)?|call(?:s|ed|ing)?|shout(?:s|ed|ing)?|yell(?:s|ed|ing)?|scream(?:s|ed|ing)?|whisper(?:s|ed|ing)?|mutter(?:s|ed|ing)?|murmur(?:s|ed|ing)?|laugh(?:s|ed|ing)?|cr(?:y|ies|ied|ying)|sob(?:s|bed|bing)?|sigh(?:s|ed|ing)?|cough(?:s|ed|ing)?|sneez(?:es|ed|ing)|clear(?:s|ed|ing)? (?:his|her|their) throat|groan(?:s|ed|ing)?|growl(?:s|ed|ing)?|snap(?:s|ped|ping)?|slam(?:s|med|ming)?|kick(?:s|ed|ing)?|ring(?:s|ing)?|rang|buzz(?:es|ed|ing)?|footsteps?|stomp(?:s|ed|ing)?|shuffl(?:es|ed|ing)|rustl(?:es|ed|ing)|clatter(?:s|ed|ing)?|crash(?:es|ed|ing)?|thud(?:s|ded|ding)?|creak(?:s|ed|ing)?|rattl(?:es|ed|ing)|click(?:s|ed|ing)?|hum(?:s|med|ming)?|sing(?:s|ing)?|sang|whistl(?:es|ed|ing)|breath(?:es|ed|ing)? (?:hard|heavily|loud|loudly|out)|pant(?:s|ed|ing)?|scrap(?:es|ed|ing)|drag(?:s|ged|ging)?|drop(?:s|ped|ping)? (?:the|a|his|her|it)|jingl(?:es|ed|ing)|clink(?:s|ed|ing)?|hiss(?:es|ed|ing)?|rumbl(?:es|ed|ing)|answer(?:s|ed|ing)?|repl(?:y|ies|ied|ying)|voice|sound(?:s|ed)?|noise|silence|quiet)\b/i;

// Where a sentence stops being sound: a clause that opens with these and has no sound verb of its own.
const CLAUSE_SPLIT_RE = /\s+(?=(?:as|while|and|but|with|before|after)\s+(?:a|an|the|his|her|their|its|my)\b)|,\s+(?=[a-z])/;

const SPEECH_LINE_RE = /^\s*[A-Z][\w.'’ -]{0,40}:\s+\S/;

/** The sentences of one line of prose. */
function sentencesOf(line: string): string[] {
  return line.replace(/\s+/g, ' ').trim().split(/(?<=[.!?…]["”')\]]*)\s+/).filter(Boolean);
}

/** One sentence trimmed to the part hearing carries; null when none of it is sound. */
export function audibleSentence(sentence: string): string | null {
  const s = sentence.trim();
  if (!SOUND_VERB_RE.test(s)) return null;
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
  return out.length ? out.join('\n') : content;
}
