/**
 * Table prose — the GM types normal tabletop prose and the system picks up
 * what's what (Mike 2026-09-26: "The system shouldn't need a tab switcher.
 * It should pick up from normal prose.").
 *
 *   You sit at the bar. The scent of flame-licked meat lingers. A bright eyed
 *   lass behind the bar gives you a wink. "Hey scruffy, you gonna order
 *   something?"
 *
 * Narration = everything outside quotes. Speech = each quoted run, attributed:
 *   1. a script prefix on the line — `Ruth: "…"` or `Ruth: …`;
 *   2. a campaign NPC named in the clause right before or the tag right after
 *      the quote (`Mr. Carrasco pounds on the door. "Open up!"`);
 *   3. otherwise the noun phrase that introduced it ("a bright eyed lass behind
 *      the bar"), and failing that "someone present" — never an invented name.
 *
 * Pure function, no I/O — unit-tested on its own.
 */

export interface ProseRosterEntry {
  id: string;
  name: string;
  /** The sheet's sex (identity.sex / physicalDescription.gender), when the caller has it — a pronoun must match it. */
  sex?: string | null;
}

/** `::Kristopher lets his eyes wander::` — an action the GM wrote for a roster character (hello world 2026-10-17). */
export interface ProseAction {
  text: string;
  actorId: string;
  actorLabel: string;
}

/**
 * What goes through a roster character, as the Watcher voiced it — "He thinks about just leaving but he
 * remembers this woman" (HW6 2026-10-25). Not his act: nobody but him perceives it, and the record draws it as
 * his ((thought)). `sentence` is the whole sentence as written, so the table can take it out of what the others hear.
 */
export interface ProseThought {
  text: string;
  sentence: string;
  actorId: string;
  actorLabel: string;
}

/** What the parser may know about the table beyond the message itself. */
export interface ProseContext {
  /** Who acted or spoke last at the table before this message — the referent of a bare "he"/"she". */
  lastActor?: ProseRosterEntry | null;
  /**
   * The recent actors at the table, newest first (HW3 2026-10-24: "He knocks…" after Violet's
   * line stayed narration because the single last actor was her). A pronoun walks back through
   * these to the first whose sex fits. Supersedes `lastActor` when given.
   */
  recentActors?: ProseRosterEntry[];
  /**
   * The roster character the Watcher voiced most recently on a line of their own (an act or a quote),
   * beings' replies not counted. A line that is nothing but a quote — no prose, no name, no action
   * span — is that voice going on (HW5 2026-10-25: a bare "You took the pizza… Were you going to pay
   * me?" became "someone present", and the Kristopher being answered the Watcher's own Kristopher).
   */
  lastVoiced?: ProseRosterEntry | null;
}

export interface ProseQuote {
  text: string;
  /** Roster NPC when one could be attributed. */
  speakerId: string | null;
  /** What the record calls the speaker: NPC name, the introducing noun phrase, or "someone present". */
  speakerLabel: string;
  /** The sentence that introduced the quote (kept on the canon event as context). */
  context: string | null;
}

export interface ParsedProse {
  /** The prose with quotes kept — what everyone at the table lived through. */
  full: string;
  /** Narration only (quotes removed), null when the message was speech alone. */
  narration: string | null;
  quotes: ProseQuote[];
  /** `::…::` spans the GM wrote for a roster character. Absent when there are none (the frozen fixtures predate it). */
  actions?: ProseAction[];
  /** Sentences of what a roster character thinks, remembers or wants. Absent when there are none. */
  thoughts?: ProseThought[];
}

