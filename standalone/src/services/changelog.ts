/**
 * Changelog Service — Business logic for the global change log.
 */

import { prisma } from '@/lib/db';
import type { ChangeLogEntry, ChangeLogQueryParams, ChangeActor, ChangeCategory, FieldChange } from '@/types/changelog';
import { diffObjects, inferCategory, summarizeChanges } from '@/lib/changelog-utils';

// ── Types ──────────────────────────────────────────────────────────────────

interface CreateEntryInput {
  campaignId: string;
  characterId: string;
  characterName: string;
  actor: ChangeActor;
  actorUserId: string;
  category?: ChangeCategory;
  description?: string;
  source?: string;
  groupId?: string;
  beforeData: Record<string, unknown>;
  afterData: Record<string, unknown>;
  snapshotBefore?: boolean; // Whether to store full snapshot
}

// ── Coalescence ────────────────────────────────────────────────────────────

const COALESCENCE_WINDOW_MS = 5000;

// ── Service Functions ──────────────────────────────────────────────────────

/**
 * Create changelog entries by diffing before/after character data.
 * Applies server-side coalescence: if same character+category changed
 * within 5s, updates the existing entry instead of creating a new one.
 */
export async function createChangeLogEntry(input: CreateEntryInput): Promise<void> {
  const changes = diffObjects(input.beforeData, input.afterData);
  if (changes.length === 0) return;

  const category = input.category || inferCategory(changes);
  const description = input.description || summarizeChanges(changes);

  // Check for coalescence: same character + category within window
  const windowStart = new Date(Date.now() - COALESCENCE_WINDOW_MS);

  const existing = await prisma.changeLog.findFirst({
    where: {
      characterId: input.characterId,
      category,
      actorUserId: input.actorUserId,
      revertedAt: null,
      createdAt: { gte: windowStart },
    },
    orderBy: { createdAt: 'desc' },
  });

  if (existing) {
    // Coalesce: update existing entry's newValues and description
    const existingChanges: FieldChange[] = JSON.parse(existing.changes);
    const mergedChanges = coalesceChanges(existingChanges, changes);

    await prisma.changeLog.update({
      where: { id: existing.id },
      data: {
        changes: JSON.stringify(mergedChanges),
        description: summarizeChanges(mergedChanges),
      },
    });
    return;
  }

  // Create new entry
  await prisma.changeLog.create({
    data: {
      campaignId: input.campaignId,
      characterId: input.characterId,
      characterName: input.characterName,
      groupId: input.groupId || null,
      actor: input.actor,
      actorUserId: input.actorUserId,
      category,
      description,
      changes: JSON.stringify(changes),
      source: input.source || null,
      snapshotBefore: input.snapshotBefore ? JSON.stringify(input.beforeData) : null,
    },
  });
}

/**
 * Merge new changes into existing changes, preserving original previousValue.
 */
function coalesceChanges(existing: FieldChange[], incoming: FieldChange[]): FieldChange[] {
  const merged = new Map<string, FieldChange>();

  // Start with existing (has the original previousValue)
  for (const c of existing) {
    merged.set(c.path, { ...c });
  }

  // Apply incoming: keep previousValue from existing, take newValue from incoming
  for (const c of incoming) {
    const prev = merged.get(c.path);
    merged.set(c.path, {
      path: c.path,
      previousValue: prev ? prev.previousValue : c.previousValue,
      newValue: c.newValue,
    });
  }

  // Remove no-op changes (previousValue === newValue after coalescence)
  const result: FieldChange[] = [];
  for (const c of merged.values()) {
    if (JSON.stringify(c.previousValue) !== JSON.stringify(c.newValue)) {
      result.push(c);
    }
  }

  return result;
}

/**
 * Query changelog with filters and pagination.
 */
