/**
 * REACH + NOTICING — the world-sim pass (perception units 6+7, ruled as ONE pass).
 *
 * Mike 2026-10-09 (Q5): "This is one of the entire points of the llm simulating
 * the world. It is able to decide if a sound could be heard by a certain type of
 * ear through a certain type of a material." → no rule table: the world-sim LLM
 * judges, per canon event, for every being in range, whether the event REACHES
 * it (its organs + their condition, the source, distance/places between) and
 * which senses carried it.
 * Mike (Q8 + NOTICING THRESHOLD = LLM JUDGES): the SAME call decides whether a
 * reaching event is NOTICED, from the being's focus (its intent / goals), its
 * Wisdom (wider passive noticing) and the context (threat, surprise, volume);
 * output = noticed | unnoticed + salience 0..1.
 * Mike (Q7): thoughts are just another event; they reach a being only through a
 * sense that reaches minds (SenseProfile.nonPhysical, default none).
 *
 * This module is pure apart from the model call, which is injected (tests) or
 * routed on the 'classify' lane (Haiku today; the local small model when that
 * lane points at it). ONE call per event, every being batched. Time-capped;
 * any failure (timeout, transport, unparseable / Zod-invalid output) falls back
 * to the deterministic STUB, which is also what runs when PERCEPTION_REACH is off.
 *
 * Hard laws the model cannot override (enforced after the parse): a sense at 0
 * carries nothing; a thought reaches only a mind sense (or the thinker); an
 * event that does not reach is not noticed.
 */
import { z } from 'zod';
import { SENSE_KINDS, type SenseKind, type SenseProfile } from './field';

// ── Flag ──────────────────────────────────────────────────────────────────

/** PERCEPTION_REACH=on turns the pass on (default OFF — behaviour is exactly as before units 6+7). Same 'on'-only convention as TABLE_SPLIT_LOOP. */
export function perceptionReachOn(): boolean {
  return process.env.PERCEPTION_REACH === 'on';
}

/** TUNING — placeholder. Off the answer clock, but a stretch waits on it before it is listened to. */
export const REACH_TUNING = {
  timeoutMs: Number(process.env.PERCEPTION_REACH_TIMEOUT_MS ?? 4000),
  /** Beings per call; more than this and the prompt outgrows the small model — the rest go in a second call. */
  maxBeingsPerCall: 12,
  maxTokensPerBeing: 40,
} as const;

// ── Shapes ────────────────────────────────────────────────────────────────

export type ReachEventKind = 'narration' | 'speech' | 'action' | 'thought';

export interface ReachEvent {
  /** CanonEvent id, when there is one (audit only). */
  id?: string | null;
  kind: ReachEventKind;
  text: string;
  /** The being the event comes from (speaker, actor, thinker). */
  sourceId?: string | null;
  sourceName?: string | null;
  /** The being it is aimed at (a whisper's listener, an attack's target). */
  targetId?: string | null;
  /** Where it happened. null = not placed (theater of mind: the whole scene). */
  locationId?: string | null;
  locationName?: string | null;
  volume?: 'whisper' | 'normal' | 'loud' | null;
  /** Deliberately concealed (sneaking, a hidden act). */
  hidden?: boolean;
  /** Free text for the world-sim: places/materials between, weather, light. */
  setting?: string | null;
}

export interface ReachBeing {
  /** Character id. */
  id: string;
  name: string;
  locationId: string | null;
  locationName?: string | null;
  senses: SenseProfile;
  /** What it is attending to right now (encounter intent, else its active goals). */
  focus?: string | null;
  /** Wisdom level (pool max) — wider passive noticing. */
  wisdom?: number | null;
}

export interface ReachVerdict {
  beingId: string;
  reaches: boolean;
  /** Senses that carried it ('self' for the event's own source). Empty when it does not reach. */
  via: string[];
  noticed: boolean;
  salience: number;
}

export interface ReachJudgement {
  verdicts: Map<string, ReachVerdict>;
  /** 'model' = the world-sim judged; 'stub' = the flag is off / no model; 'fallback' = the model failed and the stub stood in. */
  source: 'model' | 'stub' | 'fallback';
  ms: number;
  error?: string;
}

