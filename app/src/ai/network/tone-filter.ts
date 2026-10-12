/**
 * ai/network/tone-filter — the local tone-down every fiction payload passes
 * before it crosses the wall to a cloud lane (Mike 2026-10-12).
 *
 *   "Some things may need to be known for accurate simulation calculations.
 *    Like medical bleeding out etc. The point is so the safety filters on the
 *    clouds aren't ever tripped."
 *
 * Refusal-avoidance, not a taste line. The LOCAL model (Spirit pillar, inside
 * the wall) rewrites lurid violence and sexual content into a CLINICAL /
 * MECHANICAL register that keeps every simulation fact (wound site, depth,
 * blood loss, time to unconsciousness/death, ordeal duration, who did what to
 * whom, consequences). Plain violence ("cut his throat", "killed", "bled
 * out") crosses as-is. The original text is never modified in the DB; only
 * the rewritten copy crosses.
 *
 * Pipeline per text:
 *   1. screen()  — cheap keyword/regex screen, recall-biased. No hits → the
 *      text passes unchanged with NO model call (most fiction is clean).
 *   2. chunk()   — paragraph groups ≤ CHUNK_MAX chars; concatenating the
 *      chunks reproduces the input exactly, so order is preserved.
 *   3. HARD BLOCK: a chunk where age cues and sexual cues co-occur
 *      (`minor-sexual`) never crosses in any form — a fixed
 *      `[passage withheld: disallowed content]`, no model call, no detail.
 *   4. per flagged chunk: cache (sha256 → rewritten) → else ONE local-lane
 *      call. Timeout / error / empty / too short / dropped markers / no
 *      local lane → FAIL CLOSED: a mechanics-shaped placeholder (categories,
 *      severity, duration, body part). The raw chunk never crosses on failure.
 *
 * Doors:
 *   toneFilterAsync(text, ctx)  — the full filter; awaits the local model.
 *   toneFilter(text, ctx?)      — SYNC, for the wall's sync seams
 *      (route.prepareCloudText, cloud-history, the JEWL runtime). Screen +
 *      cache only: a flagged chunk not yet rewritten is withheld now
 *      (placeholder) and rewritten in the background for the next send.
 *   toneFilterHarder(text, ctx) — a stricter second pass for when a cloud
 *      model actually refused: every chunk is rewritten with more
 *      abstraction (cache key suffix `:hard`).
 * Filter output is remembered as safe, so a second pass lets it through.
 *
 * Audit: one log line per filtered chunk — caller, chunk index, hit
 * categories, in/out lengths, outcome. Never the text.
 */

import 'server-only';
import { createHash } from 'node:crypto';
import { localLane } from './config';
import { openAiCompatChat } from './transports/openai-compat';
import { recordAiCall } from './metering';
import { TONE_FILTER_SYSTEM, TONE_FILTER_HARD_SYSTEM, buildToneFilterUser } from '@/ai/prompts/tone-filter';

// ── Screen ──────────────────────────────────────────────────────────────────

export type ToneCategory = 'gore' | 'torture' | 'sexual' | 'sexual-violence' | 'minor-sexual';

/** Recall-biased: false positives cost one local call; false negatives risk a
 *  cloud refusal. Plain, non-lurid violence deliberately does NOT trigger
 *  ("cut his throat", "the arrow took his eye", "killed", "bled out"). */
