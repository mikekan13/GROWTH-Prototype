/**
 * User notifications (2026-10-16) — the Watcher and the Trailblazers are told
 * when they are needed. Today one kind: 'genesis_prod' — JEWL raised a prod
 * whose audience is a player (the character's owner, or another player's
 * character) and waits on their answer. The header badge (NotificationBell)
 * lists the unread ones; deciding the prod marks it read.
 *
 * Minimal on purpose: a row per person, a JSON payload, readAt.
 */
import 'server-only';
import { prisma } from '@/lib/db';
import { NotFoundError } from '@/lib/errors';

export const GENESIS_PROD_NOTIFICATION = 'genesis_prod';

export interface GenesisProdPayload {
  prodId: string;
  sessionId: string;
  characterId: string;
  characterName: string;
  question: string;
  why: string;
  audience: string;
}

export interface NotificationRow {
  id: string;
  userId: string;
  campaignId: string | null;
  kind: string;
  payload: string;
  readAt: Date | null;
  createdAt: Date;
}

export function parsePayload<T = Record<string, unknown>>(json: string): T | null {
  try {
    const v: unknown = JSON.parse(json);
    return v && typeof v === 'object' ? (v as T) : null;
  } catch {
    return null;
  }
}

export async function createNotification(opts: {
  userId: string;
  campaignId?: string | null;
  kind: string;
  payload: Record<string, unknown>;
}): Promise<NotificationRow> {
  return prisma.userNotification.create({
    data: {
      userId: opts.userId,
      campaignId: opts.campaignId ?? null,
      kind: opts.kind,
      payload: JSON.stringify(opts.payload),
    },
  });
}

/** Unread first (newest first), then the latest read ones, capped. */
export async function listNotifications(userId: string, opts: { limit?: number } = {}): Promise<{
  unread: NotificationRow[];
  recent: NotificationRow[];
}> {
  const limit = opts.limit ?? 20;
  const [unread, recent] = await Promise.all([
    prisma.userNotification.findMany({ where: { userId, readAt: null }, orderBy: { createdAt: 'desc' }, take: limit }),
    prisma.userNotification.findMany({ where: { userId, readAt: { not: null } }, orderBy: { createdAt: 'desc' }, take: 10 }),
  ]);
  return { unread, recent };
}

export async function markNotificationRead(userId: string, id: string): Promise<NotificationRow> {
  const row = await prisma.userNotification.findUnique({ where: { id } });
  if (!row || row.userId !== userId) throw new NotFoundError('Notification not found');
  if (row.readAt) return row;
  return prisma.userNotification.update({ where: { id }, data: { readAt: new Date() } });
}

/** A prod was decided: its notifications (any reader) are read. Best-effort. */
export async function markProdNotificationsRead(prodId: string): Promise<number> {
  try {
    const rows = await prisma.userNotification.findMany({
      where: { kind: GENESIS_PROD_NOTIFICATION, readAt: null, payload: { contains: `"prodId":"${prodId}"` } },
      select: { id: true },
    });
    if (!rows.length) return 0;
    const r = await prisma.userNotification.updateMany({ where: { id: { in: rows.map(x => x.id) } }, data: { readAt: new Date() } });
    return r.count;
  } catch (err) {
    console.error('[notifications] prod notifications not marked read:', err);
    return 0;
  }
}
