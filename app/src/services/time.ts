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
import { sweepExpiredBlossoms } from '@/services/blossom';
import { sweepManaResidues } from '@/services/mana';
import {
  STANDARD_CALENDAR,
  cycleToLocalDate,
  localUnitsToCycles,
  secondsToCycles,
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

/**
 * GM / JEWL manual clock control — the OVERRIDE (ruling 2026-10-07: the
 * simulation keeps time on its own; the GM jumps it by hand only when they
 * choose to). Pending simulation time is flushed first so the history reads
 * in order.
 */
export async function advanceClock(
  campaignId: string,
  userId: string,
  userRole: string,
  input: z.infer<typeof advanceClockSchema>,
) {
  await requireGm(campaignId, userId, userRole);
  await flushSimClock(campaignId);
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

  // T23: elapsed blossoms expire against the moved clock (borrowed KRMA
  // returns to its Godhead; GM-authored blossoms just fall off the sheet).
  const { expired } = await sweepExpiredBlossoms(campaignId, campaign.currentCycle);
  if (expired.length > 0) {
    await writeHistory(campaignId, campaign.currentCycle, expired.map(e => ({
      subjectType: 'character' as const,
      subjectId: e.characterId,
      type: 'blossom_expired',
      summary: `Blossom "${e.name}" expired on ${e.characterName}${e.returned > 0 ? ` — ${e.returned} KRMA returned to its Godhead` : ''}`,
      actorId: userId,
      visibility: 'gm' as const,
    })));
  }

  // r-2026-07-23-02: lingering mana residue fades back to the weave with time.
  const manaSweep = await sweepManaResidues(campaignId, deltaCycles);
  if (manaSweep.fadedOut > 0) {
    await writeHistory(campaignId, campaign.currentCycle, [{
      subjectType: 'campaign',
      subjectId: campaignId,
      type: 'mana_residue_faded',
      summary: `${manaSweep.fadedOut} lingering mana residue${manaSweep.fadedOut === 1 ? '' : 's'} faded back to the weave`,
      actorId: userId,
      visibility: 'gm',
    }]);
  }

  return { currentCycle: campaign.currentCycle, deltaCycles, localDate, expiredBlossoms: expired };
}

export async function setClock(
  campaignId: string,
  userId: string,
  userRole: string,
  input: z.infer<typeof setClockSchema>,
) {
  await requireGm(campaignId, userId, userRole);
  await flushSimClock(campaignId);
  const defaultTs = await ensureDefaultTimescale(campaignId);
  const prior = await prisma.campaign.findUnique({
    where: { id: campaignId },
    select: { currentCycle: true },
  });
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

  // T23: setting the clock forward can elapse blossoms too.
  // r-2026-07-23-02: same for lingering mana residue.
  await sweepManaResidues(campaignId, Math.max(0, campaign.currentCycle - (prior?.currentCycle ?? campaign.currentCycle)));
  const { expired } = await sweepExpiredBlossoms(campaignId, campaign.currentCycle);
  if (expired.length > 0) {
    await writeHistory(campaignId, campaign.currentCycle, expired.map(e => ({
      subjectType: 'character' as const,
      subjectId: e.characterId,
      type: 'blossom_expired',
      summary: `Blossom "${e.name}" expired on ${e.characterName}${e.returned > 0 ? ` — ${e.returned} KRMA returned to its Godhead` : ''}`,
      actorId: userId,
      visibility: 'gm' as const,
    })));
  }

  return { currentCycle: campaign.currentCycle, localDate, expiredBlossoms: expired };
}

// ── Simulation clock (ruling 2026-10-07: the sim keeps time) ──────────────
//
// The simulation is not a user: it advances the clock from what it resolves
// (a combat round, a continuity bridge, later every action) with no role
// check. Campaign.currentCycle moves on EVERY call so every reader sees the
// true clock at once. What is batched is the bookkeeping: the clock_advance
// HistoryEntry and the blossom-expiry / mana-residue sweeps (each sweep scans
// every character / residue in the campaign — too heavy for every 6-s tick,
// and one history line per round would bury the record).
//
// FLUSH = one clock_advance entry for the pending span + one sweep pass,
// when the pending total reaches SIM_CLOCK_FLUSH_SECONDS, or when
// flushSimClock() is called (encounter end, after a bridge, before a GM
// override). Threshold = 60 s of game time: ten combat rounds, the smallest
// span a person at the table names ("a minute passes"); a blossom can
// overstay by at most a minute of fiction, and a typical fight writes a
// handful of lines instead of one per round.
//
// Pending state is in-process (globalThis, same pattern as the encounter
// inflight set). A server restart loses at most the un-flushed history line
// and that <60 s of residue fade — never the clock value, which is already
// in the database. Blossom expiry compares against the absolute clock, so the
// next flush catches any blossom that came due meanwhile.

/** Pending sim seconds at or above which the bookkeeping flushes. */
export const SIM_CLOCK_FLUSH_SECONDS = 60;

interface PendingSimTime {
  seconds: number;
  cycles: number;
  causes: string[];
  count: number;
}

const pendingSim: Map<string, PendingSimTime> =
  ((globalThis as unknown as { __simClockPending?: Map<string, PendingSimTime> }).__simClockPending ??= new Map());

/** Seconds of sim time not yet written to history (for tests / diagnostics). */
export function pendingSimSeconds(campaignId: string): number {
  return pendingSim.get(campaignId)?.seconds ?? 0;
}

function describeSeconds(total: number): string {
  const s = Math.round(total);
  if (s < 60) return `${s} second${s === 1 ? '' : 's'}`;
  const parts: string[] = [];
  const d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), r = s % 60;
  if (d) parts.push(`${d} day${d === 1 ? '' : 's'}`);
  if (h) parts.push(`${h} hour${h === 1 ? '' : 's'}`);
  if (m) parts.push(`${m} minute${m === 1 ? '' : 's'}`);
  if (r && !d) parts.push(`${r} second${r === 1 ? '' : 's'}`);
  return parts.join(' ');
}

