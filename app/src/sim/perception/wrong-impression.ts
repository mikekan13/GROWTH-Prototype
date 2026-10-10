/**
 * WRONG IMPRESSIONS SHOW AS RECEIVED (Mike 2026-10-09 morning: "should show how it was received... saw a
 * golden button on a blouse but it was actually silver. Then it shows as gold for that entity until it is
 * 'fixed'").
 *
 * When a perceiver takes a WRONG impression of one aspect (today: an inspection fumble, sim/perception/
 * inspect planInspection op 'wrong'), the system stores the WRONG VALUE it perceived — a display-ready
 * string in the same register as the tooltip's value line — on its Familiarity row (`impression`). The
 * tooltip / feed show it as fact for that perceiver (no marker). The truth record is never touched.
 *
 * The wrong value comes from the small model (classify lane — injected here, routed by the service) with a
 * DETERMINISTIC FALLBACK that perturbs the true value and words it at a believed fidelity (F3, "named /
 * rough band"). Pure apart from the injected model call.
 */
import { z } from 'zod';
import { aspectFact, type AspectSubject } from './aspect-values';
import { parseAspectKey } from './aspects';

/** Deterministic FNV-1a + xorshift to [0, 1) — the same discipline as daya/recall seededRandom01 (kept local: this module stays pure/client-safe). */
function seededRandom01(seedKey: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seedKey.length; i++) { h ^= seedKey.charCodeAt(i); h = Math.imul(h, 16777619); }
  h ^= h << 13; h ^= h >>> 17; h ^= h << 5;
  return ((h >>> 0) % 1_000_000) / 1_000_000;
}

/** TUNING — placeholders. */
export const WRONG_IMPRESSION_TUNING = {
  /** The fidelity a wrong impression is worded at — believed as a plain fact ("roughly 24–40 lbs", "Worn"). */
  believedFidelity: 3,
  /** A later write of the aspect at or above this fidelity FIXES the impression (correct knowledge replaces it). */
  fixFidelity: 3,
  /** Numeric perturbations (×) the fallback picks from, seeded — far enough off to be wrong at F3. */
  factors: [0.5, 0.6, 1.7, 2],
  /** The model call's wall-clock cap; after it the fallback stands. */
  timeoutMs: 4000,
  maxChars: 80,
} as const;

/** The small-model transport (same shape as the reach pass's). */
export type WrongImpressionModel = (prompt: { system: string; user: string; maxTokens: number }) => Promise<string>;

const pickFactor = (seed: string) => {
  const f = WRONG_IMPRESSION_TUNING.factors;
  return f[Math.floor(seededRandom01(seed) * f.length) % f.length];
};

/**
 * The deterministic wrong value: perturb the true value, word it at the believed fidelity. null when the
 * aspect has no standing value to misjudge this way (appearance, property, history…: the model's job). Pure.
 */
export function fallbackWrongValue(aspectKey: string, subject: AspectSubject, seed: string): string | null {
  const { kind, instanceId } = parseAspectKey(aspectKey);
  const d = { ...(subject.item ?? {}) } as NonNullable<AspectSubject['item']> & Record<string, unknown>;
  const k = pickFactor(`wrong:${seed}:${aspectKey}`);
  const at = (s: AspectSubject) => aspectFact(aspectKey, WRONG_IMPRESSION_TUNING.believedFidelity, s)?.value ?? null;
  const truth = at(subject);
  let wrong: string | null = null;
  switch (kind) {
    case 'weight':
      if (typeof d.weightLbs === 'number') d.weightLbs = d.weightLbs * k;
      else if (typeof d.weightLevel === 'number') d.weightLevel = d.weightLevel * k;
      wrong = at({ ...subject, item: d });
      break;
    case 'hardness':
      if (typeof d.baseResist === 'number') d.baseResist = d.baseResist * k;
      else if (typeof d.resistance === 'number') d.resistance = d.resistance * k;
      wrong = at({ ...subject, item: d });
      break;
    case 'value':
      if (typeof d.value === 'number') d.value = Math.max(1, d.value * k);
      wrong = at({ ...subject, item: d });
      break;
    case 'quality':
      if (typeof d.quality === 'number') d.quality = d.quality >= 6 ? d.quality - 4 : d.quality + 4;
      wrong = at({ ...subject, item: d });
      break;
    case 'rarity':
      if (typeof d.rarity === 'number') d.rarity = d.rarity >= 6 ? d.rarity - 4 : d.rarity + 4;
      else if (typeof d.rarity === 'string') d.rarity = d.rarity === 'common' ? 'rare' : 'common';
      wrong = at({ ...subject, item: d });
      break;
    case 'condition':
      if (typeof d.condition === 'number') d.condition = d.condition >= 3 ? 2 : d.condition + 1;
      wrong = at({ ...subject, item: d });
      break;
    case 'damage':
      if (d.damage && typeof d.damage === 'object') d.damage = Object.fromEntries(Object.entries(d.damage as Record<string, number>).map(([t, v]) => [t, typeof v === 'number' ? Math.max(1, Math.round(v * k)) : v])) as typeof d.damage;
      wrong = at({ ...subject, item: d });
      break;
    case 'material': {
      const subs = Array.isArray(d.subordinateMaterials) ? d.subordinateMaterials.filter((s): s is string => typeof s === 'string' && !!s) : [];
      const primary = (d.primaryMaterial || d.material || null) as string | null;
      // Mistakes one of its own materials for the main one ("the hilt's brass, so it's brass").
      wrong = primary && subs.length ? subs[Math.floor(seededRandom01(`wrong-mat:${seed}`) * subs.length) % subs.length] : null;
      break;
    }
    case 'ability':
      // Takes an enchanted thing for a mundane one.
      wrong = instanceId ? 'nothing special about it' : null;
      break;
    case 'attribute': {
      const a = instanceId ? subject.being?.attrs?.[instanceId] : undefined;
      if (a) wrong = at({ ...subject, being: { ...subject.being, attrs: { ...subject.being?.attrs, [instanceId!]: { current: a.current * k, max: a.max * k } } } });
      break;
    }
    case 'pools': {
      const p = subject.being?.pools;
      if (p) wrong = at({ ...subject, being: { ...subject.being, pools: { body: Math.round(p.body * k), spirit: Math.round(p.spirit * k), soul: Math.round(p.soul * k) } } });
      break;
    }
    default:
      wrong = null;
  }
  if (!wrong || (truth && wrong.trim().toLowerCase() === truth.trim().toLowerCase())) return null;
  return wrong;
}

