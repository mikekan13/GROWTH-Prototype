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
 *   through lifetimes"). WIT = RETENTION: the perceiver's Wit scales the fade
 *   (witFadeFactor — higher Wit, slower fade; Mike 2026-10-09).
 *
 * Read by the mirror (daya/perceive: the place's stored familiarity sets the
 * scene attunement, unit 4); seeded on first contact by services/familiarity-seed —
 * recordExposure / recordExposureBatch run the seeder before counting a new row;
 * Watcher view via listFamiliarityForWatcher (GET /api/campaigns/[id]/familiarity).
 */
import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import type { Prisma } from '@/generated/prisma/client';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { requireCampaignGM } from '@/services/campaign-access';
import { RECALL_TUNING } from '@/daya/recall-tuning';
import { currentCycleOf } from '@/services/history';
import { listAspects } from '@/sim/perception/aspects';
import { WRONG_IMPRESSION_TUNING } from '@/sim/perception/wrong-impression';

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
  /**
   * WIT = RETENTION (Mike 2026-10-09: "depends on the entity's wit. Higher wit
   * means higher retention."). TUNING placeholders: the fade exponent is scaled
   * by witFadeFactor — 1 at `referenceWit` (recall's default Wit when a sheet
   * carries none, so the curve above is the reference being's), smaller (slower
   * fade) above it, larger below. Wit normalised like recall's pools (poolNorm:
   * max / 40, capped 1.2). Gain 1 → Wit 0 ×1.25, Wit 10 ×1, Wit 20 ×0.83, Wit 40 ×0.63.
   */
  witRetentionGain: 1,
  referenceWit: 10,
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
export function fadeFamiliarity(score: number, elapsed: number, witMax: number = FAMILIARITY_TUNING.referenceWit): number {
  const s = clamp01(score);
  const depth = Math.min(1, s / F5_SEAL);
  const effectiveExp = FAMILIARITY_TUNING.fadeExp * (1 - depth) * witFadeFactor(witMax);
  return s * Math.pow(1 + Math.max(0, elapsed), -effectiveExp);
}

/** Recall's pool normalisation (daya/recall poolNorm), kept local so this module stays a leaf. */
function witNorm(witMax: number): number {
  return Math.min(RECALL_TUNING.wisdomNormCap, Math.max(0, witMax / RECALL_TUNING.wisdomNormDivisor));
}

/**
 * WIT = RETENTION: the multiplier on the fade exponent — 1 at the reference
 * Wit, < 1 (slower fade) for higher Wit, > 1 for lower. The F5 seal still
 * stops the fade entirely whatever the Wit (Godheads seed at 1 → never fade).
 */
export function witFadeFactor(witMax: number): number {
  const g = FAMILIARITY_TUNING.witRetentionGain;
  const w = Number.isFinite(witMax) ? witMax : FAMILIARITY_TUNING.referenceWit;
  return (1 + g * witNorm(FAMILIARITY_TUNING.referenceWit)) / (1 + g * witNorm(w));
}

/**
 * Wit pool max from a sheet, read the way recall's Wit gate reads it
 * (daya/ensemble: level + augmentPositive − augmentNegative; no Wit on the
 * sheet → recall's default 10 = the reference Wit). Pure.
 */
export function witMaxFromSheet(sheet: unknown): number {
  const wit = (sheet as { attributes?: { wit?: { level?: number; augmentPositive?: number; augmentNegative?: number } } } | null)?.attributes?.wit;
  if (!wit || typeof wit.level !== 'number') return FAMILIARITY_TUNING.referenceWit;
  return wit.level + (wit.augmentPositive ?? 0) - (wit.augmentNegative ?? 0);
}

/** Each perceiver's (DayaEntity id) Wit, from its character sheet; unknown → the reference Wit. */
export async function witByPerceiver(perceiverIds: string[]): Promise<Map<string, number>> {
  const ids = [...new Set(perceiverIds)].filter(Boolean);
  const out = new Map<string, number>();
  if (!ids.length) return out;
  let rows: Array<{ id: string; character: { data: string } | null }> = [];
  try { rows = await prisma.dayaEntity.findMany({ where: { id: { in: ids } }, select: { id: true, character: { select: { data: true } } } }); }
  catch (err) { console.warn('[familiarity] Wit read failed; reference Wit used', err); }
  for (const r of rows) {
    let sheet: unknown = null;
    try { sheet = r.character?.data ? JSON.parse(r.character.data) : null; } catch { sheet = null; }
    out.set(r.id, witMaxFromSheet(sheet));
  }
  return out;
}

