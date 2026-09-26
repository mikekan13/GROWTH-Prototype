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

export function parseTableProse(message: string, roster: ProseRosterEntry[] = []): ParsedProse {
  const full = message.trim();
  const quotes: ProseQuote[] = [];
  const lines = full.split(/\r?\n/);
  const narrationParts: string[] = [];

  for (const line of lines) {
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
      const npc = findRosterName(beforeWindow.slice(-160), roster) ?? firstRosterName(afterTag.slice(0, 120), roster);
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