/** The model transport: system + user prompt in, raw text out. */
export type ReachModel = (prompt: { system: string; user: string; maxTokens: number }) => Promise<string>;

// ── Helpers ───────────────────────────────────────────────────────────────

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

/** Which organ senses can carry an event of this kind. A thought: none. */
export function carriersOf(kind: ReachEventKind): SenseKind[] {
  switch (kind) {
    case 'speech': return ['hearing'];
    case 'action': case 'narration': return ['sight', 'hearing'];
    case 'thought': return [];
  }
}

const WHISPER_RE = /\b(whisper(?:s|ed|ing)?|murmur(?:s|ed|ing)?|under (?:his|her|their|my|your) breath|mouths?)\b/i;
const LOUD_RE = /\b(shout(?:s|ed|ing)?|scream(?:s|ed|ing)?|yell(?:s|ed|ing)?|roar(?:s|ed|ing)?|bang(?:s|ed)?|explo(?:des|ded|sion)|crash(?:es|ed)?|gunshot|shatter(?:s|ed)?)\b/i;
const HIDDEN_RE = /\b(sneak(?:s|ed|ing)?|unseen|unnoticed|secretly|in secret|hidden|hides?|slips? (?:something|it|a))\b/i;
const THOUGHT_ONLY_RE = /^\s*\(\(([\s\S]+)\)\)\s*$/;

/** Read volume / concealment / kind off plain text when the writer passed none. Pure. */
export function cuesFromText(text: string): { kind: ReachEventKind | null; volume: ReachEvent['volume']; hidden: boolean } {
  return {
    kind: THOUGHT_ONLY_RE.test(text) ? 'thought' : null,
    volume: WHISPER_RE.test(text) ? 'whisper' : LOUD_RE.test(text) ? 'loud' : null,
    hidden: HIDDEN_RE.test(text),
  };
}

function mindSenses(b: ReachBeing): Array<{ name: string; effectiveness: number }> {
  return (b.senses.nonPhysical ?? []).filter((s) => s.reaches === 'thought' && s.effectiveness > 0);
}

function sameScene(event: ReachEvent, b: ReachBeing): boolean {
  // Unplaced on either side = theater of mind: everyone in the scene (the behaviour before units 6+7).
  return !event.locationId || !b.locationId || event.locationId === b.locationId;
}

// ── Stub ──────────────────────────────────────────────────────────────────

/**
 * The deterministic stand-in: same place (or unplaced) + a carrying sense with
 * effectiveness > 0 → reaches, via those senses. Noticed unless whispered or
 * hidden (the source and the target always notice). Salience = the old fixed
 * heuristics (0.5 a declaration; 0.8 loud or aimed at you; 0.95 your own act)
 * scaled by the best carrying sense (Broken ears → half as salient). Pure.
 */
export function stubVerdict(event: ReachEvent, b: ReachBeing): ReachVerdict {
  const none: ReachVerdict = { beingId: b.id, reaches: false, via: [], noticed: false, salience: 0 };
  if (event.sourceId && event.sourceId === b.id) return { beingId: b.id, reaches: true, via: ['self'], noticed: true, salience: 0.95 };
  if (!sameScene(event, b)) return none;
  const cues = cuesFromText(event.text);
  const kind = event.kind === 'thought' || cues.kind === 'thought' ? 'thought' : event.kind;
  let via: string[];
  let best: number;
  if (kind === 'thought') {
    const minds = mindSenses(b);
    if (!minds.length) return none;
    via = minds.map((m) => m.name);
    best = Math.max(...minds.map((m) => m.effectiveness));
  } else {
    const carried = carriersOf(kind).filter((s) => (b.senses.effectiveness[s] ?? 0) > 0);
    if (!carried.length) return none;
    via = carried;
    best = Math.max(...carried.map((s) => b.senses.effectiveness[s]));
  }
  const aimed = !!event.targetId && event.targetId === b.id;
  const volume = event.volume ?? cues.volume;
  const hidden = event.hidden ?? cues.hidden;
  const noticed = aimed || !(volume === 'whisper' || hidden);
  const base = aimed || volume === 'loud' ? 0.8 : 0.5;
  const salience = clamp01((noticed ? base : base * 0.3) * best);
  return { beingId: b.id, reaches: true, via, noticed, salience: Math.round(salience * 100) / 100 };
}