/**
 * The simulation advances the campaign clock by `seconds` of game time.
 * No permission check — callers are engine code acting on an already-
 * authorised resolution. Returns the clock AFTER the advance.
 */
export async function advanceClockBySim(campaignId: string, seconds: number, cause: string) {
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new ValidationError('Simulation time must be a positive number of seconds');
  }
  const defaultTs = await ensureDefaultTimescale(campaignId);
  const deltaCycles = secondsToCycles(seconds, defaultTs);
  const campaign = await prisma.campaign.update({
    where: { id: campaignId },
    data: { currentCycle: { increment: deltaCycles } },
    select: { currentCycle: true },
  });

  const p = pendingSim.get(campaignId) ?? { seconds: 0, cycles: 0, causes: [], count: 0 };
  p.seconds += seconds;
  p.cycles += deltaCycles;
  p.count += 1;
  if (p.causes.length < 5) p.causes.push(cause);
  pendingSim.set(campaignId, p);

  let flushed = false;
  if (p.seconds >= SIM_CLOCK_FLUSH_SECONDS) flushed = (await flushSimClock(campaignId)) !== null;
  return {
    currentCycle: campaign.currentCycle,
    deltaCycles,
    localDate: cycleToLocalDate(campaign.currentCycle, defaultTs),
    flushed,
  };
}

/**
 * Write the pending sim span: one clock_advance HistoryEntry + one sweep
 * pass. No-op (null) when nothing is pending. Safe to call anywhere.
 */
export async function flushSimClock(campaignId: string) {
  const p = pendingSim.get(campaignId);
  if (!p || p.count === 0) return null;
  // Take the batch synchronously so a concurrent advance starts a new one.
  pendingSim.delete(campaignId);

  const defaultTs = await ensureDefaultTimescale(campaignId);
  const now = await prisma.campaign.findUnique({ where: { id: campaignId }, select: { currentCycle: true } });
  const currentCycle = now?.currentCycle ?? 0;
  const localDate = cycleToLocalDate(currentCycle, defaultTs);
  const more = p.count > p.causes.length ? ` (+${p.count - p.causes.length} more)` : '';
  await writeHistory(campaignId, currentCycle, [{
    subjectType: 'campaign',
    subjectId: campaignId,
    type: 'clock_advance',
    summary: `${describeSeconds(p.seconds)} passed in play → ${localDate.formatted}`,
    details: `Simulation: ${p.causes.join('; ')}${more}`,
    visibility: 'gm',
  }]);

  const { expired } = await sweepExpiredBlossoms(campaignId, currentCycle);
  if (expired.length > 0) {
    await writeHistory(campaignId, currentCycle, expired.map(e => ({
      subjectType: 'character' as const,
      subjectId: e.characterId,
      type: 'blossom_expired',
      summary: `Blossom "${e.name}" expired on ${e.characterName}${e.returned > 0 ? ` — ${e.returned} KRMA returned to its Godhead` : ''}`,
      visibility: 'gm' as const,
    })));
  }
  const manaSweep = await sweepManaResidues(campaignId, p.cycles);
  if (manaSweep.fadedOut > 0) {
    await writeHistory(campaignId, currentCycle, [{
      subjectType: 'campaign',
      subjectId: campaignId,
      type: 'mana_residue_faded',
      summary: `${manaSweep.fadedOut} lingering mana residue${manaSweep.fadedOut === 1 ? '' : 's'} faded back to the weave`,
      visibility: 'gm',
    }]);
  }
  return { seconds: p.seconds, deltaCycles: p.cycles, advances: p.count, currentCycle, expiredBlossoms: expired };
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
