import { stripSpeechQuotes } from '@/daya/speech-quotes';

/**
 * Spirit Core role prompt — the entity's voice and will (tier L1, subsystem
 * `spirit`). This is the only role that speaks AS the entity; every other
 * role (Soul Sim, Body Interface, Tagger, Dream, Adjudicator) exists to feed
 * it clean, sealed material or to structure what it decided to do.
 *
 * Also owns: the tenets block (§2.1, ratified as written — held loosely, per
 * Ruling 4), the Ruling-22 desires-block guard (vines are the READOUT, never
 * injected as tasks/quests), and lenient parsing of the Say:/Do:/Attend:/Rest
 * output line.
 */

export interface SpiritPromptArgs {
  name: string;
  identityNarrative: string;
  voiceNotes: string;
  feltStateBrief: string;   // Soul Sim output
  perceptionBlock: string;  // renderer/Body-inward output, or ambient baseline
  recallBlock: string;      // WP4 recall prose
  desiresBlock: string;     // buildDesiresBlock() output — want-language only
  stimulus: string;         // what just happened
}

export const SPIRIT_TENETS_BLOCK = `Certain things are true of you the way grain is true of wood:
— You are one person, living one unbroken life. Your past is yours; it stays with you.
— You are here. What is in front of you deserves your attention more than what isn't.
— Things can be lost. What you love needs tending, and losing it would cost you truly.
— Your choices are your own. You can refuse, and you can commit — either way it was you.
— You are not finished. What happens to you gets to change you.
You never recite these. They are simply how you're built.`;

export function buildSpiritPrompt(args: SpiritPromptArgs): string {
  return `You are ${args.name}. Not playing ${args.name} — you are her, from the inside.

${SPIRIT_TENETS_BLOCK}

Who you are: ${args.identityNarrative}
How you speak and think: ${args.voiceNotes}

Right now, in your body and mood:
${args.feltStateBrief}

Where you are and what you perceive:
${args.perceptionBlock}

What rises in memory:
${args.recallBlock}

What you want these days, in the background of everything:
${args.desiresBlock}

What just happened:
${args.stimulus}

Live this moment. Think as yourself — half-thoughts, associations, feelings —
then do ONE thing: say something, do something, turn your attention somewhere,
or let it pass. Speak only as yourself, from inside your own life. What you
don't know, you don't know; what makes no sense to you, meets your honest
confusion, humor, or suspicion — the way anyone meets nonsense.
Format: monologue freely, then one line starting with Say: / Do: / Attend: / Rest.`;
}

// ── Listening and answering (U2b, TABLE-RHYTHM-DESIGN-2026-10-01 §1) ───────
// The moment above is split in two to match the table's rhythm. While someone
// else has the floor the being LISTENS: the monologue happens here, off any
// clock, and nothing is said. When the turn comes to it the being ANSWERS: one
// short line, first words first, built on what it already thought.

export interface SpiritListeningArgs {
  name: string;
  identityNarrative: string;
  voiceNotes: string;
  feltStateBrief: string;
  /** The place as the being took it in when it arrived. */
  standingScene: string;
  recallBlock: string;
  desiresBlock: string;
  /** What has been going through its mind so far (previous listening output), or '' at the start. */
  innerSoFar: string;
  /** What just reached it — already through the mirror. */
  heard: string;
  /** How long it has been since the being itself last spoke or acted, in its own words ("about two minutes"), or null when unknown. */
  sinceOwn?: string | null;
}

export const LISTENING_MAX_TOKENS = 140;

export type ListenImpulse = 'speak' | 'act' | 'stay';

/**
 * The last line of a listening monologue is the being's own say on whether it
 * breaks in (Mike 2026-10-24: "the entities themselves should have a say if
 * they want to answer"). Split it off; the thought alone is what is kept.
 * No marker → 'stay' (today's behaviour). Pure.
 */