export function stubReach(event: ReachEvent, beings: ReachBeing[]): Map<string, ReachVerdict> {
  return new Map(beings.map((b) => [b.id, stubVerdict(event, b)]));
}

// ── Prompt (sized for the small model) ────────────────────────────────────

function senseLine(b: ReachBeing): string {
  const parts = SENSE_KINDS.map((s) => {
    const e = b.senses.effectiveness[s];
    const hurt = b.senses.organs.filter((o) => o.sense === s && !o.assumed && o.effectiveness < 1).map((o) => `${o.partName} ${o.conditionLabel}`);
    return `${s} ${e}${hurt.length ? ` (${hurt.join(', ')})` : ''}`;
  });
  const minds = mindSenses(b);
  return `${parts.join(', ')}. Mind sense: ${minds.length ? minds.map((m) => `${m.name} ${m.effectiveness}`).join(', ') : 'none'}.`;
}

/** Short ids ('b1'…) keep the small model from mangling cuids. */
export function buildReachPrompt(event: ReachEvent, beings: ReachBeing[]): { system: string; user: string; ids: Map<string, string> } {
  const system = [
    'You simulate the physical world of a tabletop roleplaying game. One event just happened.',
    'For EACH being listed, decide three things:',
    '1. reach: could the event physically reach this being\'s senses? Think about its sense organs and their condition, where it is, distance, walls, doors and materials between, and how loud or visible the event is. A sense at 0 does not work. A sense at 0.5 is impaired (half as good).',
    '   A THOUGHT reaches nobody except a being with a mind sense. The being the event comes from always perceives it.',
    '2. noticed: if it reaches, does the being consciously notice it? A being focused on something else can miss quiet or dull things. Loud, sudden, threatening things, or things aimed at the being, are noticed anyway. Higher Wisdom notices more.',
    '3. salience: 0 to 1, how much it stands out to this being.',
    'Answer with ONLY a JSON array, one object per being, in the order given. Example:',
    '[{"id":"b1","reach":true,"via":["hearing"],"noticed":true,"salience":0.6},{"id":"b2","reach":false,"via":[],"noticed":false,"salience":0}]',
    '"via" = the senses that carried it: sight, hearing, smell, taste, touch, or the name of a mind sense.',
  ].join('\n');
  const ids = new Map<string, string>();
  const lines = beings.map((b, i) => {
    const short = `b${i + 1}`;
    ids.set(short, b.id);
    const where = b.locationName ?? (b.locationId ? 'a placed location' : 'the same scene');
    const self = event.sourceId === b.id ? ' (the event comes from this being)' : event.targetId === b.id ? ' (the event is aimed at this being)' : '';
    return `${short} ${b.name}${self} — at ${where}. Senses: ${senseLine(b)}${b.wisdom != null ? ` Wisdom ${b.wisdom}.` : ''} Focus: ${b.focus?.trim() || 'nothing in particular'}.`;
  });
  const cues = cuesFromText(event.text);
  const kind = cues.kind ?? event.kind;
  const volume = event.volume ?? cues.volume ?? 'normal';
  const hidden = event.hidden ?? cues.hidden;
  const user = [
    `EVENT (${kind}${kind === 'speech' ? `, ${volume} volume` : ''}${hidden ? ', concealed' : ''}): ${JSON.stringify(event.text.slice(0, 600))}`,
    `From: ${event.sourceName ?? 'no one in particular'}. At: ${event.locationName ?? (event.locationId ? 'a placed location' : 'the scene')}.`,
    ...(event.setting ? [`Setting: ${event.setting.slice(0, 300)}`] : []),
    'BEINGS:',
    ...lines,
  ].join('\n');
  return { system, user, ids };
}

// ── Parse (Zod) ───────────────────────────────────────────────────────────

const verdictSchema = z.object({
  id: z.string(),
  reach: z.boolean(),
  via: z.array(z.string()).default([]),
  noticed: z.boolean(),
  salience: z.number().min(0).max(1),
});
export const reachOutputSchema = z.array(verdictSchema).min(1);

