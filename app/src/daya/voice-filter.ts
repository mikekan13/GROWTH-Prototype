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
  /** Fact lines of the being's ground (room, doors, things) - a material the facts never name is not the voice's to name ("the glass" for a door no fact calls glass). */
  facts?: string[];
  /** HW8 run 7 #5: the facts say NO ONE is in sight of this being (door closed, alone on the landing): a sentence that puts a known absent being in view is dropped. */
  noOneInView?: boolean;
  /** Names of beings known to be absent, for the in-view rule (first names). */
  absentNames?: string[];
  /** HW8 run 7 #8: names of the things the being HOLDS - a sentence that places one on a shelf / across the room is dropped. */
  heldNames?: string[];
  /** 'vocab' = only the table's words (a being's DOING: "knocks three times" is not a count). Default 'all'. */
  rules?: 'all' | 'vocab';
  /** The prompt the voice answered (HW10 2026-10-29: the small model copied the prompt's own notes into Violet's thought). A sentence of five words or more that appears in it is an echo, not a thought. */
  prompt?: string;
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
const STOCK_IMAGES: Array<{ key: string; re: RegExp; always?: boolean }> = [
  { key: 'held breath', always: true, re: /\b(?:held\s+breath|breath\s+(?:held|caught)|(?:hold|holds|held|holding)\s+(?:my|your|a|the|her|his|their)\s+breath)\b/i },
  { key: 'eardrums', always: true, re: /\beardrums?\b/i },
  { key: 'dust motes', always: true, re: /\bdust\s+motes?\b|\bmotes?\s+of\s+dust\b/i },
  { key: 'statue', always: true, re: /\bstatues?\b/i },
  { key: 'hum in the teeth', always: true, re: /\bhum\b[^.!?]{0,40}\bteeth\b|\bteeth\b[^.!?]{0,40}\bhum\b/i },
  { key: 'vibration frequency', re: /\bvibrat\w*\b[^.!?]{0,60}\bfrequenc\w*\b|\bfrequenc\w*\b[^.!?]{0,60}\bvibrat\w*\b|\bdifferent\s+frequency\b/i },
  { key: 'suspended ash', always: true, re: /\bsuspended\s+ash\b|\bash\s+(?:hanging|suspended)\b/i },
  { key: 'dead light', always: true, re: /\bdead\s+light\b/i },
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

// -- Materials, sight, held things (HW8 run 7) --
const GLASS_RE = /\b(?:glass|windowpane|window-?pane|pane)\b/i;
const DOOR_RE = /\bdoor\b/i;
const IN_VIEW_RE = /\b(?:the\s+sight\s+of\s+(?:her|him|them)|(?:her|his)\s+(?:\w+\s+)?(?:hair|eyes|face|silhouette|figure|shape|shoulders|hands?)\s+(?:catch(?:es)?|gleam\w*|glint\w*|shin\w*|fram\w*|flash\w*|stand\w*|glow\w*)|(?:I|you)\s+(?:see|watch|look\s+at)\s+(?:her|him)\b|standing\s+(?:there|before\s+me|in\s+front\s+of\s+me))/i;
/** A sentence that puts a being known to be absent in view ("the sight of her", "her hair catches the light"). Pure. */
export function inViewOfAbsent(sentence: string, absentNames: string[]): boolean {
  if (IN_VIEW_RE.test(sentence)) return true;
  return absentNames.some((n) => n && new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b[^.!?]{0,40}\\b(?:stands?|standing|is\\s+there|is\\s+in\\s+front)\\b`, 'i').test(sentence) && /\b(?:I|my)\s+(?:see|watch)/i.test(sentence));
}
const ELSEWHERE_RE = /\b(?:on\s+the\s+(?:\w+\s+)?(?:shelf|counter|table|floor|desk|nightstand|dresser|sill)|across\s+the\s+room|(?:\w+\s+)?feet\s+away|over\s+there)\b/i;
const HELD_STOP = new Set(['the', 'and', 'with', 'her', 'his', 'number', 'from']);
/** A sentence that names a thing the being HOLDS and puts it somewhere else (on the shelf, across the room). Pure. */
export function heldPlacedElsewhere(sentence: string, heldNames: string[]): boolean {
  if (!ELSEWHERE_RE.test(sentence)) return false;
  return heldNames.some((n) => n.toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length >= 4 && !HELD_STOP.has(w)).some((w) => new RegExp(`\\b${w}`, 'i').test(sentence)));
}

/** Is `line` (fuzzily) one of the being's last spoken lines? (HW8 run 7 #7) Pure. */
export function isSpokenRepeat(line: string, previous: string[]): boolean {
  const toks = (x: string) => new Set(norm(x).split(/[^a-z0-9']+/).filter(Boolean));
  const a = toks(line);
  if (!a.size) return false;
  return previous.slice(0, 3).some((p) => {
    const b = toks(p);
    if (!b.size) return false;
    let inter = 0;
    for (const t of a) if (b.has(t)) inter++;
    return inter / (a.size + b.size - inter) >= 0.8;
  });
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
  const promptNorm = ctx.prompt ? norm(ctx.prompt) : '';
  for (const sentence of splitSentences(text)) {
    const drop = (why: string) => { dropped.push({ sentence, why }); };
    const vocab = TABLE_VOCAB.find(([re]) => re.test(sentence));
    if (vocab) { drop(`table vocabulary: ${vocab[1]}`); continue; }
    if (promptNorm && echoesPrompt(sentence, promptNorm)) { drop('echoes the prompt'); continue; }
    if (ctx.rules === 'vocab') { kept.push(sentence); continue; }
    if (seenBefore.has(norm(sentence))) { drop('repeat of a recent thought'); continue; }
    const image = stockImageOf(sentence);
    if (image && STOCK_IMAGES.find((i) => i.key === image)?.always) { drop(`stock image (always dropped): ${image}`); continue; }
    if (image) {
      if (countImage(image, recent) > 0) { drop(`stock image used in the last three thoughts: ${image}`); continue; }
      if (countImage(image, prior) >= 2) { drop(`stock image already used twice: ${image}`); continue; }
      if (usedNow.has(image)) { drop(`stock image twice in one go: ${image}`); continue; }
      usedNow.add(image);
    }
    if (GLASS_RE.test(sentence) && DOOR_RE.test(sentence) && !(ctx.facts ?? []).some((f) => GLASS_RE.test(f))) { drop('a material no fact gives the door: glass'); continue; }
    if (ctx.noOneInView && inViewOfAbsent(sentence, ctx.absentNames ?? [])) { drop('puts an absent being in view when the facts say no one is present'); continue; }
    if (ctx.heldNames?.length && heldPlacedElsewhere(sentence, ctx.heldNames)) { drop('places a held thing somewhere it is not'); continue; }
    const count = sentence.match(COUNT_RE);
    if (count && !countedIn(count[0], heard)) { drop(`counting: ${count[0]}`); continue; }
    if (ctx.hasLightFact === false && LIGHT_RE.test(sentence) && !LIGHT_RE.test(heard)) { drop('light or dark with no light fact for the room'); continue; }
    kept.push(sentence);
  }
  return { text: kept.join(' ').trim(), dropped };
}

/** A sentence of five words or more that is found, word for word, in the prompt it answered. Pure. */
export function echoesPrompt(sentence: string, promptNorm: string): boolean {
  const n = norm(sentence);
  if (n.split(' ').length < 5) return false;
  if (promptNorm.includes(n)) return true;
  // A clause of it: the model often runs two prompt sentences together or trims one — any 8-word run from the prompt is an echo.
  const words = n.split(' ');
  for (let i = 0; i + 8 <= words.length; i++) if (promptNorm.includes(words.slice(i, i + 8).join(' '))) return true;
  return false;
}

/** The log line for what a pass dropped, or null when nothing went. */
export function droppedLog(name: string, kind: string, dropped: DroppedSentence[]): string | null {
  if (!dropped.length) return null;
  return `[daya/voice-filter] ${name} ${kind}: dropped ${dropped.length} — ${dropped.map((d) => `"${d.sentence.slice(0, 70)}" (${d.why})`).join('; ')}`;
}
