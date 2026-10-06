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

export interface ProseRosterEntry { id: string; name: string }

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
}

const QUOTE_RE = /["“]([^"”]+)["”]/g;
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

export function parseTableProse(message: string, roster: ProseRosterEntry[] = []): ParsedProse {
  const full = message.trim();
  const quotes: ProseQuote[] = [];
  const lines = full.split(/\r?\n/);
  const narrationParts: string[] = [];

  for (const line of lines) {
    // 0. Unquoted speech (`Ruth says, sit down.`) — only on a line with no quote
    //    marks, and only when a sentence of it really is one; every other line
    //    takes the paths below exactly as before.
    if (roster.length > 0 && !QUOTE_CHAR_RE.test(line) && !SCRIPT_PREFIX_RE.test(line)) {
      const sentences = splitSentences(line);
      const said = sentences.map((s) => unquotedSpeech(s, roster));
      if (said.some(Boolean)) {
        for (const q of said) if (q) quotes.push(q);
        const kept = sentences.filter((_, i) => !said[i]).join(' ').trim();
        if (kept) narrationParts.push(kept);
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
        continue;
      }
    }

    // 2. Quoted runs inside prose.
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
      const npc = findRosterName(beforeWindow.slice(-160), roster) ?? (runsOn ? firstRosterName(afterTag.slice(0, 120), roster) : null);
      const subject = npc ? null : introducedSubject(contextSentence);
      quotes.push({
        text: m[1].trim(),
        speakerId: npc?.id ?? null,
        speakerLabel: npc?.name ?? subject ?? 'someone present',
        context: contextSentence,
      });
      cursor = start + m[0].length;
    }
    stripped += line.slice(cursor);
    const cleaned = stripped.replace(/\s{2,}/g, ' ').trim();
    if (cleaned) narrationParts.push(cleaned);
  }

  const narration = narrationParts.join('\n').trim() || null;
  return { full, narration, quotes };
}
