/**
 * The ambient classifier's wire format — prompt + parser, pure.
 *
 * The classifier runs on the LOCAL lane (Mike 2026-10-12: the local model is
 * the gatekeeper; the in-character vs table-talk split is never done by
 * Claude). One call does two jobs for the 27B (enable_thinking off, 32k):
 *   1. a per-utterance split of the raw mic lines: IC (fiction) or OOC
 *      (table talk), with the in-character words pulled out of a mixed line;
 *   2. the engage verdict silent | react | act | proact on the latest line.
 *
 * The format is plain lines (no JSON mode), and the parser is safe by
 * default: anything it cannot read is OOC and the verdict is silent.
 */

export type Verdict = 'silent' | 'react' | 'act' | 'proact';

export interface WindowLine {
  /** 1-based number shown to the model. */
  n: number;
  who: string;
  /** HH:MM:SS */
  ts: string;
  text: string;
  /** True for a raw mic line the model must split. */
  split: boolean;
}

export interface SplitResult {
  kind: 'ic' | 'ooc';
  /** In-character words; set only for kind 'ic'. */
  icText?: string;
}

export interface ClassifierReading {
  verdict: Verdict;
  reasoning: string;
  /** Keyed by WindowLine.n — every split line is present (default OOC). */
  split: Map<number, SplitResult>;
  /** False when the output had no VERDICT line (the safe fallback ran). */
  parsed: boolean;
}

export const CLASSIFIER_SYSTEM = [
  'You listen to a live tabletop roleplaying game for its copilot, JEWL.',
  'You get numbered lines. Lines tagged SPLIT are raw microphone transcript from the table.',
  '',
  'JOB 1. For EVERY SPLIT line decide:',
  '  IC  = in the fiction: narration, a character speaking or acting, moves in the story world.',
  '  OOC = table talk: the real people as themselves (breaks, food, rules lookups, mic checks,',
  '        real-life chat, scheduling, jokes about the game as a game).',
  '  A line that mixes both is IC, followed by a colon and ONLY its in-character words.',
  '',
  'JOB 2. Decide if JEWL should engage now, judging the LAST line:',
  '  silent - noise, a transcription hallucination ("Thank you.", "Bye.", "you", "music"),',
  '           table talk, or a [ui] line that is not a real pattern of someone stuck.',
  '  react  - real speech with content after JEWL\'s last reply. The default for real speech.',
  '  act    - clearly asks for a game action (apply damage, advance the clock, create something,',
  '           voice an NPC, move a character).',
  '  proact - long silence after an unresolved beat, or [ui] lines showing someone stuck',
  '           (3+ surface switches in ~2 minutes, opening and closing the same thing).',
  '  JEWL\'s own earlier replies are context, never a reason for silent. A follow-up to JEWL',
  '  (it asked "who?" and the next line gives a name) is always react or act.',
  '',
  'Answer in EXACTLY this format and nothing else:',
  'VERDICT: <silent|react|act|proact>: <a few words why>',
  '#<n> IC',
  '#<n> OOC',
  '#<n> IC: <in-character words only>',
  'One #<n> line per SPLIT line.',
].join('\n');

export function buildClassifierUser(lines: WindowLine[]): string {
  return [
    'Recent activity (last ~90s):',
    ...lines.map((l) => `${l.n}. [${l.ts}] ${l.split ? 'SPLIT ' : ''}${l.who}: ${l.text}`),
    '',
    'Answer now.',
  ].join('\n');
}

const VERDICT_RE = /^\s*\**\s*verdict\s*\**\s*[:=-]\s*\**\s*(silent|react|act|proact)\b\s*\**\s*(?::\s*(.*))?$/i;
const SPLIT_RE = /^\s*[-*]?\s*#?\s*(\d+)\s*[.):-]?\s*(IC|OOC)\b\s*(?::\s*(.*))?$/i;

/** Read the model's answer. Unparseable → verdict silent, every split line OOC. */
export function parseClassifierOutput(text: string, splitNs: number[]): ClassifierReading {
  const split = new Map<number, SplitResult>(splitNs.map((n) => [n, { kind: 'ooc' }]));
  const cleaned = (text ?? '').replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/```[a-z]*\n?/gi, '');
  let verdict: Verdict | null = null;
  let reasoning = '';
  for (const raw of cleaned.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const v = verdict === null ? line.match(VERDICT_RE) : null;
    if (v) {
      verdict = v[1].toLowerCase() as Verdict;
      reasoning = (v[2] ?? '').trim().slice(0, 200);
      continue;
    }
    const s = line.match(SPLIT_RE);
    if (!s) continue;
    const n = Number(s[1]);
    if (!split.has(n)) continue;
    if (s[2].toUpperCase() === 'OOC') { split.set(n, { kind: 'ooc' }); continue; }
    const ic = (s[3] ?? '').trim().replace(/^["“]|["”]$/g, '').trim();
    split.set(n, { kind: 'ic', ...(ic ? { icText: ic } : {}) });
  }
  if (verdict === null) {
    return { verdict: 'silent', reasoning: 'unparseable local output', split: new Map(splitNs.map((n) => [n, { kind: 'ooc' }])), parsed: false };
  }
  return { verdict, reasoning, split, parsed: true };
}
