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

Live this. Think as yourself — half-thoughts, associations, feelings —
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
  /** What the senses allow of this stretch (sensesNoteFor), or null when nothing need be said. */
  sensesNote?: string | null;
  /** The world's facts this stretch touches (HW8 run 6: the voice invented a glass door, a key in hand — the facts were never in its prompt). */
  facts?: string[];
  /** What the being has on it, with what each thing is. */
  held?: string[];
  /** What is written on a thing this stretch has the being read, exactly as written (HW8 run 6). */
  reads?: string;
}

/**
 * A line of every prompt the being reads (HW8 run 6): the quoted words are the speaker's; a name inside them is whoever he
 * addressed — "Kristopher says 'Violet?'" is Kristopher naming her, not her naming him.
 */
export const QUOTED_WORDS_NOTE = "Quoted words are the speaker's own; a name inside them is whoever the speaker is addressing, not the speaker.";

/** The in-world words for the voice: never the table's (beat, stimulus, instruction, scene). */
export const IN_WORLD_NOTE = 'Think and speak only in the words of your own life — what just happened, what you notice, what you do now. Never count knocks, seconds or minutes you were not given a number for. Say nothing about light or dark unless the facts above say how the room is lit. Do not reach for stock images that could fit any scene — say what is specific to this one. A person you remember, or are told to think of, is NOT in front of you unless the facts above say they are in sight.';

export const LISTENING_MAX_TOKENS = 140;

/**
 * What a stretch's senses allow the being to think about it (HW5 2026-10-25: Violet, behind
 * her closed door, thought "He looks like he's waiting" of a man she only heard; Kristopher
 * listened to the Watcher's "He walks back to the door and knocks with frustration" as if
 * watching a stranger). `own` = the Watcher voiced this being's own act or words. Pure.
 */
export function sensesNoteFor(via: string[] | undefined, own: boolean): string | null {
  if (own || via?.includes('self')) {
    return 'This is your OWN doing, told to you as yours: you did this, you said this. Take it as your own act and your own words — what it was like from inside — not as something you watched someone else do.';
  }
  if (!via?.length) return null;
  if (!via.includes('sight') && via.includes('hearing')) {
    return 'This reached you by HEARING only — you saw none of it. Where he stands, what his face or hands do, how he looks: none of that is yours to know. Think only from the sound.';
  }
  if (via.includes('sight') && !via.includes('hearing')) {
    return 'This reached you by SIGHT only — you heard none of it. Any words were not yours to catch; think only from what you saw.';
  }
  return null;
}

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

${args.held?.length ? `What you have on you:\n${args.held.join('\n')}\n\n` : ''}${args.facts?.length ? `What the world holds true about this (check it before you imagine anything — a thing not here or in your memory is not known to you):\n${args.facts.join('\n')}\n\n` : ''}What just reached you:
${args.heard}
${QUOTED_WORDS_NOTE}
${args.reads ? `\nWhat you read, exactly as it is written — the text in your hand; read it as it is, do not guess at it or remember it differently:\n${args.reads}\n` : ''}${args.sensesNote ? `\n${args.sensesNote}\n` : ''}${args.sinceOwn ? `\nTime, as you feel it: it has been ${args.sinceOwn} since you last said or did anything.\n` : ''}
Nobody is waiting on you; things are still unfolding. ${IN_WORLD_NOTE} Take it in. Write
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
export const SPIRIT_REPLAY_HINT = 'You already said that. Say something new, or stay silent.';
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
wrong or lie as yourself, but never fill a gap with a guess. Where words are
written on something you hold, the text in your hand is what it says: read it as
it is written, do not guess at it.`;

export function buildSpiritAnsweringPrompt(args: SpiritAnsweringArgs): string {
  const turn = args.ask.kind === 'spoken'
    ? `You are being spoken to, right now:\n${args.ask.heard}`
    : 'It is down to you now. The others are waiting to see what you do.';
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

What memory gives you, checked against what is happening:
${args.recallBlock || 'Nothing in particular comes to mind.'}

What you have on you:
${args.held?.length ? args.held.join('\n') : 'Nothing is listed; you carry nothing you know of.'}

What the world holds true about this (facts you can act on):
${args.facts?.length ? args.facts.join('\n') : '(none that bear on this)'}

${NEVER_GUESS_BLOCK}
Before you answer about where a thing is, what you have, what you did or what
happened: read what you have on you, what memory gives you and the facts above
first. If it is not there, you do not know it — say so, or check.

${QUOTED_WORDS_NOTE}
${turn}

${IN_WORLD_NOTE} You have already thought it through. Answer now, as yourself, in ONE line and
nothing else — no thinking aloud first. Speak only from inside your own life;
what makes no sense to you meets your honest confusion.
Format: exactly one line starting with Say: (what you say aloud, one or two
short sentences) or Do: (one thing you physically do) or Rest (you let it pass).`;
}

// ── The guess check (HW5 2026-10-25) ──────────────────────────────────────
// The law was in the prompt and the line still filled the gap ("I think I left
// it on the counter" with the cash on her; "I paid you, didn't I?" with his
// voice in her memory saying she had not). One small read of the line against
// what she knows; a guess is re-voiced once with the gap named.

export interface GroundingCheckArgs {
  name: string;
  line: string;
  heard: string[];
  recallBlock?: string;
  held?: string[];
  facts?: string[];
}

export const GROUNDING_CHECK_MAX_TOKENS = 40;

export function buildGroundingCheckPrompt(args: GroundingCheckArgs): string {
  return `You check one spoken line against what the speaker actually knows. The speaker is ${args.name}.

What she has just heard and seen:
${args.heard.length ? args.heard.join('\n') : '(nothing new)'}

What her memory gave her for what is happening:
${args.recallBlock || '(nothing in particular)'}

What she has on her:
${args.held?.length ? args.held.join('\n') : '(nothing listed)'}

What the world holds true:
${args.facts?.length ? args.facts.join('\n') : '(nothing that bears on this)'}

Her line: "${args.line}"

A GUESS is a thing stated as so that nothing above supports, or that the above contradicts:
where an object is, that something happened or was paid or given, what someone said, what
she has or did. Feelings, wishes, intentions ("I was going to"), refusals, questions back,
opinions, and anything the above supports are NOT guesses.
Answer with exactly one line: OK — or — GUESS: <the unsupported claim, in a few words>`;
}

/** Read the check's one line. Anything unreadable counts as OK: the check may never mute her by accident. Pure. */
export function readGroundingVerdict(raw: string): { grounded: boolean; claim?: string } {
  const first = (raw ?? '').split('\n').map((l) => l.trim()).find(Boolean) ?? '';
  const guess = first.match(/^\W*guess\b\W*(.*)$/i);
  if (guess) return { grounded: false, ...(guess[1].trim() ? { claim: guess[1].trim().replace(/[.]+$/, '') } : {}) };
  return { grounded: true };
}

/** The hint for a second take when the first line filled a gap with a guess. */
export function guessHint(line: string, claim?: string): string {
  const what = claim ? `that ${claim}` : 'what your line claimed';
  return `Your line was: "${line}". You do not actually know ${what} — nothing in your memory, your things or the facts says so. Answer again as yourself: say what you DO know, say you don't know, or check (look, feel your pocket, ask). Never fill the gap.`;
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
