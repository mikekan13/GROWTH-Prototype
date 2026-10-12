/**
 * The genesis SEED screen (2026-10-12, after Violet's run 2 lost her appearance
 * and backstory opening to a silent minor-sexual block).
 *
 * Two guards, one home:
 *
 *   1. PRE-SUBMIT: before a genesis session opens (no money spent), run the
 *      real plan through the same screens the wall will: the tone filter's
 *      screen per chunk, and the lawfulness screen. Each hit comes back as
 *      the SENTENCE around it (ellipsised) + its category, so the GM can
 *      Edit or Submit anyway.
 *   2. DURING THE RUN: when the tone filter withholds/tones any chunk of a
 *      JEWL_WORK_CYCLE prompt carrying the plan, log `[genesis] seed-withheld`
 *      and add a fixed-format progress note the overlay turns into a feed
 *      line ("⚠ part of the seed was withheld from JEWL: <category>").
 *      Never silent again.
 *
 * The note format is fixed vocabulary only (tone categories + outcome), so it
 * is safe in the process-only progress payload.
 */
import 'server-only';
import { chunk, explainScreen, onToneWithheld, type WithheldEvent } from '@/ai/network/tone-filter';
import { localLane } from '@/ai/network/config';
import { screenText } from '@/services/lawfulness';
import { formatSeedWithheldNote } from '@/lib/genesis-seed-notes';

// ── Pre-submit ────────────────────────────────────────────────────────────

export type SeedOutcome = 'blocked' | 'withheld' | 'toned';

export interface SeedScreenFinding {
  screen: 'tone' | 'lawfulness';
  category: string;
  /** blocked = never crosses; withheld = a placeholder crosses; toned = rewritten clinically, facts kept. */
  outcome: SeedOutcome;
  /** The sentence around the hit, ellipsised. Shown to the GM who wrote it — never logged. */
  passage: string;
}

export interface SeedScreenResult {
  /** True when nothing would be blocked or withheld (toned passages are info only). */
  clear: boolean;
  findings: SeedScreenFinding[];
  chunks: number;
}

const PASSAGE_MAX = 240;

/** The sentence holding `index`, ellipsised to PASSAGE_MAX around the hit. */
export function sentenceAround(text: string, index: number): string {
  let start = 0;
  const before = text.slice(0, index);
  const breakRe = /[.!?]["'”’)\]]*\s+|\n+/g;
  for (const m of before.matchAll(breakRe)) start = (m.index ?? 0) + m[0].length;
  breakRe.lastIndex = 0;
  const after = breakRe.exec(text.slice(index));
  const end = after ? index + (after.index ?? 0) + after[0].trimEnd().length : text.length;
  let s = text.slice(start, end).trim();
  if (s.length <= PASSAGE_MAX) return s;
  const rel = index - start;
  const from = Math.max(0, rel - 100);
  const to = Math.min(s.length, from + PASSAGE_MAX);
  s = `${from > 0 ? '…' : ''}${s.slice(from, to).trim()}${to < s.length ? '…' : ''}`;
  return s;
}

/** Sentence spans with offsets (breaks on terminal punctuation or newlines). */
function sentences(text: string): Array<{ start: number; text: string }> {
  const out: Array<{ start: number; text: string }> = [];
  const re = /[^.!?\n]+(?:[.!?]+["'”’)\]]*)?/g;
  for (const m of text.matchAll(re)) {
    if (m[0].trim()) out.push({ start: m.index ?? 0, text: m[0] });
  }
  return out;
}

/**
 * Screen an assembled genesis plan exactly as the wall would. Pure apart from
 * reading whether a local lane is configured (no lane → a toned chunk would be
 * withheld instead).
 */
export function screenGenesisPlan(plan: string, opts: { participantAges?: number[] } = {}): SeedScreenResult {
  const findings: SeedScreenFinding[] = [];
  const seen = new Set<string>();
  const add = (f: SeedScreenFinding) => {
    const key = `${f.screen}|${f.category}|${f.passage}`;
    if (!seen.has(key)) { seen.add(key); findings.push(f); }
  };

  // Tone filter — per chunk, as filterAsync does.
  const chunks = chunk(plan);
  const lane = !!localLane();
  let offset = 0;
  for (const c of chunks) {
    const hits = explainScreen(c);
    const minor = hits.some((h) => h.category === 'minor-sexual');
    for (const h of hits) {
      // A minor-sexual chunk is blocked whole; report its local pairs, not every cue in it.
      if (minor && h.category !== 'minor-sexual') continue;
      add({
        screen: 'tone',
        category: h.category,
        outcome: h.category === 'minor-sexual' ? 'blocked' : lane ? 'toned' : 'withheld',
        passage: sentenceAround(plan, offset + h.index),
      });
    }
    offset += c.length;
  }

  // Lawfulness — whole plan, then locate by sentence (and adjacent pairs).
  const ctx = { participantAges: opts.participantAges };
  const whole = screenText(plan, ctx);
  if (whole.verdict === 'block') {
    const sents = sentences(plan);
    let located = false;
    for (let i = 0; i < sents.length; i++) {
      const one = screenText(sents[i].text, ctx);
      const pair = !one.flags.length && i + 1 < sents.length
        ? screenText(plan.slice(sents[i].start, sents[i + 1].start + sents[i + 1].text.length), ctx)
        : null;
      const r = one.flags.length ? one : pair;
      if (!r || !r.flags.length) continue;
      located = true;
      for (const flag of r.flags) {
        add({ screen: 'lawfulness', category: flag, outcome: 'blocked', passage: sentenceAround(plan, sents[i].start + (sents[i].text.length - sents[i].text.trimStart().length)) });
      }
    }
    if (!located) {
      for (const flag of whole.flags) add({ screen: 'lawfulness', category: flag, outcome: 'blocked', passage: '(spread across the seed)' });
    }
  }

  return { clear: findings.every((f) => f.outcome === 'toned'), findings, chunks: chunks.length };
}

// ── During the run: the seed-withheld warning ───────────────────────────────

// The fixed-format note helpers are pure (lib/genesis-seed-notes) so the
// progress payload can read them without pulling in the screens.
export { SEED_WITHHELD_PREFIX, formatSeedWithheldNote, parseSeedWithheldNotes } from '@/lib/genesis-seed-notes';

/**
 * Watch the tone filter for withholds on ONE genesis session's prompt (the
 * dispatch tags its prompt with toneRef {DayaWorkSession, id}). Call before
 * the dispatch; `stop()` after returns what hit it.
 */
export function watchSeedWithheld(sessionId: string): { stop: () => WithheldEvent[] } {
  const events: WithheldEvent[] = [];
  const off = onToneWithheld((e) => {
    if (e.ref?.table === 'DayaWorkSession' && e.ref.id === sessionId) events.push(e);
  });
  return { stop: () => { off(); return events; } };
}

/**
 * After a cycle: log + note each distinct (categories, outcome) once per
 * session. `existingNotes` = the session's progress notes (dedupe across
 * cycles). Returns the notes to append.
 */
export function seedWithheldNotes(sessionId: string, events: WithheldEvent[], existingNotes: string[]): string[] {
  const have = new Set(existingNotes);
  const fresh: string[] = [];
  for (const e of events) {
    const note = formatSeedWithheldNote(e.categories, e.outcome);
    console.warn(`[genesis] seed-withheld session=${sessionId} chunk=${e.chunk}/${e.total} categories=${e.categories.join('+')} outcome=${e.outcome}`);
    if (!have.has(note)) { have.add(note); fresh.push(note); }
  }
  return fresh;
}
