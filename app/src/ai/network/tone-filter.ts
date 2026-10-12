/**
 * ai/network/tone-filter — the local tone-down every fiction payload passes
 * before it crosses the wall to a cloud lane (Mike 2026-10-12).
 *
 *   "What we want to make sure is kept from the cloud models are over violent,
 *    or sexual things and themes. Those should be sanitized to a point so
 *    mechanics can be derived from those things."
 *
 * The LOCAL model (Spirit pillar, inside the wall) does the softening. The
 * original text is never modified in the DB; only the softened copy crosses.
 *
 * Pipeline per text:
 *   1. screen()  — cheap keyword/regex screen, recall-biased. No hits → the
 *      text passes unchanged with NO model call (most fiction is clean).
 *   2. chunk()   — paragraph groups ≤ CHUNK_MAX chars; concatenating the
 *      chunks reproduces the input exactly, so order is preserved.
 *   3. per flagged chunk: cache (sha256 → softened) → else ONE local-lane
 *      call. Timeout / error / empty / <50% length / dropped markers / no
 *      local lane → FAIL CLOSED: a mechanics-shaped placeholder derived from
 *      the screen hits. The raw chunk never crosses on filter failure.
 *
 * Two doors:
 *   toneFilterAsync(text, ctx) — the full filter; awaits the local model.
 *   toneFilter(text, ctx?)     — SYNC, for the wall's sync seams
 *      (route.prepareCloudText, cloud-history, the JEWL runtime). Uses only
 *      the screen + cache: a flagged chunk not yet softened is withheld
 *      (placeholder) and softening starts in the background, so the next
 *      send (JEWL re-reads the backstory every cycle) gets the softened copy.
 *      A caller that can await should call toneFilterAsync first; its output
 *      is remembered as safe, so the sync pass lets it straight through.
 *
 * Audit: one log line per filtered chunk — caller, chunk index, hit
 * categories, in/out lengths, outcome. Never the text.
 */

import 'server-only';
import { createHash } from 'node:crypto';
import { localLane } from './config';
import { openAiCompatChat } from './transports/openai-compat';
import { recordAiCall } from './metering';
import { TONE_FILTER_SYSTEM, buildToneFilterUser } from '@/ai/prompts/tone-filter';

// ── Screen ──────────────────────────────────────────────────────────────────

export type ToneCategory = 'gore' | 'torture' | 'sexual' | 'sexual-violence';

