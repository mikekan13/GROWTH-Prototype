/**
 * Familiarity store — how well one being knows one aspect of one thing
 * (Mike 2026-10-08/09, perception rulings; memory
 * `ruling-passive-active-perception-familiarity-2026-10-08`).
 *
 * - Per perceiver, per subject, PER ASPECT (a sword's damage and its history
 *   are known separately). Subjects include the being itself (SELF).
 * - Score 0..1 maps onto the murky mirror's F0–F5 ladder (daya/renderer-math
 *   `computeFidelityLevel`: floor(x*5), F5 sealed at >= 0.95).
 * - GROWTH: diminishing returns per exposure; the step depends on the source
 *   (glance tiny < use small < ownership steady < successful inspection big).
 * - FADE: the memory curve (daya/recall `computeRecency`, power law) with
 *   familiarity playing salience's role — the deeper it is the slower it
 *   fades; at the F5 seal it does not fade at all ("would easily remain solid
 *   through lifetimes").
 *
 * Invisible for now: nothing in perception reads this store yet (unit 4).
 */
import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ValidationError } from '@/lib/errors';
import { RECALL_TUNING } from '@/daya/recall-tuning';
import { currentCycleOf } from '@/services/history';

// ── Vocabulary ────────────────────────────────────────────────────────────

export const FAMILIARITY_SOURCES = ['exposure', 'use', 'own', 'inspect', 'seed'] as const;
export type FamiliaritySource = (typeof FAMILIARITY_SOURCES)[number];
/** Sources that grow a score (seed sets it outright). */
export type GrowthSource = Exclude<FamiliaritySource, 'seed'>;

/** EntityRelationship's type vocabulary, plus SELF for self-perception. */
export const SUBJECT_KINDS = ['ITEM', 'CHARACTER', 'NPC', 'LOCATION', 'GODHEAD', 'SELF'] as const;
export type SubjectKind = (typeof SUBJECT_KINDS)[number];

// ── Tuning ────────────────────────────────────────────────────────────────

/**
 * TUNING NUMBERS — placeholders. Mike 2026-10-09: "Exact step sizes = tuning
 * numbers, set from a live run (not now)." Each step is the share of the
 * REMAINING distance to 1 that one exposure closes, so returns diminish.
 * Exposures from zero to the F5 seal (0.95): exposure ≈ 298, use ≈ 98,
 * own ≈ 58, inspect ≈ 11.
 */
export const FAMILIARITY_TUNING = {
  step: {
    exposure: 0.01, // a glance / being in the same room
    use: 0.03,      // handling or using it once
    own: 0.05,      // one ownership tick (steady over time)
    inspect: 0.25,  // a successful inspection check (the big jump)
  } satisfies Record<GrowthSource, number>,
  /** Power-law exponent — the memory curve's r (RECALL_TUNING.decayExp). */
  fadeExp: RECALL_TUNING.decayExp,
} as const;

/** The F5 seal — same gate as the mirror's ladder (renderer-math). */
export const F5_SEAL = 0.95;

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));

// ── Pure helpers ──────────────────────────────────────────────────────────

/** 0..1 → F0..F5. Same ladder as daya/renderer-math computeFidelityLevel (uncapped subject). */
export function scoreToFidelity(score: number): number {
  const s = clamp01(score);
  if (s >= F5_SEAL) return 5;
  return Math.min(4, Math.floor(s * 5));
}

/**
 * One or more exposures from one source. Each closes `step` of the remaining
 * distance to 1 (diminishing returns); `times` exposures compound.
 */
export function growFamiliarity(score: number, source: GrowthSource, times = 1): number {
  const step = FAMILIARITY_TUNING.step[source];
  const n = Math.max(0, Math.floor(times));
  return clamp01(1 - (1 - clamp01(score)) * Math.pow(1 - step, n));
}

/**
 * Familiarity after `elapsed` time without exposure (same unit the memory
 * curve uses: narrative cycles). Shape = computeRecency: (1 + t)^(-exp), with
 * exp = r * (1 - depth), depth = score / F5_SEAL — salience's role played by
 * familiarity, scaled so the F5 seal stops the fade entirely.
 */
export function fadeFamiliarity(score: number, elapsed: number): number {
  const s = clamp01(score);
  const depth = Math.min(1, s / F5_SEAL);
  const effectiveExp = FAMILIARITY_TUNING.fadeExp * (1 - depth);
  return s * Math.pow(1 + Math.max(0, elapsed), -effectiveExp);
}