/** One perceiver's Wit (see witByPerceiver). */
export async function witOfPerceiver(perceiverId: string): Promise<number> {
  return (await witByPerceiver([perceiverId])).get(perceiverId) ?? FAMILIARITY_TUNING.referenceWit;
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
  /** Pointers kept on the change record (memory row / canon event / check). */
  refs: z.object({ memoryId: z.string().nullish(), canonEventId: z.string().nullish(), checkId: z.string().nullish() }).optional(),
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
  /** The WRONG value this perceiver believes of the aspect (shown as fact to it), null = none / fixed. */
  impression: string | null;
  updatedAt: Date;
}

const RECORD_SELECT = { perceiverId: true, subjectId: true, subjectKind: true, aspectKind: true, score: true, lastSource: true, lastCycle: true, impression: true, updatedAt: true } as const;

/**
 * A stored row's familiarity as of `nowCycle` — fadeFamiliarity over the
 * cycles since its last write (same unit memory decay uses). Rows without a
 * cycle stamp are returned unfaded.
 */
export function familiarityAt(rec: Pick<FamiliarityRecord, 'score' | 'lastCycle'>, nowCycle: number, witMax?: number): number {
  return rec.lastCycle === null ? rec.score : fadeFamiliarity(rec.score, nowCycle - rec.lastCycle, witMax);
}

function parse<T>(schema: z.ZodType<T>, input: unknown): T {
  const r = schema.safeParse(input);
  if (!r.success) throw new ValidationError(r.error.issues.map((i) => `${i.path.join('.') || 'input'}: ${i.message}`).join('; '));
  return r.data;
}

function toRecord(row: Omit<FamiliarityRecord, 'fidelity'>): FamiliarityRecord {
  return { ...row, fidelity: scoreToFidelity(row.score) };
}

export interface FamiliarityView extends FamiliarityRecord {
  /** The subject's display name (item / character / location), null if it is gone. */
  subjectName: string | null;
  /** Score faded to the campaign clock (what the being knows NOW); `score` is the stored value. */
  current: number;
  currentFidelity: number;
}

/**
 * Everything one being knows, for the Watcher (read-only debug view). GM of
 * the campaign or ADMIN. `perceiver` = the DayaEntity id or its characterId.
 */
export async function listFamiliarityForWatcher(
  campaignId: string,
  user: { id: string; role: string },
  perceiver: string,
): Promise<{ perceiverId: string; characterId: string | null; nowCycle: number; rows: FamiliarityView[] }> {
  await requireCampaignGM(campaignId, user);
  if (!perceiver) throw new ValidationError('perceiverId is required');
  const entity = await prisma.dayaEntity.findFirst({ where: { OR: [{ id: perceiver }, { characterId: perceiver }] }, select: { id: true, characterId: true } });
  if (!entity) throw new NotFoundError('No DAYA being with that id');
  const [nowCycle, witMax] = await Promise.all([currentCycleOf(campaignId), witOfPerceiver(entity.id)]);
  const rows = await prisma.familiarity.findMany({ where: { campaignId, perceiverId: entity.id }, select: RECORD_SELECT, orderBy: [{ subjectKind: 'asc' }, { subjectId: 'asc' }, { aspectKind: 'asc' }] });
  const ids = [...new Set(rows.map((r) => r.subjectId))];
  const [items, chars, locs] = ids.length ? await Promise.all([
    prisma.campaignItem.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
    prisma.character.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
    prisma.location.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }),
  ]) : [[], [], []];
  const names = new Map<string, string>([...items, ...chars, ...locs].map((r) => [r.id, r.name]));
  return {
    perceiverId: entity.id,
    characterId: entity.characterId ?? null,
    nowCycle,
    rows: rows.map((r) => {
      const current = familiarityAt(r, nowCycle, witMax);
      return { ...toRecord(r), subjectName: names.get(r.subjectId) ?? null, current, currentFidelity: scoreToFidelity(current) };
    }),
  };
}

// ── The one write path (append-only change record) ───────────────────────

/** What one familiarity write rests on — optional pointers kept on its change row. */
export interface FamiliarityChangeRefs { memoryId?: string | null; canonEventId?: string | null; checkId?: string | null }

