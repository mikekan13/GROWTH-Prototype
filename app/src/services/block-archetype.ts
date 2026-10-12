/**
 * Blocks are campaign-agnostic ARCHETYPES (Mike 2026-10-12: "The suggested
 * blocks roots branches etc. are extremely campaign specific. Remember blocks
 * are meant to be campaign agnostic." — ruled before as the archetype law,
 * [[character-genesis-pipeline-2026-08-08]], and the two-ledger split,
 * [[story-attachment-two-ledgers-2026-08-19]]).
 *
 * A block's name, description, rule text and tags must pass the STRANGER
 * TEST: a stranger's character in another campaign could take it unchanged,
 * and a GM who never met the bearer understands what it is and when to pick
 * it. The bearer's specifics (who, where, which key, which years) live on the
 * character's LINK to the block (CharacterBlockLink.story).
 *
 * Pure. The tool boundary (propose_forge_blueprint) feeds it the seed text
 * and DB names; this module extracts the proper nouns and checks the draft.
 * NARRATIVE PAINT (Mike 2026-10-12): ITEMS follow the same law — the catalog
 * form is agnostic ("Silver Butter Knife"); the campaign instance carries a
 * local name ("Rosemary's keepsake"), story and history. Locations are not
 * forged and are not checked.
 */

/** Forge types the archetype law covers (every Forge type; locations aren't forged). */
export const ARCHETYPE_TYPES = ['seed', 'root', 'branch', 'skill', 'item', 'nectar', 'blossom', 'thorn'] as const;

export function isArchetypeType(type: string): boolean {
  return (ARCHETYPE_TYPES as readonly string[]).includes(type);
}

/** Progress-note prefixes that name a rejected block shape (validator / GM redraft). */
export const ARCHETYPE_REJECTED_PREFIX = 'ARCHETYPE REJECTED:';
export const DRAFTS_WITHDRAWN_PREFIX = 'drafts withdrawn: generalise per the archetype law';

/** The rejected shapes recorded in a session's progress notes, newest last. Pure. */
export function rejectedShapes(notes: string[], max = 12): string[] {
  const out: string[] = [];
  for (const n of notes) {
    if (n.startsWith(ARCHETYPE_REJECTED_PREFIX)) out.push(n.slice(ARCHETYPE_REJECTED_PREFIX.length).trim());
    else if (n.startsWith(DRAFTS_WITHDRAWN_PREFIX)) {
      const list = n.slice(DRAFTS_WITHDRAWN_PREFIX.length).replace(/^\s*[—:-]\s*/, '').trim();
      if (list && !list.startsWith('(')) out.push(`withdrawn by the GM: ${list}`);
    }
  }
  return out.slice(-max);
}

/** Shapes Mike already rejected (August 2026 Violet review) — never again. */
export const AUGUST_REJECTED = ['"The Fault Line Years"', '"The Holding Pattern"', '"Elven Longbow of the Northern Reach"', 'rule text "a Halfling rolls…"'];

/** The law as JEWL reads it — drafting cycle text + tool description. */
export const ARCHETYPE_LAW = [
  'ARCHETYPE LAW (blocks are campaign-agnostic — Mike 2026-10-12): every block you draft is an archetype for the WHOLE metaverse.',
  '- Its name, description, rule text and tags carry NO proper nouns from the seed (people, places, named objects, events, the bearer\'s name), no campaign-specific nouns, no first/second person about the bearer. Rule text says "the bearer" / "this character".',
  '- Stranger test: a stranger\'s character in another campaign could take it unchanged, AND a GM who never met her knows what it is and when to pick it — vague mood names fail too.',
  '- NARRATIVE PAINT: draft the archetype AND write the paint in the SAME proposal — localName (optional, e.g. "Rosemary\'s keepsake") + attachmentStory (who, where, which key, which years). Paint lands on her instance of the block, never in the block, and never changes mechanics. Items too: the catalog form is "Silver Butter Knife"; the instance is "Rosemary\'s keepsake".',
  '- PULL-AND-PAINT BEFORE DRAFTING: if a stock or campaign block/item already fits, attach_block it with the paint — never draft a duplicate.',
  '- BAD "Raised by Rosemary" → GOOD "Raised by Grandmother" (attachmentStory: "Rosemary Marsh raised her from age four in the house on the hill").',
  '- BAD "After the Key" / "The Holding Years" → GOOD "Years of Caregiving" (name what the years were, legibly; the key and the house go in attachmentStory).',
  '- BAD thorn rule text "When Violet hears the Key turn in the lock, she…" → GOOD "When the bearer is confronted with the sealed event, they…" (thorn "Sealed Memory"; which event it is goes in attachmentStory).',
  `- Shapes the GM already rejected — never again: ${AUGUST_REJECTED.join(', ')}.`,
].join('\n');

