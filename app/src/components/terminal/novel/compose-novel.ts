/**
 * The out-of-session Terminal reads like a novel (Mike 2026-10-26, ruling-in-session-terminal-reads-like-a-novel).
 *
 * `composeNovel` turns the feed's row models (feed-rows.ts) into plain prose blocks — no cards, no (( )) / :: / ""
 * marks, no timestamps. Everything is derived from the record; no model call.
 *
 *   omniscient  (viewer = null, the Watcher's truth record): the scene narration, then each character card as a
 *               paragraph — acts as narration, words in ordinary quotation marks with a tag (`"…," Kristopher says.`),
 *               thoughts per the GM's `thoughtStyle`:
 *                 'inner'    the being's own words, an italic run;
 *                 'narrator' reported in the narrator's voice (first person → third, past tense; small rules).
 *   first person (viewer = a character): built from the rows that reached that character (the server already filters
 *               a perceived feed); the viewer's own acts and words become "I" (a small deterministic pronoun pass),
 *               everyone else stays third person.
 *
 * Text may carry perceived-feed tokens (`{@id|label}`, `{gap}`); they pass through untouched except that the viewer's
 * own token is replaced by the pronoun. Pure, client-safe.
 */
import type { FeedRowModel, CharacterRowModel, RollRowModel } from '../table-feed/feed-rows';

export type ThoughtStyle = 'inner' | 'narrator';
export type Gender = 'he' | 'she' | null;

export interface NovelViewer { id: string | null; name: string }
export interface NovelOpts {
  thoughtStyle?: ThoughtStyle;
  /** A label for the in-world hour of a cycle; a thin break is laid wherever it changes. */
  breakLabel?: (cycle: number) => string | null;
  /** The sheet's he/she, by character id and by name — wins over what the record's own pronouns suggest. */
  sexes?: Map<string, Gender>;
}
export interface NovelRun { text: string; inner?: boolean }
export type NovelBlock =
  | { key: string; kind: 'para'; runs: NovelRun[] }
  | { key: string; kind: 'break'; text: string };

// ── small text rules ────────────────────────────────────────────────────────

const TOKEN_RE = /\{@[^|}]+\|[^}]*\}/g;