// ── Store ─────────────────────────────────────────────────────────────────

const keySchema = z.object({
  perceiverId: z.string().min(1),
  subjectId: z.string().min(1),
  aspectKind: z.string().min(1).max(200),
});

export const recordExposureSchema = keySchema.extend({
  campaignId: z.string().min(1),
  subjectKind: z.enum(SUBJECT_KINDS),
  source: z.enum(FAMILIARITY_SOURCES),
  /** Repeated exposures folded into one write (growth sources only). */
  times: z.number().int().min(1).max(10_000).optional(),
  /** The score to set — required for 'seed', refused otherwise. */
  score: z.number().min(0).max(1).optional(),
  /** Campaign clock (meta cycles) of this exposure; defaults to the campaign's current cycle. */
  cycle: z.number().finite().optional(),
}).refine((v) => (v.source === 'seed') === (v.score !== undefined), {
  message: "score is required for source 'seed' and only for it",
  path: ['score'],
});

export type RecordExposureInput = z.input<typeof recordExposureSchema>;

export interface FamiliarityRecord {
  perceiverId: string;
  subjectId: string;
  subjectKind: string;
  aspectKind: string;
  score: number;
  fidelity: number;
  lastSource: string;
  /** Campaign clock (meta cycles) at the last write — the fade anchor; null on pre-2026-10-09 rows. */
  lastCycle: number | null;
  updatedAt: Date;
}

const RECORD_SELECT = { perceiverId: true, subjectId: true, subjectKind: true, aspectKind: true, score: true, lastSource: true, lastCycle: true, updatedAt: true } as const;

/**
 * A stored row's familiarity as of `nowCycle` — fadeFamiliarity over the
 * cycles since its last write (same unit memory decay uses). Rows without a
 * cycle stamp are returned unfaded.
 */
export function familiarityAt(rec: Pick<FamiliarityRecord, 'score' | 'lastCycle'>, nowCycle: number): number {
  return rec.lastCycle === null ? rec.score : fadeFamiliarity(rec.score, nowCycle - rec.lastCycle);
}

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const r = schema.safeParse(input);
  if (!r.success) throw new ValidationError(r.error.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; '));
  return r.data;
}

function toRecord(row: Omit<FamiliarityRecord, 'fidelity'>): FamiliarityRecord {
  return { ...row, fidelity: scoreToFidelity(row.score) };
}

/** The stored familiarity (unfaded), or null if this being has never met this aspect. */
export async function getFamiliarity(perceiverId: string, subjectId: string, aspectKind: string): Promise<FamiliarityRecord | null> {
  const key = parse(keySchema, { perceiverId, subjectId, aspectKind });
  const row = await prisma.familiarity.findUnique({
    where: { perceiverId_subjectId_aspectKind: key },
    select: RECORD_SELECT,
  });
  return row ? toRecord(row) : null;
}

/**
 * Record exposure of a being to one aspect of a subject. Growth sources raise
 * the stored score along the diminishing-returns curve; 'seed' sets it.
 * Stamps lastCycle (`cycle`, else the campaign clock) as the fade anchor.
 * Fade is not applied here — it is a read-time view (familiarityAt).
 */
export async function recordExposure(input: RecordExposureInput): Promise<FamiliarityRecord> {
  const v = parse(recordExposureSchema, input);
  const key = { perceiverId: v.perceiverId, subjectId: v.subjectId, aspectKind: v.aspectKind };
  const lastCycle = v.cycle ?? await currentCycleOf(v.campaignId);
  const row = await prisma.$transaction(async (tx) => {
    const prior = await tx.familiarity.findUnique({ where: { perceiverId_subjectId_aspectKind: key }, select: { score: true, lastCycle: true } });
    // Fade the prior up to this write before growing — re-stamping lastCycle must not erase the fade.
    const base = prior ? familiarityAt(prior, lastCycle) : 0;
    const score = v.source === 'seed' ? v.score! : growFamiliarity(base, v.source, v.times ?? 1);
    return tx.familiarity.upsert({
      where: { perceiverId_subjectId_aspectKind: key },
      create: { ...key, campaignId: v.campaignId, subjectKind: v.subjectKind, score, lastSource: v.source, lastCycle },
      update: { score, lastSource: v.source, subjectKind: v.subjectKind, lastCycle },
      select: RECORD_SELECT,
    });
  });
  return toRecord(row);
}