/** Recall-biased: false positives cost one local call; false negatives leak. */
const SCREEN: Record<ToneCategory, RegExp[]> = {
  gore: [
    /\b(disembowel|eviscerat|dismember|decapitat|mutilat|behead)\w*/i,
    /\b(entrails|intestines|viscera|innards|gore|gory|gruesome)\b/i,
    /\bguts\b[^.]{0,30}\b(spill|out|hung|across|on the)/i,
    /\b(flay|flayed|flaying|skinned alive|impal\w+|crucif\w+)\b/i,
    /\bgoug\w*[^.]{0,20}\beyes?\b/i,
    /\bsever\w*\s+(\w+\s+)?(head|limb|hand|arm|leg|finger|fingers|tongue|ear|ears)\b/i,
    /\b(pool|pools|spray|sprays|gush\w*|spurt\w*|fountain|river|torrent)\s+of\s+blood\b/i,
    /\b(blood[- ]soaked|soaked in blood|covered in blood|drenched in blood|blood (gushed|spurted|sprayed|poured|pooled))\b/i,
    /\b(brains?|skull)\b[^.]{0,30}\b(spatter\w*|splatter\w*|crack\w*|split|shatter\w*|cave[ds]? in|smash\w*)\b/i,
    /\bbones?\b[^.]{0,20}\b(snap\w*|crunch\w*|splinter\w*|jutt\w*|protrud\w*)\b/i,
    /\b(rotting|charred|burning|mangled)\s+(flesh|corpses?|bodies|body)\b/i,
    /\b(bled out|bleeding out|slit (his|her|their) throat|throat slit|ripped (open|apart)|torn (open|apart|limb from limb))\b/i,
  ],
  torture: [
    /\btortur\w*/i,
    /\btorment(ed|ing)?\b/i,
    /\b(waterboard\w*|thumbscrews?|the rack|red-hot (iron|poker|blade)s?|branding iron)\b/i,
    /\b(branded|burned|burnt)\s+(him|her|them|his|her|their)\b/i,
    /\b(pull\w*|ripp\w*|tore|tear\w*|pried|cut)\s+(out\s+|off\s+)?(his|her|their)\s+(nails|fingernails|teeth|eyes|tongue|fingers)\b/i,
    /\b(beat|beaten|whipped|flogged|lashed)\s+(him|her|them)?\s*(bloody|senseless|half to death|nearly to death|to death|daily|for (hours|days))\b/i,
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

export interface ScreenResult {
  categories: ToneCategory[];
  hitCount: number;
}

export function screen(text: string): ScreenResult {
  const categories: ToneCategory[] = [];
  let hitCount = 0;
  for (const [cat, patterns] of Object.entries(SCREEN) as Array<[ToneCategory, RegExp[]]>) {
    let hit = 0;
    for (const re of patterns) {
      const g = new RegExp(re.source, 'gi');
      hit += text.match(g)?.length ?? 0;
    }
    if (hit > 0) categories.push(cat);
    hitCount += hit;
  }
  return { categories, hitCount };
}

const DURATION_RE =
  /\b(\d+|a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|several|many|countless|a few)\s+(minutes?|hours?|days?|nights?|weeks?|months?|years?|decades?)\b/i;

/** The fail-closed stand-in: shaped so mechanics can still be derived. */
export function placeholderFor(text: string, hits: ScreenResult = screen(text)): string {
  const severe = hits.categories.includes('torture') || hits.categories.includes('sexual-violence') || hits.hitCount >= 3;
  const duration = text.match(DURATION_RE)?.[0];
  const parts = [
    `graphic content (${hits.categories.join(', ') || 'unspecified'})`,
    `severity ${severe ? 'high' : 'moderate'}`,
    `duration ${duration ? duration.toLowerCase() : 'unstated'}`,
  ];
  const markers = extractMarkers(text);
  return `[passage withheld: ${parts.join('; ')}]${markers.length ? ' ' + markers.join(' ') : ''}`;
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

const CACHE_MAX = 1000;
/** sha256(chunk) → softened chunk (or the placeholder on a cached failure). */
const cache = new Map<string, string>();
/** sha256 of texts the filter itself produced — already safe to cross. */
const safe = new Set<string>();
/** sha256 → in-flight softening (dedupes concurrent + background calls). */
const inflight = new Map<string, Promise<string>>();
/** sha256 → time of last failure; the sync door waits before retrying. */
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
    `[tone-filter] caller=${ctx.caller} chunk=${index + 1}/${total} hits=${hits.categories.join('+')} in=${inLen} out=${outLen} outcome=${outcome}`,
  );
}

/** Soften one flagged chunk on the local lane. Never throws; never returns the raw chunk. */
async function softenChunk(raw: string, hits: ScreenResult, ctx: ToneFilterContext, index: number, total: number): Promise<string> {
  const key = sha(raw);
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
      audit(ctx, index, total, hits, raw.length, ph.length, `withheld:${why}`);
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
          { role: 'system', content: TONE_FILTER_SYSTEM },
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

    if (!text) return fail('empty');
    if (text.length < core.length * 0.5) return fail('too-short');
    if (!markersSurvive(core, text)) return fail('markers-lost');

    const out = lead + text + trail;
    cacheSet(key, out);
    failedAt.delete(key);
    stats.softened++;
    audit(ctx, index, total, hits, raw.length, out.length, 'softened');
    return out;
  })();

  inflight.set(key, run);
  try {
    return await run;
  } finally {
    inflight.delete(key);
  }
}

// ── The two doors ───────────────────────────────────────────────────────────

const DEFAULT_CTX: ToneFilterContext = { caller: 'wall' };

/** The full filter: awaits the local model for every flagged, uncached chunk. */
export async function toneFilterAsync(text: string, ctx: ToneFilterContext = DEFAULT_CTX): Promise<string> {
  stats.texts++;
  if (!text || safe.has(sha(text)) || screen(text).hitCount === 0) {
    stats.cleanTexts++;
    return text;
  }
  const chunks = chunk(text);
  const out = await Promise.all(
    chunks.map(async (c, i) => {
      const hits = screen(c);
      if (hits.hitCount === 0) return c;
      stats.flaggedChunks++;
      const cached = cacheGet(sha(c));
      if (cached !== undefined) { stats.cacheHits++; return cached; }
      return softenChunk(c, hits, ctx, i, chunks.length);
    }),
  );
  const joined = out.join('');
  safe.add(sha(joined));
  return joined;
}

/**
 * The sync door for the wall's sync seams. Clean → unchanged. Flagged and
 * softened before → the softened copy. Flagged and not yet softened → the
 * placeholder now, softening in the background for the next send.
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
      if (hits.hitCount === 0) return c;
      stats.flaggedChunks++;
      const key = sha(c);
      const cached = cacheGet(key);
      if (cached !== undefined) { stats.cacheHits++; return cached; }
      const last = failedAt.get(key);
      if (localLane() && !inflight.has(key) && (last === undefined || Date.now() - last > RETRY_AFTER_MS)) {
        void softenChunk(c, hits, ctx, i, chunks.length);
      }
      stats.withheld++;
      return placeholderFor(c, hits);
    })
    .join('');
}
