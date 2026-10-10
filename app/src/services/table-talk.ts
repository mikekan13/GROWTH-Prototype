/**
 * Table talk — what KIND of thing the GM just said, and to whom.
 *
 * TABLE-RHYTHM-DESIGN-2026-10-01 §1/§6: the table's four beats are the loop's
 * clock. Beings LISTEN while the GM narrates and ANSWER at the ask; this
 * classifier is what tells a being when to speak. It reads typed prose and
 * whisper transcript chunks alike, cuts them into utterances and labels each:
 *
 *   narration | dialogue (to whom) | ask-to-party | ask-to-name
 *   | check-call (to whom) | result | ooc
 *
 * Mike ruled there is NO OOC command — the filter here handles OOC.
 *
 * Rule tier only. Anything the rules cannot settle keeps its conservative
 * reading (narration, nobody answers — "hold unless addressed") and is marked
 * `ambiguous`. `settleAmbiguous` is the seam for a small-model second opinion;
 * no model is wired to it (which model answers is undecided).
 *
 * Speech and its attribution — quoted, script lines, and unquoted `Ruth says, …`
 * — come from services/table-prose.ts, so canon and the beings agree on who spoke.
 * Pure functions, no I/O — unit-tested on their own.
 */
import { parseTableProse, splitSentences, unquotedSpeech, isScriptLine, type ProseQuote, type ProseRosterEntry } from './table-prose';

export const TABLE_TALK_KINDS = ['narration', 'dialogue', 'ask-to-party', 'ask-to-name', 'check-call', 'result', 'ooc'] as const;
export type TableTalkKind = (typeof TABLE_TALK_KINDS)[number];

export type TalkTarget =
  | { scope: 'party' }
  | { scope: 'named'; ids: string[] }
  /** Aimed at someone, the text does not say whom. */
  | { scope: 'unspecified' };

export interface TableUtterance {
  text: string;
  kind: TableTalkKind;
  /** Whom it is aimed at. Null for narration, result and ooc. */
  to: TalkTarget | null;
  /** Dialogue only: who the record says spoke (table-prose attribution). */
  speaker: { id: string | null; label: string } | null;
  /** The ask bit: someone at the table is expected to speak now. */
  expectsReply: boolean;
  /** The rule tier could not settle this one; `kind` is the conservative reading. */
  ambiguous: boolean;
  /** Which rule decided (for the harness and the fallback's prompt). */
  rule: string;
}

/** Carried from one chunk to the next: voice chunks are a few seconds long, so the address and the ask often arrive apart. */
export interface TableTalkState {
  /** Who the GM last addressed by name ("Violet, the door is locked." … "What do you do?"). */
  focusIds: string[];
  /** A check was called and its result has not been narrated yet — the next narration is the result. */
  checkPending: boolean;
}

export interface TableTalkContext {
  /** The beings at the table: who can be addressed and who can answer. */
  present: ProseRosterEntry[];
  /** Campaign NPCs, for speech attribution (the roster table-prose gets). Without it, speech is attributed among `present`. */
  npcs?: ProseRosterEntry[];
  state?: TableTalkState;
  /** Streaming transcripts: keep a trailing sentence with no end punctuation back as `pending` instead of classifying half a thought. */
  holdTrailingFragment?: boolean;
}

export interface TableTalkReading {
  utterances: TableUtterance[];
  /** Unfinished trailing text to prepend to the next chunk (only with holdTrailingFragment). */
  pending: string | null;
  state: TableTalkState;
}

// ── names ────────────────────────────────────────────────────────────────────
// Names are swapped for placeholders first, so one set of patterns covers any
// roster ("Violet", "Mr. Carrasco", "Carrasco").

const NAME = '\\u0001\\d+\\u0002';
const NAME_LIST = `${NAME}(?:\\s*(?:,\\s*and|,|and|&)\\s*${NAME})*`;
const NAME_ID_RE = /\u0001(\d+)\u0002/g;
const TITLE_RE = /^(?:mr|mrs|ms|miss|dr|sir|lady|lord|the|von|van|del)$/i;

