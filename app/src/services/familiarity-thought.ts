/**
 * THINKING ABOUT IT REFRESHES IT (Mike 2026-10-09; memory
 * `ruling-passive-active-perception-familiarity-2026-10-08`): "someone thinking
 * about someone isn't going to forget things about them if they are on their
 * mind a lot." A being's own thought that touches a subject it ALREADY knows
 * refreshes that familiarity — source 'thought', the fade clock reset (the
 * fade is applied first, then lastCycle = now), and a small strengthen with
 * diminishing returns.
 *
 * Thoughts come from: the listening monologue (daya/ensemble listenStimulus),
 * ((thought)) segments in a being's own line (answerAsk), and recall surfacing
 * (daya/recall — beside the salience rehearsal touch).
 *
 * Laws:
 * - Never teaches: only rows that already exist with score > 0 are touched.
 *   Thinking about a stranger teaches nothing; an unknown id or name is ignored.
 * - Never fixes a wrong impression (it is the being's own belief being rehearsed).
 * - Godheads unaffected; SELF rows are not refreshed (self-perception is seeded).
 * - Bounded: one transaction per call, at most THOUGHT_REFRESH_TUNING.maxWrites
 *   rows, and a row already refreshed by thought at this cycle is skipped — so a
 *   being's several thoughts within one beat refresh each row once.
 * - All writes through writeFamiliarity (FamiliarityChange logs them).
 */
import 'server-only';
import { prisma } from '@/lib/db';
import { currentCycleOf } from '@/services/history';
import { familiarityAt, witOfPerceiver, writeFamiliarity, type FamiliarityChangeRefs, type FamiliarityWrite } from '@/services/familiarity';

/** lastSource / change-row source of a refresh by thought. */
export const THOUGHT_SOURCE = 'thought';

/**
 * TUNING NUMBERS — placeholders until a live run (as FAMILIARITY_TUNING).
 * `step` = share of the REMAINING distance to 1 one refresh closes (diminishing
 * returns; between exposure 0.01 and use 0.03). `maxWrites` bounds one call.
 */
export const THOUGHT_REFRESH_TUNING = {
  step: 0.02,
  maxWrites: 48,
  /** A person is thought of by first name: also match a CHARACTER/NPC's first word at least this long. */
  firstNameMinLength: 3,
} as const;

/** One refresh: fade-then-grow by the thought step. Pure. */
export function refreshByThought(fadedScore: number): number {
  const s = Math.min(1, Math.max(0, fadedScore));
  return Math.min(1, 1 - (1 - s) * (1 - THOUGHT_REFRESH_TUNING.step));
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Which of the known subjects a stretch of thought names — whole-word,
 * case-insensitive; a person (CHARACTER / NPC) also by first name. Pure.
 */
export function subjectsNamedIn(texts: string[], known: Array<{ id: string; name: string; kind: string }>): string[] {
  const hay = texts.filter(Boolean).join('\n');
  if (!hay.trim()) return [];
  const out: string[] = [];
  for (const k of known) {
    const name = (k.name ?? '').trim();
    if (!name) continue;
    const forms = [name];
    if (k.kind === 'CHARACTER' || k.kind === 'NPC') {
      const first = name.split(/\s+/)[0];
      if (first && first !== name && first.length >= THOUGHT_REFRESH_TUNING.firstNameMinLength) forms.push(first);
    }
    if (forms.some((f) => new RegExp(`(?<![\\p{L}\\p{N}])${escapeRe(f)}(?![\\p{L}\\p{N}])`, 'iu').test(hay))) out.push(k.id);
  }
  return out;
}

export interface ThoughtRefreshInput {
  /** The thinker's DayaEntity id. */
  perceiverId: string;
  /** Subjects the loop already resolved (memory entityRefs etc.) — unknown ids are ignored. */
  subjectIds?: string[];
  /** The thought itself — name-matched against subjects the thinker already knows. */
  texts?: string[];
  refs?: FamiliarityChangeRefs;
}

/**
 * Refresh the thinker's familiarity with every subject its thought touches
 * that it already knows. Returns the number of rows written. Never throws for
 * a missing being; callers treat it as non-fatal bookkeeping.
 */
export async function refreshFamiliarityByThought(input: ThoughtRefreshInput): Promise<number> {
  const ids = new Set((input.subjectIds ?? []).filter(Boolean));
  const texts = (input.texts ?? []).filter((t) => t && t.trim());
  if (!ids.size && !texts.length) return 0;

  const entity = await prisma.dayaEntity.findUnique({ where: { id: input.perceiverId }, select: { characterId: true } });
  if (!entity?.characterId) return 0;
  const { isGodheadBeing } = await import('@/services/familiarity-seed');
  if (await isGodheadBeing(entity.characterId)) return 0;

  const rows = await prisma.familiarity.findMany({
    where: { perceiverId: input.perceiverId, score: { gt: 0 }, subjectKind: { not: 'SELF' }, subjectId: { not: entity.characterId } },
    select: { campaignId: true, subjectId: true, subjectKind: true, aspectKind: true },
  });
  if (!rows.length) return 0;

  const touched = new Set<string>();
  for (const r of rows) if (ids.has(r.subjectId)) touched.add(r.subjectId);
  if (texts.length) {
    const kindOf = new Map(rows.map((r) => [r.subjectId, r.subjectKind]));
    const unknownIds = [...kindOf.keys()].filter((id) => !touched.has(id));
    if (unknownIds.length) {
      const [chars, items, locs] = await Promise.all([
        prisma.character.findMany({ where: { id: { in: unknownIds } }, select: { id: true, name: true } }),
        prisma.campaignItem.findMany({ where: { id: { in: unknownIds } }, select: { id: true, name: true } }),
        prisma.location.findMany({ where: { id: { in: unknownIds } }, select: { id: true, name: true } }),
      ]);
      const known = [...chars, ...items, ...locs].map((n) => ({ id: n.id, name: n.name, kind: kindOf.get(n.id) ?? '' }));
      for (const id of subjectsNamedIn(texts, known)) touched.add(id);
    }
  }
  const targets = rows.filter((r) => touched.has(r.subjectId)).slice(0, THOUGHT_REFRESH_TUNING.maxWrites);
  if (!targets.length) return 0;

  const campaignId = targets[0].campaignId;
  const [now, witMax] = await Promise.all([currentCycleOf(campaignId), witOfPerceiver(input.perceiverId)]);
  return prisma.$transaction(async (tx) => {
    const planned: FamiliarityWrite[] = [];
    for (const t of targets) {
      const key = { perceiverId: input.perceiverId, subjectId: t.subjectId, aspectKind: t.aspectKind };
      const row = await tx.familiarity.findUnique({ where: { perceiverId_subjectId_aspectKind: key }, select: { score: true, lastCycle: true, lastSource: true, impression: true } });
      if (!row || row.score <= 0) continue;
      // Once per beat: a row thought about already at this cycle is not touched again.
      if (row.lastSource === THOUGHT_SOURCE && row.lastCycle === now) continue;
      const faded = familiarityAt(row, now, witMax);
      if (faded <= 0) continue;
      const prior = { score: row.score, lastCycle: row.lastCycle, impression: row.impression ?? null };
      planned.push({
        ...key, campaignId: t.campaignId, subjectKind: t.subjectKind, score: refreshByThought(faded), source: THOUGHT_SOURCE,
        cycle: now, prior, keepSubjectKind: true, refs: input.refs,
        // Rehearsing a belief never corrects it: a held wrong impression stays.
        impression: prior.impression,
      });
    }
    await writeFamiliarity(tx, planned);
    return planned.length;
  });
}
