import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { getPodStatus, waitForComfyReady } from '@/ai/portraits/pod-client';
import { markUsed, forceHibernate, getKeepaliveStatus } from '@/ai/portraits/pod-keepalive';

export const maxDuration = 300;

/**
 * GET /api/portraits/pod
 *
 * Current pod + keepalive status. Useful for dashboards / debug UIs and
 * for simple CLI probes (curl) when testing the warm-keeper behavior.
 */
export async function GET() {
  try {
    await requireAuth();
    const pod = await getPodStatus();
    return NextResponse.json({
      pod: pod ? {
        id: pod.id,
        desiredStatus: pod.desiredStatus,
        costPerHr: pod.costPerHr,
      } : null,
      keepalive: getKeepaliveStatus(),
    });
  } catch (e) {
    return errorResponse(e);
  }
}

/**
 * POST /api/portraits/pod
 *
 * Body: { action?: 'wake' | 'hibernate' } — default 'wake'.
 *
 * 'wake' bumps the keepalive timer and resumes the pod if hibernated.
 * 'hibernate' forces a hibernate now (ignores the 2-min idle window).
 *
 * Returns the new status after the action resolves.
 */
export async function POST(request: NextRequest) {
  try {
    await requireAuth();
    const raw = await request.text();
    const body: { action?: string } = raw ? JSON.parse(raw) : {};
    const action = body.action ?? 'wake';

    if (action === 'hibernate') {
      const ok = await forceHibernate();
      return NextResponse.json({ ok, action });
    }

    if (action === 'wake') {
      await markUsed();
      const ready = await waitForComfyReady(180_000);
      return NextResponse.json({ ok: ready, action, keepalive: getKeepaliveStatus() });
    }

    return NextResponse.json({ error: `unknown action: ${action}` }, { status: 400 });
  } catch (e) {
    return errorResponse(e);
  }
}

/**
 * DELETE /api/portraits/pod — alias for POST { action: 'hibernate' }.
 */
export async function DELETE() {
  try {
    await requireAuth();
    const ok = await forceHibernate();
    return NextResponse.json({ ok });
  } catch (e) {
    return errorResponse(e);
  }
}