interface NameIndex {
  entries: ProseRosterEntry[];
  aliases: Array<{ index: number; re: RegExp }>;
}

function indexNames(roster: ProseRosterEntry[]): NameIndex {
  const owners = new Map<string, Set<number>>();
  const add = (alias: string, index: number) => {
    const key = alias.toLowerCase();
    if (!owners.has(key)) owners.set(key, new Set());
    owners.get(key)!.add(index);
  };
  roster.forEach((entry, index) => {
    const name = entry.name.trim();
    if (!name) return;
    add(name, index);
    // "Mr. Carrasco" also answers to "Carrasco" — a single word only counts when one entry owns it.
    for (const token of name.split(/\s+/)) {
      const bare = token.replace(/^[^\w]+|[^\w]+$/g, '');
      if (bare.length >= 3 && !TITLE_RE.test(bare)) add(bare, index);
    }
  });
  const aliases = [...owners]
    .filter(([, set]) => set.size === 1)
    .map(([alias, set]) => ({ alias, index: [...set][0] }))
    .sort((a, b) => b.alias.length - a.alias.length)
    .map(({ alias, index }) => ({
      index,
      re: new RegExp(`(^|[^\\w\\u0001\\u0002])${alias.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[^\\w])`, 'gi'),
    }));
  return { entries: roster, aliases };
}

function mark(text: string, names: NameIndex): string {
  let out = text;
  for (const { index, re } of names.aliases) out = out.replace(re, (_m, pre: string) => `${pre}\u0001${index}\u0002`);
  return out;
}

function idsIn(fragment: string | undefined, names: NameIndex): string[] {
  const ids: string[] = [];
  if (!fragment) return ids;
  for (const m of fragment.matchAll(NAME_ID_RE)) {
    const id = names.entries[Number(m[1])].id;
    if (!ids.includes(id)) ids.push(id);
  }
  return ids;
}

// ── address ──────────────────────────────────────────────────────────────────

const LEAD = '(?:(?:and|so|ok|okay|alright|all right|now|then|but|well|hey|uh|um|meanwhile)[,\\s]+)*';
// "Violet, …" / "Violet: …" / "Violet what do you do" / "Violet?" — but not "Ruth, Danny, and Carrasco walk in."
const VOC_START = new RegExp(
  `^${LEAD}(${NAME_LIST})\\s*(?:(?:[,:;]|\\s[—–-]\\s|—)(?!\\s*(?:and\\s+${NAME}|${NAME}\\s*(?:,|and\\b|&)))|[.?!…]*$|\\s(?=(?:what|how|where|you|your|roll|make|give|do you|are you|can you|will you|would you|could you|did you)\\b))`,
  'i',
);
const VOC_MID = new RegExp(`,\\s*(${NAME_LIST})\\s*,`, 'i');
const VOC_END = new RegExp(`,\\s*(${NAME_LIST})\\s*[.?!…]*$`, 'i');
const VOC_ABOUT = new RegExp(`\\b(?:what|how)\\s+about\\s+(?:you\\s*,?\\s*)?(${NAME_LIST})\\s*[.?!…]*$`, 'i');
const VOC_YOU = new RegExp(`\\byou\\s+(${NAME_LIST})\\s*[.?!…]*$`, 'i');
const BARE_NAMES = new RegExp(`^${LEAD}(${NAME_LIST})\\s*[.?!…]*$`, 'i');
const ENDS_WITH_NAME = new RegExp(`${NAME}\\s*$`);
// `Ruth turns to Violet. "What did you see?"` — the sentence that introduced a quote can carry its address.
const CONTEXT_ADDRESS = new RegExp(`\\b(?:to|at|toward|towards)\\s+(${NAME_LIST})`, 'i');