// An unterminated quote runs to the end of the line (HW3, Mike 2026-10-24: a line without its closing mark lost its speech).
const QUOTE_RE = /["“]([^"”]+)(?:["”]|$)/g;
// `::Kristopher knocks twice::` — the AOL-RP action marker (lib/feed-segments), on the GM's own line.
const ACTION_SPAN_RE = /::\s*([^:][\s\S]*?)\s*::/g;
const HE_RE = /\b(?:he|him|his|himself)\b/i;
const SHE_RE = /\b(?:she|her|hers|herself)\b/i;

type Sex = 'm' | 'f' | null;
function sexOf(entry: ProseRosterEntry): Sex {
  const s = (entry.sex ?? '').trim().toLowerCase();
  if (/^(f|female|woman|girl)\b/.test(s)) return 'f';
  if (/^(m|male|man|boy)\b/.test(s)) return 'm';
  return null;
}

/**
 * "His voice is warm" → the last roster character named at the table whose sex
 * fits the pronoun (an unknown sex fits either). Never when the window names
 * both pronouns, never when it names neither. Mike (2026-10-17): "we need a
 * much better inference" — the scene, not the word next to the quote.
 */
export function pronounActor(window: string, recent: ProseRosterEntry[]): ProseRosterEntry | null {
  // The FIRST pronoun is the subject ("He turns around and tries to get her to come to the door"
  // is about him — HW4 2026-10-24: both pronouns present used to mean nobody).
  const he = HE_RE.exec(window);
  const she = SHE_RE.exec(window);
  if (!he && !she) return null;
  const want: Sex = he && (!she || he.index <= she.index) ? 'm' : 'f';
  for (const entry of recent) {
    const sex = sexOf(entry);
    if (sex === null || sex === want) return entry;
  }
  return null;
}

/** The roster character named LAST in a stretch of prose (for "who was just talked about"). */
function lastRosterName(window: string, roster: ProseRosterEntry[]): ProseRosterEntry | null {
  return findRosterName(window, roster);
}

const SUBJECT_PRONOUN_RE = /^(he|she)\b/i;
// An opener before the subject — a connective, a time word, an adverb — is not the subject (HW8 2026-10-25: "Then he
// knocks on Violet's door." found no subject at its head, fell through to the possessive, and Violet knocked on her own
// door; she then listened to the beat as her own act and remembered holding his receipt).
const OPENER_RE = /^(?:(?:and then|and|then|so|but|now|next|finally|still|meanwhile|afterwards?|later|at last|after that|with that|at that)\b,?\s+)+/i;
const ADVERB_SUBJECT_RE = /^(\w+ly),?\s+(?=(?:he|she)\b)/i;
/** "Then he knocks" → "he knocks"; "Slowly, she turns" → "she turns". Pure. */
export function pastOpener(sentence: string): string {
  return sentence.trim().replace(OPENER_RE, '').replace(ADVERB_SUBJECT_RE, '');
}
const BARE_TAG_RE = /^(?:says|asks|shouts|whispers|yells|replies|calls out|mutters|growls|snaps|said|asked)\s*[,:]?\s*$/i;

/** "Kristopher knocks twice." → "Knocks twice"; "Ruth says," → null (a bare speech tag). Pure. */
export function actionBody(sentence: string, actor: ProseRosterEntry): string | null {
  let s = sentence.trim().replace(/[.]+$/, '').trim();
  const name = actor.name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // "And he says the prayer in his head" → the card does not open with "And".
  s = s.replace(OPENER_RE, '');
  // "Slowly, he knocks" → "Slowly knocks": the adverb stays, the pronoun goes.
  s = s.replace(/^(\w+ly),?\s+(?:he|she)\b\s*/i, '$1 ');
  // "Kristopher's hand drops" keeps its opener: the card reads whole, not "'s hand drops".
  s = s.replace(new RegExp(`^(?:${name}|he|she)\\b(?!['’]s\\b)[,]?\\s*`, 'i'), '');
  if (!s || BARE_TAG_RE.test(s)) return null;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Verbs of the mind: a sentence about a roster character whose verb is one of these is what goes THROUGH him,
// not what he does (HW6 2026-10-25: "He thinks about just leaving but he remembers this woman" was his act, and
// the reach judge, handed the whole line, read all of it as private thought — the spoken plea went down with it).
const MENTAL_VERB_RE = /^(?:thinks|wonders|remembers|recalls|realizes|realises|considers|decides|knows|wants|wishes|hopes|fears|dreads|imagines|believes|doubts|suspects|figures|reckons|feels (?:like|that|as if)|tells (?:himself|herself)|reminds (?:himself|herself)|can(?:'|’)t help (?:thinking|wondering))\b/i;
/** The body of an act is a thought when it opens with a verb of the mind. Pure. */
export function isThoughtBody(body: string): boolean {
  return MENTAL_VERB_RE.test(body.trim());
}

// A sentence that DESCRIBES a character or a part of him — looks tired, is red, seems off — is an observation,
// not an act (Mike 2026-10-25: "the second one wasn't an action but an observation"). The verb right after the
// subject decides it; "looks at the door", "is knocking" and "feels for the key" stay acts.
const STATIVE_START_RE = /^(?:is|are|was|were|seems|seem|appears|appear|looks|look|feels|feel|sounds|sound|smells|smell)\b(?!\s+(?:at|to|toward|towards|over|up|down|around|into|for|through|back|away|on|out|in|about|across|after|past|along|under|behind|upon|onto)\b|\s+\w+ing\b)/i;
// Where he is — "Kristopher stands on the fourth floor landing" — sets the scene; it is not something he does
// (Mike 2026-10-25: "That should have been a block of scene setting narration").
const POSTURE_PLACE_RE = /^(?:stands|sits|lies|kneels|leans|remains|rests|waits|is standing|is sitting|is lying|is kneeling|is waiting)\s+(?:on|in|at|by|beside|near|outside|inside|under|before|against|behind|atop|upon|along|across|between|beneath)\b/i;
const BODY_WORDS = 3;
/** "His face looks tired and his eyes are red." / "She is gorgeous but a bit weird." → true; "He looks at the door." → false. Pure. */
export function isDescriptive(sentence: string, actor: ProseRosterEntry): boolean {
  const s = pastOpener(sentence).replace(/[.!?]+$/, '');
  const name = actor.name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const subject = s.match(new RegExp(`^(?:${name}|he|she)\\s+(.+)$`, 'i'));
  if (subject) return STATIVE_START_RE.test(subject[1]) || POSTURE_PLACE_RE.test(subject[1]);
  const owned = s.match(new RegExp(`^(?:${name}['’]s|his|her)\\s+(.+)$`, 'i'));
  if (!owned) return false;
  // "His face looks…" / "Her eyes are…": the verb after a noun phrase of one to three words.
  const words = owned[1].split(/\s+/);
  for (let i = 1; i <= BODY_WORDS && i < words.length; i++) if (STATIVE_START_RE.test(words.slice(i).join(' '))) return true;
  return false;
}

// A stated span inside an act — "He waits a minute and then knocks again" — is time passing, which is the
// Watcher's narration (and the clock's business), and then the act (Mike 2026-10-25: "a narration of a minute
// passes while he waits … and then just him with ::He knocks again::").
const DURATION_RE = /\b(?:(?:a|an|one|two|three|four|five|ten|few|several|couple of|half a|\d+)\s+(?:second|minute|moment|hour|while|beat|heartbeat)s?|for a (?:while|moment|bit|second|minute)|a (?:moment|minute|while|beat) (?:later|passes|goes by)|after a (?:moment|minute|while|beat))\b/i;
const WAIT_VERB_RE = /\b(?:waits?|pauses?|lingers?|stands? there|hesitates?|lets? [\w\s]{1,20}? pass|counts? (?:to|the)|holds? (?:still|off|back)|says? nothing|does? nothing|stays? (?:put|silent|still))\b/i;
const LEADING_SPAN_RE = /^((?:after|a|an|one|two|three|few|several|some|\d+)\b[^,]{0,40}?\b(?:seconds?|minutes?|moments?|hours?|while|beats?)(?:\s+(?:later|pass(?:es)?|goes? by))?),?\s+(\S.*)$/i;
/**
 * Splits the waiting from the doing: `{ wait, rest }` with `rest` null when the sentence was only the wait.
 * Returns null when the sentence states no span, or states it inside the act itself ("knocks for a minute"). Pure.
 */
/** "After a minute, he knocks again." → the span as its own sentence, then the rest; null when the sentence does not open with a span. Pure. */
export function leadingSpan(sentence: string): { wait: string; rest: string } | null {
  const s = sentence.trim();
  const end = s.match(/[.!?…]+$/)?.[0] ?? '.';
  const lead = s.replace(/[.!?…]+$/, '').match(LEADING_SPAN_RE);
  if (!lead || /^(?:and|then|but)\b/i.test(lead[2])) return null;
  return { wait: `${lead[1].charAt(0).toUpperCase()}${lead[1].slice(1)}.`, rest: `${lead[2]}${end}` };
}

export function splitDurationClause(sentence: string, actor: ProseRosterEntry): { wait: string; rest: string | null } | null {
  const s = sentence.trim();
  if (!DURATION_RE.test(s)) return null;
  const end = s.match(/[.!?…]+$/)?.[0] ?? '.';
  const body = s.replace(/[.!?…]+$/, '');
  const lead = leadingSpan(s);
  if (lead) return lead;
  const name = actor.name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const subject = body.match(new RegExp(`^((?:${name}|he|she)\\b,?)\\s+(.+)$`, 'i'));
  if (!subject) return null;
  const clauses = subject[2].split(/\s*,?\s*\b(?:and then|then|and|before)\s+/i).map((c) => c.trim()).filter(Boolean);
  if (!clauses.length || !DURATION_RE.test(clauses[0]) || !WAIT_VERB_RE.test(clauses[0])) return null;
  const who = subject[1].replace(/,$/, '');
  const wait = `${who} ${clauses[0]}.`;
  const rest = clauses.slice(1).join(' and ').trim();
  return { wait, rest: rest ? `${who} ${rest}${end}` : null };
}

/**
 * The actor a prose sentence is ABOUT, when it opens with one: a roster name
 * ("Kristopher knocks twice.") or a bare he/she that the table resolves. A
 * possessive opener ("Kristopher's door creaks") is not his act. Pure.
 */
export function sentenceActor(sentence: string, roster: ProseRosterEntry[], recent: ProseRosterEntry[], opts: { ownedThings?: boolean } = {}): ProseRosterEntry | null {
  const s = sentence.trim();
  for (const entry of [...roster].sort((a, b) => b.name.length - a.name.length)) {
    const name = entry.name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!name) continue;
    if (new RegExp(`^${name}(?!['’]s\\b)(?=$|[^\\w])`, 'i').test(s)) return entry;
  }
  if (SUBJECT_PRONOUN_RE.test(s)) return pronounActor(s.split(/\s+/)[0]!, recent);
  // "Then he knocks on Violet's door." / "Slowly, Kristopher turns.": the subject stands after an opener.
  const lead = pastOpener(s);
  if (lead !== s) {
    for (const entry of [...roster].sort((a, b) => b.name.length - a.name.length)) {
      const name = entry.name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (name && new RegExp(`^${name}(?!['’]s\\b)(?=$|[^\\w])`, 'i').test(lead)) return entry;
    }
    if (SUBJECT_PRONOUN_RE.test(lead)) { const by = pronounActor(lead.split(/\s+/)[0]!, recent); if (by) return by; }
  }
  // A subject pronoun ahead of a possessive name is the subject: "he knocks on Violet's door" is his act, not hers.
  const subj = /\b(he|she)\b/i.exec(lead);
  if (subj) {
    let firstOwned = -1;
    for (const entry of roster) {
      const name = entry.name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const m = name ? new RegExp(`\\b${name}['’]s\\b`, 'i').exec(lead) : null;
      if (m && (firstOwned < 0 || m.index < firstOwned)) firstOwned = m.index;
    }
    if (firstOwned < 0 || subj.index < firstOwned) { const by = pronounActor(subj[1], recent); if (by) return by; }
  }
  // "A tear falls from his eye." / "Kristopher's hand drops." — about a part or thing of his: his
  // card (HW3, Mike 2026-10-24: "didn't end up as proper cards"). Not for a speaker lookup
  // (ownedThings false): "Violet's door stays shut." puts no words in her mouth.
  if (opts.ownedThings !== false) {
    for (const entry of [...roster].sort((a, b) => b.name.length - a.name.length)) {
      const name = entry.name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (name && new RegExp(`\\b${name}['’]s\\b`, 'i').test(s)) return entry;
    }
  }
  const possessive = s.match(/\b(his|her)\b/i);
  if (possessive) return pronounActor(possessive[1], recent);
  return null;
}
const SCRIPT_PREFIX_RE = /^\s*([A-Z][\w.'’-]*(?:\s+[A-Z][\w.'’-]*){0,3}):\s*(.+)$/;
// Verbs that end the noun phrase introducing a speaker ("A lass behind the bar GIVES you a wink").
const INTRO_VERB_RE = /\s+(?:gives|give|says|say|asks|ask|looks|look|turns|turn|leans|lean|nods|nod|smiles|smile|winks|wink|shouts|shout|calls|call|whispers|whisper|grins|grin|laughs|laugh|steps|step|walks|walk|stands|stand|sits|sit|is|are|was|were|has|have|does|do|comes|come|glances|glance|raises|raise|slams|slam|pounds|pound|waves|wave|points|point|mutters|mutter|growls|growl|snaps|snap|sighs|sigh|frowns|frown|shrugs|shrug|beckons|beckon|watches|watch|stares|stare|eyes|reaches|reach|pushes|push|sets|set|puts|put|drops|drop|holds|hold|offers|offer|hands|hand|sneers|sneer|barks|bark|hisses|hiss|replies|reply|answers|answer|adds|add|continues|continue|pauses|pause|hesitates|hesitate|tries|try|starts|start|begins|begin|keeps|keep|moves|move|approaches|approach|enters|enter|appears|appear|emerges|emerge)\b/i;

function lastSentence(text: string): string | null {
  const parts = text.replace(/\s+/g, ' ').trim().split(/(?<=[.!?])\s+/).filter(Boolean);
  const s = parts.at(-1)?.trim();
  return s && s.length > 0 ? s : null;
}

/** "A bright eyed lass behind the bar gives you a wink." → "a bright eyed lass behind the bar" */
export function introducedSubject(sentence: string | null): string | null {
  if (!sentence) return null;
  const s = sentence.replace(/[.!?]+$/, '').trim();
  const m = s.match(INTRO_VERB_RE);
  const phrase = (m ? s.slice(0, m.index) : '').trim();
  if (!phrase) return null;
  const words = phrase.split(/\s+/);
  if (words.length < 2 || words.length > 10) return null;
  if (!/^(a|an|the|one|two|three|some|another|his|her|their|its|your|this|that|each|every)$/i.test(words[0])) return null;
  return phrase.charAt(0).toLowerCase() + phrase.slice(1);
}

function findRosterName(window: string, roster: ProseRosterEntry[]): ProseRosterEntry | null {
  let best: { entry: ProseRosterEntry; at: number } | null = null;
  for (const entry of roster) {
    const re = new RegExp(`(^|[^\\w])${entry.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^\\w])`, 'i');
    const m = window.match(re);
    if (m && m.index !== undefined) {
      const at = m.index + (m[1]?.length ?? 0);
      if (!best || at > best.at) best = { entry, at }; // nearest to the quote = last occurrence in the before-window
    }
  }
  return best?.entry ?? null;
}

/** "Violet's closed door" names a door, not a speaker: the possessive names come out before a speaker lookup. */
function withoutPossessives(window: string): string {
  return window.replace(/\b[\w.-]+['’]s\b/g, ' ');
}

function firstRosterName(window: string, roster: ProseRosterEntry[]): ProseRosterEntry | null {
  let best: { entry: ProseRosterEntry; at: number } | null = null;
  for (const entry of roster) {
    const re = new RegExp(`(^|[^\\w])${entry.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^\\w])`, 'i');
    const m = window.match(re);
    if (m && m.index !== undefined && (!best || m.index < best.at)) best = { entry, at: m.index };
  }
  return best?.entry ?? null;
}

const ABBREVIATION_RE = /\b(?:Mr|Mrs|Ms|Dr|St|Sr|Jr|vs|etc)\.$/i;

/** Sentences of a stretch of prose; a title ("Mr. Carrasco") does not end one. */
export function splitSentences(text: string): string[] {
  const rough = text.replace(/\s+/g, ' ').trim().split(/(?<=[.!?…]["”')\]]*)\s+/).filter(Boolean);
  const out: string[] = [];
  for (const piece of rough) {
    const prev = out.at(-1);
    if (prev !== undefined && ABBREVIATION_RE.test(prev)) out[out.length - 1] = `${prev} ${piece}`;
    else out.push(piece);
  }
  return out;
}

/** `Ruth: …` — a line that is one speaker's words from start to finish. */
export function isScriptLine(line: string): boolean {
  const script = line.match(SCRIPT_PREFIX_RE);
  return !!script && script[2].trim().replace(/^["“]|["”]$/g, '').trim().length > 0;
}

const QUOTE_CHAR_RE = /["“”]/;
// A quote said where nobody can hear it: in his head, to himself, silently.
const SILENT_SAY_RE = /\b(?:in (?:his|her|their) (?:head|mind)|to (?:himself|herself|themselves)|silently|without a sound|inwardly|in silence)\b/i;
const SAID_VERBS = '(?:says|asks|shouts|whispers|yells|replies|calls out|mutters|growls|snaps)';
const SAID_LEAD_IN = '(?:(?:and|so|ok|okay|alright|all right|now|then|but|well|meanwhile)[,\\s]+)*';

/**
 * Speech with no quote marks, which is how a transcript arrives (2026-10-06):
 * `Ruth says, sit down.` — a ROSTER name, a said-verb, a comma or colon, then
 * the words. An unknown name never counts ("The stranger says, sit down."
 * stays narration), nor does reported speech ("Danny says he never touched it.").
 */
export function unquotedSpeech(sentence: string, roster: ProseRosterEntry[]): ProseQuote | null {
  if (QUOTE_CHAR_RE.test(sentence)) return null;
  for (const entry of [...roster].sort((a, b) => b.name.length - a.name.length)) {
    const name = entry.name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!name) continue;
    const m = sentence.match(new RegExp(`^\\s*${SAID_LEAD_IN}${name}\\s+${SAID_VERBS}[,:]\\s+(\\S.*)$`, 'i'));
    if (m) return { text: m[1].trim(), speakerId: entry.id, speakerLabel: entry.name, context: null };
  }
  return null;
}

/** The split a declaration carries (canon detail / feed payload): what the feed draws from. */
export interface SplitParts {
  narration?: string | null;
  speech?: Array<{ speakerId: string | null; speakerLabel: string; text: string }>;
  actions?: Array<{ actorId: string; actorLabel: string; text: string; sentence?: string }>;
  thoughts?: Array<{ actorId: string; actorLabel: string; text: string; sentence?: string }>;
}

export interface CharacterCard {
  id: string | null;
  label: string;
  segments: Array<{ kind: 'action' | 'thought' | 'speech'; text: string; source: string }>;
}

/**
 * ONE card per character for a line, its acts, thoughts and words in the order the Watcher wrote them
 * (Mike 2026-10-25: "one Kristopher card that had his actions and thoughts all in one card"). `source` is
 * the sentence each segment came from, for a viewer's feed to show only what reached them. Pure.
 */
export function characterCards(full: string, split: SplitParts): CharacterCard[] {
  const straight = (t: string) => t.toLowerCase().replace(/[“”]/g, '"').replace(/[‘’]/g, "'");
  const hay = straight(full);
  const at = (key: string) => { const i = hay.indexOf(straight(key).replace(/[.!?…"]+$/, '').trim()); return i < 0 ? Number.POSITIVE_INFINITY : i; };
  const items: Array<{ id: string | null; label: string; kind: 'action' | 'thought' | 'speech'; text: string; source: string; pos: number; n: number }> = [];
  let n = 0;
  for (const a of split.actions ?? []) items.push({ id: a.actorId, label: a.actorLabel, kind: 'action', text: a.text, source: a.sentence ?? a.text, pos: at(a.sentence ?? a.text), n: n++ });
  for (const t of split.thoughts ?? []) items.push({ id: t.actorId, label: t.actorLabel, kind: 'thought', text: t.text, source: t.sentence ?? t.text, pos: at(t.sentence ?? t.text), n: n++ });
  for (const q of split.speech ?? []) items.push({ id: q.speakerId, label: q.speakerLabel, kind: 'speech', text: q.text, source: q.text, pos: at(q.text), n: n++ });
  items.sort((a, b) => (a.pos - b.pos) || (a.n - b.n));
  const cards: CharacterCard[] = [];
  for (const it of items) {
    const key = it.id ?? `label:${it.label}`;
    let card = cards.find((c) => (c.id ?? `label:${c.label}`) === key);
    if (!card) { card = { id: it.id, label: it.label, segments: [] }; cards.push(card); }
    card.segments.push({ kind: it.kind, text: it.text, source: it.source });
  }
  return cards;
}

export function parseTableProse(message: string, roster: ProseRosterEntry[] = [], ctx: ProseContext = {}): ParsedProse {
  const full = message.trim();
  const quotes: ProseQuote[] = [];
  const actions: ProseAction[] = [];
  const thoughts: ProseThought[] = [];
  const lines = full.split(/\r?\n/);
  const narrationParts: string[] = [];
  // Who a bare pronoun points at: most recent first — this message's own
  // actors and speakers, then whoever acted last before it.
  const recent: ProseRosterEntry[] = ctx.recentActors?.length ? [...ctx.recentActors] : ctx.lastActor ? [ctx.lastActor] : [];
  const noteActor = (entry: ProseRosterEntry | null) => {
    if (!entry) return;
    const i = recent.findIndex((r) => r.id === entry.id);
    if (i >= 0) recent.splice(i, 1);
    recent.unshift(entry);
  };
  // Prose about a roster character is HIS act, not narration (HW2, Mike
  // 2026-10-24: "He knocks on the door again" belongs on Kristopher's card
  // with his words). Only prose about no one stays the Watcher's narration.
  const keepNarration = (text: string) => {
    if (roster.length === 0) { narrationParts.push(text); return; }
    const rest: string[] = [];
    // What the sentence before this one was, on this line: a thought goes on through a description after it.
    let lastKind: 'thought' | 'act' | 'description' | 'narration' | 'tag' | null = null;
    for (const written of splitSentences(text)) {
      let sentence = written;
      let actor = sentenceActor(sentence, roster, recent);
      if (!actor) {
        // "After a minute, he knocks again.": the span is narration first; the rest is whoever it is about.
        const lead = leadingSpan(sentence);
        if (lead) { rest.push(lead.wait); sentence = lead.rest; actor = sentenceActor(sentence, roster, recent); }
        if (!actor) { rest.push(sentence); lastKind = 'narration'; continue; }
      }
      noteActor(actor);
      // "He waits a minute and then knocks again": the minute is narration (time passing), the knock his act.
      const span = splitDurationClause(sentence, actor);
      if (span) { rest.push(span.wait); if (!span.rest) continue; sentence = span.rest; }
      // "His face looks tired…" / "She is gorgeous but a bit weird.": an observation of him, not his act —
      // unless it follows what someone was just thinking on this line: then it is the thought going on
      // (Mike 2026-10-25: "She is gorgeous but a bit weird" after "he remembers this woman…" was Kristopher's).
      if (isDescriptive(sentence, actor)) {
        const going = thoughts.at(-1);
        if (going && lastKind === 'thought') { going.text = `${going.text.replace(/\.{3}$|…$/, '')}… ${sentence}`.replace(/\s+/g, ' ').trim(); going.sentence = `${going.sentence} ${sentence}`; lastKind = 'thought'; continue; }
        rest.push(sentence); lastKind = 'description'; continue;
      }
      // The card carries the name: "Kristopher knocks twice." → ::Knocks twice::.
      const body = actionBody(sentence, actor);
      // A bare speech tag ("Ruth says,") is neither narration nor an act — the quote beside it is the record.
      if (!body) { lastKind = 'tag'; continue; }
      if (isThoughtBody(body)) { thoughts.push({ text: body, sentence, actorId: actor.id, actorLabel: actor.name }); lastKind = 'thought'; }
      else { actions.push({ text: body, actorId: actor.id, actorLabel: actor.name }); lastKind = 'act'; }
    }
    const kept = rest.join(' ').trim();
    if (kept) { narrationParts.push(kept); noteActor(lastRosterName(kept, roster)); }
  };

  for (const rawLine of lines) {
    // -1. Action spans for a roster character: `::Kristopher knocks::`, or
    //     `::He waits::` after Kristopher was named. The span leaves the
    //     narration and becomes his own action; a span with no actor stays
    //     narration exactly as before.
    let line = rawLine;
    const quotesBefore = quotes.length;
    const actionsBefore = actions.length;
    // The actor of an action span on THIS line: a bare quote beside it is his
    // (`::Kristopher knocks twice:: "Hello?"`).
    let lineActor: ProseRosterEntry | null = null;
    if (roster.length > 0 && line.includes('::')) {
      line = line.replace(ACTION_SPAN_RE, (whole, inner: string) => {
        const text = inner.trim();
        if (!text) return whole;
        const actor = firstRosterName(text, roster) ?? pronounActor(text, recent);
        if (!actor) return whole;
        actions.push({ text, actorId: actor.id, actorLabel: actor.name });
        noteActor(actor);
        lineActor = actor;
        return ' ';
      });
      line = line.replace(/\s{2,}/g, ' ').trim();
      if (!line) continue;
    }
    // 0. Unquoted speech (`Ruth says, sit down.`) — only on a line with no quote
    //    marks, and only when a sentence of it really is one; every other line
    //    takes the paths below exactly as before.
    if (roster.length > 0 && !QUOTE_CHAR_RE.test(line) && !SCRIPT_PREFIX_RE.test(line)) {
      const sentences = splitSentences(line);
      const said = sentences.map((s) => unquotedSpeech(s, roster));
      if (said.some(Boolean)) {
        for (const q of said) if (q) { quotes.push(q); noteActor(roster.find((r) => r.id === q.speakerId) ?? null); }
        const kept = sentences.filter((_, i) => !said[i]).join(' ').trim();
        if (kept) keepNarration(kept);
        continue;
      }
    }

    // 1. Script prefix: `Ruth: "…"` / `Ruth: …` — the whole line is speech.
    const script = line.match(SCRIPT_PREFIX_RE);
    const scriptSpeaker = script ? findRosterName(script[1], roster) : null;
    if (script && (scriptSpeaker || roster.length === 0 || /^[A-Z]/.test(script[1]))) {
      const body = script[2].trim();
      const inner = body.replace(/^["“]|["”]$/g, '').trim();
      if (inner) {
        quotes.push({ text: inner, speakerId: scriptSpeaker?.id ?? null, speakerLabel: scriptSpeaker?.name ?? script[1].trim(), context: null });
        noteActor(scriptSpeaker);
        continue;
      }
    }

    // 2. Quoted runs inside prose.
    // A line that is only quotes, with nothing to name a speaker: the Watcher's last voice goes on.
    const onlyQuotes = line.replace(new RegExp(QUOTE_RE.source, 'g'), '').trim() === '';
    const voiceGoesOn = onlyQuotes && !lineActor ? ctx.lastVoiced ?? null : null;
    let cursor = 0;
    let stripped = '';
    for (const m of line.matchAll(QUOTE_RE)) {
      const start = m.index ?? 0;
      const before = line.slice(cursor, start);
      stripped += before;
      const afterAll = line.slice(start + m[0].length);
      const afterTag = afterAll.split(/(?<=[.!?])\s|\n/)[0] ?? '';
      const beforeWindow = (stripped.length > 0 ? stripped : line.slice(0, start)).slice(-240);
      const contextSentence = lastSentence(beforeWindow);
      // A speech tag AFTER the quote only counts when the quote runs into it
      // (`"…," Ruth says` / `"…" she says`); a quote closed with . ! ? followed
      // by a capitalized new sentence ("Ruth sighs.") is a new beat, not a tag.
      const quoteText = m[1].trim();
      const runsOn = /,$/.test(quoteText) || !/[.!?…]$/.test(quoteText) || /^\s*[,a-z]/.test(afterAll);
      // The speaker is whoever the sentence before the quote is ABOUT — its subject. "He stops… and looks
      // back at Violet's closed door." is Kristopher's sentence, so the words after it are his (HW5
      // 2026-10-25: the possessive "Violet's" beside the quote made her the speaker, and the table had
      // her asking him). A name merely in the window, never a possessive, is the fallback.
      const subjectActor = contextSentence ? sentenceActor(contextSentence, roster, recent, { ownedThings: false }) : null;
      const named = subjectActor ?? findRosterName(withoutPossessives(beforeWindow.slice(-160)), roster) ?? (runsOn ? firstRosterName(afterTag.slice(0, 120), roster) : null);
      // No name by the quote: "His voice is warm. 'Take your time.'" → the
      // man the table was just talking about, if the pronoun fits his sheet.
      const byPronoun = named ? null : pronounActor(`${contextSentence ?? ''} ${runsOn ? afterTag.slice(0, 120) : ''}`, recent);
      const npc = named ?? byPronoun ?? (contextSentence === null ? lineActor ?? voiceGoesOn : null);
      const subject = npc ? null : introducedSubject(contextSentence);
      quotes.push({
        text: m[1].trim(),
        speakerId: npc?.id ?? null,
        speakerLabel: npc?.name ?? subject ?? 'someone present',
        context: contextSentence,
      });
      noteActor(npc);
      cursor = start + m[0].length;
    }
    stripped += line.slice(cursor);
    const cleaned = stripped.replace(/\s{2,}/g, ' ').trim();
    if (cleaned) keepNarration(cleaned);
    // A quote nobody claimed, on a line whose prose actions are all one character's, is his
    // (HW4 2026-10-24: "He stops… He turns around… "Please can you pay…"" went to "someone present").
    // Only when no other mouth is on the line: a quote already someone else's, or one whose sentence
    // introduced its own speaker ("A bright eyed lass… 'Hey scruffy?'"), means the bare quote stays vague.
    const lineActors = new Set(actions.slice(actionsBefore).map((a) => a.actorId));
    if (lineActors.size === 1) {
      const only = roster.find((r) => r.id === [...lineActors][0]);
      const lineQuotes = quotes.slice(quotesBefore);
      const otherMouth = lineQuotes.some((q) => (q.speakerId && q.speakerId !== only?.id) || (!q.speakerId && q.speakerLabel !== 'someone present'));
      if (only && !otherMouth) for (const q of lineQuotes) if (!q.speakerId) { q.speakerId = only.id; q.speakerLabel = only.name; }
    }
    // "And he says the prayer in his head. "Lord Jesus Christ…"": said in his head is THOUGHT, not speech (HW7
    // 2026-10-25: the prayer went out loud through the door). The tag sentence and the words become one thought;
    // the act the tag sentence made goes.
    for (let qi = quotes.length - 1; qi >= quotesBefore; qi--) {
      const q = quotes[qi];
      if (!q.speakerId || !q.context || !SILENT_SAY_RE.test(q.context)) continue;
      const who = roster.find((r) => r.id === q.speakerId);
      if (!who) continue;
      const tagBody = actionBody(q.context, who) ?? q.context.replace(/[.]+$/, '');
      const ai = actions.findIndex((a, i) => i >= actionsBefore && a.actorId === who.id && a.text === tagBody);
      if (ai >= 0) actions.splice(ai, 1);
      thoughts.push({ text: `${tagBody}: "${q.text}"`, sentence: `${q.context} "${q.text}"`, actorId: who.id, actorLabel: who.name });
      quotes.splice(qi, 1);
    }
  }

  const narration = narrationParts.join('\n').trim() || null;
  return { full, narration, quotes, ...(actions.length ? { actions } : {}), ...(thoughts.length ? { thoughts } : {}) };
}
