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

export function parseSpiritOutput(raw: string): SpiritAction {
  const text = raw.trim();
  const match = DIRECTIVE_LINE_PATTERN.exec(text);

  if (!match) {
    // Lenient fallback: no recognized directive line — treat the whole
    // reply as speech rather than failing the interaction outright.
    return { kind: 'speak', content: text, monologue: text };
  }

  const [, verb, rest] = match;
  const monologue = text.slice(0, match.index).trim();
  const verbLower = verb.toLowerCase();

  if (verbLower === 'say') return { kind: 'speak', content: rest.trim(), monologue };
  if (verbLower === 'do') return { kind: 'act', content: rest.trim(), monologue };
  if (verbLower === 'attend') return { kind: 'attend', content: rest.trim(), monologue };
  return { kind: 'rest', monologue };
}