const PARTY_RE = /\b(?:everyone|everybody|anyone|anybody|all of you|you all|y'all|you guys|you two|you three|both of you|each of you|the rest of you|the party|the group)\b/i;
const SECOND_PERSON_RE = /\b(?:you|your|yours|yourself|yourselves|y'all)\b/i;
const QUESTION_RE = /\?["”')\]]*\s*$/;
const TERMINAL_RE = /[.!?…]["”')\]]*\s*$/;

/** Names addressed in the vocative. A name that is merely mentioned ("Violet opens the door") is not an address. */
function vocatives(marked: string, names: NameIndex): string[] {
  const found: string[] = [];
  const take = (fragment?: string) => { for (const id of idsIn(fragment, names)) if (!found.includes(id)) found.push(id); };
  take(marked.match(VOC_START)?.[1]);
  for (const re of [VOC_MID, VOC_END]) {
    const m = marked.match(re);
    // ", Danny." after another name is a list ("You see Ruth, Danny."), not an address.
    if (m && m.index !== undefined && !ENDS_WITH_NAME.test(marked.slice(0, m.index))) take(m[1]);
  }
  take(marked.match(VOC_ABOUT)?.[1]);
  take(marked.match(VOC_YOU)?.[1]);
  return found;
}

// ── the rules ────────────────────────────────────────────────────────────────

const OOC_PREFIX_RE = /^\s*[([]*\s*(?:ooc\b|out of character\b)/i;
const OOC_WRAPPED_RE = /^\s*(?:\(\(.*\)\)|\(.*\)|\[.*\])\s*[.!?]*\s*$/;
// Table chatter has to OPEN the sentence ("Hang on, …"); the same words inside narration ("You hold on as the cart lurches") are not it.
const OOC_TABLE_RE = /^\s*(?:(?:sorry|ok|okay|wait|uh|um|oh|hey|alright|all right|so|guys|everyone)[,.\s]+)*(?:be right back|(?:one|just a|give me a|gimme a) (?:sec|second|minute|moment)|(?:hang|hold) on(?!\s+(?:to|tight|for)\b)|(?:i need a |quick )?bathroom break|(?:let's |lets |i need to |we should )?take (?:a (?:quick |short )?break|five)|let me (?:check|look at|find|pull up|grab) (?:my|the) (?:notes|rules|rulebook|book)|where was i|where were we|can (?:you|everyone|everybody|you all) hear me|is (?:this|it) recording|am i muted|you'?re muted)\b|\bbrb\b/i;
// "(brb) The door opens." — an aside that opens a sentence is its own utterance, so the narration after it is not swept away with it.
const LEADING_ASIDE_RE = /^\s*(\(\([^)]*\)\)|\([^)]*\)|\[[^\]]*\])\s+(\S.*)$/;
const OOC_MAX_WORDS = 12;

const NOT_MOTION = '(?!\\s+(?:over|out|up|down|away|aside|off|into|onto|through|across|back|around|(?:your|his|her|their|its) eyes)\\b)';
const CHECK_RES: Array<[string, RegExp]> = [
  ['check:roll-imperative', new RegExp(`^${LEAD}(?:${NAME_LIST}\\s*[,:]?\\s*)?(?:(?:go ahead and|please|now|everyone|everybody|all of you|you all)[,\\s]+)*roll\\b${NOT_MOTION}`, 'i')],
  ['check:request', /\b(?:give me|i need|i'll need|i will need|i want|i'd like|let's (?:see|have|get)|make|need|gonna need|going to need|call(?:ing)? for|that(?:'s| is) (?:going to|gonna) be|that's|that is|that'll be|that will be|time for)\s+(?:(?:me|us)\s+)?(?:(?:a|an|another|one more|your|the)\s+)?(?:[\w'-]+\s+){0,3}?(?:check|roll)\b(?!\s+(?:of|his|her|their|its|the|out)\b)/i],
  ['check:can-you-roll', new RegExp(`\\b(?:can|could|will|would)\\s+(?:you|everyone|everybody|y'all|you all|${NAME})\\s+(?:all\\s+)?(?:please\\s+)?(?:roll|make a|make an|give me)\\b`, 'i')],
  ['check:roll-for', /(?<!\b(?:you|they|he|she|it|we|and|to)\s)\broll\s+(?:me|for|a|an|your|the dice|it|to|again)\b/i],
  ['check:noun-phrase', new RegExp(`^${LEAD}(?:${NAME_LIST}\\s*[,:]?\\s*)?(?!(?:you|they|he|she|it|we|i)\\b)(?:(?:a|an|another)\\s+)?(?:[\\w'-]+\\s+){1,3}(?:check|roll)(?:,?\\s*(?:please|everyone|everybody))?[.!?]*$`, 'i')],
  ['check:death-save', /\bdeath saves?\b/i],
];
// A check word the strong patterns did not claim ("You roll.", "a quick check"): narration, flagged.
const WEAK_CHECK_RE = new RegExp(`\\broll\\b${NOT_MOTION}|\\b(?:a|an|the|another)\\s+(?:[\\w'-]+\\s+){0,2}check\\b(?!\\s+of\\b)`, 'i');

const HANDOFF_RE = new RegExp(
  [
    "\\bwhat (?:do|would|will|are) (?:you|y'all|you all|you guys|you two|you both|we) (?:all )?(?:do|doing|like to do|want to do|wanna do|say|going to do|gonna do)\\b",
    "\\bwhat(?:'s| is) your (?:move|play|plan|response|answer)\\b",
    '\\bwhat now\\b',
    `\\b(?:it's|its|it is) your (?:move|turn|call)(?=\\s*(?:[.!?,]|$|${NAME}))`,
    `^${LEAD}(?:${NAME_LIST}\\s*[,:]?\\s*)?your (?:move|turn|call)[.!?]*$`,
    "\\byou(?:'re| are) up\\b",
    '\\bover to you\\b',
    '\\bhow do you (?:respond|react|answer|reply|proceed)\\b',
    '\\bwhere do you go\\b',
    "\\bwhat(?:'s| is) the (?:plan|move)\\b",
    '\\bthe floor is yours\\b',
  ].join('|'),
  'i',
);
// The turn handed over in the third person: "What does Violet do?" / "Tell me what you do."
const HANDOFF_ABOUT_RE = new RegExp(
  [
    `\\bwhat (?:does|will|would|is) (?:${NAME_LIST}|she|he|they) (?:do|doing|say|going to do|gonna do|want to do)\\b`,
    `\\b(?:tell me|describe|let me know) what (?:you|y'all|you all|${NAME_LIST}) (?:all )?(?:do|does|are doing|is doing)\\b`,
  ].join('|'),
  'i',
);
// "You wonder, who would do this?" is the character's thought, not the GM handing over the turn.
const INNER_QUESTION_RE = /\byou (?:wonder|ask yourself|think to yourself|can't help but wonder|cannot help but wonder)\b/i;

const RESULT_RE = new RegExp(
  [
    `(?:\\b(?:you|he|she|they|it)|${NAME})\\s+(?:all\\s+)?(?:barely |just |narrowly |easily |somehow )?(?:succeed|succeeds|fail|fails)(?=\\s*(?:[.!?,;]|$|and\\b|but\\b))`,
    "\\b(?:that's|that is|it's|it is)\\s+a\\s+(?:success|failure|hit|miss)\\b",
    '^(?:a\\s+)?(?:success|failure)\\b',
    '\\bwith (?:a|an) \\d+\\b',
  ].join('|'),
  'i',
);
interface GmReading {
  kind: TableTalkKind;
  to: TalkTarget | null;
  expectsReply: boolean;
  ambiguous: boolean;
  rule: string;
  focus: string[];
}

function readGmSentence(sentence: string, names: NameIndex, focus: string[]): GmReading {
  const marked = mark(sentence, names);
  const voc = vocatives(marked, names);
  const party = PARTY_RE.test(sentence);
  const secondPerson = SECOND_PERSON_RE.test(sentence);
  const question = QUESTION_RE.test(sentence);
  const plain = (kind: 'narration' | 'result' | 'ooc', rule: string, ambiguous = false): GmReading => ({
    kind, to: null, expectsReply: false, ambiguous, rule,
    focus: voc.length ? voc : party && secondPerson ? [] : focus,
  });
  const ask = (rule: string, ambiguous = false, mentioned: string[] = []): GmReading => {
    const direct = voc.length ? voc : mentioned;
    const carried = !direct.length && !party && focus.length > 0;
    const ids = direct.length ? direct : carried ? focus : [];
    return ids.length
      ? { kind: 'ask-to-name', to: { scope: 'named', ids }, expectsReply: true, ambiguous, rule: carried ? `${rule}+carried` : rule, focus: ids }
      : { kind: 'ask-to-party', to: { scope: 'party' }, expectsReply: true, ambiguous, rule, focus: [] };
  };

  if (OOC_PREFIX_RE.test(sentence)) return plain('ooc', 'ooc:prefix');
  if (OOC_WRAPPED_RE.test(sentence)) return plain('ooc', 'ooc:wrapped');
  if (OOC_TABLE_RE.test(sentence) && sentence.trim().split(/\s+/).length <= OOC_MAX_WORDS) return plain('ooc', 'ooc:table-management');

  for (const [rule, re] of CHECK_RES) {
    if (!re.test(marked)) continue;
    // A check that names someone is theirs, vocative or not ("I need a check from Violet").
    const mentioned = voc.length ? voc : idsIn(marked, names);
    const carried = !mentioned.length && !party && focus.length > 0;
    const ids = mentioned.length ? mentioned : carried ? focus : [];
    const to: TalkTarget = ids.length ? { scope: 'named', ids } : party ? { scope: 'party' } : { scope: 'unspecified' };
    return { kind: 'check-call', to, expectsReply: false, ambiguous: false, rule: carried ? `${rule}+carried` : rule, focus: ids.length ? ids : party ? [] : focus };
  }

  if (BARE_NAMES.test(marked)) return ask('ask:bare-name', !question);
  if (HANDOFF_RE.test(marked)) return ask('ask:handoff');
  if (VOC_ABOUT.test(marked)) return ask('ask:what-about');
  if (HANDOFF_ABOUT_RE.test(marked)) return ask('ask:handoff-about', false, idsIn(marked, names));
  if (question) {
    if (INNER_QUESTION_RE.test(sentence)) return plain('narration', 'narration:inner-question?', true);
    if (voc.length || secondPerson || party) return ask('ask:question');
    return plain('narration', 'narration:question?', true);
  }

  if (RESULT_RE.test(marked)) return plain('result', 'result:outcome-words');
  if (WEAK_CHECK_RE.test(sentence)) return plain('narration', 'narration:check-word?', true);
  return plain('narration', 'narration');
}

function readQuote(raw: ProseQuote, names: NameIndex, present: ProseRosterEntry[]): TableUtterance {
  // A script line voiced for a being at the table (`Violet: …`) is that being speaking, even when only NPCs were offered for attribution.
  const self = raw.speakerId ? null : present.find((p) => p.name.trim().toLowerCase() === raw.speakerLabel.trim().toLowerCase());
  const quote = self ? { ...raw, speakerId: self.id, speakerLabel: self.name } : raw;
  const sentences = splitSentences(quote.text);
  let named: string[] = [];
  for (const s of sentences) for (const id of vocatives(mark(s, names), names)) if (!named.includes(id)) named.push(id);
  let rule = named.length ? 'dialogue:direct-address' : 'dialogue';
  if (!named.length && quote.context) {
    named = idsIn(mark(quote.context, names).match(CONTEXT_ADDRESS)?.[1], names);
    if (named.some((id) => id !== quote.speakerId)) rule = 'dialogue:context-address';
  }
  named = named.filter((id) => id !== quote.speakerId);
  const question = sentences.some((s) => QUESTION_RE.test(s));
  const to: TalkTarget = named.length ? { scope: 'named', ids: named } : PARTY_RE.test(quote.text) ? { scope: 'party' } : { scope: 'unspecified' };
  return {
    text: quote.text,
    kind: 'dialogue',
    to,
    speaker: { id: quote.speakerId, label: quote.speakerLabel },
    // Direct address is an ask (design §1); an open question is one too. A line thrown at nobody is not.
    expectsReply: named.length > 0 || question,
    ambiguous: false,
    rule: named.length ? rule : question ? 'dialogue:question' : 'dialogue',
  };
}

// ── segmentation ─────────────────────────────────────────────────────────────

// Mirrors table-prose's quote pattern (not exported there) so speech and narration keep their order.
const QUOTE_RE = /["“]([^"”]+)["”]/g;

export { splitSentences };

type Segment = { gm: string } | { quote: ProseQuote };

function segmentLine(line: string, roster: ProseRosterEntry[]): Segment[] {
  const matches = [...line.matchAll(QUOTE_RE)];
  // Prose with no quote marks: any speech in it is unquoted (`Ruth says, …`) and is read
  // sentence by sentence by the caller — with table-prose's own reader — so it keeps its place.
  if (!matches.length && !isScriptLine(line)) return [{ gm: line }];
  const parsed = parseTableProse(line, roster);
  // No narration left = a script line (`Ruth: …`) or nothing but quotes.
  if (parsed.narration === null) return parsed.quotes.map((quote) => ({ quote }));
  if (matches.length !== parsed.quotes.length) return [{ gm: parsed.narration }, ...parsed.quotes.map((quote) => ({ quote }))];
  const out: Segment[] = [];
  let cursor = 0;
  matches.forEach((m, i) => {
    const start = m.index ?? 0;
    out.push({ gm: line.slice(cursor, start) }, { quote: parsed.quotes[i] });
    cursor = start + m[0].length;
  });
  out.push({ gm: line.slice(cursor) });
  return out;
}

function sameTarget(a: TalkTarget | null, b: TalkTarget | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.scope !== b.scope) return false;
  if (a.scope === 'named' && b.scope === 'named') return a.ids.length === b.ids.length && a.ids.every((id) => b.ids.includes(id));
  return true;
}

/** Read a stretch of table talk (typed prose or a transcript chunk) into ordered, labeled utterances. */
export function readTableTalk(text: string, ctx: TableTalkContext): TableTalkReading {
  const roster: ProseRosterEntry[] = [];
  for (const entry of [...ctx.present, ...(ctx.npcs ?? [])]) if (!roster.some((r) => r.id === entry.id)) roster.push(entry);
  const names = indexNames(roster);
  const speakers = ctx.npcs ?? ctx.present;

  let focus = [...(ctx.state?.focusIds ?? [])];
  let awaitingResult = ctx.state?.checkPending ?? false;
  let resultNarrated = false;
  let checkCalled = false;
  let pending: string | null = null;
  const utterances: TableUtterance[] = [];

  const segments = text.split(/\r?\n/).flatMap((line) => (line.trim() ? segmentLine(line, speakers) : []));
  segments.forEach((segment, at) => {
    if ('quote' in segment) {
      if (resultNarrated) awaitingResult = false;
      utterances.push(readQuote(segment.quote, names, ctx.present));
      return;
    }
    const span = segment.gm.replace(/^[\s,;:]+/, '').trim();
    if (!/[\p{L}\p{N}]/u.test(span)) return;
    const sentences = splitSentences(span).flatMap((sentence) => {
      const aside = sentence.match(LEADING_ASIDE_RE);
      return aside ? [aside[1], aside[2]] : [sentence];
    });
    if (ctx.holdTrailingFragment && at === segments.length - 1 && !TERMINAL_RE.test(sentences.at(-1) ?? '.')) {
      pending = sentences.pop() ?? null;
    }
    for (const sentence of sentences) {
      const spoken = unquotedSpeech(sentence, speakers);
      if (spoken) {
        if (resultNarrated) awaitingResult = false;
        const said = readQuote(spoken, names, ctx.present);
        utterances.push({ ...said, rule: `${said.rule}+unquoted` });
        continue;
      }
      const read = readGmSentence(sentence, names, focus);
      focus = read.focus;
      let { kind, rule } = read;
      if (kind === 'check-call') { awaitingResult = false; checkCalled = true; }
      else if (kind === 'result') { awaitingResult = false; checkCalled = false; }
      else if (kind === 'narration' && awaitingResult) { kind = 'result'; rule = 'result:after-check'; resultNarrated = true; }
      else if (kind !== 'ooc' && kind !== 'narration') awaitingResult = false;

      const prev = utterances.at(-1);
      const merges = kind !== 'check-call' && prev && prev.speaker === null && prev.kind === kind && prev.ambiguous === read.ambiguous && sameTarget(prev.to, read.to);
      if (merges) prev.text = `${prev.text} ${sentence}`;
      else utterances.push({ text: sentence, kind, to: read.to, speaker: null, expectsReply: read.expectsReply, ambiguous: read.ambiguous, rule });
    }
  });

  return { utterances, pending, state: { focusIds: focus, checkPending: checkCalled || (awaitingResult && !resultNarrated) } };
}

/** Who should answer this utterance, out of the beings present. Empty when nobody is being asked. */
export function addressees(utterance: TableUtterance, present: ProseRosterEntry[]): string[] {
  const to = utterance.to;
  if (!utterance.expectsReply || !to) return [];
  const ids = present.map((p) => p.id).filter((id) => id !== utterance.speaker?.id);
  return to.scope === 'named' ? ids.filter((id) => to.ids.includes(id)) : ids;
}

// ── the fallback seam ────────────────────────────────────────────────────────

export interface TableTalkVerdict {
  kind: TableTalkKind;
  to?: TalkTarget | null;
  expectsReply?: boolean;
}

/**
 * A second opinion on ONE ambiguous utterance (a small model, later). Returns
 * null to leave the rule tier's reading in place.
 */
export type TableTalkFallback = (
  utterance: TableUtterance,
  around: { before: TableUtterance[]; after: TableUtterance[] },
) => Promise<TableTalkVerdict | null>;

function acceptVerdict(utterance: TableUtterance, verdict: TableTalkVerdict, known: Set<string>): TableUtterance | null {
  if (!TABLE_TALK_KINDS.includes(verdict.kind)) return null;
  let to = verdict.to ?? null;
  if (to?.scope === 'named' && (to.ids.length === 0 || !to.ids.every((id) => known.has(id)))) return null;
  if (verdict.kind === 'ask-to-party' && to?.scope !== 'party') return null;
  if (verdict.kind === 'ask-to-name' && to?.scope !== 'named') return null;
  if (verdict.kind === 'narration' || verdict.kind === 'result' || verdict.kind === 'ooc') to = null;
  if ((verdict.kind === 'dialogue' || verdict.kind === 'check-call') && to === null) to = { scope: 'unspecified' };
  const asks = verdict.kind === 'ask-to-party' || verdict.kind === 'ask-to-name';
  const expectsReply = asks || (verdict.kind === 'dialogue' && (verdict.expectsReply ?? utterance.expectsReply));
  return { ...utterance, kind: verdict.kind, to, expectsReply, ambiguous: false, rule: `fallback(${utterance.rule})` };
}

/**
 * Hand each ambiguous utterance to the fallback. With no fallback, or when it
 * declines, fails or answers nonsense, the rule tier's reading stands.
 */
export async function settleAmbiguous(
  utterances: TableUtterance[],
  ctx: Pick<TableTalkContext, 'present' | 'npcs'>,
  fallback?: TableTalkFallback,
): Promise<TableUtterance[]> {
  if (!fallback) return utterances;
  const known = new Set([...ctx.present, ...(ctx.npcs ?? [])].map((e) => e.id));
  return Promise.all(
    utterances.map(async (utterance, i) => {
      if (!utterance.ambiguous) return utterance;
      try {
        const verdict = await fallback(utterance, { before: utterances.slice(0, i), after: utterances.slice(i + 1) });
        return (verdict && acceptVerdict(utterance, verdict, known)) ?? utterance;
      } catch {
        return utterance;
      }
    }),
  );
}
