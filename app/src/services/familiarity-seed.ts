/**
 * Familiarity SEEDING on first contact (perception build unit 4; Mike
 * 2026-10-08/09 rulings, memory `ruling-passive-active-perception-familiarity-2026-10-08`).
 *
 * The first time a being meets a thing, it does not always start at zero:
 * - GODHEAD: every aspect starts at F5 and never fades ("Godhead as an entity =
 *   same perception pipeline, all aspects start F5, memory non-decaying").
 * - SELF: a being perceiving itself starts high ("INCLUDING ITSELF").
 * - OWNED: a thing it holds starts high ("the phone you own and use").
 * - KNOWN CATEGORY: a thing of a kind it already knows starts at a mid
 *   relational level for what it is and what it looks like ("a normal human
 *   knows a butter knife even if it's a different type of butter knife").
 * - Otherwise: no seed — it starts at zero and grows by exposure.
 *
 * Seeding only ever CREATES rows that do not exist (first contact), except a
 * Godhead's rows, which are raised to F5 if they somehow sit below it.
 */
import 'server-only';
import { prisma } from '@/lib/db';
import { listAspects } from '@/sim/perception/aspects';
import { familiarityAt, F5_SEAL, writeFamiliarity, type FamiliarityWrite, type SubjectKind } from '@/services/familiarity';
import { currentCycleOf } from '@/services/history';

// ── Tuning ────────────────────────────────────────────────────────────────

/**
 * SEED VALUES — TUNING NUMBERS, placeholders (0..1 → F0..F5 via scoreToFidelity).
 * Mike 2026-10-09: step sizes / levels are tuning, set from a live run.
 */
export const FAMILIARITY_SEED = {
  /** Godhead: F5 on every aspect. 1 ≥ the F5 seal, so fadeFamiliarity leaves it untouched forever. */
  godhead: 1,
  /** A being perceiving itself — F4. */
  self: 0.8,
  /** A thing the being holds (CampaignItem.holderId) — F3. */
  owned: 0.7,
  /** A thing of a category the being already knows — F2, identity + appearance only. */
  knownCategory: 0.5,
  /** Faded identity familiarity with ANOTHER item of the same category that counts as "knows the category" (F2). */
  categoryKnownMin: 0.4,
} as const;

/** The aspects a known category seeds (the rest of the thing is still new). */
export const CATEGORY_SEED_ASPECTS = ['identity', 'appearance'] as const;
/** Aspects seeded for a non-item subject (person, place, Godhead). */
export const NON_ITEM_ASPECTS = ['identity', 'appearance', 'history'] as const;
/** Self-perception adds the being's own thoughts. */
export const SELF_ASPECTS = [...NON_ITEM_ASPECTS, 'thoughts'] as const;
/** CampaignItem.type values that are not a category anyone can "know". */
const NOT_A_CATEGORY = new Set(['misc', '']);

// ── Pure ──────────────────────────────────────────────────────────────────

export type FirstContact = 'godhead' | 'self' | 'owned' | 'known-category' | 'stranger';

/** Which first-contact case applies — Godhead > self > owned > known category > stranger. Pure. */
export function contactKind(f: { godhead?: boolean; self?: boolean; owned?: boolean; categoryKnown?: boolean }): FirstContact {
  if (f.godhead) return 'godhead';
  if (f.self) return 'self';
  if (f.owned) return 'owned';
  if (f.categoryKnown) return 'known-category';
  return 'stranger';
}

/** The aspect keys a subject has: an item's from its data (listAspects), otherwise the fixed sets above. Pure. */
export function subjectAspects(kind: SubjectKind, itemData?: string | null): string[] {
  if (kind === 'ITEM') return listAspects(itemData ?? null);
  if (kind === 'SELF') return [...SELF_ASPECTS];
  return [...NON_ITEM_ASPECTS];
}

/** The rows to seed for a first contact. Stranger → none. Pure. */
export function seedPlan(contact: FirstContact, aspects: readonly string[]): Array<{ aspectKind: string; score: number }> {
  switch (contact) {
    case 'godhead': return aspects.map((aspectKind) => ({ aspectKind, score: FAMILIARITY_SEED.godhead }));
    case 'self': return aspects.map((aspectKind) => ({ aspectKind, score: FAMILIARITY_SEED.self }));
    case 'owned': return aspects.map((aspectKind) => ({ aspectKind, score: FAMILIARITY_SEED.owned }));
    case 'known-category':
      return aspects.filter((a) => (CATEGORY_SEED_ASPECTS as readonly string[]).includes(a)).map((aspectKind) => ({ aspectKind, score: FAMILIARITY_SEED.knownCategory }));
    default: return [];
  }
}

// ── DB ────────────────────────────────────────────────────────────────────

/**
 * Is this character a Godhead? A GodHead row seats it, or its DAYA persona is
 * flagged godlike/omniscient (services/godhead-beings sets `godlike`; the
 * mirror reads the same flags in daya/perceive).
 */
export async function isGodheadBeing(characterId: string): Promise<boolean> {
  const seat = await prisma.godHead.findFirst({ where: { characterId }, select: { id: true } });
  if (seat) return true;
  const entity = await prisma.dayaEntity.findUnique({ where: { characterId }, select: { personaProfile: true } });
  try {
    const p = entity ? (JSON.parse(entity.personaProfile) as { godlike?: unknown; omniscient?: unknown }) : {};
    return p.godlike === true || p.omniscient === true;
  } catch {
    return false;
  }
}