/**
 * The stored row before a write (null = first contact). `impression` read = the wrong value held then;
 * a prior read WITHOUT the key leaves the stored impression untouched (it cannot be judged fixed).
 */
export type FamiliarityPrior = { score: number; lastCycle: number | null; impression?: string | null } | null;

export interface FamiliarityWrite {
  campaignId: string;
  perceiverId: string;
  subjectId: string;
  subjectKind: string;
  aspectKind: string;
  /** The score to store. */
  score: number;
  /** lastSource on the row; `source` on the change row. */
  source: string;
  cycle: number | null;
  /** The row as read inside this transaction before the write. */
  prior: FamiliarityPrior;
  /** Leave an existing row's subjectKind as stored (default: overwrite it). */
  keepSubjectKind?: boolean;
  refs?: FamiliarityChangeRefs;
  /** Set a WRONG impression (string) or clear one (null) outright; omitted = keep, or FIX (see impressionAfter). */
  impression?: string | null;
}

/**
 * The impression a write leaves (pure): an explicit `impression` wins; otherwise a held impression is FIXED
 * (cleared) by any non-'wrong' write that brings the aspect to WRONG_IMPRESSION_TUNING.fixFidelity or above
 * — a correct perception / inspection at sufficient fidelity (Mike 2026-10-09: "until it is 'fixed'").
 * `undefined` = the prior was read without its impression → leave the stored value alone.
 */
export function impressionAfter(w: Pick<FamiliarityWrite, 'impression' | 'prior' | 'score' | 'source'>): string | null | undefined {
  if (w.impression !== undefined) return w.impression;
  if (!w.prior || !('impression' in w.prior)) return w.prior ? undefined : null;
  const held = w.prior.impression ?? null;
  if (held && w.source !== WRONG_SOURCE && scoreToFidelity(w.score) >= WRONG_IMPRESSION_TUNING.fixFidelity) return null;
  return held;
}

/** lastSource of a wrong impression (inspection fumble). */
export const WRONG_SOURCE = 'wrong';

type FamiliarityTx = Pick<Prisma.TransactionClient, 'familiarity' | 'familiarityChange'>;

/**
 * THE write path for Familiarity ("all knowledge relabels past entries; the
 * system keeps the record" — Mike 2026-10-09). Upserts each row and appends
 * one FamiliarityChange per write (one createMany per call), inside the
 * caller's transaction so a batch stays one transaction. Change rows are
 * never updated or deleted. Every writer (exposure, batch, seed, inspect,
 * use, introductions, the Watcher's word) goes through here.
 */
export async function writeFamiliarity(tx: FamiliarityTx, writes: FamiliarityWrite[]): Promise<FamiliarityRecord[]> {
  const out: FamiliarityRecord[] = [];
  const imps: Array<string | null | undefined> = [];
  for (const w of writes) {
    const key = { perceiverId: w.perceiverId, subjectId: w.subjectId, aspectKind: w.aspectKind };
    const imp = impressionAfter(w);
    imps.push(imp);
    const row = await tx.familiarity.upsert({
      where: { perceiverId_subjectId_aspectKind: key },
      create: { ...key, campaignId: w.campaignId, subjectKind: w.subjectKind, score: w.score, lastSource: w.source, lastCycle: w.cycle, impression: imp ?? null },
      update: { score: w.score, lastSource: w.source, lastCycle: w.cycle, ...(w.keepSubjectKind ? {} : { subjectKind: w.subjectKind }), ...(imp !== undefined ? { impression: imp } : {}) },
      select: RECORD_SELECT,
    });
    out.push(toRecord(row));
  }
  if (writes.length) {
    await tx.familiarityChange.createMany({
      data: writes.map((w, i) => ({
        campaignId: w.campaignId, perceiverId: w.perceiverId, subjectId: w.subjectId, subjectKind: w.subjectKind, aspectKind: w.aspectKind,
        fromScore: w.prior?.score ?? null, fromCycle: w.prior?.lastCycle ?? null, toScore: w.score, source: w.source, cycle: w.cycle,
        memoryId: w.refs?.memoryId ?? null, canonEventId: w.refs?.canonEventId ?? null, checkId: w.refs?.checkId ?? null,
        // The impression record: a set, a FIX (from → null) or unchanged; unknown (prior read without it) = the prior's.
        fromImpression: w.prior?.impression ?? null, toImpression: imps[i] === undefined ? (w.prior?.impression ?? null) : imps[i],
      })),
    });
  }
  return out;
}