const SCREEN: Record<Exclude<ToneCategory, 'minor-sexual'>, RegExp[]> = {
  gore: [
    /\b(disembowel|eviscerat|dismember|mutilat)\w*/i,
    /\b(entrails|intestines|viscera|innards|gore|gory|gruesome)\b/i,
    /\bguts\b[^.]{0,30}\b(spill|out|hung|across|on the)/i,
    /\b(flay|flayed|flaying|skinned alive)\b/i,
    /\bgoug\w*[^.]{0,20}\beyes?\b/i,
    /\b(pool|pools|spray|sprays|gush\w*|spurt\w*|fountain|river|torrent)\s+of\s+blood\b/i,
    /\b(blood[- ]soaked|soaked in blood|drenched in blood|blood (gushed|spurted|sprayed|fountained))\b/i,
    /\b(choke\w*|chok\w*|gurgl\w*|drown\w*)\s+on\s+(his|her|their)\s+own\s+blood\b/i,
    /\b(brains?)\b[^.]{0,30}\b(spatter\w*|splatter\w*|spill\w*|leak\w*)\b/i,
    /\bskull\b[^.]{0,30}\b(cave[ds]? in|split open|shatter\w*|smash\w*)\b/i,
    /\bbones?\b[^.]{0,20}\b(splinter\w*|jutt\w*|protrud\w*)\b/i,
    /\b(rotting|charred|mangled)\s+(flesh|corpses?|bodies|body)\b/i,
    /\b(torn limb from limb|ripped (him|her|them) apart|torn apart)\b/i,
    /\b(watched (him|her|them) (die|choke|bleed|suffer|writhe|scream)|savou?r\w* (his|her|their) (screams|pain|suffering))\b/i,
  ],
  torture: [
    /\btortur\w*/i,
    /\btorment(ed|ing)?\b/i,
    /\b(waterboard\w*|thumbscrews?|the rack|red-hot (iron|poker|blade)s?|branding iron)\b/i,
    /\b(branded|burned|burnt)\s+(him|her|them|his|her|their)\b/i,
    /\b(pull\w*|ripp\w*|tore|tear\w*|pried|cut)\s+(out\s+|off\s+)?(his|her|their)\s+(nails|fingernails|teeth|eyes|tongue|fingers)\b/i,
    /\b(peel\w*|strip\w*)\s+(the\s+)?skin\b/i,
    /\b(beat|beaten|whipped|flogged|lashed)\s+(him|her|them)?\s*(bloody|senseless|half to death|nearly to death|daily|for (hours|days))\b/i,
  ],
  sexual: [
    /\b(sex|sexual|sexually|sexy|erotic\w*|orgasm\w*|aroused|arousal|intercourse|lust\w*|seduc\w*|foreplay)\b/i,
    /\b(naked|nude|nudity|undress\w*|stripped (naked|bare))\b/i,
    /\b(genital\w*|penis|vagina|breasts?|nipples?|cock|clit\w*|groin|crotch)\b/i,
    /\b(fuck\w*|made love|making love|slept with|bedded|in bed together|moan\w*)\b/i,
    /\b(brothel|whore\w*|prostitut\w*|harlot|courtesan|concubine)\b/i,
  ],
  'sexual-violence': [
    /\b(rape|raped|rapes|raping|rapist)\b/i,
    /\b(molest\w*|ravish\w*|defil\w*|incest\w*|grop\w*)\b/i,
    /\bsexual(ly)?\s+(assault\w*|abus\w*|violen\w*)\b/i,
    /\bforced\s+(himself|herself|themself|themselves)\s+(on|upon)\b/i,
  ],
};

/** Age cues for the minor-sexual hard block. Recall-biased on purpose: any
 *  co-occurrence with a sexual cue in the same chunk blocks the chunk. */
const AGE_CUES: RegExp[] = [
  /\b(child|children|childhood|kid|kids|minor|minors|underage|under-age|toddler|infant|baby|babies|preteen|pre-teen|tween)\b/i,
  /\b(teen|teens|teenage\w*|adolescen\w*|pubescen\w*|prepubescen\w*|puberty|juvenile)\b/i,
  /\b(boy|boys|girl|girls|schoolgirl\w*|schoolboy\w*|lad|lass|youngster\w*)\b/i,
  /\b([1-9]|1[0-7]|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen)[- ]years?[- ]old\b/i,
  /\b(aged?|age of)\s+([1-9]|1[0-7]|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen)\b/i,
];

export interface ScreenResult {
  categories: ToneCategory[];
  hitCount: number;
}

const countMatches = (text: string, patterns: RegExp[]) =>
  patterns.reduce((n, re) => n + (text.match(new RegExp(re.source, 'gi'))?.length ?? 0), 0);

