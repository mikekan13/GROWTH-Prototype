/**
 * Time system service — campaign clocks, timescales/calendars, and the
 * Location timescale-inheritance resolver.
 *
 * Canon (rulings 2026-06-08 + r-2026-06-09-06):
 *  - Campaign clock stored in META CYCLES (Campaign.currentCycle).
 *  - Timescales are campaign-local entities carrying the FULL calendar.
 *  - Every campaign gets a default "Standard Reckoning" (1 local year =
 *    1 meta cycle) on first touch.
 *  - Locations inherit their parent's timescale via located_at, up to the
 *    campaign default; a Location's data.timescaleId overrides.
 *  - Clock changes write a campaign-perspective HistoryEntry.
 */
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { ForbiddenError, NotFoundError, ValidationError } from '@/lib/errors';
import { canManageCampaign } from '@/lib/permissions';
import { writeHistory } from '@/services/history';
import {
  STANDARD_CALENDAR,
  cycleToLocalDate,
  localUnitsToCycles,
  dualAge,
  type CalendarSpec,
  type TimescaleRecord,
} from '@/types/time';

// ── Schemas ────────────────────────────────────────────────────────────────

const calendarMonthSchema = z.object({ name: z.string().min(1).max(60), days: z.number().int().min(1).max(1000) });
export const calendarSpecSchema = z.object({
  months: z.array(calendarMonthSchema).min(1).max(60),
  dayNames: z.array(z.string().min(1).max(40)).max(30).optional(),
  hoursPerDay: z.number().int().min(1).max(1000).optional(),
  epochYear: z.number().int().optional(),
  epochLabel: z.string().max(40).optional(),
  holidays: z.array(z.object({
    name: z.string().min(1).max(80),
    month: z.number().int().min(1),
    day: z.number().int().min(1),
    description: z.string().max(500).optional(),
  })).max(200).optional(),
  seasons: z.array(z.object({ name: z.string().min(1).max(60), startMonth: z.number().int().min(1) })).max(24).optional(),
  moons: z.array(z.object({ name: z.string().min(1).max(60), periodDays: z.number().min(0.1) })).max(12).optional(),
});

export const createTimescaleSchema = z.object({
  name: z.string().min(1).max(120),
  unitName: z.string().min(1).max(40).default('year'),
  unitsPerMetaCycle: z.number().positive().max(1_000_000).default(1),
  calendar: calendarSpecSchema.optional(),
});

export const updateTimescaleSchema = createTimescaleSchema.partial();

export const advanceClockSchema = z.object({
  /** Advance by an amount of local units of the campaign's default
   *  timescale (or raw meta cycles when unit = 'cycle'). */
  amount: z.number().positive().max(1_000_000),
  unit: z.enum(['cycle', 'year', 'month', 'day', 'hour', 'round']),
  /** Optional narrative note recorded on the history entry. */
  note: z.string().max(500).optional(),
});

export const setClockSchema = z.object({
  currentCycle: z.number().min(0),
  note: z.string().max(500).optional(),
});

// ── Helpers ────────────────────────────────────────────────────────────────

function parseCalendar(raw: string | null): CalendarSpec | null {
  if (!raw) return null;
  try { return JSON.parse(raw) as CalendarSpec; } catch { return null; }
}

function toRecord(t: { id: string; campaignId: string; name: string; unitName: string; unitsPerMetaCycle: number; calendar: string | null }): TimescaleRecord {
  return { id: t.id, campaignId: t.campaignId, name: t.name, unitName: t.unitName, unitsPerMetaCycle: t.unitsPerMetaCycle, calendar: parseCalendar(t.calendar) };
}

async function requireGm(campaignId: string, userId: string, userRole: string) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new NotFoundError('Campaign not found');
  if (!canManageCampaign(userId, userRole, campaign)) {
    throw new ForbiddenError('Only the campaign GM can manage time');
  }
  return campaign;
}

/** Ensure the campaign has a default timescale; create "Standard
 *  Reckoning" (1 year = 1 cycle, Earth-like calendar) if absent. */