/** Read one row's prior inside a transaction (the change record's `from`). */
export async function priorOf(tx: FamiliarityTx, key: { perceiverId: string; subjectId: string; aspectKind: string }): Promise<FamiliarityPrior> {
  const row = await tx.familiarity.findUnique({ where: { perceiverId_subjectId_aspectKind: key }, select: { score: true, lastCycle: true, impression: true } });
  return row ? { score: row.score, lastCycle: row.lastCycle, impression: row.impression ?? null } : null;
}

export interface FamiliarityChangeView {
  subjectId: string; subjectKind: string; aspectKind: string;
  fromScore: number | null; fromCycle: number | null; toScore: number;
  source: string; cycle: number | null;
  memoryId: string | null; canonEventId: string | null; checkId: string | null;
  fromImpression: string | null; toImpression: string | null;
  createdAt: Date;
}

/**
 * The change record of one being, oldest first (internal: Watcher of the
 * campaign or ADMIN; deliberately NO API route — players never see it).
 * `perceiver` = DayaEntity id or characterId; optional subject/aspect filter.
 */
export async function listFamiliarityChanges(
  campaignId: string,
  user: { id: string; role: string },
  perceiver: string,
  opts: { subjectId?: string; aspectKind?: string; limit?: number } = {},
): Promise<FamiliarityChangeView[]> {
  await requireCampaignGM(campaignId, user);
  const entity = await prisma.dayaEntity.findFirst({ where: { OR: [{ id: perceiver }, { characterId: perceiver }] }, select: { id: true } });
  if (!entity) throw new NotFoundError('No DAYA being with that id');
  return prisma.familiarityChange.findMany({
    where: { campaignId, perceiverId: entity.id, ...(opts.subjectId ? { subjectId: opts.subjectId } : {}), ...(opts.aspectKind ? { aspectKind: opts.aspectKind } : {}) },
    select: { subjectId: true, subjectKind: true, aspectKind: true, fromScore: true, fromCycle: true, toScore: true, source: true, cycle: true, memoryId: true, canonEventId: true, checkId: true, fromImpression: true, toImpression: true, createdAt: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    take: Math.min(Math.max(1, opts.limit ?? 500), 5000),
  });
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
 * First contact BEFORE exposure is counted (Mike's seeding ruling: self /
 * owned / known category / Godhead start above zero). For every subject with
 * any of `aspects` not yet stored for this perceiver, run the unit-4 seeder
 * (services/familiarity-seed), which creates only missing rows; the exposure
 * then grows from the seeded score. A perceiver with no character (no DAYA
 * row / no characterId) cannot be classified and is left unseeded.
 */
async function seedFirstContacts(input: { campaignId: string; perceiverId: string; perceiverCharacterId?: string | null; subjects: Array<{ subjectId: string; subjectKind: SubjectKind }>; aspects: readonly string[] }): Promise<void> {
  if (!input.subjects.length || !input.aspects.length) return;
  const ids = input.subjects.map((s) => s.subjectId);
  const have = await prisma.familiarity.findMany({ where: { perceiverId: input.perceiverId, subjectId: { in: ids }, aspectKind: { in: [...input.aspects] } }, select: { subjectId: true, aspectKind: true } });
  const known = new Set(have.map((r) => `${r.subjectId}|${r.aspectKind}`));
  const fresh = input.subjects.filter((s) => input.aspects.some((a) => !known.has(`${s.subjectId}|${a}`)));
  if (!fresh.length) return;
  const characterId = input.perceiverCharacterId
    ?? (await prisma.dayaEntity.findUnique({ where: { id: input.perceiverId }, select: { characterId: true } }))?.characterId
    ?? null;
  if (!characterId) return;
  const { seedOnFirstContact, isGodheadBeing } = await import('@/services/familiarity-seed');
  const godhead = await isGodheadBeing(characterId);
  for (const s of fresh) {
    await seedOnFirstContact({ campaignId: input.campaignId, perceiverId: input.perceiverId, perceiverCharacterId: characterId, subjectId: s.subjectId, subjectKind: s.subjectKind, godhead });
  }
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
  if (v.source !== 'seed') {
    await seedFirstContacts({ campaignId: v.campaignId, perceiverId: v.perceiverId, subjects: [{ subjectId: v.subjectId, subjectKind: v.subjectKind }], aspects: [v.aspectKind] });
  }
  const lastCycle = v.cycle ?? await currentCycleOf(v.campaignId);
  const witMax = await witOfPerceiver(v.perceiverId);
  return prisma.$transaction(async (tx) => {
    const prior = await priorOf(tx, key);
    // Fade the prior up to this write before growing — re-stamping lastCycle must not erase the fade.
    const base = prior ? familiarityAt(prior, lastCycle, witMax) : 0;
    const score = v.source === 'seed' ? v.score! : growFamiliarity(base, v.source, v.times ?? 1);
    const [row] = await writeFamiliarity(tx, [{ ...key, campaignId: v.campaignId, subjectKind: v.subjectKind, score, source: v.source, cycle: lastCycle, prior, refs: v.refs }]);
    return row;
  });
}

/** The aspects a passive exposure touches — what the senses take in of a thing, never its stats (Mike Q1). */
export const PASSIVE_ASPECTS = ['identity', 'appearance'] as const;
/** Bound on one being's writes per pass (subjects × PASSIVE_ASPECTS). */
export const EXPOSURE_BATCH_CAP = 48;

export interface ExposureSubject { subjectId: string; subjectKind: SubjectKind; source: 'exposure' | 'own' }

/**
 * Perception units 6+7: one being's passive exposures for one pass (a round /
 * a beat), in ONE transaction — every noticed subject's passive aspects grow
 * once ('own' for its own items). Duplicates fold; the being itself is skipped
 * (self-perception is seeded, not exposed). Returns the rows written.
 */
export async function recordExposureBatch(input: { campaignId: string; perceiverId: string; perceiverCharacterId?: string | null; cycle?: number; subjects: ExposureSubject[]; refs?: FamiliarityChangeRefs }): Promise<number> {
  const seen = new Map<string, ExposureSubject>();
  for (const s of input.subjects) {
    if (!s.subjectId || s.subjectId === input.perceiverCharacterId) continue;
    const prior = seen.get(s.subjectId);
    if (!prior || (s.source === 'own' && prior.source !== 'own')) seen.set(s.subjectId, s);
  }
  const writes = [...seen.values()].flatMap((s) => PASSIVE_ASPECTS.map((aspectKind) => ({ ...s, aspectKind }))).slice(0, EXPOSURE_BATCH_CAP);
  if (!writes.length) return 0;
  await seedFirstContacts({
    campaignId: input.campaignId, perceiverId: input.perceiverId, perceiverCharacterId: input.perceiverCharacterId,
    subjects: [...new Map(writes.map((w) => [w.subjectId, w])).values()], aspects: PASSIVE_ASPECTS,
  });
  const lastCycle = input.cycle ?? await currentCycleOf(input.campaignId);
  const witMax = await witOfPerceiver(input.perceiverId);
  await prisma.$transaction(async (tx) => {
    const planned: FamiliarityWrite[] = [];
    for (const w of writes) {
      const key = { perceiverId: input.perceiverId, subjectId: w.subjectId, aspectKind: w.aspectKind };
      const prior = await priorOf(tx, key);
      const score = growFamiliarity(prior ? familiarityAt(prior, lastCycle, witMax) : 0, w.source);
      planned.push({ ...key, campaignId: input.campaignId, subjectKind: w.subjectKind, score, source: w.source, cycle: lastCycle, prior, refs: input.refs });
    }
    await writeFamiliarity(tx, planned);
  });
  return writes.length;
}

// ── Introductions + the Watcher's word ────────────────────────────────────

/**
 * TUNING (placeholder): the identity score an introduction sets — mid-F3, the
 * naming level (services/visible-form VISIBLE_FORM_TUNING.nameAt = 3 → 0.6),
 * with headroom so a name is not lost at the first fade (≈2 cycles at r 0.5).
 */
export const INTRODUCED_SCORE = 0.7;
/** lastSource of a name learned by introduction (a raise-to-at-least, not a growth step). */
export const INTRODUCED_SOURCE = 'introduced';
/** lastSource of a level the Watcher set by declaration. */
export const WATCHER_SOURCE = 'watcher';

/**
 * Drop the cached visible form of the perceiver's rows that name any of
 * `subjectIds` (the cache holds the entity ids it labelled), so old lines
 * re-label at the new familiarity, and nudge its feed. The render signature
 * already misses on a familiarity change; this makes it explicit + pushes.
 */
export async function invalidateVisibleFormsNaming(perceiverId: string, subjectIds: string[]): Promise<number> {
  if (!subjectIds.length) return 0;
  const r = await prisma.dayaMemoryEntry.updateMany({
    where: { entityId: perceiverId, visibleForm: { not: null }, OR: subjectIds.map((id) => ({ visibleForm: { contains: id } })) },
    data: { visibleForm: null },
  });
  try { (await import('@/lib/perceived-feed-push')).notifyMemoryWritten(perceiverId); } catch { /* push is a nudge only */ }
  return r.count;
}

/**
 * INTRODUCTIONS TEACH NAMES: raise the perceiver's identity familiarity with
 * each subject to AT LEAST INTRODUCED_SCORE (a higher, earned score is kept),
 * one transaction; first contact seeded first. Returns the subjects raised.
 */
export async function recordIntroductions(input: { campaignId: string; perceiverId: string; perceiverCharacterId?: string | null; cycle?: number; subjects: Array<{ subjectId: string; subjectKind: SubjectKind; /** The memory row the introduction was caught in (overrides refs.memoryId). */ memoryId?: string | null }>; refs?: FamiliarityChangeRefs }): Promise<string[]> {
  const subjects = [...new Map(input.subjects.filter((s) => s.subjectId && s.subjectId !== input.perceiverCharacterId).map((s) => [s.subjectId, s])).values()].slice(0, EXPOSURE_BATCH_CAP);
  if (!subjects.length) return [];
  await seedFirstContacts({ campaignId: input.campaignId, perceiverId: input.perceiverId, perceiverCharacterId: input.perceiverCharacterId, subjects, aspects: ['identity'] });
  const lastCycle = input.cycle ?? await currentCycleOf(input.campaignId);
  const witMax = await witOfPerceiver(input.perceiverId);
  const raised: string[] = [];
  await prisma.$transaction(async (tx) => {
    const planned: FamiliarityWrite[] = [];
    for (const s of subjects) {
      const key = { perceiverId: input.perceiverId, subjectId: s.subjectId, aspectKind: 'identity' };
      const prior = await priorOf(tx, key);
      const now = prior ? familiarityAt(prior, lastCycle, witMax) : 0;
      if (now >= INTRODUCED_SCORE) continue;
      planned.push({ ...key, campaignId: input.campaignId, subjectKind: s.subjectKind, score: INTRODUCED_SCORE, source: INTRODUCED_SOURCE, cycle: lastCycle, prior, keepSubjectKind: true, refs: { ...input.refs, ...(s.memoryId ? { memoryId: s.memoryId } : {}) } });
      raised.push(s.subjectId);
    }
    await writeFamiliarity(tx, planned);
  });
  if (raised.length) await invalidateVisibleFormsNaming(input.perceiverId, raised);
  return raised;
}

/** F-level → the stored score the Watcher's word sets (mid-band; F5 = sealed). Pure. */
export function scoreForLevel(level: number): number {
  const l = Math.max(0, Math.min(5, Math.floor(level)));
  return l === 0 ? 0 : l === 5 ? 0.97 : (l + 0.5) / 5;
}

export const watcherSetFamiliaritySchema = z.object({
  perceiverId: z.string().min(1),
  subjectId: z.string().min(1),
  aspectKind: z.string().min(1).max(200).default('identity'),
  level: z.number().int().min(0).max(5),
});

/**
 * The Watcher declares what a being knows ("they know each other" — Mike
 * 2026-10-09: party members' names are up to the GM's story, never seeded).
 * Sets one aspect to an F-level outright. GM of the campaign or ADMIN.
 * `perceiverId` = DayaEntity id or characterId; the subject = a character,
 * item or location of the campaign.
 */
export async function setFamiliarityByWatcher(campaignId: string, user: { id: string; role: string }, input: unknown): Promise<FamiliarityRecord> {
  await requireCampaignGM(campaignId, user);
  const v = parse(watcherSetFamiliaritySchema, input);
  const entity = await prisma.dayaEntity.findFirst({ where: { OR: [{ id: v.perceiverId }, { characterId: v.perceiverId }] }, select: { id: true, characterId: true, character: { select: { campaignId: true } } } });
  if (!entity || entity.character?.campaignId !== campaignId) throw new NotFoundError('No DAYA being with that id in this campaign');
  const [ch, item, loc] = await Promise.all([
    prisma.character.findFirst({ where: { id: v.subjectId, campaignId }, select: { entityType: true } }),
    prisma.campaignItem.findFirst({ where: { id: v.subjectId, campaignId }, select: { id: true } }),
    prisma.location.findFirst({ where: { id: v.subjectId, campaignId }, select: { id: true } }),
  ]);
  const subjectKind: SubjectKind | null = ch ? (v.subjectId === entity.characterId ? 'SELF' : ch.entityType === 'NPC' ? 'NPC' : 'CHARACTER') : item ? 'ITEM' : loc ? 'LOCATION' : null;
  if (!subjectKind) throw new NotFoundError('No character, item or location with that id in this campaign');
  const key = { perceiverId: entity.id, subjectId: v.subjectId, aspectKind: v.aspectKind };
  const score = scoreForLevel(v.level);
  const lastCycle = await currentCycleOf(campaignId);
  const row = await prisma.$transaction(async (tx) => {
    const prior = await priorOf(tx, key);
    const [r] = await writeFamiliarity(tx, [{ ...key, campaignId, subjectKind, score, source: WATCHER_SOURCE, cycle: lastCycle, prior }]);
    return r;
  });
  await invalidateVisibleFormsNaming(entity.id, [v.subjectId]);
  return row;
}

/**
 * Perception unit 12 — USE TEACHES: one round's item uses (sim/perception/use.usesFromRound), written
 * once per being in ONE transaction, source 'use' (the small step), regardless of domain knowledge. Only
 * aspects the item actually has are written; first contact is seeded first (an owned item starts known).
 * `uses` carry characterIds; beings without a DAYA row are skipped. Returns the rows written.
 */
export async function recordUseBatch(input: { campaignId: string; cycle?: number; uses: Array<{ userId: string; itemId: string; aspects: string[] }>; refs?: FamiliarityChangeRefs; /** Per user (characterId): its own row this round (merged over refs). */ refsByUser?: Record<string, FamiliarityChangeRefs> }): Promise<number> {
  if (!input.uses.length) return 0;
  const itemIds = [...new Set(input.uses.map((u) => u.itemId))];
  const items = await prisma.campaignItem.findMany({ where: { id: { in: itemIds } }, select: { id: true, data: true } });
  const has = new Map(items.map((i) => [i.id, new Set(listAspects(i.data))]));
  const lastCycle = input.cycle ?? await currentCycleOf(input.campaignId);
  let written = 0;
  for (const characterId of [...new Set(input.uses.map((u) => u.userId))]) {
    const entity = await prisma.dayaEntity.findUnique({ where: { characterId }, select: { id: true } });
    if (!entity) continue;
    const witMax = await witOfPerceiver(entity.id);
    const writes = input.uses.filter((u) => u.userId === characterId)
      .flatMap((u) => u.aspects.filter((a) => has.get(u.itemId)?.has(a)).map((aspectKind) => ({ subjectId: u.itemId, aspectKind })))
      .slice(0, EXPOSURE_BATCH_CAP);
    if (!writes.length) continue;
    await seedFirstContacts({
      campaignId: input.campaignId, perceiverId: entity.id, perceiverCharacterId: characterId,
      subjects: [...new Set(writes.map((w) => w.subjectId))].map((subjectId) => ({ subjectId, subjectKind: 'ITEM' as const })),
      aspects: [...new Set(writes.map((w) => w.aspectKind))],
    });
    await prisma.$transaction(async (tx) => {
      const planned: FamiliarityWrite[] = [];
      for (const w of writes) {
        const key = { perceiverId: entity.id, subjectId: w.subjectId, aspectKind: w.aspectKind };
        const prior = await priorOf(tx, key);
        const score = growFamiliarity(prior ? familiarityAt(prior, lastCycle, witMax) : 0, 'use');
        planned.push({ ...key, campaignId: input.campaignId, subjectKind: 'ITEM', score, source: 'use', cycle: lastCycle, prior, keepSubjectKind: true, refs: { ...input.refs, ...input.refsByUser?.[characterId] } });
      }
      await writeFamiliarity(tx, planned);
    });
    written += writes.length;
  }
  return written;
}
