/**
 * The voice filter (HW8 run 6, Mike's "voice filter"): a deterministic pass over a being's own words — its listening
 * monologue and its spoken / acted answer — before anything downstream (the scene builder, the feed) sees them.
 *
 * What it removes is never WORLD content (no per-item text, no keyword lists about the story). It removes the model's
 * own tics:
 *   - TABLE VOCABULARY in the being's mouth ("the next beat", "the stimulus", "instruction from the quiet") — words of
 *     our prompts, not of its life;
 *   - STOCK IMAGES both heads share ("a held breath", "pressing against my eardrums", "dust motes", "statue", "the hum
 *     in the teeth", "the weight of the air") — dropped when the being used the image in its last three thoughts, and
 *     always once it has appeared twice in its history;
 *   - COUNTING nobody gave it ("Two knocks. Not three.", "Thirty seconds. I count them like a metronome") unless the
 *     stretch it heard counted them;
 *   - LIGHT and DARK where the room has no light fact ("The dark is absolute");
 *   - a sentence it already thought, verbatim (the replay), against its last three thoughts.
 *
 * A sentence is the unit; the rest of the text stands exactly as the being wrote it. Pure.
 */
import { splitSentences } from '@/services/table-prose';

export interface VoiceFilterContext {
  /** The being's last thoughts / monologues, newest first (the first three are "recent"; all of them are "history"). */
  prior?: string[];
  /** What reached the being this stretch (so a count the stretch itself made is not stripped). */
  heard?: string;
  /** Does any fact give the being's room a light state (a lamp, a bulb, a switch, lit / dark)? Unknown = true (never strip on a guess). */
  hasLightFact?: boolean;
  /** 'vocab' = only the table's words (a being's DOING: "knocks three times" is not a count). Default 'all'. */
  rules?: 'all' | 'vocab';
}

export interface DroppedSentence { sentence: string; why: string }

// ── Table vocabulary ──────────────────────────────────────────────────────────
// Our prompt words. "heartbeat" and "beat of my heart" are not these; a plain "a beat" (a pause) is a novel's idiom and stays.
const TABLE_VOCAB: Array<[RegExp, string]> = [
  [/\b(?:the|next|this|last|each|every|another|my)\s+beat\b(?!\s+of\b)/i, 'beat'],
  [/\bstimul(?:us|i)\b/i, 'stimulus'],
  [/\b(?:instructions?|directions?|cues?|prompts?)\s+from\s+the\s+(?:quiet|narrator|watcher|table|dark)\b/i, 'instruction from the quiet'],
  [/\bnext\s+(?:instruction|cue|prompt)\b/i, 'next instruction'],
  [/\bnarrator\b/i, 'narrator'],
  [/\b(?:the|this|next|new|a)\s+scene\b/i, 'scene'],
  [/\bwait(?:s|ing)?\s+(?:on|for)\s+the\s+table\b|\bthe\s+table\s+(?:waits|is\s+waiting|goes\s+quiet|falls\s+silent)\b/i, 'the table'],
  [/\bthe\s+(?:game\s+master|GM|watcher)\b/i, 'the game master'],
];

// ── Stock images ──────────────────────────────────────────────────────────────
const STOCK_IMAGES: Array<{ key: string; re: RegExp }> = [
  { key: 'held breath', re: /\b(?:held\s+breath|breath\s+(?:held|caught)|hold(?:ing)?\s+(?:my|a|the)\s+breath|hold(?:ing)?\s+(?:her|his)\s+breath)\b/i },
  { key: 'eardrums', re: /\beardrums?\b/i },
  { key: 'dust motes', re: /\bdust\s+motes?\b|\bmotes?\s+of\s+dust\b/i },
  { key: 'statue', re: /\bstatues?\b/i },
  { key: 'hum in the teeth', re: /\bhum\b[^.!?]{0,40}\bteeth\b|\bteeth\b[^.!?]{0,40}\bhum\b/i },
  { key: 'vibration frequency', re: /\bvibrat\w*\b[^.!?]{0,60}\bfrequenc\w*\b|\bfrequenc\w*\b[^.!?]{0,60}\bvibrat\w*\b|\bdifferent\s+frequency\b/i },
  { key: 'weight of the air', re: /\bweight\s+of\s+the\s+air\b|\bair\s+(?:feels\s+)?(?:thick|heavy)\s+with\b/i },
];

/** The stock image a sentence uses, if any (its key). Pure. */
export function stockImageOf(sentence: string): string | null {
  return STOCK_IMAGES.find((i) => i.re.test(sentence))?.key ?? null;
}
const countImage = (key: string, texts: string[]): number => {
  const img = STOCK_IMAGES.find((i) => i.key === key);
  if (!img) return 0;
  return texts.reduce((n, t) => n + splitSentences(t).filter((s) => img.re.test(s)).length, 0);
};