/** Strip fences / chatter around the array, Zod-validate. Throws on anything else. */
export function parseReachOutput(text: string): z.infer<typeof reachOutputSchema> {
  const cleaned = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = cleaned.indexOf('[');
  const end = cleaned.lastIndexOf(']');
  if (start < 0 || end <= start) throw new Error('reach: no JSON array in the output');
  const r = reachOutputSchema.safeParse(JSON.parse(cleaned.slice(start, end + 1)));
  if (!r.success) throw new Error(`reach: output failed validation: ${r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  return r.data;
}

/**
 * Apply the hard laws to the model's verdict: only senses the being has (> 0)
 * carry; a thought only via a mind sense; no reach → not noticed. A being the
 * model left out gets the stub verdict. Pure.
 */
export function lawfulVerdict(event: ReachEvent, b: ReachBeing, raw: z.infer<typeof verdictSchema> | undefined): ReachVerdict {
  if (!raw) return stubVerdict(event, b);
  if (event.sourceId === b.id) return stubVerdict(event, b);
  const thought = event.kind === 'thought' || cuesFromText(event.text).kind === 'thought';
  const minds = new Map(mindSenses(b).map((m) => [m.name.toLowerCase(), m.name]));
  const via = [...new Set(raw.via.map((v) => v.trim().toLowerCase()))].flatMap((v) => {
    if (minds.has(v)) return [minds.get(v)!];
    if (thought) return [];
    return (SENSE_KINDS as readonly string[]).includes(v) && (b.senses.effectiveness[v as SenseKind] ?? 0) > 0 ? [v] : [];
  });
  const reaches = raw.reach && via.length > 0;
  return { beingId: b.id, reaches, via: reaches ? via : [], noticed: reaches && raw.noticed, salience: reaches ? Math.round(clamp01(raw.salience) * 100) / 100 : 0 };
}

// ── Judge ─────────────────────────────────────────────────────────────────

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`reach: timed out after ${ms}ms`)), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

/**
 * One event, every being: does it reach, by which senses, is it noticed, how
 * salient. Flag off or no model → the stub. Never throws.
 */
export async function judgeReach(
  event: ReachEvent,
  beings: ReachBeing[],
  opts: { model?: ReachModel | null; timeoutMs?: number; force?: boolean } = {},
): Promise<ReachJudgement> {
  const t0 = Date.now();
  if (!beings.length) return { verdicts: new Map(), source: 'stub', ms: 0 };
  if ((!perceptionReachOn() && !opts.force) || !opts.model) return { verdicts: stubReach(event, beings), source: 'stub', ms: Date.now() - t0 };
  const model = opts.model;
  try {
    const verdicts = new Map<string, ReachVerdict>();
    // The source needs no judging; the rest go in chunks the small model can hold (normally one call).
    const judged = beings.filter((b) => b.id !== event.sourceId);
    for (const b of beings) if (b.id === event.sourceId) verdicts.set(b.id, stubVerdict(event, b));
    const chunks: ReachBeing[][] = [];
    for (let i = 0; i < judged.length; i += REACH_TUNING.maxBeingsPerCall) chunks.push(judged.slice(i, i + REACH_TUNING.maxBeingsPerCall));
    await withTimeout(Promise.all(chunks.map(async (chunk) => {
      const { system, user, ids } = buildReachPrompt(event, chunk);
      const text = await model({ system, user, maxTokens: 40 + chunk.length * REACH_TUNING.maxTokensPerBeing });
      const parsed = parseReachOutput(text);
      const byId = new Map(parsed.map((p) => [ids.get(p.id) ?? p.id, p]));
      for (const b of chunk) verdicts.set(b.id, lawfulVerdict(event, b, byId.get(b.id)));
    })), opts.timeoutMs ?? REACH_TUNING.timeoutMs);
    return { verdicts, source: 'model', ms: Date.now() - t0 };
  } catch (err) {
    return { verdicts: stubReach(event, beings), source: 'fallback', ms: Date.now() - t0, error: err instanceof Error ? err.message : String(err) };
  }
}