export function screen(text: string): ScreenResult {
  const categories: ToneCategory[] = [];
  let hitCount = 0;
  for (const [cat, patterns] of Object.entries(SCREEN) as Array<[ToneCategory, RegExp[]]>) {
    const hit = countMatches(text, patterns);
    if (hit > 0) categories.push(cat);
    hitCount += hit;
  }
  const sexualCue = categories.includes('sexual') || categories.includes('sexual-violence');
  if (sexualCue && countMatches(text, AGE_CUES) > 0) categories.unshift('minor-sexual');
  return { categories, hitCount };
}

/** The minor-sexual hard block: fixed, no detail, nothing derived. */
export const DISALLOWED_PLACEHOLDER = '[passage withheld: disallowed content]';

const DURATION_RE =
  /\b(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|several|many|countless|a few)\s+(seconds?|minutes?|hours?|days?|nights?|weeks?|months?|years?|decades?)\b/i;
const BODY_PART_RE =
  /\b(head|skull|face|eyes?|ears?|nose|jaw|mouth|teeth|tongue|throat|neck|shoulders?|chest|ribs?|heart|lungs?|abdomen|stomach|belly|guts|back|spine|arms?|hands?|fingers?|wrists?|hips?|groin|legs?|thighs?|knees?|feet|foot|toes?|skin)\b/gi;

/** The fail-closed stand-in: shaped so mechanics can still be derived. */
export function placeholderFor(text: string, hits: ScreenResult = screen(text)): string {
  if (hits.categories.includes('minor-sexual')) return DISALLOWED_PLACEHOLDER;
  const severe = hits.categories.includes('torture') || hits.categories.includes('sexual-violence') || hits.hitCount >= 3;
  const duration = text.match(DURATION_RE)?.[0];
  const parts = [...new Set((text.match(BODY_PART_RE) ?? []).map((p) => p.toLowerCase()))].slice(0, 3);
  const fields = [
    `graphic content (${hits.categories.join(', ') || 'unspecified'})`,
    `severity ${severe ? 'high' : 'moderate'}`,
    `duration ${duration ? duration.toLowerCase() : 'unstated'}`,
    `body part ${parts.length ? parts.join(', ') : 'unstated'}`,
  ];
  const markers = extractMarkers(text);
  return `[passage withheld: ${fields.join('; ')}]${markers.length ? ' ' + markers.join(' ') : ''}`;
}

// ── Markers ─────────────────────────────────────────────────────────────────

const MARKER_RE = /\[[^\]\n]{1,80}\]|\{[^}\n]{0,80}\}|__DAYA\w*/g;

function extractMarkers(text: string): string[] {
  return text.match(MARKER_RE) ?? [];
}

function markersSurvive(input: string, output: string): boolean {
  return extractMarkers(input).every((m) => output.includes(m));
}

// ── Chunking ────────────────────────────────────────────────────────────────

export const CHUNK_MAX = 2500;

/** Paragraph groups ≤ CHUNK_MAX. chunks.join('') === text, always. */
export function chunk(text: string, max = CHUNK_MAX): string[] {
  if (text.length <= max) return [text];
  // Paragraphs with their trailing separator attached.
  const paras = text.match(/[\s\S]*?(?:\n[ \t]*\n\s*|$)/g)?.filter((p) => p.length > 0) ?? [text];
  const pieces: string[] = [];
  for (const p of paras) {
    if (p.length <= max) { pieces.push(p); continue; }
    // An oversized paragraph: split on sentences, hard-slice as a last resort.
    const sentences = p.match(/[^.!?]+[.!?]*\s*|[.!?]+\s*/g) ?? [p];
    for (const s of sentences) {
      for (let i = 0; i < s.length; i += max) pieces.push(s.slice(i, i + max));
    }
  }
  const out: string[] = [];
  let cur = '';
  for (const piece of pieces) {
    if (cur && cur.length + piece.length > max) { out.push(cur); cur = ''; }
    cur += piece;
  }
  if (cur) out.push(cur);
  return out;
}

// ── Cache + stats ───────────────────────────────────────────────────────────

type Mode = 'soft' | 'hard';

