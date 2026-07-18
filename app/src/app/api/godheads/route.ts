import { NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { errorResponse } from '@/lib/api';
import { prisma } from '@/lib/db';
import { isWatcherOrAbove } from '@/lib/permissions';

export const dynamic = 'force-dynamic';

// GET /api/godheads — lightweight godhead directory for pickers
// (custodian assignment on goal cards, T34). Watcher+ only; the full
// admin view (metrics, wallets) stays at /api/admin/godheads.
export async function GET() {
  try {
    const session = await requireAuth();
    if (!isWatcherOrAbove(session.user.role)) {
      return NextResponse.json({ error: 'Watcher role required' }, { status: 403 });
    }
    const godheads = await prisma.godHead.findMany({
      select: { id: true, name: true, pillar: true, domain: true },
      orderBy: { name: 'asc' },
    });
    return NextResponse.json({ godheads });
  } catch (error) {
    return errorResponse(error);
  }
}
