/**
 * The PLAYER role (Claude; ruled by Michael 2026-10-30): the mind behind the
 * character, the one a human brings to a table. The character feels and
 * speaks, sealed from numbers. The player reads the sheet raw — pools, levels,
 * conditions, the die — knows the rules, keeps the scene moving, and makes the
 * decisions a player makes: follow the routine or hold it, push on or rest,
 * how much Effort to spend. It never speaks in the character's voice.
 *
 * Tier L1, subsystem `player`. The one role beside the Soul Sim that SEES
 * numbers; unlike the Soul Sim its output never reaches the character — it
 * reaches the engine (a decision) and the Watcher (a reason on the record).
 */
import type { GrowthCharacter } from '@/types/growth';

export const PLAYER_MAX_TOKENS = 90;

/** The nine attributes in sheet order, and the condition canon names for a pool at zero (GROWTH-DESIGN-TRUTH §2). */
const ATTRS: Array<[key: string, label: string, condition: string]> = [
  ['clout', 'Clout', 'Weak'], ['celerity', 'Celerity', 'Clumsy'], ['constitution', 'Constitution', 'Exhausted'],
  ['flow', 'Flow', 'Deafened'], ['frequency', 'Frequency', "Death's Door"], ['focus', 'Focus', 'Muted'],
  ['willpower', 'Willpower', 'Overwhelmed'], ['wisdom', 'Wisdom', 'Confused'], ['wit', 'Wit', 'Incoherent'],
];

/** The sheet as a player reads it: numbers, plainly. Pure. */
export function sheetReadout(sheet: Partial<GrowthCharacter> | null | undefined): { lines: string[]; conditions: string[]; fateDie: string | null } {
  const attrs = (sheet?.attributes ?? {}) as Record<string, { level?: number; current?: number; augmentPositive?: number; augmentNegative?: number } | undefined>;
  const lines: string[] = [];
  const conditions: string[] = [];
  for (const [key, label, condition] of ATTRS) {
    const a = attrs[key];
    if (!a || typeof a.level !== 'number') continue;
    const max = key === 'frequency' ? a.level : a.level + (a.augmentPositive ?? 0) - (a.augmentNegative ?? 0);
    const cur = typeof a.current === 'number' ? a.current : max;
    lines.push(`${label} ${cur}/${max}`);
    if (cur <= 0) conditions.push(condition);
  }
  const fateDie = (sheet as { creation?: { seed?: { baseFateDie?: string } } } | null | undefined)?.creation?.seed?.baseFateDie ?? null;
  return { lines, conditions, fateDie };
}

export interface PlayerPromptArgs {
  name: string;
  sheetLines: string[];
  conditions: string[];
  fateDie: string | null;
  /** The routine and the step its hands know next. */
  routine: { name: string; step: string; because: string[]; ends: string[] };
  /** What the character thought this beat and where it leaned. */
  thought: string;
  impulse: 'speak' | 'act' | 'stay';
  stayReason?: string | null;
  /** The memory that rose against it, with its charge — null when nothing did. */
  resistance: { content: string; arousal: number } | null;
  /** What just reached the character (the Watcher's line, through its senses). */
  heard: string;
  sinceOwn?: string | null;
  /** Someone is speaking to the character this beat. */
  addressed?: boolean;
}

export function buildPlayerPrompt(a: PlayerPromptArgs): string {
  const sheet = a.sheetLines.length ? a.sheetLines.join(', ') : '(no sheet)';
  const cond = a.conditions.length ? `Conditions: ${a.conditions.join(', ')}.` : 'No conditions.';
  return `You are the PLAYER seated behind ${a.name} at the table — not ${a.name}. ${a.name} feels; you read the sheet and the room, know how the game goes, and keep the scene moving the way a player does when the character hesitates. You never speak in ${a.name}'s voice.

The sheet, as it stands: ${sheet}. Fate die ${a.fateDie ?? 'unknown'}. ${cond}
A pool at zero is a condition; Effort spent on a roll comes out of a pool; a drained pool does not come back tonight.

The routine of ${a.name}'s days that this moment called up: "${a.routine.name}".
What it is for: ${a.routine.ends.join('; ')}.
What the hands know to do next: ${a.routine.step}.
Why that step: ${a.routine.because.join('; ')}.

What just reached ${a.name}: ${a.heard || '(nothing new)'}
${a.sinceOwn ? `It has been ${a.sinceOwn} since ${a.name} last said or did anything.\n` : ''}What ${a.name} thought just now: ${a.thought || '(nothing)'}
Where ${a.name} leaned: ${a.impulse}${a.stayReason ? ` — "${a.stayReason}"` : ''}.
${a.resistance ? `What rose against it: "${a.resistance.content.slice(0, 220)}" (charge ${a.resistance.arousal.toFixed(2)} of 1).` : 'Nothing rose against it.'}

The routine runs by default: a person does what their hands know without deciding it. You HOLD it only for a reason you could point to at the table — a fact of the room, a memory that stands in the way, a pool that cannot afford it${a.addressed ? `, or someone speaking to ${a.name} right now while the step would end the exchange (shutting a door, walking off): that is worth one beat of holding unless ${a.name} means to end it` : ''}. You BREAK it when ${a.name} would do something else INSTEAD, now, that moves the scene (speak through the door, go to the window) — not to do nothing. Nobody at a table waits a whole beat on a character doing nothing for no reason.

Answer with one line of JSON and nothing else:
{"decision":"follow"|"hold"|"break","reason":"<a few words, in plain terms the table can check>"}`;
}

export interface PlayerDecision {
  decision: 'follow' | 'hold' | 'break';
  reason: string;
}

/** Read the player's line. Anything unreadable is FOLLOW: the routine is the default, and a dead lane never freezes a being. Pure. */
export function readPlayerDecision(raw: string): PlayerDecision {
  const text = (raw ?? '').trim();
  const m = text.match(/"decision"\s*:\s*"(follow|hold|break)"/i);
  const r = text.match(/"reason"\s*:\s*"((?:[^"\\]|\\.)*)"/i);
  const reason = r ? r[1].replace(/\\"/g, '"').trim().slice(0, 200) : '';
  if (!m) {
    const bare = text.match(/\b(follow|hold|break)\b/i);
    return { decision: (bare?.[1].toLowerCase() as PlayerDecision['decision']) ?? 'follow', reason };
  }
  return { decision: m[1].toLowerCase() as PlayerDecision['decision'], reason };
}