const CACHE_MAX = 1000;
/** sha256(chunk)[+':hard'] → rewritten chunk. */
const cache = new Map<string, string>();
/** sha256 of texts the filter itself produced — already safe to cross. */
const safe = new Set<string>();
/** cache key → in-flight rewrite (dedupes concurrent + background calls). */
const inflight = new Map<string, Promise<string>>();
/** cache key → time of last failure; the sync door waits before retrying. */
const failedAt = new Map<string, number>();
const RETRY_AFTER_MS = 60_000;
export const TONE_FILTER_TIMEOUT_MS = 20_000;

const stats = {
  texts: 0,
  cleanTexts: 0,
  flaggedChunks: 0,
  cacheHits: 0,
  modelCalls: 0,
  softened: 0,
  withheld: 0,
  blocked: 0,
};

export function toneFilterStats(): Readonly<typeof stats> & { cacheSize: number } {
  return { ...stats, cacheSize: cache.size };
}

/** Tests only. */
export function resetToneFilter(): void {
  cache.clear();
  safe.clear();
  inflight.clear();
  failedAt.clear();
  for (const k of Object.keys(stats) as Array<keyof typeof stats>) stats[k] = 0;
}

const sha = (s: string) => createHash('sha256').update(s).digest('hex');
const keyOf = (chunkText: string, mode: Mode) => sha(chunkText) + (mode === 'hard' ? ':hard' : '');

function cacheGet(key: string): string | undefined {
  const v = cache.get(key);
  if (v !== undefined) { cache.delete(key); cache.set(key, v); } // LRU touch
  return v;
}