// ── Counting ──────────────────────────────────────────────────────────────────
const NUMBER = '(?:one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|fifteen|twenty|thirty|forty|fifty|sixty|\\d+)';
const COUNTED = '(?:knocks?|raps?|taps?|seconds?|minutes?|heartbeats?|breaths?|steps?|times|footsteps?)';
const COUNT_RE = new RegExp(`\\b${NUMBER}\\s+(?:more\\s+)?${COUNTED}\\b|\\bnot\\s+${NUMBER}\\b|\\b(?:first|second|third|fourth|fifth)\\s+(?:knock|rap|tap)\\b|\\bI(?:'m|\\s+am)?\\s+count(?:ing)?\\b|\\bcount(?:ing)?\\s+(?:them|the\\s+(?:seconds|knocks|minutes))\\b`, 'i');

/** Did the stretch itself count this (the same phrase, or a number of the same unit — "30 seconds" licenses "Thirty seconds")? */
function countedIn(phrase: string, heard: string): boolean {
  if (!heard) return false;
  if (new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(heard)) return true;
  const unit = phrase.trim().split(/\s+/).pop()?.replace(/s$/i, '') ?? '';
  if (!unit || !new RegExp(`\\b${COUNTED}\\b`, 'i').test(phrase)) return false;
  return new RegExp(`\\b${NUMBER}\\s+(?:more\\s+)?${unit}`, 'i').test(heard);
}

// ── Light and dark ────────────────────────────────────────────────────────────
const LIGHT_RE = /\b(?:dark(?:ness)?|dim(?:ly)?|gloom\w*|pitch[-\s]black|moonlight|sunlight|daylight|twilight|dusk|lamp-?light|candle-?light|bulbs?|lit\b|unlit|illuminat\w*|flicker\w*|glow(?:s|ing)?)\b/i;
const LIGHT_FACT_RE = /\b(?:lights?|lamps?|bulbs?|switch|lit|unlit|dark|dim|candles?|window|curtains?|blinds?|sunlight|moonlight)\b/i;

/** Does any fact line speak of the room's light? Pure. */
export function hasLightFact(factLines: string[]): boolean {
  return factLines.some((l) => LIGHT_FACT_RE.test(l));
}

// ── Verbatim repeats ──────────────────────────────────────────────────────────
const norm = (s: string) => s.toLowerCase().replace(/[*_`]/g, '').replace(/[“”]/g, '"').replace(/[‘’]/g, "'").replace(/\s+/g, ' ').replace(/[\s.!?…"')\]]+$/u, '').replace(/^["'(\[]+/, '').trim();

/**
 * Filter a being's own words. Returns the text without the sentences the rules drop, and what was dropped (for the log).
 * An empty `text` means every sentence went.
 */
export function filterVoice(text: string, ctx: VoiceFilterContext = {}): { text: string; dropped: DroppedSentence[] } {
  const dropped: DroppedSentence[] = [];
  const prior = ctx.prior ?? [];
  const recent = prior.slice(0, 3);
  const heard = ctx.heard ?? '';
  const seenBefore = new Set(recent.flatMap((p) => splitSentences(p).map(norm)).filter(Boolean));
  const usedNow = new Set<string>();
  const kept: string[] = [];
  for (const sentence of splitSentences(text)) {
    const drop = (why: string) => { dropped.push({ sentence, why }); };
    const vocab = TABLE_VOCAB.find(([re]) => re.test(sentence));
    if (vocab) { drop(`table vocabulary: ${vocab[1]}`); continue; }
    if (ctx.rules === 'vocab') { kept.push(sentence); continue; }
    if (seenBefore.has(norm(sentence))) { drop('repeat of a recent thought'); continue; }
    const image = stockImageOf(sentence);
    if (image) {
      if (countImage(image, recent) > 0) { drop(`stock image used in the last three thoughts: ${image}`); continue; }
      if (countImage(image, prior) >= 2) { drop(`stock image already used twice: ${image}`); continue; }
      if (usedNow.has(image)) { drop(`stock image twice in one go: ${image}`); continue; }
      usedNow.add(image);
    }
    const count = sentence.match(COUNT_RE);
    if (count && !countedIn(count[0], heard)) { drop(`counting: ${count[0]}`); continue; }
    if (ctx.hasLightFact === false && LIGHT_RE.test(sentence) && !LIGHT_RE.test(heard)) { drop('light or dark with no light fact for the room'); continue; }
    kept.push(sentence);
  }
  return { text: kept.join(' ').trim(), dropped };
}

/** The log line for what a pass dropped, or null when nothing went. */
export function droppedLog(name: string, kind: string, dropped: DroppedSentence[]): string | null {
  if (!dropped.length) return null;
  return `[daya/voice-filter] ${name} ${kind}: dropped ${dropped.length} — ${dropped.map((d) => `"${d.sentence.slice(0, 70)}" (${d.why})`).join('; ')}`;
}