/** The small-model prompt: the true value at full fidelity, ask for a plausible misperception. Pure. */
export function buildWrongImpressionPrompt(aspectKey: string, subject: AspectSubject, subjectName: string): { system: string; user: string } | null {
  const truth = aspectFact(aspectKey, 5, subject);
  const look = subject.description?.trim() || null;
  if (!truth && !(parseAspectKey(aspectKey).kind === 'appearance' && look)) return null;
  const system = [
    'You simulate a mistaken perception in a tabletop roleplaying game.',
    'Someone looked closely at a thing and got ONE detail wrong — the kind of mistake a person really makes (silver taken for gold, worn taken for whole, heavier than it is).',
    'Give the WRONG value as they now believe it, worded plainly as a fact, at most 8 words, never the true value, no hedging, no explanation.',
    'Answer ONLY JSON: {"value":"..."}',
  ].join('\n');
  const user = [
    `Thing: ${subjectName}.`,
    ...(look ? [`What it looks like: ${look.slice(0, 300)}`] : []),
    `Detail they got wrong: ${truth?.label ?? 'Appearance'}. True value: ${truth?.value ?? look}.`,
  ].join('\n');
  return { system, user };
}

const outputSchema = z.object({ value: z.string().min(1).max(200) });

/** Strip fences, Zod-validate, refuse the truth and over-long answers. Throws on anything else. Pure. */
export function parseWrongImpression(text: string, truth: string | null): string {
  const cleaned = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('wrong-impression: no JSON object');
  const r = outputSchema.safeParse(JSON.parse(cleaned.slice(start, end + 1)));
  if (!r.success) throw new Error('wrong-impression: invalid output');
  const v = r.data.value.trim().replace(/\s+/g, ' ');
  if (v.length > WRONG_IMPRESSION_TUNING.maxChars) throw new Error('wrong-impression: too long');
  if (truth && v.toLowerCase() === truth.trim().toLowerCase()) throw new Error('wrong-impression: the truth, not a mistake');
  return v;
}

/**
 * The wrong value one perceiver takes away: the model's (time-capped), else the deterministic fallback,
 * else null (nothing plausible to say — the row keeps only its 'wrong' mark). Never throws.
 */
export async function wrongImpressionFor(
  aspectKey: string,
  subject: AspectSubject,
  opts: { seed: string; subjectName: string; model?: WrongImpressionModel | null },
): Promise<{ value: string | null; source: 'model' | 'fallback' | 'none' }> {
  const fallback = () => {
    const v = fallbackWrongValue(aspectKey, subject, opts.seed);
    return { value: v, source: v ? 'fallback' as const : 'none' as const };
  };
  if (!opts.model) return fallback();
  const prompt = buildWrongImpressionPrompt(aspectKey, subject, opts.subjectName);
  if (!prompt) return fallback();
  const truth = aspectFact(aspectKey, 5, subject)?.value ?? null;
  try {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new Error('timeout')), WRONG_IMPRESSION_TUNING.timeoutMs); });
    const text = await Promise.race([opts.model({ ...prompt, maxTokens: 60 }), timeout]).finally(() => clearTimeout(timer));
    return { value: parseWrongImpression(text, truth), source: 'model' };
  } catch (err) {
    console.warn('[wrong-impression] model failed; deterministic fallback', err instanceof Error ? err.message : err);
    return fallback();
  }
}