export async function ensureDefaultTimescale(campaignId: string) {
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId } });
  if (!campaign) throw new NotFoundError('Campaign not found');
  if (campaign.defaultTimescaleId) {
    const existing = await prisma.timescale.findUnique({ where: { id: campaign.defaultTimescaleId } });
    if (existing) return toRecord(existing);
  }
  const created = await prisma.timescale.create({
    data: {
      campaignId,
      name: 'Standard Reckoning',
      unitName: 'year',
      unitsPerMetaCycle: 1,
      calendar: JSON.stringify(STANDARD_CALENDAR),
    },
  });
  await prisma.campaign.update({ where: { id: campaignId }, data: { defaultTimescaleId: created.id } });
  return toRecord(created);
}

// ── Timescale CRUD ─────────────────────────────────────────────────────────

export async function listTimescales(campaignId: string) {
  await ensureDefaultTimescale(campaignId);
  const rows = await prisma.timescale.findMany({ where: { campaignId }, orderBy: { createdAt: 'asc' } });
  const campaign = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { defaultTimescaleId: true, currentCycle: true } });
  return {
    defaultTimescaleId: campaign?.defaultTimescaleId ?? null,
    currentCycle: campaign?.currentCycle ?? 0,
    timescales: rows.map(toRecord),
  };
}

export async function createTimescale(
  campaignId: string,
  userId: string,
  userRole: string,
  input: z.infer<typeof createTimescaleSchema>,
) {
  await requireGm(campaignId, userId, userRole);
  const created = await prisma.timescale.create({
    data: {
      campaignId,
      name: input.name,
      unitName: input.unitName,
      unitsPerMetaCycle: input.unitsPerMetaCycle,
      calendar: input.calendar ? JSON.stringify(input.calendar) : JSON.stringify(STANDARD_CALENDAR),
    },
  });
  return toRecord(created);
}

export async function updateTimescale(
  campaignId: string,
  userId: string,
  userRole: string,
  timescaleId: string,
  input: z.infer<typeof updateTimescaleSchema>,
) {
  await requireGm(campaignId, userId, userRole);
  const existing = await prisma.timescale.findFirst({ where: { id: timescaleId, campaignId } });
  if (!existing) throw new NotFoundError('Timescale not found');
  const updated = await prisma.timescale.update({
    where: { id: timescaleId },
    data: {
      ...(input.name !== undefined ? { name: input.name } : {}),
      ...(input.unitName !== undefined ? { unitName: input.unitName } : {}),
      ...(input.unitsPerMetaCycle !== undefined ? { unitsPerMetaCycle: input.unitsPerMetaCycle } : {}),
      ...(input.calendar !== undefined ? { calendar: JSON.stringify(input.calendar) } : {}),
    },
  });
  return toRecord(updated);
}

export async function deleteTimescale(
  campaignId: string,
  userId: string,
  userRole: string,
  timescaleId: string,
) {
  const campaign = await requireGm(campaignId, userId, userRole);
  if (campaign.defaultTimescaleId === timescaleId) {
    throw new ValidationError('Cannot delete the campaign default timescale — set a different default first');
  }
  const existing = await prisma.timescale.findFirst({ where: { id: timescaleId, campaignId } });
  if (!existing) throw new NotFoundError('Timescale not found');
  await prisma.timescale.delete({ where: { id: timescaleId } });
  return { deleted: true };
}

export async function setDefaultTimescale(
  campaignId: string,
  userId: string,
  userRole: string,
  timescaleId: string,
) {
  await requireGm(campaignId, userId, userRole);
  const existing = await prisma.timescale.findFirst({ where: { id: timescaleId, campaignId } });
  if (!existing) throw new NotFoundError('Timescale not found');
  await prisma.campaign.update({ where: { id: campaignId }, data: { defaultTimescaleId: timescaleId } });
  return toRecord(existing);
}

// ── Campaign clock ─────────────────────────────────────────────────────────

export async function getClock(campaignId: string) {
  const defaultTs = await ensureDefaultTimescale(campaignId);
  const campaign = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { currentCycle: true, defaultTimescaleId: true },
  });
  if (!campaign) throw new NotFoundError('Campaign not found');
  const localDate = cycleToLocalDate(campaign.currentCycle, defaultTs);
  return {
    currentCycle: campaign.currentCycle,
    defaultTimescale: defaultTs,
    localDate,
  };
}