/** Words that are capitalised in prose but are never campaign-specific:
 *  sentence starters, pronouns, kinship/role nouns, calendar words, game terms. */
const STOPLIST = new Set([
  // function words / sentence starters
  'a', 'an', 'the', 'and', 'but', 'or', 'so', 'as', 'at', 'in', 'on', 'of', 'for', 'from', 'with', 'by', 'to',
  'if', 'when', 'while', 'once', 'after', 'before', 'then', 'there', 'here', 'this', 'that', 'these', 'those',
  'every', 'each', 'all', 'some', 'no', 'not', 'now', 'later', 'soon', 'still', 'even', 'also', 'only', 'just',
  'both', 'most', 'many', 'few', 'what', 'who', 'whom', 'why', 'how', 'where', 'which', 'because', 'since',
  'until', 'though', 'although', 'yet', 'nothing', 'everything', 'someone', 'something', 'nobody', 'everyone',
  'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'years', 'year', 'yes', 'ok',
  'during', 'over', 'under', 'into', 'out', 'up', 'down', 'about', 'again', 'never', 'always', 'sometimes',
  'growing', 'born', 'raised', 'later', 'eventually', 'finally', 'first', 'last', 'next', 'another', 'other',
  // pronouns
  'i', 'me', 'my', 'we', 'our', 'you', 'your', 'he', 'him', 'his', 'she', 'her', 'hers', 'they', 'them',
  'their', 'it', 'its', 'im', 'ive', 'id',
  // titles / kinship / roles (common nouns even when capitalised)
  'mr', 'mrs', 'ms', 'dr', 'st', 'sir', 'madam', 'lord', 'lady', 'god', 'king', 'queen', 'prince', 'princess',
  'captain', 'doctor', 'professor', 'master', 'teacher', 'elder', 'grandmother', 'grandfather', 'grandma',
  'grandpa', 'granny', 'nana', 'mother', 'father', 'mom', 'mum', 'dad', 'mama', 'papa', 'aunt', 'auntie',
  'uncle', 'sister', 'brother', 'son', 'daughter', 'cousin', 'wife', 'husband', 'parents', 'family',
  // calendar
  'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday', 'january', 'february',
  'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december',
  'christmas', 'easter',
  // game vocabulary
  'human', 'elf', 'elven', 'dwarf', 'halfling', 'seed', 'root', 'branch', 'nectar', 'thorn', 'blossom', 'skill',
  'krma', 'gm', 'jewl', 'watcher', 'trailblazer', 'godhead', 'terminal', 'body', 'spirit', 'soul',
  'backstory', 'appearance', 'name', 'age',
  // headings / genres / common capitalised nouns
  'books', 'book', 'mythology', 'myth', 'myths', 'childhood', 'chapter', 'part', 'parts', 'winter', 'summer',
  'spring', 'autumn', 'fall', 'history', 'magic', 'music', 'art', 'arts', 'poetry', 'stories', 'story', 'school',
  'work', 'home', 'life', 'death', 'love', 'war', 'peace', 'solitude', 'craft', 'craftsmanship', 'travel',
  'travels', 'friends', 'friendship', 'interests', 'hobbies', 'notes', 'summary', 'overview', 'personality',
  'history', 'background', 'family', 'goals', 'fears', 'skills', 'education', 'career', 'adulthood', 'youth',
  'legends', 'folklore', 'science', 'nature', 'religion', 'faith', 'church', 'prayer', 'grief', 'loss', 'fire',
  'water', 'earth', 'night', 'day', 'morning', 'evening', 'dreams', 'memories', 'secrets', 'solitary',
]);

