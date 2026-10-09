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
 * Read by the mirror (daya/perceive: the place's stored familiarity sets the
 * scene attunement, unit 4); seeded on first contact by services/familiarity-seed —
 * recordExposure / recordExposureBatch run the seeder before counting a new row;
 * Watcher view via listFamiliarityForWatcher (GET /api/campaigns/[id]/familiarity).
 */
import 'server-only';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { NotFoundError, ValidationError } from '@/lib/errors';
import { requireCampaignGM } from '@/services/campaign-access';
import { RECALL_TUNING } from '@/daya/recall-tuning';
import { currentCycleOf } from '@/services/history';
import { listAspects } from '@/sim/perception/aspects';

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
  const nowCycle = await currentCycleOf(campaignId);
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
      const current = familiarityAt(r, nowCycle);
      return { ...toRecord(r), subjectName: names.get(r.subjectId) ?? null, current, currentFidelity: scoreToFidelity(current) };
    }),
  };
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
export async function recordExposureBatch(input: { campaignId: string; perceiverId: string; perceiverCharacterId?: string | null; cycle?: number; subjects: ExposureSubject[] }): Promise<number> {
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
  await prisma.$transaction(async (tx) => {
    for (const w of writes) {
      const key = { perceiverId: input.perceiverId, subjectId: w.subjectId, aspectKind: w.aspectKind };
      const prior = await tx.familiarity.findUnique({ where: { perceiverId_subjectId_aspectKind: key }, select: { score: true, lastCycle: true } });
      const score = growFamiliarity(prior ? familiarityAt(prior, lastCycle) : 0, w.source);
      await tx.familiarity.upsert({
        where: { perceiverId_subjectId_aspectKind: key },
        create: { ...key, campaignId: input.campaignId, subjectKind: w.subjectKind, score, lastSource: w.source, lastCycle },
        update: { score, lastSource: w.source, subjectKind: w.subjectKind, lastCycle },
      });
    }
  });
  return writes.length;
}

/**
 * Perception unit 12 — USE TEACHES: one round's item uses (sim/perception/use.usesFromRound), written
 * once per being in ONE transaction, source 'use' (the small step), regardless of domain knowledge. Only
 * aspects the item actually has are written; first contact is seeded first (an owned item starts known).
 * `uses` carry characterIds; beings without a DAYA row are skipped. Returns the rows written.
 */
export async function recordUseBatch(input: { campaignId: string; cycle?: number; uses: Array<{ userId: string; itemId: string; aspects: string[] }> }): Promise<number> {
  if (!input.uses.length) return 0;
  const itemIds = [...new Set(input.uses.map((u) => u.itemId))];
  const items = await prisma.campaignItem.findMany({ where: { id: { in: itemIds } }, select: { id: true, data: true } });
  const has = new Map(items.map((i) => [i.id, new Set(listAspects(i.data))]));
  const lastCycle = input.cycle ?? await currentCycleOf(input.campaignId);
  let written = 0;
  for (const characterId of [...new Set(input.uses.map((u) => u.userId))]) {
    const entity = await prisma.dayaEntity.findUnique({ where: { characterId }, select: { id: true } });
    if (!entity) continue;
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
      for (const w of writes) {
        const key = { perceiverId: entity.id, subjectId: w.subjectId, aspectKind: w.aspectKind };
        const prior = await tx.familiarity.findUnique({ where: { perceiverId_subjectId_aspectKind: key }, select: { score: true, lastCycle: true } });
        const score = growFamiliarity(prior ? familiarityAt(prior, lastCycle) : 0, 'use');
        await tx.familiarity.upsert({
          where: { perceiverId_subjectId_aspectKind: key },
          create: { ...key, campaignId: input.campaignId, subjectKind: 'ITEM', score, lastSource: 'use', lastCycle },
          update: { score, lastSource: 'use', lastCycle },
        });
      }
    });
    written += writes.length;
  }
  return written;
}