function escapeRe(s: string): string { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

/** Sentence-ish pieces, keeping their whitespace so they join back unchanged. */
function sentences(text: string): string[] {
  return text.match(/[^.!?]+(?:[.!?]+["')\]]*|$)\s*/g) ?? [text];
}

function ensureStop(text: string): string {
  const t = text.trim();
  return /[.!?…"')\]]$/.test(t) ? t : `${t}.`;
}

function stripMarks(text: string): string {
  return text.replace(/\*+/g, '').replace(/\s+/g, ' ').trim();
}

function capitalise(s: string): string { return s ? s[0].toUpperCase() + s.slice(1) : s; }

/** Third-person present verb → the "I" form: knocks → knock, approaches → approach, tries → try, is → am. */
export function conjugateForI(word: string): string {
  const w = word.toLowerCase();
  const irregular: Record<string, string> = { is: 'am', has: 'have', does: 'do', goes: 'go', "isn't": 'am not', "hasn't": "haven't", "doesn't": "don't", "wasn't": "wasn't" };
  const out = irregular[w] ?? (() => {
    if (w.length > 4 && /ies$/.test(w)) return `${w.slice(0, -3)}y`;
    if (/(ss|us|is|'s)$/.test(w) || !/s$/.test(w)) return w;
    if (/(sh|ch|x|z|s|o)es$/.test(w) && !/(ces|ses|zes)$/.test(w)) return w.slice(0, -2);
    return w.slice(0, -1);
  })();
  return word[0] === word[0].toUpperCase() && word[0] !== word[0].toLowerCase() ? capitalise(out) : out;
}

const NOT_VERBS = new Set(['his', 'this', 'its', 'as', 'us', 'was', 'yes', 'across', 'less', 'perhaps', 'always', 'sometimes', 'towards', 'afterwards', 'besides', 'upstairs', 'downstairs', 'outdoors']);

/** Conjugate the first word of `rest` and the word after each following " and ". */
function conjugateRun(rest: string): string {
  return rest.replace(/^(\s+)([A-Za-z']+)|(\band\s+)([A-Za-z']+)/g, (m, sp: string | undefined, w1: string | undefined, and: string | undefined, w2: string | undefined) => {
    const word = (w1 ?? w2)!;
    if (NOT_VERBS.has(word.toLowerCase())) return m;
    return (sp ?? and!) + conjugateForI(word);
  });
}

const AFTER_HER_OBJECT = new Set(['to', 'at', 'in', 'on', 'with', 'for', 'from', 'and', 'as', 'by', 'of', 'through', 'that', 'when', 'while', 'but', 'or', 'if', 'then', 'before', 'after', 'over', 'into', 'up', 'down', 'out', 'off', 'about', 'behind', 'than']);

/**
 * The viewer's own act sentences → first person. `name` is the character's name, `gender` as read from the record
 * (null = leave pronouns alone, change only the name). A sentence that does not begin with the viewer (Name / He / She)
 * is left to the name pass alone, so another person's "she" is never turned into "I".
 */
export function firstPerson(text: string, viewer: { id?: string | null; name: string; gender: Gender }): string {
  const { name, gender } = viewer;
  const first = name.trim().split(/\s+/)[0];
  const full = escapeRe(name.trim());
  const given = escapeRe(first);
  const nameAlt = first && first !== name.trim() ? `${full}|${given}` : full;
  let src = text;
  if (viewer.id) src = src.replace(new RegExp(`\\{@${escapeRe(viewer.id)}\\|[^}]*\\}`, 'g'), name.trim());
  const subj = gender === 'he' ? 'He' : gender === 'she' ? 'She' : null;
  const subjRe = new RegExp(`^(\\s*)(${subj ? `${nameAlt}|${subj}` : nameAlt})(?![\\p{L}\\p{N}'’])`, 'u');

  const nameRest = (s: string) => s
    .replace(new RegExp(`\\b(?:${nameAlt})['’]s\\b`, 'g'), 'my')
    .replace(new RegExp(`\\b(?:${nameAlt})\\b`, 'g'), 'me');

  return sentences(src).map((sentence) => {
    const m = subjRe.exec(sentence);
    if (!m) return nameRest(sentence);
    let rest = sentence.slice(m[0].length);
    rest = conjugateRun(rest);
    if (gender === 'he') {
      rest = rest.replace(/\bhimself\b/g, 'myself').replace(/\bhis\b/g, 'my').replace(/\bhim\b/g, 'me').replace(/\bhe\b(\s+)([A-Za-z']+)/g, (_x, sp: string, w: string) => `I${sp}${conjugateForI(w)}`);
    } else if (gender === 'she') {
      rest = rest.replace(/\bherself\b/g, 'myself').replace(/\bshe\b(\s+)([A-Za-z']+)/g, (_x, sp: string, w: string) => `I${sp}${conjugateForI(w)}`)
        .replace(/\bher\b(\s+)?([A-Za-z]+)?/g, (_x, sp: string | undefined, next: string | undefined) => {
          const object = !next || AFTER_HER_OBJECT.has(next.toLowerCase());
          return `${object ? 'me' : 'my'}${sp ?? ''}${next ?? ''}`;
        });
    }
    return `${m[1]}I${nameRest(rest)}`;
  }).join('');
}

/** Name the viewer wherever narration (not their own segments) mentions them: Violet's → my, Violet → me. */
export function nameToFirstPerson(text: string, viewer: { id?: string | null; name: string }): string {
  const name = viewer.name.trim();
  const first = name.split(/\s+/)[0];
  const alt = first && first !== name ? `${escapeRe(name)}|${escapeRe(first)}` : escapeRe(name);
  let out = text;
  if (viewer.id) out = out.replace(new RegExp(`\\{@${escapeRe(viewer.id)}\\|[^}]*\\}`, 'g'), name);
  return out
    .replace(new RegExp(`(^|[.!?]\\s+)(?:${alt})['’]s\\b`, 'g'), (_m, p: string) => `${p}My`)
    .replace(new RegExp(`\\b(?:${alt})['’]s\\b`, 'g'), 'my')
    .replace(new RegExp(`(^|[.!?]\\s+)(?:${alt})\\b`, 'g'), (_m, p: string) => `${p}I`)
    .replace(new RegExp(`\\b(?:${alt})\\b`, 'g'), 'me');
}

const IRREGULAR_PAST: Record<string, string> = {
  know: 'knew', see: 'saw', think: 'thought', feel: 'felt', hear: 'heard', come: 'came', go: 'went', take: 'took', get: 'got',
  hold: 'held', keep: 'kept', stand: 'stood', say: 'said', tell: 'told', make: 'made', find: 'found', give: 'gave', run: 'ran',
  sit: 'sat', leave: 'left', forget: 'forgot', mean: 'meant', let: 'let', put: 'put', stop: 'stopped', begin: 'began', speak: 'spoke',
  hope: 'hoped', want: 'wanted', need: 'needed', wonder: 'wondered', look: 'looked',
};
const ADVERBS = new Set(['still', 'just', 'never', 'always', 'also', 'only', 'even', 'already', 'almost', 'really', 'barely', 'simply', 'now', 'then', 'not', 'too', 'so', 'maybe', 'perhaps', 'once', 'ever', 'often']);
const MODALS = new Set(['would', 'could', 'should', 'might', 'must', 'shall', 'may', 'will', 'can', 'cannot', 'was', 'had']);

function pastTense(verb: string): string {
  const v = verb.toLowerCase();
  if (IRREGULAR_PAST[v]) return IRREGULAR_PAST[v];
  if (/e$/.test(v)) return `${v}d`;
  if (/[^aeiou]y$/.test(v)) return `${v.slice(0, -1)}ied`;
  return `${v}ed`;
}

/**
 * A being's own words reported by the narrator (thoughtStyle 'narrator'): "I know this door." → "He knew this door."
 * Person shift plus the verb that follows "I" into the past. Without a gender the name stands in for the pronoun.
 */
export function narratorise(text: string, speaker: { name: string; gender: Gender }): string {
  const { name, gender } = speaker;
  const S = gender === 'he' ? 'he' : gender === 'she' ? 'she' : name;
  const O = gender === 'he' ? 'him' : gender === 'she' ? 'her' : name;
  const P = gender === 'he' ? 'his' : gender === 'she' ? 'her' : `${name}'s`;
  const R = gender === 'he' ? 'himself' : gender === 'she' ? 'herself' : name;
  const cap = (offset: number, s: string, full: string) => {
    const before = full.slice(0, offset).trimEnd();
    return before === '' || /[.!?…—"“]$/.test(before) ? capitalise(s) : s;
  };
  const rules: Array<[RegExp, (m: RegExpMatchArray, off: number, full: string) => string]> = [
    [/\bI['’]m\b/g, (_m, o, f) => `${cap(o, S, f)} was`],
    [/\bI['’]ve\b/g, (_m, o, f) => `${cap(o, S, f)} had`],
    [/\bI['’](?:ll|d)\b/g, (_m, o, f) => `${cap(o, S, f)} would`],
    [/\bI am\b/g, (_m, o, f) => `${cap(o, S, f)} was`],
    [/\bI have\b/g, (_m, o, f) => `${cap(o, S, f)} had`],
    [/\bI (?:do not|don['’]t)\b/g, (_m, o, f) => `${cap(o, S, f)} did not`],
    [/\bI (?:can['’]t|cannot)\b/g, (_m, o, f) => `${cap(o, S, f)} could not`],
    [/\bI can\b/g, (_m, o, f) => `${cap(o, S, f)} could`],
    [/\bI will\b/g, (_m, o, f) => `${cap(o, S, f)} would`],
    [/\bI ([a-z]+)\b/g, (m, o, f) => {
      const w = m[1];
      const keep = ADVERBS.has(w) || MODALS.has(w) || w.endsWith('ly');
      return `${cap(o, S, f)} ${keep ? w : pastTense(w)}`;
    }],
  ];
  const parts = text.split(TOKEN_RE);
  const tokens = text.match(TOKEN_RE) ?? [];
  const done = parts.map((part) => {
    let out = part;
    for (const [re, fn] of rules) out = out.replace(re, (...args) => {
      const match = args.slice(0, -2) as unknown as RegExpMatchArray;
      const off = args[args.length - 2] as number;
      return fn(match, off, args[args.length - 1] as string);
    });
    return out
      .replace(/\bI\b/g, (_m, ...a) => cap(a[a.length - 2] as number, S, a[a.length - 1] as string))
      .replace(/\bmyself\b/g, R)
      .replace(/\b[Mm]y\b/g, (m, ...a) => (m[0] === 'M' ? capitalise(P) : cap(a[a.length - 2] as number, P, a[a.length - 1] as string)))
      .replace(/\b[Mm]e\b/g, (m, ...a) => (m[0] === 'M' ? capitalise(O) : cap(a[a.length - 2] as number, O, a[a.length - 1] as string)));
  });
  return parts.length === 1 ? done[0] : done.reduce((acc, part, i) => acc + part + (tokens[i] ?? ''), '');
}

// ── the composer ─────────────────────────────────────────────────────────────

/** Read each named character's gender off the record: a sentence that opens an act with He/His or She/Her. */
/** A sheet's sex string ('Male', 'f', 'woman'…) → he/she; anything else = unknown. */
export function genderFromSex(sex: string | null | undefined): Gender {
  const c = (sex ?? '').trim().toLowerCase();
  if (/^(m|male|man|boy)\b/.test(c)) return 'he';
  if (/^(f|female|woman|girl)\b/.test(c)) return 'she';
  return null;
}

export function gendersOf(rows: FeedRowModel[]): Map<string, Gender> {
  const tally = new Map<string, { he: number; she: number }>();
  const visit = (r: CharacterRowModel) => {
    for (const s of r.segments) {
      if (s.kind !== 'action') continue;
      for (const sentence of sentences(s.text)) {
        const t = tally.get(r.name) ?? { he: 0, she: 0 };
        if (/^\s*(?:He|His)\b/.test(sentence)) t.he += 1;
        else if (/^\s*(?:She|Her)\b/.test(sentence)) t.she += 1;
        tally.set(r.name, t);
      }
    }
  };
  const walk = (r: FeedRowModel) => {
    if (r.type === 'character') visit(r);
    else if (r.type === 'beat') r.groups.forEach((g) => g.forEach(walk));
  };
  rows.forEach(walk);
  const out = new Map<string, Gender>();
  for (const [n, t] of tally) out.set(n, t.he > t.she ? 'he' : t.she > t.he ? 'she' : null);
  return out;
}

function mergeRuns(runs: NovelRun[]): NovelRun[] {
  const out: NovelRun[] = [];
  for (const r of runs) {
    const last = out[out.length - 1];
    if (last && !!last.inner === !!r.inner) last.text += r.text;
    else out.push({ ...r });
  }
  return out;
}

/** `"Violet? I have a pizza here for you," Kristopher says.` */
function speechLine(text: string, who: string): string {
  const verb = who === 'I' ? 'say' : 'says';
  let t = stripMarks(text).replace(/^["“]|["”]$/g, '').trim();
  if (!t) return '';
  if (/[.…]$/.test(t)) t = `${t.replace(/\.$/, '')},`;
  else if (!/[?!,]$/.test(t)) t = `${t},`;
  return `"${t}" ${who} ${verb}.`;
}

function cardRuns(row: CharacterRowModel, viewer: NovelViewer | null, genders: Map<string, Gender>, style: ThoughtStyle, sexes?: Map<string, Gender>): NovelRun[] {
  const own = !!viewer && ((!!viewer.id && row.characterId === viewer.id) || row.name === viewer.name);
  const gender = (row.characterId ? sexes?.get(row.characterId) : undefined) ?? sexes?.get(row.name) ?? genders.get(row.name) ?? null;
  const runs: NovelRun[] = [];
  for (const s of row.segments) {
    const clean = stripMarks(s.text);
    if (!clean) continue;
    if (s.kind === 'action') {
      const t = own ? firstPerson(ensureStop(clean), { id: viewer!.id, name: row.name, gender }) : (viewer ? nameToFirstPerson(ensureStop(clean), viewer) : ensureStop(clean));
      runs.push({ text: `${t} ` });
    } else if (s.kind === 'speech') {
      const line = speechLine(clean, own ? 'I' : row.name);
      if (line) runs.push({ text: `${line} ` });
    } else if (own || style === 'inner') {
      runs.push({ text: `${ensureStop(clean)} `, inner: true });
    } else {
      runs.push({ text: `${ensureStop(narratorise(clean, { name: row.name, gender }))} ` });
    }
  }
  return mergeRuns(runs);
}

/**
 * A roll card as prose, per viewpoint. The actor reads it in first person; the Watcher and a witness who saw it read
 * "Name succeeds at Skill." / "fails"; a hearer reads only the event sentence (they know no outcome). Effort, when
 * spent, is one short clause. No numbers, no DR — the Log holds those.
 */
export function rollRuns(row: RollRowModel, viewer: NovelViewer | null): NovelRun[] {
  const event = stripMarks(row.event);
  if (!event) return [];
  const own = !!viewer && ((!!viewer.id && row.actorId === viewer.id) || row.actorName === viewer.name);
  const first = own ? firstPerson(ensureStop(event), { id: viewer!.id, name: row.actorName, gender: null }) : (viewer ? nameToFirstPerson(ensureStop(event), viewer) : ensureStop(event));
  if (row.level === 'event' || row.success === null) return [{ text: first }];
  const at = row.skill ? ` at ${row.skill}` : '';
  const result = own
    ? (row.success ? `I succeed${at}.` : `I fail${at}.`)
    : (row.success ? `${row.actorName} succeeds${at}.` : `${row.actorName} fails${at}.`);
  const cost = row.effort > 0 ? (own ? ` It costs me ${row.effort} Effort.` : ` It costs ${row.effort} Effort.`) : '';
  return [{ text: `${first} ${result}${cost}` }];
}

export function composeNovel(rows: FeedRowModel[], viewer: NovelViewer | null, opts: NovelOpts = {}): NovelBlock[] {
  const style = opts.thoughtStyle ?? 'inner';
  const genders = gendersOf(rows);
  const blocks: NovelBlock[] = [];
  let lastLabel: string | null = null;

  const note = (cycle: number | undefined, key: string) => {
    if (cycle === undefined || !opts.breakLabel) return;
    const label = opts.breakLabel(cycle);
    if (label && label !== lastLabel) {
      if (lastLabel !== null || blocks.length > 0) blocks.push({ key: `${key}#br`, kind: 'break', text: label });
      lastLabel = label;
    }
  };

  const walk = (row: FeedRowModel) => {
    switch (row.type) {
      case 'narration': {
        const clean = stripMarks(row.text);
        if (!clean) return;
        note(row.cycle, row.key);
        blocks.push({ key: row.key, kind: 'para', runs: [{ text: viewer ? nameToFirstPerson(clean, viewer) : clean }] });
        return;
      }
      case 'character': {
        const runs = cardRuns(row, viewer, genders, style, opts.sexes);
        if (runs.length === 0) return;
        note(row.cycle, row.key);
        blocks.push({ key: row.key, kind: 'para', runs: runs.map((r, i) => (i === runs.length - 1 ? { ...r, text: r.text.trimEnd() } : r)) });
        return;
      }
      case 'beat':
        row.groups.forEach((g) => g.forEach(walk));
        return;
      case 'roll': {
        // A roll reads as one or two sentences, as far as this viewpoint perceived it (the book leaves the dice out).
        const runs = rollRuns(row, viewer);
        if (runs.length === 0) return;
        note(row.cycle, row.key);
        blocks.push({ key: row.key, kind: 'para', runs });
        return;
      }
      default:
        return; // checks, event bars, JEWL margin, system readouts, withdrawn lines: the book leaves the machinery out
    }
  };
  rows.forEach(walk);
  return blocks;
}