const DETERMINERS = new Set(['the', 'a', 'an', 'his', 'her', 'their', 'my', 'our', 'its', 'this', 'that', 'some']);

const WORD = /[A-Za-z][A-Za-z'’-]*/g;

function stripPossessive(w: string): string {
  return w.replace(/['’]s$/i, '').replace(/['’]$/, '');
}

function isCap(w: string): boolean {
  return /^[A-Z][A-Za-z'’-]*[a-z]$/.test(w);
}

/** Split into sentences (on . ! ? : ; and line breaks). */
function sentences(text: string): string[] {
  return text.split(/(?<=[.!?:;])\s+|\n+|—|–/).map(s => s.trim()).filter(Boolean);
}

/**
 * Proper nouns of a seed. A capitalised word counts when it is not on the
 * stoplist AND either appears mid-sentence (not sentence-initial), recurs as
 * a capitalised word, or matches a token of a known DB name. Sentence-initial
 * one-offs ("Growing up…", "Grief…") are ignored.
 */
export function extractSeedProperNouns(seedText: string, dbNames: string[] = []): string[] {
  const dbTokens = new Set(
    dbNames.flatMap(n => (n.match(WORD) ?? []).map(stripPossessive)).filter(t => isCap(t)),
  );
  // Any word seen in lowercase anywhere in the seed is a common word.
  const lower = new Set<string>();
  for (const w of seedText.match(WORD) ?? []) {
    const t = stripPossessive(w);
    if (/^[a-z]/.test(t)) lower.add(t.toLowerCase());
  }
  const midSure = new Map<string, number>(); // mid-sentence, no determiner before
  const midDet = new Map<string, number>(); // mid-sentence after the/a/her/...
  const count = new Map<string, number>();
  const out = new Set<string>();
  const qualifies = (w: string) =>
    isCap(w) && !STOPLIST.has(w.toLowerCase()) && !lower.has(w.toLowerCase()) && w.length >= 3;
  for (const s of sentences(seedText)) {
    const words = (s.match(WORD) ?? []).map(stripPossessive);
    for (let i = 0; i < words.length;) {
      if (!qualifies(words[i])) { i++; continue; }
      let j = i;
      while (j + 1 < words.length && qualifies(words[j + 1])) j++;
      if (j > i) {
        // A multi-word Title Case run ("Rosemary Marsh"): the phrase and its
        // leading tokens are names; the head word counts only if it also
        // stands alone elsewhere.
        out.add(words.slice(i, j + 1).join(' '));
        for (let k = i; k < j; k++) out.add(words[k]);
      } else {
        const w = words[i];
        count.set(w, (count.get(w) ?? 0) + 1);
        if (i > 0) {
          const m = DETERMINERS.has(words[i - 1].toLowerCase()) ? midDet : midSure;
          m.set(w, (m.get(w) ?? 0) + 1);
        }
      }
      i = j + 1;
    }
  }
  for (const [w] of count) {
    const mid = (midSure.get(w) ?? 0) + (midDet.get(w) ?? 0);
    // "the Key" once is a plain noun; twice mid-sentence it is a titled object.
    if (dbTokens.has(w) || (midSure.get(w) ?? 0) >= 1 || mid >= 2) out.add(w);
  }
  return [...out].sort();
}

/** The bearer's name tokens ("Violet Almswood" → Violet, Almswood). */
export function bearerNameTokens(name: string): string[] {
  return (name.match(WORD) ?? [])
    .map(stripPossessive)
    .filter(w => w.length >= 3 && !STOPLIST.has(w.toLowerCase()));
}

export interface BannedTerms {
  /** Case-sensitive whole-word tokens (Rosemary, Violet, Key). */
  tokens: string[];
  /** Case-insensitive whole phrases from the DB (campaign/location/character names). */
  phrases: string[];
}

export function buildBannedTerms(opts: {
  seedText?: string;
  bearerName?: string;
  dbNames?: string[];
}): BannedTerms {
  const tokens = new Set<string>([
    ...extractSeedProperNouns(opts.seedText ?? '', opts.dbNames ?? []),
    ...(opts.bearerName ? bearerNameTokens(opts.bearerName) : []),
  ]);
  const phrases = new Set<string>();
  for (const n of opts.dbNames ?? []) {
    const p = n.trim().replace(/^the\s+/i, '');
    if (p.length >= 3 && !STOPLIST.has(p.toLowerCase())) phrases.add(p);
  }
  return { tokens: [...tokens].sort(), phrases: [...phrases].sort() };
}

/** Body keys never scanned: notes (may cite biography), enums, rationale. */
const SKIP_KEYS = new Set([
  '_proposalNote', '_chainNote', 'declaredKvRationale', 'gmNote', 'chainNote', 'maturityFlags',
  'pillar', 'kind', 'unit', 'governors', 'governorAttribute', 'scope', 'type', 'category', 'baseFateDie',
]);

function collectStrings(value: unknown, path: string, out: Array<{ field: string; text: string }>) {
  if (typeof value === 'string') { out.push({ field: path || '(body)', text: value }); return; }
  if (Array.isArray(value)) { value.forEach((v, i) => collectStrings(v, `${path}[${i}]`, out)); return; }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SKIP_KEYS.has(k)) continue;
      collectStrings(v, path ? `${path}.${k}` : k, out);
    }
  }
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const FIRST_SECOND_PERSON = /\b(?:I|I'm|I've|I'd)\b|\b(?:my|mine|myself|you|your|yours|yourself)\b/i;

export interface ArchetypeHit {
  token: string;
  fields: string[];
}

/** Check a draft's name + body against the banned terms. Pure. */
export function checkArchetype(name: string, body: Record<string, unknown>, banned: BannedTerms): ArchetypeHit[] {
  const strings: Array<{ field: string; text: string }> = [{ field: 'name', text: name }];
  collectStrings(body, '', strings);
  const hits = new Map<string, Set<string>>();
  const hit = (token: string, field: string) => {
    if (!hits.has(token)) hits.set(token, new Set());
    hits.get(token)!.add(field);
  };
  for (const { field, text } of strings) {
    for (const t of banned.tokens) {
      if (new RegExp(`(?<![A-Za-z])${escapeRe(t)}(?![a-z])`).test(text)) hit(t, field);
    }
    for (const p of banned.phrases) {
      if (new RegExp(`(?<![A-Za-z])${escapeRe(p)}(?![A-Za-z])`, 'i').test(text)) hit(p, field);
    }
    // First person is never rule text; "your" sneaks in as bearer address.
    const fp = FIRST_SECOND_PERSON.exec(text);
    if (fp && (field === 'name' || /description|ruleText|mechanicalEffect|effects|tags/.test(field) || field === '(body)')) {
      hit(`first/second person ("${fp[0]}")`, field);
    }
  }
  return [...hits].map(([token, f]) => ({ token, fields: [...f] }));
}

/** The reject-with-reason message JEWL reads. */
export function archetypeRejection(name: string, hits: ArchetypeHit[]): string {
  const list = hits.map(h => `"${h.token}" (in ${h.fields.join(', ')})`).join('; ');
  return (
    `ARCHETYPE LAW — "${name}" is campaign-specific. Generalise these before re-proposing: ${list}. ` +
    'Blocks are archetypes for the whole metaverse: write the role or shape ("Raised by Grandmother", not ' +
    '"Raised by Rosemary"; "the bearer", never her name), keep it legible to a GM who never met her, and ' +
    'put the specifics (who, where, which object, which years) in attachmentStory — it is written to her ' +
    'link to the block, not the block.'
  );
}