/**
 * Does the being already know this item's CATEGORY? Category = CampaignItem.type
 * ('misc' is none). Known = it holds another ACTIVE item of that type, or its
 * faded identity familiarity with another item of that type is at least
 * FAMILIARITY_SEED.categoryKnownMin. [QUESTION for Mike: `type` is coarse —
 * weapon/tool/… — there is no item archetype field ("butter knife") yet.]
 */
export async function knowsItemCategory(input: { campaignId: string; perceiverId: string; perceiverCharacterId: string; itemId: string; itemType: string }): Promise<boolean> {
  if (NOT_A_CATEGORY.has(input.itemType)) return false;
  const held = await prisma.campaignItem.count({ where: { campaignId: input.campaignId, holderId: input.perceiverCharacterId, type: input.itemType, status: 'ACTIVE', id: { not: input.itemId } } });
  if (held > 0) return true;
  const rows = await prisma.familiarity.findMany({
    where: { perceiverId: input.perceiverId, subjectKind: 'ITEM', aspectKind: 'identity', subjectId: { not: input.itemId } },
    select: { subjectId: true, score: true, lastCycle: true },
  });
  if (rows.length === 0) return false;
  const now = await currentCycleOf(input.campaignId);
  const known = rows.filter((r) => familiarityAt(r, now) >= FAMILIARITY_SEED.categoryKnownMin).map((r) => r.subjectId);
  if (known.length === 0) return false;
  return (await prisma.campaignItem.count({ where: { id: { in: known }, type: input.itemType } })) > 0;
}

export interface SeedOnFirstContactInput {
  campaignId: string;
  /** DayaEntity id of the perceiver (Familiarity.perceiverId). */
  perceiverId: string;
  /** The perceiver's characterId (for SELF, holderId and the Godhead check). */
  perceiverCharacterId: string;
  subjectId: string;
  subjectKind: SubjectKind;
  /** Skip the lookup when the caller already knows. */
  godhead?: boolean;
}

/**
 * Seed a being's familiarity of a subject on first contact. Creates the rows
 * the first-contact case calls for that do not exist yet; a Godhead's existing
 * rows below F5 are raised to it. Never lowers or regrows an existing row.
 * Returns which case applied and the aspect keys written.
 */
export async function seedOnFirstContact(input: SeedOnFirstContactInput): Promise<{ contact: FirstContact; seeded: string[] }> {
  const godhead = input.godhead ?? await isGodheadBeing(input.perceiverCharacterId);
  const self = input.subjectKind === 'SELF' || input.subjectId === input.perceiverCharacterId;
  const kind: SubjectKind = self ? 'SELF' : input.subjectKind;

  let itemData: string | null = null;
  let owned = false;
  let categoryKnown = false;
  if (kind === 'ITEM') {
    const item = await prisma.campaignItem.findUnique({ where: { id: input.subjectId }, select: { type: true, data: true, holderId: true, campaignId: true } });
    if (!item || item.campaignId !== input.campaignId) return { contact: 'stranger', seeded: [] };
    itemData = item.data;
    owned = item.holderId === input.perceiverCharacterId;
    if (!godhead && !owned) categoryKnown = await knowsItemCategory({ ...input, itemId: input.subjectId, itemType: item.type });
  }

  const contact = contactKind({ godhead, self, owned, categoryKnown });
  const plan = seedPlan(contact, subjectAspects(kind, itemData));
  if (plan.length === 0) return { contact, seeded: [] };

  const existing = await prisma.familiarity.findMany({ where: { perceiverId: input.perceiverId, subjectId: input.subjectId }, select: { aspectKind: true, score: true } });
  const have = new Map(existing.map((r) => [r.aspectKind, r.score]));
  const todo = plan.filter((p) => !have.has(p.aspectKind) || (contact === 'godhead' && (have.get(p.aspectKind) ?? 0) < F5_SEAL));
  if (todo.length === 0) return { contact, seeded: [] };

  const lastCycle = await currentCycleOf(input.campaignId);
  const seeded = await prisma.$transaction(async (tx) => {
    const planned: FamiliarityWrite[] = [];
    for (const p of todo) {
      const prior = await tx.familiarity.findUnique({ where: { perceiverId_subjectId_aspectKind: { perceiverId: input.perceiverId, subjectId: input.subjectId, aspectKind: p.aspectKind } }, select: { score: true, lastCycle: true } });
      // A concurrent first contact may have created it: only a Godhead's row is raised; nobody else's is touched.
      if (prior && (contact !== 'godhead' || prior.score >= F5_SEAL)) continue;
      planned.push({ campaignId: input.campaignId, perceiverId: input.perceiverId, subjectId: input.subjectId, subjectKind: kind, aspectKind: p.aspectKind, score: p.score, source: 'seed', cycle: lastCycle, prior, keepSubjectKind: true });
    }
    await writeFamiliarity(tx, planned);
    return planned.map((w) => w.aspectKind);
  });
  return { contact, seeded };
}
