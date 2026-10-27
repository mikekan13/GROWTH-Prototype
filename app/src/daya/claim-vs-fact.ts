/**
 * A being's spoken claim against the world's facts (HW8 run 6: Violet, behind her entry door — fact `entry_door`:
 * "closed, locked from the inside", the deadbolt untouched — answered "It's open.").
 *
 * The never-guess check (spirit_guess_check) reads a line against what the being knows, by model. This is its
 * deterministic first half: when the line asserts a STATE of a thing (open / closed / locked / unlocked / dark / lit)
 * and a fact about that same thing says the opposite, the line is re-voiced once with the fact quoted. Pure.
 *
 * The thing a sentence is about is found by the fact's own subject words (`entry_door` → "entry", "door") appearing in
 * the sentence or in the ask it answers ("…open the door" → "It's open." is about the door). Nothing is listed per
 * world: the words come from the fact.
 */

type State = 'open' | 'closed' | 'locked' | 'unlocked' | 'dark' | 'lit';

const OPPOSES: Record<State, State[]> = {
  open: ['closed', 'locked'],
  closed: ['open'],
  locked: ['unlocked', 'open'],
  unlocked: ['locked'],
  dark: ['lit'],
  lit: ['dark'],
};

/** The states a text asserts, negation read ("not open" → closed, "isn't locked" → unlocked, "unlocked"). Pure. */
export function statesOf(text: string): Set<State> {
  const out = new Set<State>();
  const t = text.toLowerCase();
  const add = (re: RegExp, positive: State, negated: State | null) => {
    for (const m of t.matchAll(re)) {
      const before = t.slice(Math.max(0, (m.index ?? 0) - 14), m.index ?? 0);
      const neg = /\b(?:not|n't|never|no longer|isn't|aren't|wasn't|hasn't|haven't|didn't|don't)\s*(?:yet\s*|been\s*|quite\s*)?$/.test(before);
      if (neg) { if (negated) out.add(negated); } else out.add(positive);
    }
  };
  for (const m of t.matchAll(/\bunlocked\b/g)) { void m; out.add('unlocked'); }
  // "locked" that is not the tail of "unlocked"
  add(/(?<!un)\blocked\b/g, 'locked', 'unlocked');
  add(/\b(?:open|opened|ajar|wide open)\b/g, 'open', 'closed');
  add(/\b(?:closed|shut)\b/g, 'closed', 'open');
  add(/\b(?:dark|unlit)\b/g, 'dark', 'lit');
  add(/\b(?:lit|bright|illuminated)\b/g, 'lit', 'dark');
  return out;
}

/** "It's open." — a sentence with no noun of its own is about what the ask was about. */
const PRONOUN_LED = /^\W*(?:(?:yes|no|well|oh|ok|okay|look)[\s,.!]*)?(?:it|that|this|they)\b/i;
const GENERIC =new Set(['the', 'and', 'for', 'of', 'in', 'on', 'at', 'to', 'a', 'an', 'is', 'room', 'apartment']);

/** The words naming the thing a fact is about: its subject key, split. */
function subjectWords(subjectKey: string): string[] {
  return subjectKey.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 3 && !GENERIC.has(w));
}

export interface FactLine { subjectKey: string; fact: string }
export interface ClaimContradiction { subjectKey: string; fact: string; claimed: State; fact_says: State[] }

/**
 * The first fact the spoken `line` contradicts, or null. `context` is the ask the line answers (and what was just
 * heard): a sentence like "It's open." has no noun of its own. Only facts that themselves assert a state are read. Pure.
 */
export function claimVsFact(line: string, facts: FactLine[], context = ''): ClaimContradiction | null {
  const sentences = line.split(/(?<=[.!?…])\s+/).filter(Boolean);
  for (const sentence of sentences) {
    const claimed = statesOf(sentence);
    if (!claimed.size) continue;
    for (const f of facts) {
      const fs = statesOf(f.fact);
      if (!fs.size) continue;
      const words = subjectWords(f.subjectKey);
      if (!words.length) continue;
      const about = words.some((w) => new RegExp(`\\b${w}`, 'i').test(sentence)) || (PRONOUN_LED.test(sentence) && words.some((w) => new RegExp(`\\b${w}`, 'i').test(context)));
      if (!about) continue;
      for (const c of claimed) {
        if (fs.has(c)) continue;
        const against = OPPOSES[c].filter((o) => fs.has(o));
        if (against.length) return { subjectKey: f.subjectKey, fact: f.fact, claimed: c, fact_says: against };
      }
    }
  }
  return null;
}

/** The hint for the second take: the fact quoted, nothing else decided for her. */
export function factHint(line: string, c: ClaimContradiction): string {
  const thing = c.subjectKey.replace(/[._:-]+/g, ' ').trim();
  return `Your line was: "${line}". But the world holds this true about the ${thing}: ${c.fact}. Answer again as yourself, from what is true: you know the ${thing} is not ${c.claimed}.`;
}