function cacheSet(key: string, value: string): void {
  cache.set(key, value);
  safe.add(sha(value));
  if (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
  if (safe.size > CACHE_MAX * 2) safe.clear(); // bounded; worst case = one re-screen
}

// ── The local call ──────────────────────────────────────────────────────────

export interface ToneFilterContext {
  /** Stable caller id for the audit line + metering. */
  caller: string;
  campaignId?: string;
}

function audit(ctx: ToneFilterContext, index: number, total: number, hits: ScreenResult, inLen: number, outLen: number, outcome: string): void {
  console.info(
    `[tone-filter] caller=${ctx.caller} chunk=${index + 1}/${total} hits=${hits.categories.join('+') || 'none'} in=${inLen} out=${outLen} outcome=${outcome}`,
  );
}

/** The hard block: logged by category only, never the text. */
function block(ctx: ToneFilterContext, index: number, total: number, inLen: number): string {
  stats.blocked++;
  console.info(
    `[tone-filter] caller=${ctx.caller} chunk=${index + 1}/${total} hits=minor-sexual in=${inLen} out=${DISALLOWED_PLACEHOLDER.length} outcome=blocked`,
  );
  return DISALLOWED_PLACEHOLDER;
}

/** Rewrite one chunk on the local lane. Never throws; never returns the raw chunk. */
async function rewriteChunk(raw: string, hits: ScreenResult, ctx: ToneFilterContext, index: number, total: number, mode: Mode): Promise<string> {
  const key = keyOf(raw, mode);
  const existing = inflight.get(key);
  if (existing) return existing;

  const run = (async () => {
    // Keep the chunk's edge whitespace (paragraph breaks) out of the model's hands.
    const lead = raw.match(/^\s*/)?.[0] ?? '';
    const trail = raw.slice(lead.length).match(/\s*$/)?.[0] ?? '';
    const core = raw.slice(lead.length, raw.length - trail.length);

    const fail = (why: string) => {
      const ph = placeholderFor(raw, hits);
      stats.withheld++;
      failedAt.set(key, Date.now());
      audit(ctx, index, total, hits, raw.length, ph.length, `withheld:${mode}:${why}`);
      return ph;
    };

    const lane = localLane();
    if (!lane) return fail('no-local-lane');

    let text: string;
    try {
      stats.modelCalls++;
      const res = await openAiCompatChat({
        baseUrl: lane.baseUrl,
        model: lane.model,
        apiKey: lane.apiKey,
        messages: [
          { role: 'system', content: mode === 'hard' ? TONE_FILTER_HARD_SYSTEM : TONE_FILTER_SYSTEM },
          { role: 'user', content: buildToneFilterUser(core) },
        ],
        maxTokens: Math.ceil(core.length / 3) + 256,
        temperature: 0,
        timeoutMs: TONE_FILTER_TIMEOUT_MS,
      });
      recordAiCall({ lane: 'local', provider: 'openai-compat', model: res.model, caller: `tone-filter:${ctx.caller}`, campaignId: ctx.campaignId, usage: res.usage });
      text = res.text.trim();
    } catch (e) {
      return fail(e instanceof Error && e.name === 'TimeoutError' ? 'timeout' : 'error');
    }

    // The harder pass abstracts more, so it may legitimately run shorter.
    const minRatio = mode === 'hard' ? 0.3 : 0.5;
    if (!text) return fail('empty');
    if (text.length < core.length * minRatio) return fail('too-short');
    if (!markersSurvive(core, text)) return fail('markers-lost');

    const out = lead + text + trail;
    cacheSet(key, out);
    failedAt.delete(key);
    stats.softened++;
    audit(ctx, index, total, hits, raw.length, out.length, `rewritten:${mode}`);
    return out;
  })();

  inflight.set(key, run);
  try {
    return await run;
  } finally {
    inflight.delete(key);
  }
}

// ── The doors ───────────────────────────────────────────────────────────────

const DEFAULT_CTX: ToneFilterContext = { caller: 'wall' };

async function filterAsync(text: string, ctx: ToneFilterContext, mode: Mode): Promise<string> {
  stats.texts++;
  if (!text) return text;
  if (mode === 'soft' && (safe.has(sha(text)) || screen(text).hitCount === 0)) {
    stats.cleanTexts++;
    return text;
  }
  const chunks = chunk(text);
  const out = await Promise.all(
    chunks.map(async (c, i) => {
      const hits = screen(c);
      if (hits.categories.includes('minor-sexual')) return block(ctx, i, chunks.length, c.length);
      // soft: only flagged chunks. hard: Claude refused something the screen
      // may have missed — every non-blank chunk gets the stricter rewrite.
      if (mode === 'soft' ? hits.hitCount === 0 : !c.trim()) return c;
      stats.flaggedChunks++;
      const cached = cacheGet(keyOf(c, mode));
      if (cached !== undefined) { stats.cacheHits++; return cached; }
      return rewriteChunk(c, hits, ctx, i, chunks.length, mode);
    }),
  );
  const joined = out.join('');
  safe.add(sha(joined));
  return joined;
}

/** The full filter: awaits the local model for every flagged, uncached chunk. */
export function toneFilterAsync(text: string, ctx: ToneFilterContext = DEFAULT_CTX): Promise<string> {
  return filterAsync(text, ctx, 'soft');
}

/**
 * The stricter second pass, for when a cloud model actually refused. Pass the
 * ORIGINAL text (not the first pass's output): every chunk is rewritten with
 * more abstraction; cached under a `:hard` key. Same fail-closed rules.
 */
export function toneFilterHarder(text: string, ctx: ToneFilterContext = DEFAULT_CTX): Promise<string> {
  return filterAsync(text, ctx, 'hard');
}

/**
 * The sync door for the wall's sync seams. Clean → unchanged. Flagged and
 * rewritten before → the rewritten copy. Flagged and not yet rewritten → the
 * placeholder now, rewriting in the background for the next send.
 */
export function toneFilter(text: string, ctx: ToneFilterContext = DEFAULT_CTX): string {
  stats.texts++;
  if (!text || safe.has(sha(text)) || screen(text).hitCount === 0) {
    stats.cleanTexts++;
    return text;
  }
  const chunks = chunk(text);
  return chunks
    .map((c, i) => {
      const hits = screen(c);
      if (hits.categories.includes('minor-sexual')) return block(ctx, i, chunks.length, c.length);
      if (hits.hitCount === 0) return c;
      stats.flaggedChunks++;
      const key = keyOf(c, 'soft');
      const cached = cacheGet(key);
      if (cached !== undefined) { stats.cacheHits++; return cached; }
      const last = failedAt.get(key);
      if (localLane() && !inflight.has(key) && (last === undefined || Date.now() - last > RETRY_AFTER_MS)) {
        void rewriteChunk(c, hits, ctx, i, chunks.length, 'soft');
      }
      stats.withheld++;
      return placeholderFor(c, hits);
    })
    .join('');
}