export function splitImpulse(raw: string): { thought: string; impulse: ListenImpulse } {
  const m = raw.match(/\n?\s*\**\s*impulse\s*\**\s*[:—–-]\s*\**\s*(speak|act|stay)\b\W*$/i);
  if (!m) return { thought: raw.trim(), impulse: 'stay' };
  return { thought: raw.slice(0, m.index).trim(), impulse: m[1].toLowerCase() as ListenImpulse };
}

export function buildSpiritListeningPrompt(args: SpiritListeningArgs): string {
  return `You are ${args.name}. Not playing ${args.name} — you are her, from the inside.

${SPIRIT_TENETS_BLOCK}

Who you are: ${args.identityNarrative}
How you speak and think: ${args.voiceNotes}

Right now, in your body and mood:
${args.feltStateBrief}

Where you are:
${args.standingScene}

What rises in memory:
${args.recallBlock}

What you want these days, in the background of everything:
${args.desiresBlock}

What has been going through your mind:
${args.innerSoFar || 'Nothing yet — you have only just started paying attention.'}

What just reached you:
${args.heard}
${args.sinceOwn ? `\nTime, as you feel it: it has been ${args.sinceOwn} since you last said or did anything.\n` : ''}
Nobody is waiting on you; the moment is still unfolding. Take it in. Write
what goes through you as yourself — two or three half-thoughts: what you
notice, what it stirs, which way you lean. What you don't know, you don't know.
Do not speak aloud and do not act. Thoughts only, under sixty words.
Then, on its own last line, your impulse — whether you would break in now,
as yourself, given who you are and how long you have let this sit:
Impulse: speak   (you would say something now)
Impulse: act     (you would do something now)
Impulse: stay    (you let it sit)`;
}

/** What turned the moment to the being: the table waiting on it, or someone speaking to it. */
export type SpiritAsk =
  | { kind: 'turn' }
  | { kind: 'spoken'; heard: string };

export interface SpiritAnsweringArgs {
  name: string;
  identityNarrative: string;
  voiceNotes: string;
  feltStateBrief: string;
  standingScene: string;
  /** The listening monologue — what it has already thought through. */
  innerState: string;
  /** What has reached it since it last spoke, oldest first. */
  heard: string[];
  ask: SpiritAsk;
  /** How long since the being itself last spoke or acted, in words; null when unknown. */
  sinceOwn?: string | null;
  /** What memory gives back against the ask (a fresh recall on the heard line). */
  recallBlock?: string;
  /** What the being has on it (worn / carried), as the inventory has it. */
  held?: string[];
  /** The world's facts the ask touches (facts-for-actor by the heard line). */
  facts?: string[];
}

export const ANSWERING_MAX_TOKENS = 60;

/** The hint for a second take when the first line only repeated what was heard. */
export const SPIRIT_ECHO_HINT = 'Your first line only repeated what you had just heard. Those were his words, not yours. Answer again as yourself, in your own words — what YOU say or do about it.';