export async function queryChangeLog(params: ChangeLogQueryParams) {
  const where: Record<string, unknown> = {
    campaignId: params.campaignId,
  };

  if (params.characterId) where.characterId = params.characterId;
  if (params.category?.length) where.category = { in: params.category };
  if (params.actor?.length) where.actor = { in: params.actor };

  const dateFilter: Record<string, Date> = {};
  if (params.after) dateFilter.gte = new Date(params.after);
  if (params.before) dateFilter.lte = new Date(params.before);
  if (Object.keys(dateFilter).length > 0) where.createdAt = dateFilter;

  if (params.cursor) {
    where.createdAt = {
      ...(where.createdAt as Record<string, Date> || {}),
      lt: new Date(params.cursor),
    };
  }

  const limit = Math.min(params.limit || 50, 200);

  const rows = await prisma.changeLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: limit + 1, // Fetch one extra for cursor
  });

  const hasMore = rows.length > limit;
  const entries = rows.slice(0, limit);

  return {
    entries: entries.map(rowToEntry),
    nextCursor: hasMore ? entries[entries.length - 1].createdAt.toISOString() : null,
  };
}

/**
 * Revert a changelog entry. Returns the restored character data or throws.
 */
export async function revertChangeLogEntry(
  entryId: string,
  actorUserId: string,
) {
  const entry = await prisma.changeLog.findUnique({ where: { id: entryId } });
  if (!entry) throw new Error('Change log entry not found');
  if (!entry.revertible) throw new Error('This entry is no longer revertible');
  if (entry.revertedAt) throw new Error('This entry has already been reverted');

  const character = await prisma.character.findUnique({ where: { id: entry.characterId } });
  if (!character) throw new Error('Character not found');

  const currentData = JSON.parse(character.data) as Record<string, unknown>;
  const changes: FieldChange[] = JSON.parse(entry.changes);

  // Verify current state matches expected newValues
  for (const change of changes) {
    const currentVal = getNestedValue(currentData, change.path);
    if (JSON.stringify(currentVal) !== JSON.stringify(change.newValue)) {
      throw new Error(
        `Conflict: ${change.path} is currently ${JSON.stringify(currentVal)}, ` +
        `expected ${JSON.stringify(change.newValue)}. Another change was made since this entry.`
      );
    }
  }

  // Apply revert: restore previousValues
  const revertedData = JSON.parse(JSON.stringify(currentData));
  for (const change of changes) {
    setNestedValue(revertedData, change.path, change.previousValue);
  }

  // Save reverted character data
  await prisma.character.update({
    where: { id: entry.characterId },
    data: { data: JSON.stringify(revertedData) },
  });

  // Mark entry as reverted
  await prisma.changeLog.update({
    where: { id: entryId },
    data: { revertedAt: new Date(), revertedBy: actorUserId, revertible: false },
  });

  // Log the revert itself
  const revertChanges = changes.map(c => ({
    path: c.path,
    previousValue: c.newValue,
    newValue: c.previousValue,
  }));

  await prisma.changeLog.create({
    data: {
      campaignId: entry.campaignId,
      characterId: entry.characterId,
      characterName: entry.characterName,
      actor: 'gm',
      actorUserId,
      category: entry.category,
      description: `Reverted: ${entry.description}`,
      changes: JSON.stringify(revertChanges),
      source: `revert:${entryId}`,
      revertible: true,
    },
  });

  return revertedData;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function rowToEntry(row: {
  id: string;
  campaignId: string;
  characterId: string;
  characterName: string;
  groupId: string | null;
  actor: string;
  actorUserId: string;
  category: string;
  description: string;
  changes: string;
  source: string | null;
  revertible: boolean;
  revertedAt: Date | null;
  revertedBy: string | null;
  snapshotBefore: string | null;
  createdAt: Date;
}): ChangeLogEntry {
  return {
    id: row.id,
    campaignId: row.campaignId,
    characterId: row.characterId,
    characterName: row.characterName,
    groupId: row.groupId,
    actor: row.actor as ChangeLogEntry['actor'],
    actorUserId: row.actorUserId,
    category: row.category as ChangeLogEntry['category'],
    description: row.description,
    changes: JSON.parse(row.changes),
    source: row.source,
    revertible: row.revertible,
    revertedAt: row.revertedAt?.toISOString() || null,
    revertedBy: row.revertedBy,
    snapshotBefore: row.snapshotBefore,
    createdAt: row.createdAt.toISOString(),
  };
}

function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

function setNestedValue(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split('.');
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < parts.length - 1; i++) {
    if (current[parts[i]] === undefined || typeof current[parts[i]] !== 'object') {
      current[parts[i]] = {};
    }
    current = current[parts[i]] as Record<string, unknown>;
  }
  current[parts[parts.length - 1]] = value;
}
