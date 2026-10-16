/**
 * GET /api/notifications — the signed-in user's notifications: unread
 * (newest first) + the latest read ones. Today: 'genesis_prod' — JEWL needs
 * this person's answer (2026-10-16). Thin wrapper over services/notifications.
 */
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { listNotifications, parsePayload } from '@/services/notifications';

export async function GET() {
  try {
    const session = await getSession();
    if (!session) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { unread, recent } = await listNotifications(session.user.id);
    const shape = (rows: typeof unread) => rows.map(n => ({
      id: n.id, kind: n.kind, campaignId: n.campaignId, readAt: n.readAt, createdAt: n.createdAt, payload: parsePayload(n.payload) ?? {},
    }));
    return NextResponse.json({ unread: shape(unread), recent: shape(recent), unreadCount: unread.length });
  } catch (error) {
    return errorResponse(error);
  }
}