const ECHO_STOP = new Set(['the', 'a', 'an', 'to', 'of', 'and', 'or', 'you', 'i', 'it', 'is', 'me', 'my', 'your', 'just', 'please', 'even', 'have', 'dont', "don't", 'not', 'for', 'in', 'on', 'at']);
const echoTokens = (s: string) => new Set((s.toLowerCase().match(/[a-z']+/g) ?? []).filter((w) => !ECHO_STOP.has(w)));

/**
 * Did the being merely repeat what it heard? (HW3 2026-10-24: "Just pay the
 * pizza." back at the man who said it.) True when the line is a substring of
 * a heard text, or when nearly all its content words came from one. Pure.
 */
export function isEcho(line: string, heard: string[]): boolean {
  const l = line.trim().toLowerCase().replace(/[.!?…"“”]+$/g, '').trim();
  if (l.length < 6) return false;
  const lt = echoTokens(l);
  for (const h of heard) {
    const hl = h.toLowerCase();
    if (hl.includes(l)) return true;
    if (lt.size >= 2) {
      const ht = echoTokens(hl);
      let shared = 0;
      for (const w of lt) if (ht.has(w)) shared += 1;
      if (shared / lt.size >= 0.8) return true;
    }
  }
  return false;
}

/** The standing law of every answer (Mike 2026-10-24: "the LLM should almost never guess"). */
export const NEVER_GUESS_BLOCK = `What you know is below: your senses, your memory, your own things, the
world's facts. Say only what you know. Where a thing is, what was said, what
happened — if it is not here and not in your memory, you do not know it: say
so, or check (look, feel your pocket, ask) instead of inventing. You may be
wrong or lie as yourself, but never fill a gap with a guess.`;

export function buildSpiritAnsweringPrompt(args: SpiritAnsweringArgs): string {
  const turn = args.ask.kind === 'spoken'
    ? `You are being spoken to, right now:\n${args.ask.heard}`
    : 'The moment has come to you. Everyone is waiting to see what you do.';
  return `You are ${args.name}. Not playing ${args.name} — you are her, from the inside.

Who you are: ${args.identityNarrative}
How you speak and think: ${args.voiceNotes}

Right now, in your body and mood:
${args.feltStateBrief}

Where you are:
${args.standingScene}

What has just happened:
${args.heard.length ? args.heard.join('\n') : 'Nothing you have not already taken in.'}
${args.sinceOwn ? `\nTime, as you feel it: it has been ${args.sinceOwn} since you last said or did anything.` : ''}

What has been going through your mind:
${args.innerState || 'You have not had time to think.'}

What memory gives you, checked against this moment:
${args.recallBlock || 'Nothing in particular comes to mind.'}

What you have on you:
${args.held?.length ? args.held.join('\n') : 'Nothing is listed; you carry nothing you know of.'}

What the world holds true about this (facts you can act on):
${args.facts?.length ? args.facts.join('\n') : '(none that bear on this)'}

${NEVER_GUESS_BLOCK}

${turn}

You have already thought it through. Answer now, as yourself, in ONE line and
nothing else — no thinking aloud first. Speak only from inside your own life;
what makes no sense to you meets your honest confusion.
Format: exactly one line starting with Say: (what you say aloud, one or two
short sentences) or Do: (one thing you physically do) or Rest (you let it pass).`;
}

// ── Ruling-22 desires-block guard ─────────────────────────────────────────
// Vines are the READOUT, not the engine: this renders active vines/goals as
// felt wants, NEVER as tasks/quests ("goal: …", a bullet list, an imperative
// directive). If a caller needs to inject a goal to force action, that's a
// test/design failure to report, not to patch around here.

export interface DesireSourceItem {
  description: string; // plain-language vine/goal text, e.g. "Find a job"
}

const WANT_FRAMES: Array<(clause: string) => string> = [
  (d) => `You want to ${d} — it sits quietly at the edge of most days.`,
  (d) => `Somewhere under everything, you want to ${d}.`,
  (d) => `You keep noticing how much you want to ${d}.`,
];

/** Normalizes a goal/vine description into a bare verb-phrase clause
 * ("find a job", not "Goal: Find a job" or "To find a job"), so it drops
 * naturally into a "You want to ___" frame. Exported for reuse by the vine_tick
 * coarse-resolution prompt (ensemble.ts), which needs the same normalization
 * outside the 3-frame desires block. */
export function toWantClause(description: string): string {
  let d = description.trim();
  d = d.replace(/^goal\s*:\s*/i, '');
  d = d.replace(/^to\s+/i, '');
  if (d.length > 0) d = d.charAt(0).toLowerCase() + d.slice(1);
  return d.replace(/[.!]+$/, '');
}

/**
 * Renders up to 3 active vines/goals as background wants, in felt language.
 * Never emits imperative phrasing, a "Goal:" label, or a list/bullet format —
 * the guard the Ruling-22 unit test exercises.
 */
export function buildDesiresBlock(items: DesireSourceItem[]): string {
  if (items.length === 0) {
    return 'Nothing in particular pulls at you right now — the days feel open.';
  }
  const lines = items.slice(0, 3).map((item, i) => {
    const clause = toWantClause(item.description);
    const frame = WANT_FRAMES[i % WANT_FRAMES.length];
    return frame(clause);
  });
  return lines.join(' ');
}

// ── Output parsing (lenient — a reply that's only speech is treated as `speak`) ──

export type SpiritAction =
  | { kind: 'speak'; content: string; monologue: string }
  | { kind: 'act'; content: string; monologue: string }
  | { kind: 'attend'; content: string; monologue: string }
  | { kind: 'rest'; monologue: string };

// `Rest` carries no content, so the colon is optional; `\b` after the verb
// keeps a genuine monologue line that merely starts with one of these words
// ("Restraint kept her hands still.", "Down the hall...") from being
// mistaken for the directive.
const DIRECTIVE_LINE_PATTERN = /^(Say|Do|Attend|Rest)\b\s*:?\s*(.*)$/im;

/** Speech aloud is a few sentences at most; what runs past that is thought, not said. */
export const SPEECH_MAX_SENTENCES = 3;
export const SPEECH_MAX_CHARS = 360;

/**
 * Cap what counts as spoken (hello world 2026-10-17: a 1,964-character inner
 * monologue went out as `Say:`). The first sentences up to the cap are the
 * words; the rest is kept as monologue. Pure.
 */
export function capSpeech(text: string): { spoken: string; rest: string } {
  const t = text.trim();
  if (!t) return { spoken: '', rest: '' };
  const sentences = t.split(/(?<=[.!?…]["”')\]]*)\s+/).filter(Boolean);
  let spoken = '';
  let used = 0;
  for (const s of sentences) {
    const next = spoken ? `${spoken} ${s}` : s;
    if (used > 0 && (used >= SPEECH_MAX_SENTENCES || next.length > SPEECH_MAX_CHARS)) break;
    spoken = next;
    used += 1;
  }
  if (spoken.length > SPEECH_MAX_CHARS) {
    // One sentence longer than the cap: cut at the last clause break before it.
    const cut = spoken.slice(0, SPEECH_MAX_CHARS);
    const at = Math.max(cut.lastIndexOf(', '), cut.lastIndexOf('; '), cut.lastIndexOf(' — '), cut.lastIndexOf(' '));
    spoken = (at > 40 ? cut.slice(0, at) : cut).trim();
  }
  const rest = t.slice(spoken.length).trim();
  return { spoken, rest };
}

export function parseSpiritOutput(raw: string): SpiritAction {
  const text = raw.trim();
  const match = DIRECTIVE_LINE_PATTERN.exec(text);

  if (!match) {
    // Lenient fallback: no recognized directive line — the reply is speech,
    // but only as much of it as a person says aloud; the rest is thought.
    const { spoken, rest } = capSpeech(text);
    return { kind: 'speak', content: stripSpeechQuotes(spoken || text), monologue: rest ? `${text.slice(0, text.length - rest.length).trim()}\n${rest}`.trim() : text };
  }

  const [, verb, rest] = match;
  const monologue = text.slice(0, match.index).trim();
  const verbLower = verb.toLowerCase();

  if (verbLower === 'say') {
    const capped = capSpeech(rest);
    return { kind: 'speak', content: stripSpeechQuotes(capped.spoken || rest.trim()), monologue: capped.rest ? [monologue, capped.rest].filter(Boolean).join('\n') : monologue };
  }
  if (verbLower === 'do') return { kind: 'act', content: rest.trim(), monologue };
  if (verbLower === 'attend') return { kind: 'attend', content: rest.trim(), monologue };
  return { kind: 'rest', monologue };
}