export async function advanceClock(
  campaignId: string,
  userId: string,
  userRole: string,
  input: z.infer<typeof advanceClockSchema>,
) {
  await requireGm(campaignId, userId, userRole);
  const defaultTs = await ensureDefaultTimescale(campaignId);
  const deltaCycles = input.unit === 'cycle'
    ? input.amount
    : localUnitsToCycles(input.amount, input.unit, defaultTs);

  const campaign = await prisma.campaign.update({
    where: { id: campaignId },
    data: { currentCycle: { increment: deltaCycles } },
    select: { currentCycle: true },
  });

  const localDate = cycleToLocalDate(campaign.currentCycle, defaultTs);
  await writeHistory(campaignId, campaign.currentCycle, [{
    subjectType: 'campaign',
    subjectId: campaignId,
    type: 'clock_advance',
    summary: `Time advanced by ${input.amount} ${input.unit}${input.amount === 1 ? '' : 's'} → ${localDate.formatted}`,
    details: input.note,
    actorId: userId,
    visibility: 'gm',
  }]);

  return { currentCycle: campaign.currentCycle, deltaCycles, localDate };
}

export async function setClock(
  campaignId: string,
  userId: string,
  userRole: string,
  input: z.infer<typeof setClockSchema>,
) {
  await requireGm(campaignId, userId, userRole);
  const defaultTs = await ensureDefaultTimescale(campaignId);
  const campaign = await prisma.campaign.update({
    where: { id: campaignId },
    data: { currentCycle: input.currentCycle },
    select: { currentCycle: true },
  });
  const localDate = cycleToLocalDate(campaign.currentCycle, defaultTs);
  await writeHistory(campaignId, campaign.currentCycle, [{
    subjectType: 'campaign',
    subjectId: campaignId,
    type: 'clock_advance',
    summary: `Clock set to cycle ${input.currentCycle} → ${localDate.formatted}`,
    details: input.note,
    actorId: userId,
    visibility: 'gm',
  }]);
  return { currentCycle: campaign.currentCycle, localDate };
}

// ── Location timescale resolution (inheritance up located_at) ─────────────

/**
 * Resolve the effective timescale for a Location: its own
 * data.timescaleId if set, else the nearest ancestor's (walking
 * located_at edges upward), else the campaign default.
 */
export async function resolveTimescaleForLocation(campaignId: string, locationId: string): Promise<TimescaleRecord> {
  const [locations, edges] = await Promise.all([
    prisma.location.findMany({ where: { campaignId }, select: { id: true, data: true } }),
    prisma.entityRelationship.findMany({
      where: { campaignId, relationshipType: 'located_at' },
      select: { sourceId: true, targetId: true },
    }),
  ]);
  const tsIdByLoc = new Map<string, string | undefined>();
  for (const l of locations) {
    try {
      const d = JSON.parse(l.data || '{}') as { timescaleId?: unknown };
      tsIdByLoc.set(l.id, typeof d.timescaleId === 'string' ? d.timescaleId : undefined);
    } catch { tsIdByLoc.set(l.id, undefined); }
  }
  const parentByChild = new Map(edges.map(e => [e.sourceId, e.targetId]));

  let cur: string | undefined = locationId;
  const seen = new Set<string>();
  while (cur && !seen.has(cur)) {
    seen.add(cur);
    const tsId = tsIdByLoc.get(cur);
    if (tsId) {
      const ts = await prisma.timescale.findFirst({ where: { id: tsId, campaignId } });
      if (ts) return toRecord(ts);
    }
    cur = parentByChild.get(cur);
  }
  return ensureDefaultTimescale(campaignId);
}

// ── Ages ───────────────────────────────────────────────────────────────────

/**
 * Compute a character's dual age. birthCycle lives on the character JSON;
 * characters without one have no computed age (legacy identity.age is the
 * display fallback at the call site). Fated age is in META cycles
 * (top-level fatedAge — humans 80).
 */
export function characterDualAge(
  charData: { birthCycle?: number },
  currentCycle: number,
  ts: { unitsPerMetaCycle: number; unitName: string },
) {
  if (typeof charData.birthCycle !== 'number') return null;
  const ageCycles = Math.max(0, currentCycle - charData.birthCycle);
  return dualAge(ageCycles, ts);
}
